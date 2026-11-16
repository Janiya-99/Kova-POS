package http

import (
	"fmt"
	"strings"
	"time"

	"github.com/enterprise-pos/backend/internal/delivery/http/middleware"
	"github.com/enterprise-pos/backend/internal/domain"
	"github.com/enterprise-pos/backend/internal/infrastructure/ratelimit"
	"github.com/enterprise-pos/backend/internal/usecase"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

func (h *Handler) recordRateLimitAudit(
	c *fiber.Ctx,
	businessID *uuid.UUID,
	companySlug, dbName, actorEmail, policyName string,
	retryAfter int,
) {
	if h == nil || h.adminAudit == nil || h.rateLimiter == nil {
		return
	}
	auditKey := policyName + "|" + strings.TrimSpace(c.IP()) + "|" + strings.TrimSpace(actorEmail)
	if !h.rateLimiter.ShouldAuditBlock(policyName, auditKey, time.Minute) {
		return
	}
	summary := fmt.Sprintf("Rate limit blocked (%s) from %s — retry in %ds", policyName, c.IP(), retryAfter)
	if strings.TrimSpace(actorEmail) != "" {
		summary = fmt.Sprintf("Rate limit blocked (%s) for %s from %s — retry in %ds", policyName, actorEmail, c.IP(), retryAfter)
	}
	h.adminAudit.RecordEvent(c.UserContext(), usecase.AuditEventInput{
		BusinessID:  businessID,
		CompanySlug: companySlug,
		DBName:      dbName,
		ActorEmail:  actorEmail,
		Module:      "SECURITY",
		Action:      "RATE_LIMIT_EXCEEDED",
		EntityType:  "rate_limit",
		EntityID:    policyName,
		Summary:     summary,
		Metadata: map[string]any{
			"policy":              policyName,
			"retry_after_seconds": retryAfter,
			"path":                c.Path(),
			"method":              c.Method(),
		},
		IPAddress: c.IP(),
		Status:    "DENIED",
	})
}

func (h *Handler) onRateLimitBlocked(c *fiber.Ctx, res ratelimit.CheckResult) {
	if tc, ok := middleware.GetTenantContext(c); ok {
		biz := tc.BusinessID
		h.recordRateLimitAudit(c, &biz, tc.CompanySlug, tc.DBName, tc.Email, res.Policy, res.RetryAfterSeconds)
		return
	}
	h.recordRateLimitAudit(c, nil, "", "", "", res.Policy, res.RetryAfterSeconds)
}

// Logout terminates the caller's active tenant session across PostgreSQL and Redis.
func (h *Handler) Logout(c *fiber.Ctx) error {
	tc, ok := middleware.GetTenantContext(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}
	if err := h.authUC(c).LogoutSession(c.UserContext(), tc.BusinessID, tc.UserID, tc.SessionID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "AUTH", "USER_LOGOUT", "user_session", tc.SessionID.String(),
		tc.FullName+" signed out cleanly", "SUCCESS", nil)
	return c.JSON(fiber.Map{"status": "logged_out"})
}

// RefreshSession extends the caller's active tenant session TTL and returns a refreshed JWT + context.
func (h *Handler) RefreshSession(c *fiber.Ctx) error {
	tc, ok := middleware.GetTenantContext(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}
	res, err := h.authUC(c).RefreshSession(c.UserContext(), tc, middleware.ClientMeta(c))
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error(), "code": "SESSION_INVALID"})
	}
	return c.JSON(res)
}

// ListMySessions returns active sessions belonging to the authenticated staff user within the company tenant.
func (h *Handler) ListMySessions(c *fiber.Ctx) error {
	tc, ok := middleware.GetTenantContext(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}
	sessions, err := h.authUC(c).ListMySessions(c.UserContext(), tc.BusinessID, tc.UserID, tc.SessionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	policy := h.authUC(c).ResolveSessionPolicy(c.UserContext(), tc.BusinessID, tc.BranchID, tc.TerminalID)
	return c.JSON(fiber.Map{
		"current_session_id": tc.SessionID,
		"sessions":           sessions,
		"policy":             policy,
	})
}

// RevokeMySession terminates one specific session owned by the signed-in user.
func (h *Handler) RevokeMySession(c *fiber.Ctx) error {
	tc, ok := middleware.GetTenantContext(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}
	targetID, err := uuid.Parse(c.Params("id"))
	if err != nil || targetID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid session id"})
	}
	if err := h.authUC(c).RevokeSession(c.UserContext(), tc.BusinessID, targetID, tc.UserID, false, "user_session_revoked"); err != nil {
		status := fiber.StatusUnprocessableEntity
		if strings.Contains(err.Error(), "forbidden") {
			status = fiber.StatusForbidden
		}
		return c.Status(status).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "SECURITY", "SESSION_REVOKED", "user_session", targetID.String(),
		tc.FullName+" revoked personal session "+targetID.String(), "SUCCESS", nil)
	return c.JSON(fiber.Map{"status": "revoked", "session_id": targetID})
}

// RevokeOtherSessions signs out all other active devices/tabs for the signed-in user.
func (h *Handler) RevokeOtherSessions(c *fiber.Ctx) error {
	tc, ok := middleware.GetTenantContext(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}
	count, err := h.authUC(c).RevokeOtherSessions(c.UserContext(), tc.BusinessID, tc.UserID, tc.SessionID, "user_revoke_other_devices")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "SECURITY", "OTHER_SESSIONS_REVOKED", "user", tc.UserID.String(),
		fmt.Sprintf("%s signed out %d other active session(s)", tc.FullName, count), "SUCCESS", map[string]any{"revoked_count": count})
	return c.JSON(fiber.Map{"status": "revoked_others", "revoked_count": count})
}

// ListBusinessSessions returns all active sessions across the tenant business for security admins.
func (h *Handler) ListBusinessSessions(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	sessions, err := h.authUC(c).ListBusinessSessions(c.UserContext(), tc.BusinessID, tc.SessionID, 150)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{
		"current_session_id": tc.SessionID,
		"sessions":           sessions,
	})
}

// AdminRevokeTenantSession terminates any active session inside the caller's company business.
func (h *Handler) AdminRevokeTenantSession(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	targetID, err := uuid.Parse(c.Params("id"))
	if err != nil || targetID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid session id"})
	}
	if err := h.authUC(c).RevokeSession(c.UserContext(), tc.BusinessID, targetID, tc.UserID, true, "admin_force_revoke"); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "SECURITY", "ADMIN_SESSION_REVOKED", "user_session", targetID.String(),
		tc.FullName+" force-terminated session "+targetID.String(), "SUCCESS", nil)
	return c.JSON(fiber.Map{"status": "revoked", "session_id": targetID})
}

// AdminRevokeAllUserSessions terminates every active session for a target staff member in the tenant business.
func (h *Handler) AdminRevokeAllUserSessions(c *fiber.Ctx) error {
	tc, _ := middleware.GetTenantContext(c)
	targetUserID, err := uuid.Parse(c.Params("userId"))
	if err != nil || targetUserID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user id"})
	}
	count, err := h.authUC(c).RevokeAllUserSessions(c.UserContext(), tc.BusinessID, targetUserID, tc.UserID, "admin_force_logout")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	h.recordAudit(c, tc, "SECURITY", "USER_SESSIONS_TERMINATED", "user", targetUserID.String(),
		fmt.Sprintf("%s force-terminated %d session(s) for user %s", tc.FullName, count, targetUserID.String()), "SUCCESS", map[string]any{"revoked_count": count})
	return c.JSON(fiber.Map{"status": "terminated", "user_id": targetUserID, "revoked_count": count})
}

// GetSecurityOverview returns current user's sessions, effective policy, and (when authorized) company-wide sessions & rate limits.
func (h *Handler) GetSecurityOverview(c *fiber.Ctx) error {
	tc, ok := middleware.GetTenantContext(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}
	auth := h.authUC(c)
	mySessions, err := auth.ListMySessions(c.UserContext(), tc.BusinessID, tc.UserID, tc.SessionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	policy := auth.ResolveSessionPolicy(c.UserContext(), tc.BusinessID, tc.BranchID, tc.TerminalID)

	canViewOrg := h.hasPermission(c, tc, "security:sessions_view") || h.hasPermission(c, tc, "rbac:view") || tc.RoleCode == "BusinessOwner"
	canManageOrg := h.hasPermission(c, tc, "security:sessions_manage") || h.hasPermission(c, tc, "rbac:manage") || tc.RoleCode == "BusinessOwner"

	companySessions := []domain.UserSessionSummary{}
	if canViewOrg {
		if list, lErr := auth.ListBusinessSessions(c.UserContext(), tc.BusinessID, tc.SessionID, 150); lErr == nil {
			companySessions = list
		}
	}

	var rateLimits []ratelimit.PolicyMetrics
	if h.rateLimiter != nil && canViewOrg {
		rateLimits = h.rateLimiter.SnapshotMetrics(c.UserContext())
	} else {
		rateLimits = []ratelimit.PolicyMetrics{}
	}

	return c.JSON(fiber.Map{
		"current_session_id": tc.SessionID,
		"can_view_org":       canViewOrg,
		"can_manage_org":     canManageOrg,
		"policy":             policy,
		"my_sessions":        mySessions,
		"company_sessions":   companySessions,
		"rate_limits":        rateLimits,
	})
}

// --- Platform Control Plane Session & Security Handlers ---

// AdminLogout terminates the current Platform SuperAdmin session across PostgreSQL and Redis.
func (h *Handler) AdminLogout(c *fiber.Ctx) error {
	actor, ok := middleware.GetPlatformAdminContext(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}
	if err := h.masterAuth.LogoutPlatformAdminSession(c.UserContext(), actor.SessionID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if h.adminAudit != nil {
		h.adminAudit.RecordEvent(c.UserContext(), usecase.AuditEventInput{
			ActorEmail: actor.Email,
			ActorName:  actor.FullName,
			ActorRole:  "PlatformSuperAdmin",
			Module:     "PLATFORM",
			Action:     "ADMIN_LOGOUT",
			EntityType: "platform_admin_session",
			EntityID:   actor.SessionID.String(),
			Summary:    actor.FullName + " signed out from Platform Control Plane",
			IPAddress:  c.IP(),
			Status:     "SUCCESS",
		})
	}
	return c.JSON(fiber.Map{"status": "logged_out"})
}

// AdminRefreshSession refreshes an active Platform SuperAdmin session token and extends idle deadline.
func (h *Handler) AdminRefreshSession(c *fiber.Ctx) error {
	actor, ok := middleware.GetPlatformAdminContext(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthenticated"})
	}
	res, err := h.masterAuth.RefreshPlatformAdminSession(c.UserContext(), actor, middleware.ClientMeta(c))
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": err.Error(), "code": "SESSION_INVALID"})
	}
	return c.JSON(res)
}

// AdminListSessions lists all active Platform SuperAdmin sessions in the Master DB.
func (h *Handler) AdminListSessions(c *fiber.Ctx) error {
	actor, _ := middleware.GetPlatformAdminContext(c)
	sessions, err := h.masterAuth.ListPlatformAdminSessions(c.UserContext(), actor.SessionID, 100)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{
		"current_session_id": actor.SessionID,
		"sessions":           sessions,
	})
}

// AdminRevokeSession force-closes a specific Platform SuperAdmin session.
func (h *Handler) AdminRevokeSession(c *fiber.Ctx) error {
	actor, _ := middleware.GetPlatformAdminContext(c)
	targetID, err := uuid.Parse(c.Params("id"))
	if err != nil || targetID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid session id"})
	}
	if err := h.masterAuth.RevokePlatformAdminSession(c.UserContext(), targetID, "admin_manual_revoke"); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": err.Error()})
	}
	if h.adminAudit != nil {
		h.adminAudit.RecordEvent(c.UserContext(), usecase.AuditEventInput{
			ActorEmail: actor.Email,
			ActorName:  actor.FullName,
			ActorRole:  "PlatformSuperAdmin",
			Module:     "SECURITY",
			Action:     "ADMIN_SESSION_REVOKED",
			EntityType: "platform_admin_session",
			EntityID:   targetID.String(),
			Summary:    actor.FullName + " revoked platform admin session " + targetID.String(),
			IPAddress:  c.IP(),
			Status:     "SUCCESS",
		})
	}
	return c.JSON(fiber.Map{"status": "revoked", "session_id": targetID})
}

// AdminRevokeOtherSessions terminates all other active Platform SuperAdmin sessions belonging to the caller.
func (h *Handler) AdminRevokeOtherSessions(c *fiber.Ctx) error {
	actor, _ := middleware.GetPlatformAdminContext(c)
	count, err := h.masterAuth.RevokeOtherPlatformAdminSessions(c.UserContext(), actor.AdminID, actor.SessionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if h.adminAudit != nil {
		h.adminAudit.RecordEvent(c.UserContext(), usecase.AuditEventInput{
			ActorEmail: actor.Email,
			ActorName:  actor.FullName,
			ActorRole:  "PlatformSuperAdmin",
			Module:     "SECURITY",
			Action:     "ADMIN_OTHER_SESSIONS_REVOKED",
			EntityType: "platform_admin",
			EntityID:   actor.AdminID.String(),
			Summary:    fmt.Sprintf("%s terminated %d other platform admin session(s)", actor.FullName, count),
			IPAddress:  c.IP(),
			Status:     "SUCCESS",
		})
	}
	return c.JSON(fiber.Map{"status": "revoked_others", "revoked_count": count})
}

// AdminGetSecurityOverview returns Platform SuperAdmin active sessions and global rate-limit telemetry.
func (h *Handler) AdminGetSecurityOverview(c *fiber.Ctx) error {
	actor, _ := middleware.GetPlatformAdminContext(c)
	sessions, err := h.masterAuth.ListPlatformAdminSessions(c.UserContext(), actor.SessionID, 100)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	rateLimits := []ratelimit.PolicyMetrics{}
	if h.rateLimiter != nil {
		rateLimits = h.rateLimiter.SnapshotMetrics(c.UserContext())
	}
	return c.JSON(fiber.Map{
		"current_session_id": actor.SessionID,
		"sessions":           sessions,
		"rate_limits":        rateLimits,
	})
}

