package ratelimit

import (
	"context"
	"testing"
	"time"
)

func TestLimiterWindowIsolationAndLockout(t *testing.T) {
	ctx := context.Background()
	lim := NewLimiter(nil)

	// Allow 3 requests under auth_login override for user A
	for i := 1; i <= 3; i++ {
		res := lim.Allow(ctx, "auth_login", "ip:10.0.0.1", 3, time.Minute)
		if !res.Allowed {
			t.Fatalf("expected request %d to be allowed", i)
		}
		if res.Remaining != 3-i {
			t.Fatalf("expected remaining %d, got %d", 3-i, res.Remaining)
		}
	}

	// 4th request for user A must be blocked
	blocked := lim.Allow(ctx, "auth_login", "ip:10.0.0.1", 3, time.Minute)
	if blocked.Allowed {
		t.Fatalf("expected 4th request to be blocked")
	}
	if blocked.Remaining != 0 || blocked.RetryAfterSeconds < 1 {
		t.Fatalf("expected Remaining=0 and RetryAfterSeconds>=1, got %+v", blocked)
	}

	// Separate key (user B) remains isolated and allowed
	other := lim.Allow(ctx, "auth_login", "ip:10.0.0.2", 3, time.Minute)
	if !other.Allowed || other.Remaining != 2 {
		t.Fatalf("expected distinct key to remain allowed with 2 remaining, got %+v", other)
	}

	// Verify failure-streak lockout lifecycle
	locked, _, cnt := lim.CheckLockout(ctx, "login", "zona:owner@zonaretail.com", 3)
	if locked || cnt != 0 {
		t.Fatalf("expected unlocked initially, got locked=%v cnt=%d", locked, cnt)
	}

	for attempt := 1; attempt <= 2; attempt++ {
		l, _, f := lim.RecordFailure(ctx, "auth_login", "login", "zona:owner@zonaretail.com", 3, 5*time.Minute)
		if l || f != attempt {
			t.Fatalf("expected attempt %d not locked yet, got locked=%v fails=%d", attempt, l, f)
		}
	}

	l3, retrySec, f3 := lim.RecordFailure(ctx, "auth_login", "login", "zona:owner@zonaretail.com", 3, 5*time.Minute)
	if !l3 || f3 != 3 || retrySec < 1 {
		t.Fatalf("expected 3rd failure to lock with retrySec>=1, got locked=%v fails=%d retry=%d", l3, f3, retrySec)
	}

	lim.ClearFailures(ctx, "login", "zona:owner@zonaretail.com")
	lockedAfterClear, _, _ := lim.CheckLockout(ctx, "login", "zona:owner@zonaretail.com", 3)
	if lockedAfterClear {
		t.Fatalf("expected lockout cleared after successful auth")
	}

	// Verify metrics snapshot captured allowed & blocked hits
	stats := lim.SnapshotMetrics(ctx)
	var found bool
	for _, s := range stats {
		if s.Name == "auth_login" {
			found = true
			if s.TotalAllowed != 4 || s.TotalBlocked < 2 {
				t.Fatalf("unexpected metrics for auth_login: %+v", s)
			}
			if s.Backend != "memory" {
				t.Fatalf("expected memory backend when redis=nil, got %s", s.Backend)
			}
		}
	}
	if !found {
		t.Fatalf("expected auth_login in policy snapshot metrics")
	}
}

