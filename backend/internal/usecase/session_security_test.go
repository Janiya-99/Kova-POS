package usecase

import (
	"context"
	"errors"
	"strings"
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

func TestPasswordResetTokenHelpersAndMailerGuard(t *testing.T) {
	code1, tok1, err := generateResetCodeAndToken()
	if err != nil {
		t.Fatalf("generateResetCodeAndToken failed: %v", err)
	}
	code2, tok2, err := generateResetCodeAndToken()
	if err != nil {
		t.Fatalf("second generateResetCodeAndToken failed: %v", err)
	}
	if len(code1) != 6 || len(code2) != 6 {
		t.Fatalf("expected 6-digit OTP codes, got %q and %q", code1, code2)
	}
	for _, r := range code1 {
		if r < '0' || r > '9' {
			t.Fatalf("expected numeric digit in OTP %q", code1)
		}
	}
	if len(tok1) < 32 || tok1 == tok2 {
		t.Fatalf("expected unique URL-safe tokens, got %q and %q", tok1, tok2)
	}

	key := []byte("kova-pos-secret")
	h1 := hashResetSecret(code1, key)
	h2 := hashResetSecret("  "+code1+" ", key)
	hOther := hashResetSecret("000000", key)
	if h1 == "" || h1 != h2 || h1 == strings.TrimSpace(code1) {
		t.Fatalf("expected deterministic non-plaintext HMAC hash, got %q vs %q", h1, h2)
	}
	if h1 == hOther && code1 != "000000" {
		t.Fatalf("expected different codes to produce different HMAC digests")
	}

	authUC := NewAuthUsecase(nil, nil, "kova-pos-secret", "pin-secret")
	_, _, sent, err := authUC.RequestPasswordResetEmail(context.Background(), "owner@zonaretail.com", "zona-retail", "127.0.0.1")
	if !errors.Is(err, ErrMailerNotConfigured) {
		t.Fatalf("expected ErrMailerNotConfigured when mailer is nil, got sent=%v err=%v", sent, err)
	}
}

