package usecase

import (
	"context"
	"testing"
	"time"

	"github.com/enterprise-pos/backend/internal/domain"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

func TestSessionJWTParsingAndPolicyDefaults(t *testing.T) {
	authUC := NewAuthUsecase(nil, nil, "jwt-secret", "pin-secret")
	sessID := uuid.New()
	userID := uuid.New()
	bizID := uuid.New()
	exp := time.Now().Add(8 * time.Hour).Truncate(time.Second)

	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, AuthJWTClaims{
		TokenScope: "TENANT",
		UserID:     userID.String(),
		BusinessID: bizID.String(),
		RoleCode:   "BusinessOwner",
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        sessID.String(),
			Subject:   userID.String(),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(exp),
		},
	}).SignedString([]byte("jwt-secret"))
	if err != nil {
		t.Fatal(err)
	}

	tc, err := authUC.ParseJWT(tok)
	if err != nil {
		t.Fatalf("ParseJWT failed: %v", err)
	}
	if tc.SessionID != sessID {
		t.Fatalf("expected SessionID=%s, got %s", sessID, tc.SessionID)
	}
	if tc.SessionExpiresAt == nil || !tc.SessionExpiresAt.Equal(exp) {
		t.Fatalf("expected SessionExpiresAt=%v, got %v", exp, tc.SessionExpiresAt)
	}

	// Verify SummarizeDeviceLabel
	if got := SummarizeDeviceLabel("Mozilla/5.0 (X11; Linux x86_64) Chrome/131.0.0.0 Safari/537.36"); got != "Chrome · Linux" {
		t.Fatalf("expected Chrome · Linux, got %q", got)
	}
	if got := SummarizeDeviceLabel("Mozilla/5.0 (Windows NT 10.0) Edg/131.0"); got != "Edge · Windows" {
		t.Fatalf("expected Edge · Windows, got %q", got)
	}

	// Verify default session & rate-limit policy resolution when SettingsResolver is absent
	policy := authUC.ResolveSessionPolicy(context.Background(), bizID, uuid.Nil, uuid.Nil)
	if policy.TTLHours != 24 || policy.IdleTimeoutMinutes != 480 || policy.MaxConcurrent != 5 || !policy.RateLimitEnabled || policy.APIRPM != 240 {
		t.Fatalf("unexpected default session policy: %+v", policy)
	}

	// Verify ValidateTenantSession rejects missing jti when a session backing store (redis) is attached
	rdb := redis.NewClient(&redis.Options{Addr: "127.0.0.1:0"})
	defer func() { _ = rdb.Close() }()
	storeAuth := NewAuthUsecase(nil, rdb, "jwt-secret", "pin-secret")
	if err := storeAuth.ValidateTenantSession(context.Background(), domain.TenantContext{
		UserID:     userID,
		BusinessID: bizID,
		SessionID:  uuid.Nil,
	}); err == nil {
		t.Fatalf("expected missing session identifier error when store is wired")
	}
}

