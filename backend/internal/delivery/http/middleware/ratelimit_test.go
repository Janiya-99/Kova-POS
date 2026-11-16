package middleware

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/enterprise-pos/backend/internal/infrastructure/ratelimit"
	"github.com/enterprise-pos/backend/internal/usecase"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

func TestRateLimitMiddlewareHeadersAnd429(t *testing.T) {
	lim := ratelimit.NewLimiter(nil)
	lim.RegisterPolicy(ratelimit.PolicyConfig{
		Name:   "test_burst",
		Label:  "Test Burst",
		Scope:  "IP",
		Limit:  2,
		Window: time.Minute,
	})

	blockedCalls := 0
	app := fiber.New()
	app.Get("/limited", RateLimit(lim, RateLimitOptions{
		PolicyName: "test_burst",
		KeyFn:      func(c *fiber.Ctx) string { return "client-1" },
		OnBlocked:  func(c *fiber.Ctx, res ratelimit.CheckResult) { blockedCalls++ },
	}), func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})

	for i := 0; i < 2; i++ {
		resp, err := app.Test(httptest.NewRequest("GET", "/limited", nil))
		if err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != fiber.StatusOK {
			t.Fatalf("expected 200 on request %d, got %d", i+1, resp.StatusCode)
		}
		if resp.Header.Get("X-RateLimit-Limit") != "2" {
			t.Fatalf("expected X-RateLimit-Limit=2, got %q", resp.Header.Get("X-RateLimit-Limit"))
		}
	}

	resp3, err := app.Test(httptest.NewRequest("GET", "/limited", nil))
	if err != nil {
		t.Fatal(err)
	}
	if resp3.StatusCode != fiber.StatusTooManyRequests {
		t.Fatalf("expected 429 on 3rd request, got %d", resp3.StatusCode)
	}
	if resp3.Header.Get("Retry-After") == "" || resp3.Header.Get("X-RateLimit-Remaining") != "0" {
		t.Fatalf("missing Retry-After or zero remaining header on 429")
	}
	var payload map[string]any
	if decErr := json.NewDecoder(resp3.Body).Decode(&payload); decErr != nil {
		t.Fatal(decErr)
	}
	if payload["code"] != "RATE_LIMIT_EXCEEDED" || payload["policy"] != "test_burst" {
		t.Fatalf("unexpected 429 JSON payload: %+v", payload)
	}
	if blockedCalls != 1 {
		t.Fatalf("expected OnBlocked callback once, got %d", blockedCalls)
	}
}

func TestRequireAnyPermission(t *testing.T) {
	authUC := usecase.NewAuthUsecase(nil, nil, "test-jwt-secret", "test-pin-secret")
	claims := usecase.AuthJWTClaims{
		UserID:      uuid.New().String(),
		BusinessID:  uuid.New().String(),
		RoleCode:    "BranchManager",
		Permissions: []string{"security:sessions_view"},
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte("test-jwt-secret"))
	if err != nil {
		t.Fatal(err)
	}

	app := fiber.New()
	app.Get("/sec", AuthMiddleware(authUC), RequireAnyPermission(authUC, "security:sessions_view", "rbac:view"), func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})
	req := httptest.NewRequest("GET", "/sec", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("expected 200 for security:sessions_view via RequireAnyPermission, got %d", resp.StatusCode)
	}
}

