package http

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/enterprise-pos/backend/internal/delivery/http/middleware"
	"github.com/enterprise-pos/backend/internal/domain"
	"github.com/enterprise-pos/backend/internal/infrastructure/ratelimit"
	"github.com/enterprise-pos/backend/internal/infrastructure/tenant"
	"github.com/enterprise-pos/backend/internal/infrastructure/ws"
	"github.com/enterprise-pos/backend/internal/repository/sqlc/db"
	"github.com/enterprise-pos/backend/internal/usecase"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// Handler routes HTTP traffic either to the Master Control Plane or strictly to a company's isolated TenantBundle DB.
type Handler struct {
	masterAuth  *usecase.AuthUsecase
	adminAudit  *usecase.AdminAuditUsecase
	tenants     *tenant.TenantManager
	rateLimiter *ratelimit.Limiter
	hub         *ws.Hub
}

// NewHandler constructs an HTTP Handler wired to Master Auth, Master Admin/Audit, and the TenantManager.
func NewHandler(
	masterAuth *usecase.AuthUsecase,
	adminAudit *usecase.AdminAuditUsecase,
	tenants *tenant.TenantManager,
) *Handler {
	return &Handler{
		masterAuth:  masterAuth,
		adminAudit:  adminAudit,
		tenants:     tenants,
		rateLimiter: ratelimit.NewLimiter(nil),
	}
}

// SetRateLimiter attaches a Redis-backed RateLimiter instance to HTTP handlers and route middlewares.
func (h *Handler) SetRateLimiter(limiter *ratelimit.Limiter) {
	if limiter != nil {
		h.rateLimiter = limiter
	}
}

// SetHub attaches the real-time WebSocket hub for broadcasting domain mutation events across terminals.
func (h *Handler) SetHub(hub *ws.Hub) {
	h.hub = hub
}

func resolveTenantMutationEvent(path string) string {
	switch {
	case strings.HasPrefix(path, "/api/v1/pos/checkout"), strings.HasPrefix(path, "/api/v1/pos/invoices"):
		return "SALE_COMPLETED"
	case strings.HasPrefix(path, "/api/v1/products"), strings.HasPrefix(path, "/api/v1/categories"):
		return "CATALOG_UPDATED"
	case strings.HasPrefix(path, "/api/v1/customers"):
		return "CUSTOMER_UPDATED"
	case strings.HasPrefix(path, "/api/v1/suppliers"):
		return "SUPPLIER_UPDATED"
	case strings.HasPrefix(path, "/api/v1/inventory"), strings.HasPrefix(path, "/api/v1/procurement"):
		return "INVENTORY_UPDATED"
	case strings.HasPrefix(path, "/api/v1/accounting"):
		return "ACCOUNTING_UPDATED"
	case strings.HasPrefix(path, "/api/v1/tax-groups"), strings.HasPrefix(path, "/api/v1/tax-rules"):
		return "TAX_UPDATED"
	case strings.HasPrefix(path, "/api/v1/branches"), strings.HasPrefix(path, "/api/v1/terminals"):
		return "BRANCH_UPDATED"
	case strings.HasPrefix(path, "/api/v1/access"):
		return "RBAC_UPDATED"
	case strings.HasPrefix(path, "/api/v1/security"), strings.HasPrefix(path, "/api/v1/auth/sessions"):
		return "SECURITY_UPDATED"
	case strings.HasPrefix(path, "/api/v1/notifications"):
		return "NOTIFICATION_UPDATED"
	case strings.HasPrefix(path, "/api/v1/company/settings"):
		return "SETTINGS_UPDATED"
	default:
		return ""
	}
}

// RealtimeTenantMutationMiddleware broadcasts typed real-time invalidation events to connected tenant terminals
// immediately after any mutating endpoint completes cleanly.
func (h *Handler) RealtimeTenantMutationMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		err := c.Next()
		if err != nil || h.hub == nil || c.Response().StatusCode() >= 400 {
			return err
		}
		method := c.Method()
		if method != fiber.MethodPost && method != fiber.MethodPut && method != fiber.MethodPatch && method != fiber.MethodDelete {
			return nil
		}
		evType := resolveTenantMutationEvent(c.Path())
		if evType == "" {
			return nil
		}
		if tc, ok := middleware.GetTenantContext(c); ok && tc.BusinessID != uuid.Nil {
			h.hub.BroadcastTenant(tc.BusinessID, evType, map[string]any{
				"path":      c.Path(),
				"method":    method,
				"actor_id":  tc.UserID.String(),
				"branch_id": tc.BranchID.String(),
				"ts":        time.Now().UTC().UnixMilli(),
			})
		}
		return nil
	}
}

// RealtimeAdminMutationMiddleware broadcasts live Platform Control Plane invalidation events on mutations.
func (h *Handler) RealtimeAdminMutationMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		err := c.Next()
		if err != nil || h.hub == nil || c.Response().StatusCode() >= 400 {
			return err
		}
		method := c.Method()
		if method != fiber.MethodPost && method != fiber.MethodPut && method != fiber.MethodPatch && method != fiber.MethodDelete {
			return nil
		}
		path := c.Path()
		if strings.HasSuffix(path, "/refresh") || strings.HasSuffix(path, "/logout") {
			return nil
		}
		h.hub.BroadcastAdmin("ADMIN_SYNC", map[string]any{
			"path":   path,
			"method": method,
			"ts":     time.Now().UTC().UnixMilli(),
		})
		return nil
	}
}

func (h *Handler) mustBundle(c *fiber.Ctx) *tenant.TenantBundle {
	b, _ := middleware.GetTenantBundle(c)
	return b
}

func (h *Handler) authUC(c *fiber.Ctx) *usecase.AuthUsecase           { return h.mustBundle(c).Auth }
func (h *Handler) settingsUC(c *fiber.Ctx) *usecase.SettingsResolver   { return h.mustBundle(c).Settings }
func (h *Handler) inventoryUC(c *fiber.Ctx) *usecase.InventoryFIFOUsecase { return h.mustBundle(c).Inventory }
func (h *Handler) posUC(c *fiber.Ctx) *usecase.POSCheckoutUsecase      { return h.mustBundle(c).POS }
func (h *Handler) accountingUC(c *fiber.Ctx) *usecase.AccountingGLUsecase { return h.mustBundle(c).Accounting }
func (h *Handler) analyticsUC(c *fiber.Ctx) *usecase.AnalyticsUsecase  { return h.mustBundle(c).Analytics }
func (h *Handler) catalogUC(c *fiber.Ctx) *usecase.CatalogCompanyUsecase { return h.mustBundle(c).Catalog }
func (h *Handler) printStudioUC(c *fiber.Ctx) *usecase.PrintStudioUsecase { return h.mustBundle(c).PrintStudio }
func (h *Handler) branchesUC(c *fiber.Ctx) *usecase.BranchTerminalUsecase { return h.mustBundle(c).Branches }

func (h *Handler) hasPermission(c *fiber.Ctx, tc domain.TenantContext, perm string) bool {
	for _, p := range h.authUC(c).GetEffectivePermissions(c.UserContext(), tc) {
		if p == perm {
			return true
		}
	}
	return false
}

func (h *Handler) recordAudit(c *fiber.Ctx, tc domain.TenantContext, module, action, entityType, entityID, summary, status string, metadata any) {
	if h.adminAudit == nil {
		return
	}
	h.adminAudit.RecordTenantEvent(c.UserContext(), tc, module, action, entityType, entityID, summary, c.IP(), status, metadata)
}

// Health returns 200 OK for Docker/load-balancer readiness probes.
func (h *Handler) Health(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "ok", "service": "pos-erp-api"})
}

// GetPublicCompanies returns active registered companies for 1-to-1 company portal selection (/login).
func (h *Handler) GetPublicCompanies(c *fiber.Ctx) error {
	rows, err := h.masterAuth.ListPublicCompanies(c.UserContext())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"companies": rows})
}

func (h *Handler) resolvePublicTenant(c *fiber.Ctx, slugRaw, bizIDRaw string) (*tenant.TenantBundle, error) {
	if slug := strings.TrimSpace(slugRaw); slug != "" {
		return h.tenants.GetBySlug(c.UserContext(), slug)
	}
	if rawBiz := strings.TrimSpace(bizIDRaw); rawBiz != "" {
		if parsed, err := uuid.Parse(rawBiz); err == nil && parsed != uuid.Nil {
			return h.tenants.GetByBusinessID(c.UserContext(), parsed)
		}
	}
	return nil, fiber.NewError(fiber.StatusBadRequest, "company_slug is required for 1-to-1 portal resolution")
}

func (h *Handler) resolveCandidateTenantsForEmail(c *fiber.Ctx, emailRaw string) ([]*tenant.TenantBundle, []db.ListPublicPlatformCompaniesRow) {
	normEmail := strings.ToLower(strings.TrimSpace(emailRaw))
	if normEmail == "" || !strings.Contains(normEmail, "@") {
		return nil, nil
	}
	companies, err := h.masterAuth.ListPublicCompanies(c.UserContext())
	if err != nil || len(companies) == 0 {
		return nil, nil
	}
	bundles := make([]*tenant.TenantBundle, 0, 2)
	matchedMeta := make([]db.ListPublicPlatformCompaniesRow, 0, 2)
	for _, comp := range companies {
		b, bErr := h.tenants.GetByBusinessID(c.UserContext(), comp.ID)
		if bErr != nil || b.Queries == nil {
			continue
		}
		if _, uErr := b.Queries.GetUserByEmail(c.UserContext(), normEmail); uErr == nil {
			bundles = append(bundles, b)
			matchedMeta = append(matchedMeta, comp)
		}
	}
	return bundles, matchedMeta
}

// resolvePublicTenantForAuth resolves explicit portal targets or, when omitted on direct /login,
// matches the tenant database containing the user's email cleanly without falling back across tenants.
func (h *Handler) resolvePublicTenantForAuth(c *fiber.Ctx, slugRaw, bizIDRaw, emailRaw string) (*tenant.TenantBundle, error) {
	if strings.TrimSpace(slugRaw) != "" || strings.TrimSpace(bizIDRaw) != "" {
		return h.resolvePublicTenant(c, slugRaw, bizIDRaw)
	}
	bundles, _ := h.resolveCandidateTenantsForEmail(c, emailRaw)
	if len(bundles) > 0 {
		return bundles[0], nil
	}
	return nil, fiber.NewError(fiber.StatusUnauthorized, "no active company account found for that email")
}

// DiscoverWorkspaceByEmail resolves a staff member's company branding on /login directly from their email address.
func (h *Handler) DiscoverWorkspaceByEmail(c *fiber.Ctx) error {
	normEmail := strings.ToLower(strings.TrimSpace(c.Query("email")))
	if normEmail == "" || !strings.Contains(normEmail, "@") {
		return c.JSON(fiber.Map{"matched": false})
	}
	_, matches := h.resolveCandidateTenantsForEmail(c, normEmail)
	if len(matches) == 0 {
		return c.JSON(fiber.Map{"matched": false})
	}
	return c.JSON(fiber.Map{
		"matched":   true,
		"multiple":  len(matches) > 1,
		"company":   matches[0],
		"companies": matches,
	})
}

// GetPublicBranding returns dynamic white-label branding for a specific 1-to-1 company portal (?company_slug=...).
func (h *Handler) GetPublicBranding(c *fiber.Ctx) error {
	slug := strings.TrimSpace(c.Query("company_slug"))
	bizParam := strings.TrimSpace(c.Query("business_id"))
	if slug != "" || bizParam != "" {
		bundle, err := h.resolvePublicTenant(c, slug, bizParam)
		if err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		}
		branding, bErr := bundle.Auth.GetPublicBranding(c.UserContext(), &bundle.CompanyID)
		if bErr != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": bErr.Error()})
		}
		return c.JSON(fiber.Map{
			"id":                branding.ID,
			"slug":              bundle.Slug,
			"name":              branding.Name,
			"trade_name":        branding.TradeName,
			"base_currency":     branding.BaseCurrency,
			"logo_light_url":    branding.LogoLightUrl,
			"logo_dark_url":     branding.LogoDarkUrl,
			"primary_color_hex": branding.PrimaryColorHex,
			"default_language":  branding.DefaultLanguage,
		})
	}
	return c.JSON(fiber.Map{
		"trade_name":        "Kova POS",
		"base_currency":     "USD",
		"logo_light_url":    "",
		"logo_dark_url":     "",
		"primary_color_hex": "#10B981",
		"default_language":  "en",
	})
}

// Login authenticates a company user strictly against that company's dedicated database (auto-resolved by email on /login, or pinned on /c/:slug/login).
func (h *Handler) Login(c *fiber.Ctx) error {
	var body struct {
		Email       string `json:"email"`
		Password    string `json:"password"`
		CompanySlug string `json:"company_slug"`
		BusinessID  string `json:"business_id,omitempty"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid login payload"})
	}

	normEmail := strings.ToLower(strings.TrimSpace(body.Email))
	var candidates []*tenant.TenantBundle
	if strings.TrimSpace(body.CompanySlug) != "" || strings.TrimSpace(body.BusinessID) != "" {
		bundle, err := h.resolvePublicTenant(c, body.CompanySlug, body.BusinessID)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		candidates = []*tenant.TenantBundle{bundle}
	} else {
		matched, _ := h.resolveCandidateTenantsForEmail(c, normEmail)
		if len(matched) == 0 {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid email or password"})
		}
		candidates = matched
	}

	var lastErr error
	for idx, bundle := range candidates {
		policy := bundle.Auth.ResolveSessionPolicy(c.UserContext(), bundle.CompanyID, uuid.Nil, uuid.Nil)
		failKey := bundle.Slug + ":" + normEmail
		if h.rateLimiter != nil && policy.RateLimitEnabled && normEmail != "" {
			if locked, retrySec, _ := h.rateLimiter.CheckLockout(c.UserContext(), "login", failKey, policy.LoginMaxAttempts); locked {
				if idx == len(candidates)-1 {
					h.recordRateLimitAudit(c, &bundle.CompanyID, bundle.Slug, bundle.DBName, normEmail, "auth_login", retrySec)
					return middleware.TooManyRequestsResponse(
						c,
						"auth_login",
						retrySec,
						policy.LoginMaxAttempts,
						fmt.Sprintf("Too many failed sign-in attempts for this account. Try again in %d seconds.", retrySec),
					)
				}
				continue
			}
		}

		req := usecase.LoginRequest{
			Email:      body.Email,
			Password:   body.Password,
			BusinessID: bundle.CompanyID.String(),
		}
		res, err := bundle.Auth.LoginWithMeta(c.UserContext(), req, middleware.ClientMeta(c))
		if err == nil {
			if h.rateLimiter != nil && normEmail != "" {
				h.rateLimiter.ClearFailures(c.UserContext(), "login", failKey)
			}
			h.recordAudit(c, res.Context, "AUTH", "USER_LOGIN", "user", res.Context.UserID.String(),
				res.Context.FullName+" signed in as "+res.Context.RoleName+" ("+bundle.Slug+" -> "+bundle.DBName+")",
				"SUCCESS", map[string]any{
					"industry_profile": res.Context.IndustryProfile,
					"company_slug":     bundle.Slug,
					"db_name":          bundle.DBName,
					"session_id":       res.Context.SessionID.String(),
				})
			return c.JSON(res)
		}

		lastErr = err
		if h.adminAudit != nil {
			h.adminAudit.RecordEvent(c.UserContext(), usecase.AuditEventInput{
				BusinessID:  &bundle.CompanyID,
				CompanySlug: bundle.Slug,
				DBName:      bundle.DBName,
				ActorEmail:  normEmail,
				Module:      "AUTH",
				Action:      "LOGIN_FAILED",
				EntityType:  "user",
				EntityID:    normEmail,
				Summary:     "Failed login attempt on " + bundle.Slug + " for " + normEmail,
				IPAddress:   c.IP(),
				Status:      "DENIED",
			})
		}
		if idx == len(candidates)-1 && h.rateLimiter != nil && policy.RateLimitEnabled && normEmail != "" {
			if locked, retrySec, fails := h.rateLimiter.RecordFailure(c.UserContext(), "auth_login", "login", failKey, policy.LoginMaxAttempts, 5*time.Minute); locked {
				h.recordRateLimitAudit(c, &bundle.CompanyID, bundle.Slug, bundle.DBName, normEmail, "auth_login", retrySec)
				return middleware.TooManyRequestsResponse(
					c,
					"auth_login",
					retrySec,
					policy.LoginMaxAttempts,
					fmt.Sprintf("Too many failed sign-in attempts (%d). Account temporarily locked for %d seconds.", fails, retrySec),
				)
			}
		}
	}

	if lastErr == nil {
		lastErr = fiber.NewError(fiber.StatusUnauthorized, "invalid email or password")
	}
	return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": lastErr.Error()})
}

// SwitchContext updates active branch or terminal inside the user's dedicated company database.
func (h *Handler) SwitchContext(c *fiber.Ctx) error {
	tc, ok := middleware.GetTenantContext(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}
	var body struct {
		BusinessID string `json:"business_id"`
		BranchID   string `json:"branch_id"`
		TerminalID string `json:"terminal_id"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid context switch payload"})
	}
	bizID, _ := uuid.Parse(body.BusinessID)
	brID, _ := uuid.Parse(body.BranchID)
	termID, _ := uuid.Parse(body.TerminalID)

	res, err := h.authUC(c).SwitchContextWithMeta(c.UserContext(), tc, bizID, brID, termID, middleware.ClientMeta(c))
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, res.Context, "AUTH", "CONTEXT_SWITCH", "business", res.Context.BusinessID.String(),
		res.Context.FullName+" switched workspace branch/terminal in "+res.Context.BusinessName,
		"SUCCESS", map[string]any{"branch_id": res.Context.BranchID, "terminal_id": res.Context.TerminalID})
	return c.JSON(res)
}

// VerifySupervisorPIN validates a 6-digit manager PIN inside the tenant DB and returns X-Supervisor-Override-Token.
func (h *Handler) VerifySupervisorPIN(c *fiber.Ctx) error {
	tc, ok := middleware.GetTenantContext(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}
	var body struct {
		PIN    string `json:"pin"`
		Action string `json:"action"`
		Reason string `json:"reason"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid PIN verification payload"})
	}

	policy := h.authUC(c).ResolveSessionPolicy(c.UserContext(), tc.BusinessID, tc.BranchID, tc.TerminalID)
	pinFailKey := tc.BusinessID.String() + ":" + tc.UserID.String()
	if h.rateLimiter != nil && policy.RateLimitEnabled {
		if locked, retrySec, _ := h.rateLimiter.CheckLockout(c.UserContext(), "pin", pinFailKey, policy.PINMaxAttempts); locked {
			h.recordRateLimitAudit(c, &tc.BusinessID, tc.CompanySlug, tc.DBName, tc.Email, "pin_verify", retrySec)
			return middleware.TooManyRequestsResponse(
				c,
				"pin_verify",
				retrySec,
				policy.PINMaxAttempts,
				fmt.Sprintf("Supervisor PIN locked after repeated failed attempts. Retry in %d seconds.", retrySec),
			)
		}
	}

	tok, claim, err := h.authUC(c).VerifySupervisorPIN(c.UserContext(), tc.BusinessID, body.PIN, body.Action, body.Reason)
	if err != nil {
		h.recordAudit(c, tc, "POS", "SUPERVISOR_PIN_DENIED", "override", body.Action,
			"Invalid supervisor PIN attempt for "+body.Action, "DENIED", map[string]any{"reason": body.Reason})
		if h.rateLimiter != nil && policy.RateLimitEnabled {
			if locked, retrySec, fails := h.rateLimiter.RecordFailure(c.UserContext(), "pin_verify", "pin", pinFailKey, policy.PINMaxAttempts, 5*time.Minute); locked {
				h.recordRateLimitAudit(c, &tc.BusinessID, tc.CompanySlug, tc.DBName, tc.Email, "pin_verify", retrySec)
				return middleware.TooManyRequestsResponse(
					c,
					"pin_verify",
					retrySec,
					policy.PINMaxAttempts,
					fmt.Sprintf("Too many invalid supervisor PIN attempts (%d). Retry in %d seconds.", fails, retrySec),
				)
			}
		}
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	if h.rateLimiter != nil {
		h.rateLimiter.ClearFailures(c.UserContext(), "pin", pinFailKey)
	}
	h.recordAudit(c, tc, "POS", "SUPERVISOR_PIN_APPROVED", "override", claim.SupervisorID.String(),
		"Supervisor "+claim.SupervisorName+" approved "+body.Action, "SUCCESS", map[string]any{"reason": body.Reason})
	return c.JSON(fiber.Map{
		"override_token": tok,
		"supervisor":     claim,
	})
}

// ForgotPassword generates a single-use 6-digit email OTP + reset link and sends it via configured SMTP relay.
func (h *Handler) ForgotPassword(c *fiber.Ctx) error {
	var body struct {
		Email       string `json:"email"`
		CompanySlug string `json:"company_slug"`
		BusinessID  string `json:"business_id,omitempty"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid forgot-password payload"})
	}
	cleanEmail := strings.ToLower(strings.TrimSpace(body.Email))
	if cleanEmail == "" || !strings.Contains(cleanEmail, "@") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "valid email address is required"})
	}

	// Apply per-email recovery throttling alongside the IP limiter so repeated inbox bombs are blocked.
	if h.rateLimiter != nil {
		if res := h.rateLimiter.Allow(c.UserContext(), "auth_recovery", "email:"+cleanEmail, 0, 0); !res.Allowed {
			h.onRateLimitBlocked(c, res)
			return middleware.TooManyRequestsResponse(
				c,
				res.Policy,
				res.RetryAfterSeconds,
				res.Limit,
				fmt.Sprintf("Too many password reset requests for %s. Try again in %d seconds.", cleanEmail, res.RetryAfterSeconds),
			)
		}
	}

	bundle, bErr := h.resolvePublicTenantForAuth(c, body.CompanySlug, body.BusinessID, cleanEmail)
	if bErr != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": bErr.Error()})
	}

	userID, bizID, sent, err := bundle.Auth.RequestPasswordResetEmail(c.UserContext(), cleanEmail, bundle.Slug, c.IP())
	if err != nil {
		if h.adminAudit != nil {
			h.adminAudit.RecordEvent(c.UserContext(), usecase.AuditEventInput{
				BusinessID:  &bundle.CompanyID,
				CompanySlug: bundle.Slug,
				DBName:      bundle.DBName,
				ActorEmail:  cleanEmail,
				Module:      "AUTH",
				Action:      "PASSWORD_RESET_EMAIL_FAILED",
				EntityType:  "user",
				EntityID:    cleanEmail,
				Summary:     "Password reset email delivery failed for " + cleanEmail + ": " + err.Error(),
				IPAddress:   c.IP(),
				Status:      "ERROR",
			})
		}
		if strings.Contains(err.Error(), "email service is not configured") {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "unable to send verification email: " + err.Error()})
	}

	if sent && h.adminAudit != nil {
		uid := userID
		h.adminAudit.RecordEvent(c.UserContext(), usecase.AuditEventInput{
			BusinessID:  bizID,
			CompanySlug: bundle.Slug,
			DBName:      bundle.DBName,
			ActorUserID: &uid,
			ActorEmail:  cleanEmail,
			Module:      "AUTH",
			Action:      "PASSWORD_RESET_EMAIL_SENT",
			EntityType:  "user",
			EntityID:    uid.String(),
			Summary:     "Password reset verification code emailed to " + cleanEmail + " in " + bundle.Slug,
			IPAddress:   c.IP(),
			Status:      "SUCCESS",
		})
	}

	return c.JSON(fiber.Map{
		"status":             "reset_email_sent",
		"message":            "If an active account matches that email, a 6-digit verification code and direct reset link have been sent.",
		"expires_in_minutes": 15,
	})
}

// ResetPassword updates a user's password strictly inside the specified company's database.
func (h *Handler) ResetPassword(c *fiber.Ctx) error {
	var body struct {
		usecase.ResetPasswordRequest
		CompanySlug string `json:"company_slug"`
		BusinessID  string `json:"business_id,omitempty"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid password reset payload"})
	}
	bundle, bErr := h.resolvePublicTenantForAuth(c, body.CompanySlug, body.BusinessID, body.Email)
	if bErr != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": bErr.Error()})
	}
	userID, bizID, actorLabel, err := bundle.Auth.ResetPasswordWithVerification(c.UserContext(), body.ResetPasswordRequest)
	if err != nil {
		if h.adminAudit != nil {
			h.adminAudit.RecordEvent(c.UserContext(), usecase.AuditEventInput{
				BusinessID:  &bundle.CompanyID,
				CompanySlug: bundle.Slug,
				DBName:      bundle.DBName,
				ActorEmail:  strings.ToLower(strings.TrimSpace(body.Email)),
				Module:      "AUTH",
				Action:      "PASSWORD_RESET_DENIED",
				EntityType:  "user",
				EntityID:    strings.ToLower(strings.TrimSpace(body.Email)),
				Summary:     "Failed password reset verification on " + bundle.Slug + " for " + strings.ToLower(strings.TrimSpace(body.Email)),
				IPAddress:   c.IP(),
				Status:      "DENIED",
			})
		}
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	if h.adminAudit != nil {
		h.adminAudit.RecordEvent(c.UserContext(), usecase.AuditEventInput{
			BusinessID:  bizID,
			CompanySlug: bundle.Slug,
			DBName:      bundle.DBName,
			ActorUserID: &userID,
			ActorEmail:  strings.ToLower(strings.TrimSpace(body.Email)),
			ActorName:   actorLabel,
			Module:      "AUTH",
			Action:      "PASSWORD_RESET",
			EntityType:  "user",
			EntityID:    userID.String(),
			Summary:     "Password updated for " + strings.ToLower(strings.TrimSpace(body.Email)) + " in " + bundle.Slug + " (authorized by " + actorLabel + ")",
			Metadata:    map[string]any{"mode": body.Mode},
			IPAddress:   c.IP(),
			Status:      "SUCCESS",
		})
	}
	return c.JSON(fiber.Map{"status": "password_updated"})
}

// ChangePassword lets the currently signed-in user rotate their password cleanly and revokes other devices.
func (h *Handler) ChangePassword(c *fiber.Ctx) error {
	tc, ok := middleware.GetTenantContext(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}
	var req usecase.ChangePasswordRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid change-password payload"})
	}
	if err := h.authUC(c).ChangePasswordWithSession(c.UserContext(), tc.BusinessID, tc.UserID, tc.SessionID, req); err != nil {
		h.recordAudit(c, tc, "AUTH", "PASSWORD_CHANGE_DENIED", "user", tc.UserID.String(),
			"Password change verification failed for "+tc.Email, "DENIED", nil)
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "AUTH", "PASSWORD_CHANGED", "user", tc.UserID.String(),
		tc.FullName+" rotated login password and revoked other sessions", "SUCCESS", nil)
	return c.JSON(fiber.Map{"status": "password_updated"})
}

// GetOverview returns Role-Scoped Multi-Period Overview Bento analytics from PostgreSQL.
func (h *Handler) GetOverview(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	period := c.Query("period", "month")
	var reqBranchID uuid.UUID
	if raw := strings.TrimSpace(c.Query("branch_id")); raw != "" {
		if parsed, err := uuid.Parse(raw); err == nil {
			reqBranchID = parsed
		}
	}
	var reqTerminalID uuid.UUID
	if rawTerm := strings.TrimSpace(c.Query("terminal_id")); rawTerm != "" {
		if parsed, err := uuid.Parse(rawTerm); err == nil {
			reqTerminalID = parsed
		}
	}
	data, err := h.analyticsUC(c).GetOverviewDashboard(c.UserContext(), tc, period, reqBranchID, reqTerminalID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(data)
}

// BootstrapPOS returns catalog, FIFO branch stock, tax rules, customers, settings, and held bills.
func (h *Handler) BootstrapPOS(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	data, err := h.posUC(c).BootstrapPOS(c.UserContext(), tc)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(data)
}

// POSCheckout executes an idempotent atomic POS checkout (FIFO + Tax + Double-Entry GL).
func (h *Handler) POSCheckout(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	idemStr := strings.TrimSpace(c.Get("X-Idempotency-Key"))
	idemUUID, err := uuid.Parse(idemStr)
	if err != nil || idemUUID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "valid X-Idempotency-Key UUID header is required"})
	}

	var req usecase.CheckoutRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid checkout payload"})
	}

	resp, err := h.posUC(c).Checkout(c.UserContext(), tc, idemUUID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "POS", "POS_CHECKOUT", "sales_invoice", idemUUID.String(),
		"Completed POS sale checkout in "+tc.BusinessName, "SUCCESS", map[string]any{"payment_method": req.PaymentMethod, "item_count": len(req.Items)})
	return c.Status(fiber.StatusCreated).JSON(resp)
}

// VoidInvoice marks a paid invoice VOID with FIFO restock and GL reversal.
func (h *Handler) VoidInvoice(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	invID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid invoice id"})
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = c.BodyParser(&body)
	claim, _ := middleware.GetSupervisorClaim(c)
	if err := h.posUC(c).VoidOrRefundInvoice(c.UserContext(), tc, invID, "VOID", body.Reason, claim); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "POS", "INVOICE_VOID", "sales_invoice", invID.String(),
		"Voided sales invoice "+invID.String(), "SUCCESS", map[string]any{"reason": body.Reason})
	return c.JSON(fiber.Map{"status": "VOID", "invoice_id": invID})
}

// RefundInvoice marks a paid invoice REFUND with FIFO restock and GL reversal.
func (h *Handler) RefundInvoice(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	invID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid invoice id"})
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = c.BodyParser(&body)
	claim, _ := middleware.GetSupervisorClaim(c)
	if err := h.posUC(c).VoidOrRefundInvoice(c.UserContext(), tc, invID, "REFUND", body.Reason, claim); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "POS", "INVOICE_REFUND", "sales_invoice", invID.String(),
		"Refunded sales invoice "+invID.String(), "SUCCESS", map[string]any{"reason": body.Reason})
	return c.JSON(fiber.Map{"status": "REFUND", "invoice_id": invID})
}

// ListHeldBills returns active suspended bills for the branch.
func (h *Handler) ListHeldBills(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	bills, err := h.posUC(c).ListHeldBills(c.UserContext(), tc.BusinessID, tc.BranchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"held_bills": bills})
}

// CreateHeldBill creates a suspended POS ticket and syncs over WebSockets.
func (h *Handler) CreateHeldBill(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	var req usecase.HoldBillRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid held bill payload"})
	}
	res, err := h.posUC(c).CreateHeldBill(c.UserContext(), tc, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(res)
}

// VoidHeldBill voids a suspended POS ticket.
func (h *Handler) VoidHeldBill(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid held bill id"})
	}
	if err := h.posUC(c).VoidHeldBill(c.UserContext(), tc.BusinessID, id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "VOIDED", "id": id})
}

// UpdateHeldBillWorkflow updates KOT status (QUEUED/PREPARING/READY) or table/bay label for Pane 3 active orders.
func (h *Handler) UpdateHeldBillWorkflow(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid held bill id"})
	}
	var body struct {
		KotStatus       string `json:"kot_status"`
		TableOrBayLabel string `json:"table_or_bay_label"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid workflow payload"})
	}
	res, err := h.posUC(c).UpdateHeldBillWorkflow(c.UserContext(), tc.BusinessID, id, body.KotStatus, body.TableOrBayLabel)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(res)
}

func resolveQueryScopedBranch(c *fiber.Ctx, tc domain.TenantContext) (uuid.UUID, error) {
	reqBranch := uuid.Nil
	if br := parseOptionalUUID(c.Query("branch_id"), uuid.Nil); br != nil {
		reqBranch = *br
	}
	return usecase.ResolveScopedBranchID(tc, reqBranch)
}

func validateScopedBranchSettingTarget(tc domain.TenantContext, scopeLevel string, targetID *uuid.UUID) error {
	if strings.EqualFold(strings.TrimSpace(scopeLevel), "BRANCH") {
		target := uuid.Nil
		if targetID != nil {
			target = *targetID
		}
		_, err := usecase.ResolveScopedBranchID(tc, target)
		return err
	}
	return nil
}

// ListInventory returns FIFO batches, suppliers, and recent GRNs scoped cleanly by branch permissions.
func (h *Handler) ListInventory(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	scopedBranch, err := resolveQueryScopedBranch(c, tc)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	}
	if scopedBranch == uuid.Nil {
		scopedBranch = tc.BranchID
	}
	data, err := h.inventoryUC(c).ListBatchesAndGRNs(c.UserContext(), tc.BusinessID, scopedBranch, tc.HasMultiBranchAccess())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(data)
}

// CreateGRN creates (and optionally approves) a GRN with FIFO batch + GL posting.
func (h *Handler) CreateGRN(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	var req usecase.CreateGRNRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid GRN payload"})
	}
	if _, err := usecase.ResolveScopedBranchID(tc, req.BranchID); err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	}
	res, err := h.inventoryUC(c).CreateGRN(c.UserContext(), tc.BusinessID, tc.BranchID, tc.UserID, tc.HasMultiBranchAccess(), req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(res)
}

// GetGRNDetail returns header details, supplier metadata, and line items for a single GRN.
func (h *Handler) GetGRNDetail(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	grnID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid GRN id"})
	}
	res, err := h.inventoryUC(c).GetGRNDetails(c.UserContext(), tc.BusinessID, grnID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "GRN not found"})
	}
	return c.JSON(res)
}

// UpdateGRN edits an existing DRAFT GRN and optionally approves & posts GL if permitted.
func (h *Handler) UpdateGRN(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	grnID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid GRN id"})
	}
	var req usecase.UpdateGRNRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid GRN update payload"})
	}
	if req.ApproveNow {
		allowed := false
		for _, p := range h.authUC(c).GetEffectivePermissions(c.UserContext(), tc) {
			if p == "inventory:grn_approve" {
				allowed = true
				break
			}
		}
		if !allowed {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error":               "forbidden: missing permission inventory:grn_approve",
				"required_permission": "inventory:grn_approve",
			})
		}
	}
	res, err := h.inventoryUC(c).UpdateDraftGRN(c.UserContext(), tc.BusinessID, grnID, tc.UserID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(res)
}

// ApproveGRN approves an existing DRAFT GRN.
func (h *Handler) ApproveGRN(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	grnID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid GRN id"})
	}
	jeID, err := h.inventoryUC(c).ApproveGRN(c.UserContext(), tc.BusinessID, grnID, tc.UserID)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "INVENTORY", "GRN_APPROVED", "grn", grnID.String(),
		"Approved GRN "+grnID.String()+" and posted FIFO batches + GL", "SUCCESS", map[string]any{"journal_id": jeID})
	return c.JSON(fiber.Map{"status": "APPROVED", "journal_id": jeID})
}

// GetAccountingWorkspace returns Chart of Accounts, Fiscal Periods, and GL Journals.
func (h *Handler) GetAccountingWorkspace(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	data, err := h.accountingUC(c).GetLedgerWorkspace(c.UserContext(), tc.BusinessID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(data)
}

// GetJournalLines returns lines for a journal entry.
func (h *Handler) GetJournalLines(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid journal entry id"})
	}
	lines, err := h.accountingUC(c).GetJournalLines(c.UserContext(), tc.BusinessID, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"lines": lines})
}

// GetSourceJournals returns GL journal lines tied to a POS invoice or GRN source ID.
func (h *Handler) GetSourceJournals(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	sourceID, err := uuid.Parse(c.Params("sourceId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid source id"})
	}
	lines, err := h.accountingUC(c).GetSourceJournals(c.UserContext(), tc.BusinessID, sourceID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"lines": lines})
}

// LockFiscalPeriod locks a fiscal period against future postings.
func (h *Handler) LockFiscalPeriod(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	periodID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid fiscal period id"})
	}
	res, err := h.accountingUC(c).LockFiscalPeriod(c.UserContext(), tc.BusinessID, periodID, tc.UserID)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "ACCOUNTING", "FISCAL_PERIOD_LOCKED", "fiscal_period", periodID.String(),
		"Locked accounting fiscal period "+periodID.String(), "SUCCESS", nil)
	return c.JSON(res)
}

// GetResolvedSettings resolves the 6-level inheritance hierarchy for optional branch/terminal/category/product query params.
func (h *Handler) GetResolvedSettings(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	scopedBranch, err := resolveQueryScopedBranch(c, tc)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	}
	branchPtr := parseOptionalUUID("", tc.BranchID)
	if scopedBranch != uuid.Nil {
		branchPtr = &scopedBranch
	}
	sc := usecase.SettingsContext{
		BusinessID: tc.BusinessID,
		BranchID:   branchPtr,
		TerminalID: parseOptionalUUID(c.Query("terminal_id"), tc.TerminalID),
		CategoryID: parseOptionalUUID(c.Query("category_id"), uuid.Nil),
		ProductID:  parseOptionalUUID(c.Query("product_id"), uuid.Nil),
	}
	resolved, cacheSource, cachedAt, err := h.settingsUC(c).ResolveAllWithMeta(c.UserContext(), sc)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	allRoles, _ := h.authUC(c).ListRoleMatrixForBusiness(c.UserContext(), tc.BusinessID)
	isSA := h.hasPermission(c, tc, "platform:admin")
	roles := make([]usecase.RoleMatrixEntry, 0, len(allRoles))
	for _, r := range allRoles {
		if !isSA && r.RoleCode == "SuperAdmin" {
			continue
		}
		roles = append(roles, r)
	}
	return c.JSON(fiber.Map{
		"settings":     resolved,
		"roles":        roles,
		"cache_source": cacheSource,
		"cached_at":    cachedAt,
	})
}

// UpsertSettingOverride sets a scoped override, warms Redis/memory cache, and broadcasts SETTINGS_UPDATED over WebSocket.
func (h *Handler) UpsertSettingOverride(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	var body struct {
		SettingKey    string          `json:"setting_key"`
		ScopeLevel    string          `json:"scope_level"`
		ScopeTargetID *uuid.UUID      `json:"scope_target_id"`
		ValueJSON     json.RawMessage `json:"value_json"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid setting payload"})
	}
	if err := validateScopedBranchSettingTarget(tc, body.ScopeLevel, body.ScopeTargetID); err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	}
	if err := h.settingsUC(c).UpsertOverride(c.UserContext(), tc.BusinessID, tc.UserID, body.SettingKey, body.ScopeLevel, body.ScopeTargetID, body.ValueJSON); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "SETTINGS", "SETTING_OVERRIDE_SAVED", "setting", body.SettingKey,
		"Updated setting "+body.SettingKey+" at "+body.ScopeLevel+" level", "SUCCESS", map[string]any{"value": string(body.ValueJSON)})
	sc := settingsContextForScope(tc.BusinessID, tc.BranchID, tc.TerminalID, body.ScopeLevel, body.ScopeTargetID)
	resolved, cacheSource, cachedAt, _ := h.settingsUC(c).ResolveAllWithMeta(c.UserContext(), sc)
	return c.JSON(fiber.Map{
		"status":       "updated",
		"cache_source": cacheSource,
		"cached_at":    cachedAt,
		"settings":     resolved,
	})
}

// ResetSettingOverride removes a scoped override, warms cache, and re-evaluates parent scope inheritance.
func (h *Handler) ResetSettingOverride(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	var body struct {
		SettingKey    string     `json:"setting_key"`
		ScopeLevel    string     `json:"scope_level"`
		ScopeTargetID *uuid.UUID `json:"scope_target_id"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid reset payload"})
	}
	if err := validateScopedBranchSettingTarget(tc, body.ScopeLevel, body.ScopeTargetID); err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	}
	if err := h.settingsUC(c).ResetOverride(c.UserContext(), tc.BusinessID, body.SettingKey, body.ScopeLevel, body.ScopeTargetID); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "SETTINGS", "SETTING_OVERRIDE_RESET", "setting", body.SettingKey,
		"Reset setting "+body.SettingKey+" override at "+body.ScopeLevel, "SUCCESS", nil)
	sc := settingsContextForScope(tc.BusinessID, tc.BranchID, tc.TerminalID, body.ScopeLevel, body.ScopeTargetID)
	resolved, cacheSource, cachedAt, _ := h.settingsUC(c).ResolveAllWithMeta(c.UserContext(), sc)
	return c.JSON(fiber.Map{
		"status":       "reset",
		"cache_source": cacheSource,
		"cached_at":    cachedAt,
		"settings":     resolved,
	})
}

// ApplyIndustryPreset configures a business industry mode (restaurant, hardware, garage, retail, mobile, stationery) and seeds matching POS layout/feature defaults.
func (h *Handler) ApplyIndustryPreset(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	var body struct {
		IndustryMode string `json:"industry_mode"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid industry preset payload"})
	}
	mode, err := h.catalogUC(c).ApplyIndustryPreset(c.UserContext(), tc.BusinessID, tc.UserID, body.IndustryMode)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	if h.adminAudit != nil {
		h.adminAudit.SyncRegistryFromTenant(c.UserContext(), tc.BusinessID, "", "", "", "", mode, "", "")
	}
	sc := usecase.SettingsContext{
		BusinessID: tc.BusinessID,
		BranchID:   &tc.BranchID,
		TerminalID: &tc.TerminalID,
	}
	resolved, cacheSource, cachedAt, _ := h.settingsUC(c).ResolveAllWithMeta(c.UserContext(), sc)
	return c.JSON(fiber.Map{
		"status":           "applied",
		"industry_profile": mode,
		"cache_source":     cacheSource,
		"cached_at":        cachedAt,
		"settings":         resolved,
	})
}

func settingsContextForScope(businessID, defaultBranch, defaultTerm uuid.UUID, scopeLevel string, targetID *uuid.UUID) usecase.SettingsContext {
	sc := usecase.SettingsContext{
		BusinessID: businessID,
		BranchID:   &defaultBranch,
		TerminalID: &defaultTerm,
	}
	switch strings.ToUpper(strings.TrimSpace(scopeLevel)) {
	case "BRANCH":
		if targetID != nil && *targetID != uuid.Nil {
			sc.BranchID = targetID
		}
	case "TERMINAL":
		if targetID != nil && *targetID != uuid.Nil {
			sc.TerminalID = targetID
		}
	case "CATEGORY":
		if targetID != nil && *targetID != uuid.Nil {
			sc.CategoryID = targetID
		}
	case "PRODUCT":
		if targetID != nil && *targetID != uuid.Nil {
			sc.ProductID = targetID
		}
	}
	return sc
}

// ListCustomers returns tenant-isolated CRM customer records.
func (h *Handler) ListCustomers(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	rows, err := h.catalogUC(c).ListCustomers(c.UserContext(), tc.BusinessID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"customers": rows})
}

// CreateCustomer registers a CRM customer with normalized phone and optional credit line.
func (h *Handler) CreateCustomer(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	var req usecase.CreateCustomerRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid customer payload"})
	}
	row, err := h.catalogUC(c).CreateCustomer(c.UserContext(), tc.BusinessID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"customer": row})
}

// CreateProduct creates a new SKU with up to 5 images and optional Level-6 negative-stock override.
func (h *Handler) CreateProduct(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	var req usecase.SaveProductRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid product payload"})
	}
	res, err := h.catalogUC(c).SaveProduct(c.UserContext(), tc.BusinessID, tc.UserID, nil, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	if prod, ok := res["product"].(db.CreateProductRow); ok {
		h.catalogUC(c).CheckLowStockOnProductSave(c.UserContext(), tc.BusinessID, tc.BranchID, prod.ID)
	}
	return c.Status(fiber.StatusCreated).JSON(res)
}

// UpdateProduct updates an existing SKU, its images, pricing, and Level-6 setting override.
func (h *Handler) UpdateProduct(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	prodID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid product id"})
	}
	var req usecase.SaveProductRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid product payload"})
	}
	res, err := h.catalogUC(c).SaveProduct(c.UserContext(), tc.BusinessID, tc.UserID, &prodID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.catalogUC(c).CheckLowStockOnProductSave(c.UserContext(), tc.BusinessID, tc.BranchID, prodID)
	return c.JSON(res)
}

// DeleteOrArchiveProduct archives historical products or deletes unused products cleanly.
func (h *Handler) DeleteOrArchiveProduct(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	prodID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid product id"})
	}
	outcome, err := h.catalogUC(c).DeleteOrArchiveProduct(c.UserContext(), tc.BusinessID, prodID)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": outcome, "id": prodID})
}

// BulkDiscountProducts applies or clears a promotional discount percentage across multiple selected products.
func (h *Handler) BulkDiscountProducts(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	var req usecase.BulkProductDiscountRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid bulk discount payload"})
	}
	res, err := h.catalogUC(c).BulkUpdateProductDiscounts(c.UserContext(), tc.BusinessID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "CATALOG", "BULK_DISCOUNT", "product", "BULK",
		"Updated discount "+req.DiscountPercent.StringFixed(2)+"% on selected catalog products", "SUCCESS",
		map[string]any{"count": res["updated_count"], "discount_percent": res["discount_percent"]})
	return c.JSON(res)
}

// GetCompanySettings returns brand logos, VAT registration, and global warehouse approval flags.
func (h *Handler) GetCompanySettings(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	res, err := h.catalogUC(c).GetCompanySettings(c.UserContext(), tc.BusinessID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(res)
}

// UpdateCompanySettings updates company profile, brand logos, VAT registration, warehouse approval flags, and warms Redis/memory cache.
func (h *Handler) UpdateCompanySettings(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	var req usecase.UpdateCompanySettingsRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid company settings payload"})
	}
	res, err := h.catalogUC(c).UpdateCompanySettings(c.UserContext(), tc.BusinessID, tc.UserID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "SETTINGS", "COMPANY_SETTINGS_UPDATED", "business", tc.BusinessID.String(),
		"Updated company branding, currency, tax reg or approval policy", "SUCCESS", nil)
	if h.adminAudit != nil {
		h.adminAudit.SyncRegistryFromTenant(
			c.UserContext(),
			tc.BusinessID,
			req.TradeName,
			req.BaseCurrency,
			req.DefaultLanguage,
			req.PrimaryColorHex,
			req.IndustryProfile,
			req.LogoLightURL,
			req.TaxRegistrationNo,
		)
	}
	if h.settingsUC(c) != nil {
		h.settingsUC(c).InvalidateAndWarmBusiness(c.UserContext(), tc.BusinessID, "company.profile", "BUSINESS")
		resolved, cacheSource, cachedAt, _ := h.settingsUC(c).ResolveAllWithMeta(c.UserContext(), usecase.SettingsContext{
			BusinessID: tc.BusinessID,
			BranchID:   &tc.BranchID,
			TerminalID: &tc.TerminalID,
		})
		res["settings"] = resolved
		res["cache_source"] = cacheSource
		res["cached_at"] = cachedAt
	}
	return c.JSON(res)
}

// UpdateCustomer updates an existing customer profile and credit line.
func (h *Handler) UpdateCustomer(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	custID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid customer id"})
	}
	var req usecase.CreateCustomerRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid customer payload"})
	}
	row, err := h.catalogUC(c).UpdateCustomer(c.UserContext(), tc.BusinessID, custID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"customer": row})
}

// ListCategories returns all tenant product categories and active SKU counts.
func (h *Handler) ListCategories(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	rows, err := h.catalogUC(c).ListCategories(c.UserContext(), tc.BusinessID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"categories": rows})
}

// CreateCategory adds a product category for the active business.
func (h *Handler) CreateCategory(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	var req usecase.SaveCategoryRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid category payload"})
	}
	row, err := h.catalogUC(c).SaveCategory(c.UserContext(), tc.BusinessID, nil, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"category": row})
}

// UpdateCategory updates an existing product category.
func (h *Handler) UpdateCategory(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	catID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid category id"})
	}
	var req usecase.SaveCategoryRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid category payload"})
	}
	row, err := h.catalogUC(c).SaveCategory(c.UserContext(), tc.BusinessID, &catID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"category": row})
}

// DeleteCategory removes an unused product category.
func (h *Handler) DeleteCategory(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	catID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid category id"})
	}
	if err := h.catalogUC(c).DeleteCategory(c.UserContext(), tc.BusinessID, catID); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "DELETED", "id": catID})
}

// ListBrands returns all tenant product brands with active SKU & stock counts.
func (h *Handler) ListBrands(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	rows, err := h.catalogUC(c).ListBrands(c.UserContext(), tc.BusinessID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"brands": rows})
}

// CreateBrand adds a product brand for the active business.
func (h *Handler) CreateBrand(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	var req usecase.SaveBrandRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid brand payload"})
	}
	row, err := h.catalogUC(c).SaveBrand(c.UserContext(), tc.BusinessID, nil, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"brand": row})
}

// UpdateBrand updates an existing product brand.
func (h *Handler) UpdateBrand(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	brandID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid brand id"})
	}
	var req usecase.SaveBrandRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid brand payload"})
	}
	row, err := h.catalogUC(c).SaveBrand(c.UserContext(), tc.BusinessID, &brandID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"brand": row})
}

// DeleteBrand removes an unused product brand.
func (h *Handler) DeleteBrand(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	brandID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid brand id"})
	}
	if err := h.catalogUC(c).DeleteBrand(c.UserContext(), tc.BusinessID, brandID); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "DELETED", "id": brandID})
}

// ListAccessUsers lists row-wise logins, roles, designations, branches, and PIN states strictly for company users.
func (h *Handler) ListAccessUsers(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	res, err := h.catalogUC(c).ListAccessUsers(c.UserContext(), tc.BusinessID, false)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(res)
}

// CreateAccessUser creates or attaches a company staff/owner login to the active company database.
func (h *Handler) CreateAccessUser(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	var req usecase.SaveAccessUserRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid access user payload"})
	}
	res, err := h.catalogUC(c).CreateAccessUser(c.UserContext(), tc.BusinessID, false, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "RBAC", "STAFF_USER_CREATED", "user", req.Email,
		"Provisioned staff access for "+req.FullName+" ("+req.Email+")", "SUCCESS", map[string]any{"role_id": req.RoleID})
	return c.Status(fiber.StatusCreated).JSON(res)
}

// UpdateAccessUser updates a user's role, designation, active flag, name, and optional 6-digit PIN.
func (h *Handler) UpdateAccessUser(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	ubrID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid assignment id"})
	}
	var body struct {
		usecase.SaveAccessUserRequest
		UserID string `json:"user_id"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid access update payload"})
	}
	uid, _ := uuid.Parse(body.UserID)
	res, err := h.catalogUC(c).UpdateAccessUser(c.UserContext(), tc.BusinessID, ubrID, uid, false, body.SaveAccessUserRequest)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	targetUID := uid
	if ubr, ok := res["assignment"].(db.UserBusinessRole); ok && ubr.UserID != uuid.Nil {
		targetUID = ubr.UserID
	}
	if !body.IsActive && targetUID != uuid.Nil {
		_, _ = h.authUC(c).RevokeAllUserSessions(c.UserContext(), tc.BusinessID, targetUID, tc.UserID, "user_deactivated")
	}
	h.recordAudit(c, tc, "RBAC", "STAFF_USER_UPDATED", "user_business_role", ubrID.String(),
		"Updated staff role/designation/PIN assignment", "SUCCESS", map[string]any{"is_active": body.IsActive})
	return c.JSON(res)
}

// ScanLowStockAutoPO scans branch FIFO balances against minimum thresholds and auto-drafts POs + Invoices + Notifications.
func (h *Handler) ScanLowStockAutoPO(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	branchID, err := resolveQueryScopedBranch(c, tc)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	}
	if branchID == uuid.Nil {
		branchID = tc.BranchID
	}
	res, err := h.inventoryUC(c).ScanAndAutoDraftLowStockPOs(c.UserContext(), tc.BusinessID, branchID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(res)
}

// UpdatePurchaseInvoiceStatus updates the lifecycle status (DRAFT/ISSUED/PAID/CANCELLED) of a vendor purchase invoice.
func (h *Handler) UpdatePurchaseInvoiceStatus(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	invID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid purchase invoice id"})
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid status payload"})
	}
	row, err := h.inventoryUC(c).UpdatePurchaseInvoiceStatus(c.UserContext(), tc.BusinessID, invID, body.Status)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"invoice": row})
}

// ListNotifications returns tenant notifications and unread count.
func (h *Handler) ListNotifications(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	res, err := h.catalogUC(c).ListNotifications(c.UserContext(), tc.BusinessID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(res)
}

// MarkNotificationRead marks one notification as read.
func (h *Handler) MarkNotificationRead(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid notification id"})
	}
	if err := h.catalogUC(c).MarkNotificationRead(c.UserContext(), tc.BusinessID, id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "READ"})
}

// MarkAllNotificationsRead marks all unread notifications for the business as read.
func (h *Handler) MarkAllNotificationsRead(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	if err := h.catalogUC(c).MarkAllNotificationsRead(c.UserContext(), tc.BusinessID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "ALL_READ"})
}

// GetEnterpriseReports returns Sales Summary, Invoices, Auto-POs & Vendor Invoices, and FIFO Valuation reports.
func (h *Handler) GetEnterpriseReports(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	now := time.Now().UTC()
	fromTime := now.AddDate(0, 0, -90)
	toTime := now.Add(24 * time.Hour)
	if rawFrom := strings.TrimSpace(c.Query("from")); rawFrom != "" {
		if t, err := time.Parse("2006-01-02", rawFrom); err == nil {
			fromTime = t.UTC()
		}
	}
	if rawTo := strings.TrimSpace(c.Query("to")); rawTo != "" {
		if t, err := time.Parse("2006-01-02", rawTo); err == nil {
			toTime = t.UTC().Add(23*time.Hour + 59*time.Minute + 59*time.Second)
		}
	}
	branchID, err := resolveQueryScopedBranch(c, tc)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	}
	res, err := h.analyticsUC(c).GetEnterpriseReports(c.UserContext(), tc.BusinessID, branchID, fromTime, toTime)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(res)
}

func parseOptionalUUID(raw string, fallback uuid.UUID) *uuid.UUID {
	if raw != "" {
		if id, err := uuid.Parse(raw); err == nil && id != uuid.Nil {
			return &id
		}
	}
	if fallback != uuid.Nil {
		return &fallback
	}
	return nil
}

// ListSuppliers returns tenant-isolated suppliers with PO/GRN/invoice metrics.
func (h *Handler) ListSuppliers(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	rows, err := h.catalogUC(c).ListSuppliers(c.UserContext(), tc.BusinessID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"suppliers": rows})
}

// CreateSupplier adds a new vendor/supplier record for the active tenant.
func (h *Handler) CreateSupplier(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	var req usecase.SaveSupplierRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid supplier payload"})
	}
	row, err := h.catalogUC(c).CreateSupplier(c.UserContext(), tc.BusinessID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"supplier": row})
}

// UpdateSupplier updates an existing vendor/supplier record scoped by business_id.
func (h *Handler) UpdateSupplier(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	supID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid supplier id"})
	}
	var req usecase.SaveSupplierRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid supplier payload"})
	}
	row, err := h.catalogUC(c).UpdateSupplier(c.UserContext(), tc.BusinessID, supID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"supplier": row})
}

// DeleteSupplier deletes an unused vendor/supplier record scoped by business_id.
func (h *Handler) DeleteSupplier(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	supID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid supplier id"})
	}
	if err := h.catalogUC(c).DeleteSupplier(c.UserContext(), tc.BusinessID, supID); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "DELETED", "id": supID})
}

// ListPrintTemplates returns tenant-isolated print templates for Receipt & Invoice Studio.
func (h *Handler) ListPrintTemplates(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	rows, err := h.printStudioUC(c).ListTemplates(c.UserContext(), tc.BusinessID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"templates": rows})
}

// CreatePrintTemplate persists a new Canva-style print template scoped by business_id.
func (h *Handler) CreatePrintTemplate(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	var req usecase.SavePrintTemplateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid print template payload"})
	}
	row, err := h.printStudioUC(c).CreateTemplate(c.UserContext(), tc.BusinessID, tc.UserID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"template": row})
}

// UpdatePrintTemplate saves layout coordinates, styling, variables, and hardware profile changes.
func (h *Handler) UpdatePrintTemplate(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	tplID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid print template id"})
	}
	var req usecase.SavePrintTemplateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid print template payload"})
	}
	row, err := h.printStudioUC(c).UpdateTemplate(c.UserContext(), tc.BusinessID, tplID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"template": row})
}

// SetDefaultPrintTemplate atomically marks a template as the active default for its paper type.
func (h *Handler) SetDefaultPrintTemplate(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	tplID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid print template id"})
	}
	row, err := h.printStudioUC(c).SetDefaultTemplate(c.UserContext(), tc.BusinessID, tplID)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"template": row})
}

// DeletePrintTemplate removes a tenant print template.
func (h *Handler) DeletePrintTemplate(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	tplID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid print template id"})
	}
	if err := h.printStudioUC(c).DeleteTemplate(c.UserContext(), tc.BusinessID, tplID); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "DELETED", "id": tplID})
}

// ListAllPermissions returns all granular RBAC permissions grouped cleanly by module.
func (h *Handler) ListAllPermissions(c *fiber.Ctx) error {
	perms, err := h.catalogUC(c).ListAllPermissions(c.UserContext())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"permissions": perms})
}

// CreateCustomRole creates a tenant-scoped custom RBAC role with selected permission codes.
func (h *Handler) CreateCustomRole(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	var req usecase.SaveCustomRoleRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid custom role payload"})
	}
	res, err := h.catalogUC(c).CreateCustomRole(c.UserContext(), tc.BusinessID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "RBAC", "CUSTOM_ROLE_CREATED", "role", req.Name,
		"Created custom role "+req.Name+" with "+strconv.Itoa(len(req.Permissions))+" permissions", "SUCCESS", nil)
	return c.Status(fiber.StatusCreated).JSON(res)
}

// UpdateCustomRole updates a tenant custom role and its permission assignments.
func (h *Handler) UpdateCustomRole(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	roleID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid role id"})
	}
	var req usecase.SaveCustomRoleRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid custom role payload"})
	}
	res, err := h.catalogUC(c).UpdateCustomRole(c.UserContext(), tc.BusinessID, roleID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "RBAC", "CUSTOM_ROLE_UPDATED", "role", roleID.String(),
		"Updated custom role "+req.Name, "SUCCESS", nil)
	return c.JSON(res)
}

// ListDepartmentsAndDesignations lists tenant departments and staff designations with discount caps.
func (h *Handler) ListDepartmentsAndDesignations(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	res, err := h.catalogUC(c).ListDepartmentsAndDesignations(c.UserContext(), tc.BusinessID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(res)
}

// CreateDepartment creates a new tenant department.
func (h *Handler) CreateDepartment(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	var req usecase.SaveDepartmentRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid department payload"})
	}
	row, err := h.catalogUC(c).CreateDepartment(c.UserContext(), tc.BusinessID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "RBAC", "DEPARTMENT_CREATED", "department", row.ID.String(),
		"Created department "+row.Name, "SUCCESS", nil)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"department": row})
}

// CreateDesignation creates a new designation linked to a department and max POS discount cap.
func (h *Handler) CreateDesignation(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	var req usecase.SaveDesignationRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid designation payload"})
	}
	row, err := h.catalogUC(c).CreateDesignation(c.UserContext(), tc.BusinessID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "RBAC", "DESIGNATION_CREATED", "designation", row.ID.String(),
		"Created designation "+row.Name+" (max discount "+row.MaxPosDiscountPct.String()+"%)", "SUCCESS", nil)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"designation": row})
}

// UpdateDesignation updates an existing designation.
func (h *Handler) UpdateDesignation(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	desigID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid designation id"})
	}
	var req usecase.SaveDesignationRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid designation payload"})
	}
	row, err := h.catalogUC(c).UpdateDesignation(c.UserContext(), tc.BusinessID, desigID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "RBAC", "DESIGNATION_UPDATED", "designation", row.ID.String(),
		"Updated designation "+row.Name, "SUCCESS", nil)
	return c.JSON(fiber.Map{"designation": row})
}

// ListTaxGroupsAndRules returns tenant tax groups, multi-tier tax rules, VAT reg number, and active rounding mode.
func (h *Handler) ListTaxGroupsAndRules(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	res, err := h.catalogUC(c).ListTaxGroupsAndRules(c.UserContext(), tc.BusinessID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(res)
}

// CreateTaxGroup creates a new tenant tax group.
func (h *Handler) CreateTaxGroup(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	var req usecase.SaveTaxGroupRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tax group payload"})
	}
	row, err := h.catalogUC(c).SaveTaxGroup(c.UserContext(), tc.BusinessID, tc.UserID, nil, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "TAX", "TAX_GROUP_CREATED", "tax_group", row.ID.String(),
		"Created tax group "+row.Name, "SUCCESS", nil)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"tax_group": row})
}

// UpdateTaxGroup updates an existing tenant tax group.
func (h *Handler) UpdateTaxGroup(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	groupID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tax group id"})
	}
	var req usecase.SaveTaxGroupRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tax group payload"})
	}
	row, err := h.catalogUC(c).SaveTaxGroup(c.UserContext(), tc.BusinessID, tc.UserID, &groupID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "TAX", "TAX_GROUP_UPDATED", "tax_group", row.ID.String(),
		"Updated tax group "+row.Name, "SUCCESS", nil)
	return c.JSON(fiber.Map{"tax_group": row})
}

// CreateTaxRule creates a multi-tier tax rule inside a tenant tax group.
func (h *Handler) CreateTaxRule(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	var req usecase.SaveTaxRuleRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tax rule payload"})
	}
	row, err := h.catalogUC(c).SaveTaxRule(c.UserContext(), tc.BusinessID, nil, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "TAX", "TAX_RULE_CREATED", "tax_rule", row.ID.String(),
		"Created tax rule "+row.Name+" ("+row.RatePercent.String()+"%)", "SUCCESS", nil)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"tax_rule": row})
}

// UpdateTaxRule updates an existing tax rule.
func (h *Handler) UpdateTaxRule(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	ruleID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tax rule id"})
	}
	var req usecase.SaveTaxRuleRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tax rule payload"})
	}
	row, err := h.catalogUC(c).SaveTaxRule(c.UserContext(), tc.BusinessID, &ruleID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "TAX", "TAX_RULE_UPDATED", "tax_rule", row.ID.String(),
		"Updated tax rule "+row.Name+" ("+row.RatePercent.String()+"%, active="+strconv.FormatBool(row.IsActive)+")", "SUCCESS", nil)
	return c.JSON(fiber.Map{"tax_rule": row})
}

// DeleteTaxRule deletes a tax rule scoped by business_id.
func (h *Handler) DeleteTaxRule(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	ruleID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tax rule id"})
	}
	if err := h.catalogUC(c).DeleteTaxRule(c.UserContext(), tc.BusinessID, ruleID); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "TAX", "TAX_RULE_DELETED", "tax_rule", ruleID.String(),
		"Deleted tax rule "+ruleID.String(), "SUCCESS", nil)
	return c.JSON(fiber.Map{"status": "DELETED", "id": ruleID})
}

// ApplySLTaxPreset configures Sri Lankan IRD VAT (18%) and SSCL (2.5%) for the active business.
func (h *Handler) ApplySLTaxPreset(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	var req usecase.ApplySLTaxPresetRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid SL tax preset payload"})
	}
	res, err := h.catalogUC(c).ApplySLTaxPreset(c.UserContext(), tc.BusinessID, tc.UserID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "TAX", "SL_TAX_PRESET_APPLIED", "business", tc.BusinessID.String(),
		"Applied Sri Lanka tax rules (VAT 18%="+strconv.FormatBool(req.ApplyVAT)+", SSCL 2.5%="+strconv.FormatBool(req.ApplySSCL)+")",
		"SUCCESS", nil)
	return c.JSON(res)
}

// --- Separate Master Control Plane Portal Endpoints (Strictly Isolated from Company DBs) ---

// PlatformSetupStatus reports whether the Platform Control Plane requires first-run SuperAdmin creation.
func (h *Handler) PlatformSetupStatus(c *fiber.Ctx) error {
	status, err := h.masterAuth.GetPlatformSetupStatus(c.UserContext())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(status)
}

// PlatformBootstrap creates the first Platform SuperAdmin account when platform_admins is empty.
func (h *Handler) PlatformBootstrap(c *fiber.Ctx) error {
	var req usecase.PlatformAdminSaveRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid platform setup payload"})
	}
	res, err := h.masterAuth.BootstrapFirstPlatformAdminWithMeta(c.UserContext(), req, middleware.ClientMeta(c))
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	if h.adminAudit != nil {
		h.adminAudit.RecordEvent(c.UserContext(), usecase.AuditEventInput{
			ActorEmail: res.Admin.Email,
			ActorName:  res.Admin.FullName,
			ActorRole:  "PlatformSuperAdmin",
			Module:     "PLATFORM",
			Action:     "PLATFORM_SUPERADMIN_BOOTSTRAP",
			EntityType: "platform_admin",
			EntityID:   res.Admin.AdminID.String(),
			Summary:    "Initialized first Platform SuperAdmin " + res.Admin.Email,
			IPAddress:  c.IP(),
			Status:     "SUCCESS",
		})
	}
	return c.Status(fiber.StatusCreated).JSON(res)
}

// AdminLogin authenticates strictly against the Master Control Plane `platform_admins` table.
func (h *Handler) AdminLogin(c *fiber.Ctx) error {
	var req usecase.PlatformAdminLoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid admin login payload"})
	}
	normEmail := strings.ToLower(strings.TrimSpace(req.Email))
	adminFailKey := "admin:" + normEmail
	const adminMaxFailures = 8
	if h.rateLimiter != nil && normEmail != "" {
		if locked, retrySec, _ := h.rateLimiter.CheckLockout(c.UserContext(), "admin_login", adminFailKey, adminMaxFailures); locked {
			h.recordRateLimitAudit(c, nil, "", "", normEmail, "admin_login", retrySec)
			return middleware.TooManyRequestsResponse(
				c,
				"admin_login",
				retrySec,
				adminMaxFailures,
				fmt.Sprintf("Too many failed Platform Admin login attempts. Try again in %d seconds.", retrySec),
			)
		}
	}

	res, err := h.masterAuth.PlatformAdminLoginWithMeta(c.UserContext(), req, middleware.ClientMeta(c))
	if err != nil {
		if h.adminAudit != nil {
			h.adminAudit.RecordEvent(c.UserContext(), usecase.AuditEventInput{
				ActorEmail: normEmail,
				ActorRole:  "PlatformSuperAdmin",
				Module:     "PLATFORM",
				Action:     "ADMIN_LOGIN_FAILED",
				EntityType: "platform_admin",
				EntityID:   normEmail,
				Summary:    "Failed Platform Admin login attempt for " + normEmail,
				IPAddress:  c.IP(),
				Status:     "DENIED",
			})
		}
		if h.rateLimiter != nil && normEmail != "" {
			if locked, retrySec, fails := h.rateLimiter.RecordFailure(c.UserContext(), "admin_login", "admin_login", adminFailKey, adminMaxFailures, 5*time.Minute); locked {
				h.recordRateLimitAudit(c, nil, "", "", normEmail, "admin_login", retrySec)
				return middleware.TooManyRequestsResponse(
					c,
					"admin_login",
					retrySec,
					adminMaxFailures,
					fmt.Sprintf("Too many failed Platform Admin attempts (%d). Try again in %d seconds.", fails, retrySec),
				)
			}
		}
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error()})
	}
	if h.rateLimiter != nil && normEmail != "" {
		h.rateLimiter.ClearFailures(c.UserContext(), "admin_login", adminFailKey)
	}
	if h.adminAudit != nil {
		h.adminAudit.RecordEvent(c.UserContext(), usecase.AuditEventInput{
			ActorEmail: res.Admin.Email,
			ActorName:  res.Admin.FullName,
			ActorRole:  "PlatformSuperAdmin",
			Module:     "PLATFORM",
			Action:     "ADMIN_LOGIN",
			EntityType: "platform_admin",
			EntityID:   res.Admin.AdminID.String(),
			Summary:    res.Admin.FullName + " signed into the standalone Platform Control Plane",
			IPAddress:  c.IP(),
			Status:     "SUCCESS",
		})
	}
	return c.JSON(res)
}

// AdminListPlatformUsers lists Platform SuperAdmin accounts stored in Master Control Plane.
func (h *Handler) AdminListPlatformUsers(c *fiber.Ctx) error {
	rows, err := h.masterAuth.ListPlatformAdmins(c.UserContext())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"admins": rows})
}

// AdminCreatePlatformUser creates a new Platform SuperAdmin user inside Master Control Plane.
func (h *Handler) AdminCreatePlatformUser(c *fiber.Ctx) error {
	actor, _ := middleware.GetPlatformAdminContext(c)
	var req usecase.PlatformAdminSaveRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid platform admin payload"})
	}
	created, err := h.masterAuth.CreatePlatformAdmin(c.UserContext(), req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	if h.adminAudit != nil {
		h.adminAudit.RecordEvent(c.UserContext(), usecase.AuditEventInput{
			ActorEmail: actor.Email,
			ActorName:  actor.FullName,
			ActorRole:  "PlatformSuperAdmin",
			Module:     "PLATFORM",
			Action:     "PLATFORM_ADMIN_CREATED",
			EntityType: "platform_admin",
			EntityID:   created.ID.String(),
			Summary:    "Created Platform SuperAdmin " + created.FullName + " (" + created.Email + ")",
			IPAddress:  c.IP(),
			Status:     "SUCCESS",
		})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"admin": created})
}

// AdminUpdatePlatformUser updates a Platform SuperAdmin display title or active state.
func (h *Handler) AdminUpdatePlatformUser(c *fiber.Ctx) error {
	actor, _ := middleware.GetPlatformAdminContext(c)
	targetID, err := uuid.Parse(c.Params("id"))
	if err != nil || targetID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid platform admin id"})
	}
	var body struct {
		FullName string `json:"full_name"`
		Title    string `json:"title"`
		IsActive bool   `json:"is_active"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid platform admin update payload"})
	}
	updated, err := h.masterAuth.UpdatePlatformAdmin(c.UserContext(), targetID, actor.AdminID, body.FullName, body.Title, body.IsActive)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	if h.adminAudit != nil {
		h.adminAudit.RecordEvent(c.UserContext(), usecase.AuditEventInput{
			ActorEmail: actor.Email,
			ActorName:  actor.FullName,
			ActorRole:  "PlatformSuperAdmin",
			Module:     "PLATFORM",
			Action:     "PLATFORM_ADMIN_UPDATED",
			EntityType: "platform_admin",
			EntityID:   updated.ID.String(),
			Summary:    "Updated Platform SuperAdmin " + updated.Email + " (active=" + strconv.FormatBool(updated.IsActive) + ")",
			IPAddress:  c.IP(),
			Status:     "SUCCESS",
		})
	}
	return c.JSON(fiber.Map{"admin": updated})
}

// AdminListCompanies lists all registered companies paired with their dedicated PostgreSQL database names and live stats.
func (h *Handler) AdminListCompanies(c *fiber.Ctx) error {
	companies, err := h.adminAudit.ListCompanies(c.UserContext())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"companies": companies})
}

// AdminCreateCompany provisions a physical database-per-company plus its initial basics and Owner/Admin user.
func (h *Handler) AdminCreateCompany(c *fiber.Ctx) error {
	actor, _ := middleware.GetPlatformAdminContext(c)
	var req usecase.CreateCompanyRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid company creation payload"})
	}
	res, err := h.adminAudit.CreateCompany(c.UserContext(), actor, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	if comp, ok := res["company"].(map[string]any); ok {
		bizID, _ := comp["id"].(uuid.UUID)
		slug, _ := comp["slug"].(string)
		dbName, _ := comp["db_name"].(string)
		h.adminAudit.RecordEvent(c.UserContext(), usecase.AuditEventInput{
			BusinessID:  &bizID,
			CompanySlug: slug,
			CompanyName: req.Name,
			DBName:      dbName,
			ActorEmail:  actor.Email,
			ActorName:   actor.FullName,
			ActorRole:   "PlatformSuperAdmin",
			Module:      "PLATFORM",
			Action:      "COMPANY_DB_PROVISIONED",
			EntityType:  "business",
			EntityID:    bizID.String(),
			Summary:     "Provisioned company " + req.Name + " with dedicated DB " + dbName + " (/c/" + slug + "/login)",
			Metadata:    map[string]any{"owner_email": req.OwnerEmail, "industry_profile": req.IndustryProfile, "slug": slug, "db_name": dbName},
			IPAddress:   c.IP(),
			Status:      "SUCCESS",
		})
	}
	return c.Status(fiber.StatusCreated).JSON(res)
}

// AdminUpdateCompany updates a company's profile in Master Registry and syncs it into its isolated tenant DB.
func (h *Handler) AdminUpdateCompany(c *fiber.Ctx) error {
	actor, _ := middleware.GetPlatformAdminContext(c)
	compID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid company id"})
	}
	var req usecase.UpdateCompanyAdminRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid company update payload"})
	}
	updated, err := h.adminAudit.UpdateCompanyAdmin(c.UserContext(), compID, req)
	if err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.adminAudit.RecordEvent(c.UserContext(), usecase.AuditEventInput{
		BusinessID:  &compID,
		CompanySlug: updated.Slug,
		CompanyName: updated.TradeName,
		DBName:      updated.DbName,
		ActorEmail:  actor.Email,
		ActorName:   actor.FullName,
		ActorRole:   "PlatformSuperAdmin",
		Module:      "PLATFORM",
		Action:      "COMPANY_UPDATED",
		EntityType:  "business",
		EntityID:    compID.String(),
		Summary:     "Updated company " + updated.TradeName + " (" + updated.IndustryProfile + ", active=" + strconv.FormatBool(updated.IsActive) + ")",
		IPAddress:   c.IP(),
		Status:      "SUCCESS",
	})
	return c.JSON(fiber.Map{"company": updated})
}

// AdminListAuditLogs lists centralized Master DB audit events across all isolated company databases.
func (h *Handler) AdminListAuditLogs(c *fiber.Ctx) error {
	bizID := uuid.Nil
	if rawBiz := strings.TrimSpace(c.Query("business_id")); rawBiz != "" {
		if parsed, err := uuid.Parse(rawBiz); err == nil {
			bizID = parsed
		}
	}
	limit := int32(100)
	if rawLimit := strings.TrimSpace(c.Query("limit")); rawLimit != "" {
		if n, err := strconv.Atoi(rawLimit); err == nil && n > 0 {
			limit = int32(n)
		}
	}
	offset := int32(0)
	if rawOffset := strings.TrimSpace(c.Query("offset")); rawOffset != "" {
		if n, err := strconv.Atoi(rawOffset); err == nil && n >= 0 {
			offset = int32(n)
		}
	}
	res, err := h.adminAudit.ListAuditLogs(c.UserContext(), usecase.ListAuditLogsFilter{
		BusinessID: bizID,
		Module:     c.Query("module"),
		Status:     c.Query("status"),
		Search:     c.Query("q"),
		Limit:      limit,
		Offset:     offset,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(res)
}

func branchTerminalMutationStatus(err error) int {
	msg := err.Error()
	if strings.Contains(msg, "only Company Owner") {
		return fiber.StatusForbidden
	}
	if strings.Contains(msg, "not found") {
		return fiber.StatusNotFound
	}
	return fiber.StatusUnprocessableEntity
}

// ListBranches lists company branches inside the company's dedicated DB, scoped to the user's authorized branches.
func (h *Handler) ListBranches(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	rows, err := h.branchesUC(c).ListBranchesManagement(c.UserContext(), tc)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	isOwner := usecase.IsMultiBranchRole(tc.RoleCode)
	return c.JSON(fiber.Map{
		"branches":            rows,
		"can_manage_branches": isOwner,
		"can_switch_branch":   tc.HasMultiBranchAccess(),
	})
}

// CreateBranch atomically creates a company branch, its warehouse, and optional starter POS terminal.
func (h *Handler) CreateBranch(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	if !usecase.IsMultiBranchRole(tc.RoleCode) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "only Company Owner can create branches"})
	}
	var req usecase.SaveBranchRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid branch payload"})
	}
	res, err := h.branchesUC(c).CreateBranch(c.UserContext(), tc, req)
	if err != nil {
		return c.Status(branchTerminalMutationStatus(err)).JSON(fiber.Map{"error": err.Error()})
	}
	entityID := ""
	if br, ok := res["branch"].(db.Branch); ok {
		entityID = br.ID.String()
	}
	h.recordAudit(c, tc, "BRANCHES", "BRANCH_CREATED", "branch", entityID,
		"Created branch "+req.Name+" ("+strings.ToUpper(strings.TrimSpace(req.Code))+")", "SUCCESS",
		map[string]any{"country_code": req.CountryCode, "is_warehouse": req.IsWarehouse})
	return c.Status(fiber.StatusCreated).JSON(res)
}

// UpdateBranch updates an existing branch in the active company DB (Owner only).
func (h *Handler) UpdateBranch(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	if !usecase.IsMultiBranchRole(tc.RoleCode) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "only Company Owner can update branches"})
	}
	branchID, err := uuid.Parse(c.Params("id"))
	if err != nil || branchID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid branch id"})
	}
	var req usecase.SaveBranchRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid branch payload"})
	}
	updated, err := h.branchesUC(c).UpdateBranch(c.UserContext(), tc, branchID, req)
	if err != nil {
		return c.Status(branchTerminalMutationStatus(err)).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "BRANCHES", "BRANCH_UPDATED", "branch", updated.ID.String(),
		"Updated branch "+updated.Name+" ("+updated.Code+", active="+strconv.FormatBool(updated.IsActive)+")", "SUCCESS", nil)
	return c.JSON(fiber.Map{"branch": updated})
}

// ListTerminals lists POS terminals inside the company's dedicated DB (clamped for single-branch roles).
func (h *Handler) ListTerminals(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	scopedBranch, err := resolveQueryScopedBranch(c, tc)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	}
	rows, err := h.branchesUC(c).ListTerminalsManagement(c.UserContext(), tc, scopedBranch)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{
		"terminals":            rows,
		"can_manage_terminals": usecase.IsMultiBranchRole(tc.RoleCode),
	})
}

// CreateTerminal registers a POS terminal under a branch in the active company DB (Owner only).
func (h *Handler) CreateTerminal(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	if !usecase.IsMultiBranchRole(tc.RoleCode) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "only Company Owner can create POS terminals"})
	}
	var req usecase.SaveTerminalRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid terminal payload"})
	}
	created, err := h.branchesUC(c).CreateTerminal(c.UserContext(), tc, req)
	if err != nil {
		return c.Status(branchTerminalMutationStatus(err)).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "TERMINALS", "TERMINAL_CREATED", "terminal", created.ID.String(),
		"Created POS terminal "+created.Name+" ("+created.Code+")", "SUCCESS",
		map[string]any{"branch_id": created.BranchID, "hardware_serial": created.HardwareSerial})
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"terminal": created})
}

// UpdateTerminal updates a POS terminal's details or active status in the active company DB (Owner only).
func (h *Handler) UpdateTerminal(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	if !usecase.IsMultiBranchRole(tc.RoleCode) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "only Company Owner can update POS terminals"})
	}
	terminalID, err := uuid.Parse(c.Params("id"))
	if err != nil || terminalID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid terminal id"})
	}
	var req usecase.SaveTerminalRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid terminal payload"})
	}
	updated, err := h.branchesUC(c).UpdateTerminal(c.UserContext(), tc, terminalID, req)
	if err != nil {
		return c.Status(branchTerminalMutationStatus(err)).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "TERMINALS", "TERMINAL_UPDATED", "terminal", updated.ID.String(),
		"Updated POS terminal "+updated.Name+" ("+updated.Code+", active="+strconv.FormatBool(updated.IsActive)+")", "SUCCESS",
		map[string]any{"branch_id": updated.BranchID, "hardware_serial": updated.HardwareSerial})
	return c.JSON(fiber.Map{"terminal": updated})
}



