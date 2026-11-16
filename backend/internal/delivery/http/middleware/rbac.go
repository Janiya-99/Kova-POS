package middleware

import (
	"context"
	"strings"

	"github.com/enterprise-pos/backend/internal/domain"
	"github.com/enterprise-pos/backend/internal/infrastructure/tenant"
	"github.com/enterprise-pos/backend/internal/usecase"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

const (
	tenantContextLocal        = "tenant_context"
	tenantBundleLocal         = "tenant_bundle"
	platformAdminContextLocal = "platform_admin_context"
	supervisorClaimLocal      = "supervisor_claim"
)

// TenantBundleResolver resolves the isolated company DB pool/bundle for each verified request.
type TenantBundleResolver interface {
	GetByBusinessID(ctx context.Context, businessID uuid.UUID) (*tenant.TenantBundle, error)
}

// AuthMiddleware verifies the Bearer JWT and injects TenantContext into Fiber locals.
func AuthMiddleware(authUC *usecase.AuthUsecase) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		tokenStr := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		if tokenStr == "" || tokenStr == authHeader {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "missing or malformed Authorization Bearer token",
			})
		}

		tc, err := authUC.ParseJWT(tokenStr)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid or expired JWT",
			})
		}
		c.Locals(tenantContextLocal, tc)
		return c.Next()
	}
}

// TenantAuthMiddleware verifies a TENANT JWT, enforces database-per-company isolation, and binds its *tenant.TenantBundle.
func TenantAuthMiddleware(masterAuth *usecase.AuthUsecase, resolver TenantBundleResolver) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		tokenStr := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		if tokenStr == "" || tokenStr == authHeader {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "missing or malformed Authorization Bearer token",
			})
		}

		tc, err := masterAuth.ParseJWT(tokenStr)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": err.Error(),
			})
		}

		if resolver == nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "tenant database resolver unavailable",
			})
		}
		bundle, err := resolver.GetByBusinessID(c.UserContext(), tc.BusinessID)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": err.Error(),
			})
		}
		if tc.CompanySlug != "" && !strings.EqualFold(tc.CompanySlug, bundle.Slug) {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "company portal slug mismatch",
			})
		}
		if tc.CompanySlug == "" {
			tc.CompanySlug = bundle.Slug
		}
		if tc.DBName == "" {
			tc.DBName = bundle.DBName
		}

		sessionAuth := masterAuth
		if bundle.Auth != nil {
			sessionAuth = bundle.Auth
		}
		if sessionAuth != nil {
			if sErr := sessionAuth.ValidateTenantSession(c.UserContext(), tc); sErr != nil {
				return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
					"error": sErr.Error(),
					"code":  "SESSION_INVALID",
				})
			}
		}

		c.Locals(tenantContextLocal, tc)
		c.Locals(tenantBundleLocal, bundle)
		return c.Next()
	}
}

// PlatformAdminMiddleware verifies strictly TokenScope == "PLATFORM_ADMIN" JWTs and rejects all company tenant tokens.
func PlatformAdminMiddleware(masterAuth *usecase.AuthUsecase) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		tokenStr := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		if tokenStr == "" || tokenStr == authHeader {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "missing or malformed Authorization Bearer token",
			})
		}

		adminCtx, err := masterAuth.ParsePlatformAdminJWT(tokenStr)
		if err != nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": err.Error(),
			})
		}
		if sErr := masterAuth.ValidatePlatformAdminSession(c.UserContext(), adminCtx); sErr != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": sErr.Error(),
				"code":  "SESSION_INVALID",
			})
		}
		c.Locals(platformAdminContextLocal, adminCtx)
		return c.Next()
	}
}

// RequirePermission checks direct RBAC permission or valid X-Supervisor-Override-Token for override-capable actions.
func RequirePermission(fallbackAuth *usecase.AuthUsecase, permCode string) fiber.Handler {
	return RequireAnyPermission(fallbackAuth, permCode)
}

// RequireAnyPermission allows access when the caller has ANY listed permission or valid supervisor override token.
func RequireAnyPermission(fallbackAuth *usecase.AuthUsecase, permCodes ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tc, ok := GetTenantContext(c)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
		}

		authUC := fallbackAuth
		if bundle, ok := GetTenantBundle(c); ok && bundle != nil && bundle.Auth != nil {
			authUC = bundle.Auth
		}
		if authUC == nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "auth verifier unavailable"})
		}

		perms := authUC.GetEffectivePermissions(c.UserContext(), tc)
		for _, code := range permCodes {
			if HasPermission(perms, code) {
				return c.Next()
			}
		}

		// Supervisor override is supported on sensitive cashier actions.
		for _, code := range permCodes {
			if IsSupervisorOverridable(code) {
				overrideHeader := strings.TrimSpace(c.Get("X-Supervisor-Override-Token"))
				if overrideHeader != "" {
					claim, err := authUC.ParseOverrideToken(overrideHeader, tc.BusinessID, code)
					if err == nil {
						c.Locals(supervisorClaimLocal, claim)
						return c.Next()
					}
				}
			}
		}

		primary := ""
		if len(permCodes) > 0 {
			primary = permCodes[0]
		}
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error":               "permission_denied",
			"required_permission": primary,
			"can_override_pin":    IsSupervisorOverridable(primary),
		})
	}
}

// GetTenantContext extracts TenantContext from Fiber locals.
func GetTenantContext(c *fiber.Ctx) (domain.TenantContext, bool) {
	v := c.Locals(tenantContextLocal)
	if v == nil {
		return domain.TenantContext{}, false
	}
	tc, ok := v.(domain.TenantContext)
	return tc, ok
}

// GetTenantBundle extracts the company's dedicated *tenant.TenantBundle from Fiber locals.
func GetTenantBundle(c *fiber.Ctx) (*tenant.TenantBundle, bool) {
	v := c.Locals(tenantBundleLocal)
	if v == nil {
		return nil, false
	}
	bundle, ok := v.(*tenant.TenantBundle)
	return bundle, ok && bundle != nil
}

// GetPlatformAdminContext extracts PlatformAdminContext from Fiber locals.
func GetPlatformAdminContext(c *fiber.Ctx) (domain.PlatformAdminContext, bool) {
	v := c.Locals(platformAdminContextLocal)
	if v == nil {
		return domain.PlatformAdminContext{}, false
	}
	ctx, ok := v.(domain.PlatformAdminContext)
	return ctx, ok
}

// GetSupervisorClaim extracts optional SupervisorClaim from Fiber locals.
func GetSupervisorClaim(c *fiber.Ctx) (*domain.SupervisorClaim, bool) {
	v := c.Locals(supervisorClaimLocal)
	if v == nil {
		return nil, false
	}
	claim, ok := v.(*domain.SupervisorClaim)
	return claim, ok
}

// HasPermission returns true when target exists inside granted permissions slice.
func HasPermission(granted []string, target string) bool {
	for _, p := range granted {
		if p == target {
			return true
		}
	}
	return false
}

// IsSupervisorOverridable identifies actions that accept a signed 6-digit manager PIN override token.
func IsSupervisorOverridable(permCode string) bool {
	switch permCode {
	case "pos:void_bill", "pos:refund", "pos:discount_override":
		return true
	default:
		return false
	}
}
