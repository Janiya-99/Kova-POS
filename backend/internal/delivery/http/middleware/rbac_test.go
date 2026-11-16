package middleware

import (
	"testing"

	"github.com/enterprise-pos/backend/internal/domain"
	"github.com/enterprise-pos/backend/internal/usecase"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"net/http/httptest"
	"time"
)

func TestSupervisorOverrideTenantIsolationAndRBAC(t *testing.T) {
	authUC := usecase.NewAuthUsecase(nil, nil, "test-jwt-secret", "test-pin-secret")
	bizA := uuid.New()
	bizB := uuid.New()
	userID := uuid.New()

	// Create JWT for a Cashier in bizA (no direct pos:void_bill permission)
	claims := usecase.AuthJWTClaims{
		UserID:      userID.String(),
		BusinessID:  bizA.String(),
		RoleCode:    "Cashier",
		Permissions: []string{"pos:view", "pos:checkout"},
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	cashierToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte("test-jwt-secret"))
	if err != nil {
		t.Fatal(err)
	}

	// Create an override token belonging to bizB (cross-tenant attack attempt)
	wrongTenantOverride, err := jwt.NewWithClaims(jwt.SigningMethodHS256, usecase.OverrideJWTClaims{
		SupervisorID: uuid.New().String(),
		BusinessID:   bizB.String(),
		Action:       "pos:void_bill",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(5 * time.Minute)),
		},
	}).SignedString([]byte("test-pin-secret"))
	if err != nil {
		t.Fatal(err)
	}

	// Valid override token for bizA + pos:void_bill
	validOverride, err := jwt.NewWithClaims(jwt.SigningMethodHS256, usecase.OverrideJWTClaims{
		SupervisorID:   uuid.New().String(),
		SupervisorName: "Marcus Sterling",
		BusinessID:     bizA.String(),
		Action:         "pos:void_bill",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(5 * time.Minute)),
		},
	}).SignedString([]byte("test-pin-secret"))
	if err != nil {
		t.Fatal(err)
	}

	app := fiber.New()
	app.Post("/void", AuthMiddleware(authUC), RequirePermission(authUC, "pos:void_bill"), func(c *fiber.Ctx) error {
		tc, _ := GetTenantContext(c)
		if tc.BusinessID != bizA {
			return c.SendStatus(fiber.StatusInternalServerError)
		}
		claim, ok := GetSupervisorClaim(c)
		if !ok || claim.SupervisorName != "Marcus Sterling" {
			return c.SendStatus(fiber.StatusBadRequest)
		}
		return c.SendStatus(fiber.StatusOK)
	})

	// 1. Without override -> 403 Forbidden
	req1 := httptest.NewRequest("POST", "/void", nil)
	req1.Header.Set("Authorization", "Bearer "+cashierToken)
	resp1, _ := app.Test(req1)
	if resp1.StatusCode != fiber.StatusForbidden {
		t.Fatalf("expected 403 without override, got %d", resp1.StatusCode)
	}

	// 2. With cross-tenant override (bizB) -> 403 Forbidden
	req2 := httptest.NewRequest("POST", "/void", nil)
	req2.Header.Set("Authorization", "Bearer "+cashierToken)
	req2.Header.Set("X-Supervisor-Override-Token", wrongTenantOverride)
	resp2, _ := app.Test(req2)
	if resp2.StatusCode != fiber.StatusForbidden {
		t.Fatalf("expected 403 for cross-tenant override token, got %d", resp2.StatusCode)
	}

	// 3. With valid bizA override -> 200 OK
	req3 := httptest.NewRequest("POST", "/void", nil)
	req3.Header.Set("Authorization", "Bearer "+cashierToken)
	req3.Header.Set("X-Supervisor-Override-Token", validOverride)
	resp3, _ := app.Test(req3)
	if resp3.StatusCode != fiber.StatusOK {
		t.Fatalf("expected 200 with valid supervisor override, got %d", resp3.StatusCode)
	}

	_ = domain.TenantContext{}
}

func TestPlatformAndTenantTokenScopeIsolation(t *testing.T) {
	authUC := usecase.NewAuthUsecase(nil, nil, "test-jwt-secret", "test-pin-secret")
	bizID := uuid.New()
	adminID := uuid.New()

	tenantTok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, usecase.AuthJWTClaims{
		TokenScope:  "TENANT",
		CompanySlug: "zona-retail",
		UserID:      uuid.New().String(),
		BusinessID:  bizID.String(),
		RoleCode:    "BusinessOwner",
		Permissions: []string{"analytics:view", "platform:admin"},
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}).SignedString([]byte("test-jwt-secret"))
	if err != nil {
		t.Fatal(err)
	}

	platformTok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, usecase.PlatformAdminJWTClaims{
		TokenScope: "PLATFORM_ADMIN",
		AdminID:    adminID.String(),
		Email:      "admin@kovapos.com",
		FullName:   "Kova Root Admin",
		Title:      "Kova Platform SuperAdmin",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}).SignedString([]byte("test-jwt-secret"))
	if err != nil {
		t.Fatal(err)
	}

	app := fiber.New()
	app.Get("/tenant/overview", AuthMiddleware(authUC), RequirePermission(authUC, "analytics:view"), func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})
	app.Get("/admin/companies", PlatformAdminMiddleware(authUC), func(c *fiber.Ctx) error {
		admin, ok := GetPlatformAdminContext(c)
		if !ok || admin.AdminID != adminID {
			return c.SendStatus(fiber.StatusInternalServerError)
		}
		return c.SendStatus(fiber.StatusOK)
	})

	// 1. Platform Admin token cannot access tenant routes
	req1 := httptest.NewRequest("GET", "/tenant/overview", nil)
	req1.Header.Set("Authorization", "Bearer "+platformTok)
	resp1, _ := app.Test(req1)
	if resp1.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("expected 401 when Platform Admin token hits tenant endpoint, got %d", resp1.StatusCode)
	}

	// 2. Tenant token (even with BusinessOwner/stale platform:admin claim) cannot access /admin routes
	req2 := httptest.NewRequest("GET", "/admin/companies", nil)
	req2.Header.Set("Authorization", "Bearer "+tenantTok)
	resp2, _ := app.Test(req2)
	if resp2.StatusCode != fiber.StatusForbidden {
		t.Fatalf("expected 403 when Tenant token hits admin endpoint, got %d", resp2.StatusCode)
	}

	// 3. Valid tokens work in their respective scopes
	req3 := httptest.NewRequest("GET", "/tenant/overview", nil)
	req3.Header.Set("Authorization", "Bearer "+tenantTok)
	resp3, _ := app.Test(req3)
	if resp3.StatusCode != fiber.StatusOK {
		t.Fatalf("expected 200 for tenant token on tenant endpoint, got %d", resp3.StatusCode)
	}

	req4 := httptest.NewRequest("GET", "/admin/companies", nil)
	req4.Header.Set("Authorization", "Bearer "+platformTok)
	resp4, _ := app.Test(req4)
	if resp4.StatusCode != fiber.StatusOK {
		t.Fatalf("expected 200 for platform token on admin endpoint, got %d", resp4.StatusCode)
	}

	// 4. Unmatched /api/v1/admin/* paths hitting TenantAuthMiddleware must return 404 (not 401 forced admin logout)
	appTenantGuard := fiber.New()
	appTenantGuard.Use("/api/v1", TenantAuthMiddleware(authUC, nil))
	req5 := httptest.NewRequest("GET", "/api/v1/admin/unknown-probe", nil)
	req5.Header.Set("Authorization", "Bearer "+platformTok)
	resp5, _ := appTenantGuard.Test(req5)
	if resp5.StatusCode != fiber.StatusNotFound {
		t.Fatalf("expected 404 when unmatched /api/v1/admin/* hits TenantAuthMiddleware, got %d", resp5.StatusCode)
	}
}

