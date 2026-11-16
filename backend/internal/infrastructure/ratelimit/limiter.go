package ratelimit

import (
	"context"
	"fmt"
	"math"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/redis/go-redis/v9"
)

// PolicyConfig describes one rate-limiting tier enforced by the HTTP/WS gateway.
type PolicyConfig struct {
	Name        string        `json:"name"`
	Label       string        `json:"label"`
	Description string        `json:"description"`
	Scope       string        `json:"scope"`
	Limit       int           `json:"limit"`
	Window      time.Duration `json:"window"`
}

// CheckResult reports the evaluation outcome for a single rate-limit request check.
type CheckResult struct {
	Allowed           bool   `json:"allowed"`
	Policy            string `json:"policy"`
	Limit             int    `json:"limit"`
	Remaining         int    `json:"remaining"`
	RetryAfterSeconds int    `json:"retry_after_seconds"`
	ResetAtUnix       int64  `json:"reset_at_unix"`
}

// PolicyMetrics represents live hit/block telemetry per configured tier for admin & security dashboards.
type PolicyMetrics struct {
	Name          string `json:"name"`
	Label         string `json:"label"`
	Description   string `json:"description"`
	Scope         string `json:"scope"`
	Limit         int    `json:"limit"`
	WindowSeconds int    `json:"window_seconds"`
	TotalAllowed  int64  `json:"total_allowed"`
	TotalBlocked  int64  `json:"total_blocked"`
	Backend       string `json:"backend"`
}

type memBucket struct {
	count   int
	resetAt time.Time
}

type policyStat struct {
	cfg     PolicyConfig
	allowed atomic.Int64
	blocked atomic.Int64
}

var incrWithTTLLua = redis.NewScript(`
local current = redis.call("INCR", KEYS[1])
if current == 1 then
	redis.call("PEXPIRE", KEYS[1], tonumber(ARGV[1]))
	return {current, tonumber(ARGV[1])}
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
	redis.call("PEXPIRE", KEYS[1], tonumber(ARGV[1]))
	ttl = tonumber(ARGV[1])
end
return {current, ttl}
`)

// DefaultPolicies returns the standard enterprise multi-tier rate-limit catalog.
func DefaultPolicies() []PolicyConfig {
	return []PolicyConfig{
		{
			Name:        "auth_login",
			Label:       "Company Staff Login",
			Description: "Protects /api/v1/auth/login against credential stuffing and password brute force",
			Scope:       "IP & Account",
			Limit:       10,
			Window:      time.Minute,
		},
		{
			Name:        "admin_login",
			Label:       "Platform SuperAdmin Login",
			Description: "Strict throttling on /api/v1/admin/login and master bootstrap routes",
			Scope:       "IP & Admin Email",
			Limit:       8,
			Window:      time.Minute,
		},
		{
			Name:        "auth_recovery",
			Label:       "Password Reset & Recovery",
			Description: "Limits password reset / PIN recovery attempts to prevent enumeration",
			Scope:       "IP & Email",
			Limit:       5,
			Window:      5 * time.Minute,
		},
		{
			Name:        "pin_verify",
			Label:       "Supervisor 6-Digit PIN Override",
			Description: "Prevents brute-forcing 6-digit manager approval PINs at POS terminals",
			Scope:       "Business + User + IP",
			Limit:       5,
			Window:      5 * time.Minute,
		},
		{
			Name:        "public_discovery",
			Label:       "Public Portal & Branding",
			Description: "Protects /auth/companies and /auth/branding discovery endpoints",
			Scope:       "Client IP",
			Limit:       60,
			Window:      time.Minute,
		},
		{
			Name:        "tenant_api",
			Label:       "Authenticated Tenant Workspace API",
			Description: "Baseline quota across ERP inventory, catalog, customers, and settings routes",
			Scope:       "Business + User",
			Limit:       240,
			Window:      time.Minute,
		},
		{
			Name:        "pos_burst",
			Label:       "Edge POS Checkout & Held Bills",
			Description: "High-throughput checkout and offline outbox replay allowance per register",
			Scope:       "Business + User + Terminal",
			Limit:       90,
			Window:      time.Minute,
		},
		{
			Name:        "analytics_heavy",
			Label:       "Reports, Overview & GL Aggregations",
			Description: "Protects heavy multi-join analytical and FIFO valuation queries",
			Scope:       "Business + User",
			Limit:       45,
			Window:      time.Minute,
		},
		{
			Name:        "ws_upgrade",
			Label:       "WebSocket Real-Time Upgrades",
			Description: "Throttles reconnect storms on /ws real-time broadcast sockets",
			Scope:       "IP & Business",
			Limit:       20,
			Window:      time.Minute,
		},
	}
}

// Limiter implements distributed Redis-backed rate limiting with automatic thread-safe in-memory fallback.
type Limiter struct {
	redis *redis.Client

	mu       sync.Mutex
	buckets  map[string]*memBucket
	auditLog map[string]time.Time

	statsMu  sync.RWMutex
	policies map[string]*policyStat
	order    []string
}

// NewLimiter constructs a Limiter backed by rdb (or purely in-memory if rdb is nil).
func NewLimiter(rdb *redis.Client) *Limiter {
	l := &Limiter{
		redis:    rdb,
		buckets:  make(map[string]*memBucket),
		auditLog: make(map[string]time.Time),
		policies: make(map[string]*policyStat),
	}
	for _, cfg := range DefaultPolicies() {
		l.RegisterPolicy(cfg)
	}
	return l
}

// RegisterPolicy registers or updates metadata for a named policy tier.
func (l *Limiter) RegisterPolicy(cfg PolicyConfig) {
	if l == nil || strings.TrimSpace(cfg.Name) == "" {
		return
	}
	l.statsMu.Lock()
	defer l.statsMu.Unlock()
	if existing, ok := l.policies[cfg.Name]; ok {
		existing.cfg = cfg
		return
	}
	l.policies[cfg.Name] = &policyStat{cfg: cfg}
	l.order = append(l.order, cfg.Name)
}

// PolicyConfig returns the registered defaults for policyName.
func (l *Limiter) PolicyConfig(policyName string) (PolicyConfig, bool) {
	if l == nil {
		return PolicyConfig{}, false
	}
	l.statsMu.RLock()
	defer l.statsMu.RUnlock()
	st, ok := l.policies[policyName]
	if !ok {
		return PolicyConfig{}, false
	}
	return st.cfg, true
}

// Allow checks and consumes 1 token under policyName for key using limit/window overrides if positive.
func (l *Limiter) Allow(ctx context.Context, policyName, key string, overrideLimit int, overrideWindow time.Duration) CheckResult {
	cfg, ok := l.PolicyConfig(policyName)
	if !ok {
		cfg = PolicyConfig{
			Name:   policyName,
			Label:  policyName,
			Limit:  60,
			Window: time.Minute,
		}
		l.RegisterPolicy(cfg)
	}
	limit := cfg.Limit
	if overrideLimit > 0 {
		limit = overrideLimit
	}
	window := cfg.Window
	if overrideWindow > 0 {
		window = overrideWindow
	}
	if limit <= 0 {
		limit = 1
	}
	if window <= 0 {
		window = time.Minute
	}

	redisKey := fmt.Sprintf("rl:%s:%s", policyName, strings.TrimSpace(key))
	count, ttlMs, usedRedis := l.incrementCounter(ctx, redisKey, window)
	_ = usedRedis

	now := time.Now()
	resetAt := now.Add(time.Duration(ttlMs) * time.Millisecond)
	retryAfter := int(math.Ceil(float64(ttlMs) / 1000.0))
	if retryAfter < 1 {
		retryAfter = 1
	}

	allowed := count <= limit
	remaining := limit - count
	if remaining < 0 {
		remaining = 0
	}

	l.recordStat(ctx, policyName, allowed)

	return CheckResult{
		Allowed:           allowed,
		Policy:            policyName,
		Limit:             limit,
		Remaining:         remaining,
		RetryAfterSeconds: retryAfter,
		ResetAtUnix:       resetAt.Unix(),
	}
}

// CheckLockout inspects an active failure-streak bucket without incrementing its count.
func (l *Limiter) CheckLockout(ctx context.Context, scope, key string, maxFailures int) (locked bool, retryAfterSec int, currentFailures int) {
	if l == nil || maxFailures <= 0 {
		return false, 0, 0
	}
	bucketKey := fmt.Sprintf("rl:fail:%s:%s", scope, strings.TrimSpace(key))

	if l.redis != nil {
		pipe := l.redis.Pipeline()
		valCmd := pipe.Get(ctx, bucketKey)
		ttlCmd := pipe.PTTL(ctx, bucketKey)
		if _, err := pipe.Exec(ctx); err == nil || err == redis.Nil {
			var cnt int
			if raw, getErr := valCmd.Result(); getErr == nil {
				_, _ = fmt.Sscanf(raw, "%d", &cnt)
			}
			ttlMs := ttlCmd.Val().Milliseconds()
			if cnt >= maxFailures && ttlMs > 0 {
				sec := int(math.Ceil(float64(ttlMs) / 1000.0))
				if sec < 1 {
					sec = 1
				}
				return true, sec, cnt
			}
			return false, 0, cnt
		}
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	b, ok := l.buckets[bucketKey]
	if !ok || time.Now().After(b.resetAt) {
		delete(l.buckets, bucketKey)
		return false, 0, 0
	}
	if b.count >= maxFailures {
		sec := int(math.Ceil(time.Until(b.resetAt).Seconds()))
		if sec < 1 {
			sec = 1
		}
		return true, sec, b.count
	}
	return false, 0, b.count
}

// RecordFailure increments a failure-streak bucket (e.g., wrong password / wrong PIN) cleanly.
func (l *Limiter) RecordFailure(ctx context.Context, policyName, scope, key string, maxFailures int, window time.Duration) (locked bool, retryAfterSec int, currentFailures int) {
	if l == nil || maxFailures <= 0 {
		return false, 0, 0
	}
	if window <= 0 {
		window = 5 * time.Minute
	}
	bucketKey := fmt.Sprintf("rl:fail:%s:%s", scope, strings.TrimSpace(key))
	count, ttlMs, _ := l.incrementCounter(ctx, bucketKey, window)
	sec := int(math.Ceil(float64(ttlMs) / 1000.0))
	if sec < 1 {
		sec = 1
	}
	isLocked := count >= maxFailures
	if isLocked && policyName != "" {
		l.recordStat(ctx, policyName, false)
	}
	return isLocked, sec, count
}

// ClearFailures resets a failure streak upon successful authentication.
func (l *Limiter) ClearFailures(ctx context.Context, scope, key string) {
	if l == nil {
		return
	}
	bucketKey := fmt.Sprintf("rl:fail:%s:%s", scope, strings.TrimSpace(key))
	if l.redis != nil {
		_ = l.redis.Del(ctx, bucketKey).Err()
	}
	l.mu.Lock()
	delete(l.buckets, bucketKey)
	l.mu.Unlock()
}

// ShouldAuditBlock suppresses duplicate audit log inserts per offender key for cooldown duration.
func (l *Limiter) ShouldAuditBlock(scope, key string, cooldown time.Duration) bool {
	if l == nil {
		return false
	}
	if cooldown <= 0 {
		cooldown = time.Minute
	}
	mapKey := scope + ":" + key
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	if prev, ok := l.auditLog[mapKey]; ok && now.Sub(prev) < cooldown {
		return false
	}
	l.auditLog[mapKey] = now
	if len(l.auditLog) > 4096 {
		cutoff := now.Add(-cooldown)
		for k, ts := range l.auditLog {
			if ts.Before(cutoff) {
				delete(l.auditLog, k)
			}
		}
	}
	return true
}

// SnapshotMetrics returns live telemetry across every registered rate-limit policy.
func (l *Limiter) SnapshotMetrics(ctx context.Context) []PolicyMetrics {
	if l == nil {
		return nil
	}
	l.statsMu.RLock()
	order := append([]string(nil), l.order...)
	cfgs := make([]PolicyConfig, 0, len(order))
	localAllowed := make([]int64, 0, len(order))
	localBlocked := make([]int64, 0, len(order))
	for _, name := range order {
		st := l.policies[name]
		cfgs = append(cfgs, st.cfg)
		localAllowed = append(localAllowed, st.allowed.Load())
		localBlocked = append(localBlocked, st.blocked.Load())
	}
	l.statsMu.RUnlock()

	backend := "memory"
	var redisAllowed, redisBlocked map[string]string
	if l.redis != nil {
		if aMap, err := l.redis.HGetAll(ctx, "rl:stats:allowed").Result(); err == nil {
			redisAllowed = aMap
			backend = "redis"
		}
		if bMap, err := l.redis.HGetAll(ctx, "rl:stats:blocked").Result(); err == nil {
			redisBlocked = bMap
			backend = "redis"
		}
	}

	out := make([]PolicyMetrics, 0, len(cfgs))
	for i, cfg := range cfgs {
		allowed := localAllowed[i]
		blocked := localBlocked[i]
		if redisAllowed != nil {
			if raw, ok := redisAllowed[cfg.Name]; ok {
				var v int64
				_, _ = fmt.Sscanf(raw, "%d", &v)
				if v > allowed {
					allowed = v
				}
			}
		}
		if redisBlocked != nil {
			if raw, ok := redisBlocked[cfg.Name]; ok {
				var v int64
				_, _ = fmt.Sscanf(raw, "%d", &v)
				if v > blocked {
					blocked = v
				}
			}
		}
		out = append(out, PolicyMetrics{
			Name:          cfg.Name,
			Label:         cfg.Label,
			Description:   cfg.Description,
			Scope:         cfg.Scope,
			Limit:         cfg.Limit,
			WindowSeconds: int(cfg.Window.Seconds()),
			TotalAllowed:  allowed,
			TotalBlocked:  blocked,
			Backend:       backend,
		})
	}
	return out
}

func (l *Limiter) incrementCounter(ctx context.Context, bucketKey string, window time.Duration) (count int, ttlMs int64, usedRedis bool) {
	windowMs := window.Milliseconds()
	if windowMs <= 0 {
		windowMs = 60000
	}
	if l.redis != nil {
		res, err := incrWithTTLLua.Run(ctx, l.redis, []string{bucketKey}, windowMs).Result()
		if err == nil {
			if arr, ok := res.([]any); ok && len(arr) >= 2 {
				c64, ok1 := arr[0].(int64)
				t64, ok2 := arr[1].(int64)
				if ok1 && ok2 {
					return int(c64), t64, true
				}
			}
		}
	}

	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	b, ok := l.buckets[bucketKey]
	if !ok || now.After(b.resetAt) {
		b = &memBucket{
			count:   1,
			resetAt: now.Add(window),
		}
		l.buckets[bucketKey] = b
		if len(l.buckets) > 16384 {
			for k, item := range l.buckets {
				if now.After(item.resetAt) {
					delete(l.buckets, k)
				}
			}
		}
		return 1, windowMs, false
	}
	b.count++
	remMs := b.resetAt.Sub(now).Milliseconds()
	if remMs <= 0 {
		remMs = windowMs
	}
	return b.count, remMs, false
}

func (l *Limiter) recordStat(ctx context.Context, policyName string, allowed bool) {
	l.statsMu.RLock()
	st, ok := l.policies[policyName]
	l.statsMu.RUnlock()
	if ok {
		if allowed {
			st.allowed.Add(1)
		} else {
			st.blocked.Add(1)
		}
	}
	if l.redis != nil {
		hash := "rl:stats:blocked"
		if allowed {
			hash = "rl:stats:allowed"
		}
		_ = l.redis.HIncrBy(ctx, hash, policyName, 1).Err()
	}
}

