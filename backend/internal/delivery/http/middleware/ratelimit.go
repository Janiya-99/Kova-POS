package middleware

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/enterprise-pos/backend/internal/domain"
	"github.com/enterprise-pos/backend/internal/infrastructure/ratelimit"
	"github.com/enterprise-pos/backend/internal/usecase"
	"github.com/gofiber/fiber/v2"
)

// ClientMeta extracts verified IP, User-Agent, and human device summary from the request.
func ClientMeta(c *fiber.Ctx) domain.SessionClientMeta {
	ua := strings.TrimSpace(c.Get("User-Agent"))
	return domain.SessionClientMeta{
		IPAddress:   strings.TrimSpace(c.IP()),
		UserAgent:   ua,
		DeviceLabel: usecase.SummarizeDeviceLabel(ua),
	}
}

// RateLimitOptions customizes per-route rate limiting behavior.
type RateLimitOptions struct {
	PolicyName     string
	KeyFn          func(c *fiber.Ctx) string
	WindowOverride time.Duration
	DynamicLimitFn func(c *fiber.Ctx) (enabled bool, limit int)
	OnBlocked      func(c *fiber.Ctx, res ratelimit.CheckResult)
}

// RateLimit enforces a distributed/fallback rate-limit policy and emits X-RateLimit-* & Retry-After headers.
func RateLimit(limiter *ratelimit.Limiter, opts RateLimitOptions) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if limiter == nil || strings.TrimSpace(opts.PolicyName) == "" {
			return c.Next()
		}

		limitOverride := 0
		if opts.DynamicLimitFn != nil {
			enabled, dynLimit := opts.DynamicLimitFn(c)
			if !enabled {
				return c.Next()
			}
			if dynLimit > 0 {
				limitOverride = dynLimit
			}
		}

		key := ""
		if opts.KeyFn != nil {
			key = strings.TrimSpace(opts.KeyFn(c))
		}
		if key == "" {
			key = "ip:" + strings.TrimSpace(c.IP())
		}

		res := limiter.Allow(c.UserContext(), opts.PolicyName, key, limitOverride, opts.WindowOverride)

		c.Set("X-RateLimit-Policy", res.Policy)
		c.Set("X-RateLimit-Limit", strconv.Itoa(res.Limit))
		c.Set("X-RateLimit-Remaining", strconv.Itoa(res.Remaining))
		c.Set("X-RateLimit-Reset", strconv.FormatInt(res.ResetAtUnix, 10))

		if !res.Allowed {
			c.Set("Retry-After", strconv.Itoa(res.RetryAfterSeconds))
			if opts.OnBlocked != nil {
				opts.OnBlocked(c, res)
			}
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error":               fmt.Sprintf("Rate limit exceeded (%s). Try again in %d seconds.", res.Policy, res.RetryAfterSeconds),
				"code":                "RATE_LIMIT_EXCEEDED",
				"policy":              res.Policy,
				"limit":               res.Limit,
				"remaining":           0,
				"retry_after_seconds": res.RetryAfterSeconds,
			})
		}

		return c.Next()
	}
}

// TooManyRequestsResponse writes a standardized 429 JSON error with Retry-After headers.
func TooManyRequestsResponse(c *fiber.Ctx, policy string, retryAfterSeconds, limit int, message string) error {
	if retryAfterSeconds < 1 {
		retryAfterSeconds = 1
	}
	c.Set("Retry-After", strconv.Itoa(retryAfterSeconds))
	if policy != "" {
		c.Set("X-RateLimit-Policy", policy)
	}
	if limit > 0 {
		c.Set("X-RateLimit-Limit", strconv.Itoa(limit))
	}
	c.Set("X-RateLimit-Remaining", "0")
	return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
		"error":               message,
		"code":                "RATE_LIMIT_EXCEEDED",
		"policy":              policy,
		"limit":               limit,
		"remaining":           0,
		"retry_after_seconds": retryAfterSeconds,
	})
}

