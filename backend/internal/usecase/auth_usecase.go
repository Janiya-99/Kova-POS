package usecase

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/enterprise-pos/backend/internal/domain"
	"github.com/enterprise-pos/backend/internal/infrastructure/mailer"
	"github.com/enterprise-pos/backend/internal/infrastructure/ws"
	"github.com/enterprise-pos/backend/internal/repository/sqlc/db"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/redis/go-redis/v9"
	"github.com/shopspring/decimal"
	"golang.org/x/crypto/bcrypt"
)

// AuthJWTClaims defines the signed JWT payload for tenant-isolated requests.
type AuthJWTClaims struct {
	TokenScope        string   `json:"token_scope"` // "TENANT"
	CompanySlug       string   `json:"company_slug"`
	DBName            string   `json:"db_name,omitempty"`
	UserID            string   `json:"user_id"`
	Email             string   `json:"email"`
	FullName          string   `json:"full_name"`
	AvatarURL         string   `json:"avatar_url"`
	BusinessID        string   `json:"business_id"`
	BusinessName      string   `json:"business_name"`
	TradeName         string   `json:"trade_name"`
	BaseCurrency      string   `json:"base_currency"`
	PrimaryColorHex   string   `json:"primary_color_hex"`
	DefaultLanguage   string   `json:"default_language"`
	IndustryProfile   string   `json:"industry_profile"`
	BranchID          string   `json:"branch_id"`
	TerminalID        string   `json:"terminal_id"`
	RoleCode          string   `json:"role_code"`
	RoleName          string   `json:"role_name"`
	DesignationName   string   `json:"designation_name"`
	MaxPOSDiscountPct string   `json:"max_pos_discount_pct"`
	Permissions       []string `json:"permissions"`
	jwt.RegisteredClaims
}

// PlatformAdminJWTClaims defines the signed JWT payload strictly scoped to Platform Control Plane routes.
type PlatformAdminJWTClaims struct {
	TokenScope string `json:"token_scope"` // "PLATFORM_ADMIN"
	AdminID    string `json:"admin_id"`
	Email      string `json:"email"`
	FullName   string `json:"full_name"`
	Title      string `json:"title"`
	jwt.RegisteredClaims
}

// PlatformAdminLoginRequest authenticates into the standalone Platform Control Plane.
type PlatformAdminLoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// PlatformAdminSaveRequest creates or bootstraps a Platform SuperAdmin account.
type PlatformAdminSaveRequest struct {
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Title    string `json:"title"`
}

// PlatformAdminLoginResponse returns the signed Platform Admin JWT and identity.
type PlatformAdminLoginResponse struct {
	Token string                      `json:"token"`
	Admin domain.PlatformAdminContext `json:"admin"`
}

// OverrideJWTClaims defines the short-lived supervisor override token payload.
type OverrideJWTClaims struct {
	SupervisorID   string `json:"supervisor_id"`
	SupervisorName string `json:"supervisor_name"`
	BusinessID     string `json:"business_id"`
	Action         string `json:"action"`
	Reason         string `json:"reason"`
	jwt.RegisteredClaims
}

// PasswordResetMailer defines the outbound SMTP interface for sending password reset emails.
type PasswordResetMailer interface {
	IsConfigured() bool
	SendPasswordResetEmail(ctx context.Context, in mailer.PasswordResetEmailInput) error
}

// ResetPasswordRequest verifies identity via email OTP/token, current password, or supervisor PIN before updating password.
type ResetPasswordRequest struct {
	Mode            string `json:"mode"` // "email_code" | "email_token" | "current_password" | "supervisor_pin"
	Email           string `json:"email"`
	EmailCode       string `json:"email_code"`
	ResetToken      string `json:"reset_token"`
	CurrentPassword string `json:"current_password"`
	SupervisorEmail string `json:"supervisor_email"`
	SupervisorPIN   string `json:"supervisor_pin"`
	NewPassword     string `json:"new_password"`
}

// ChangePasswordRequest updates the currently authenticated user's password.
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// LoginRequest represents credentials + optional tenant selection.
type LoginRequest struct {
	Email      string `json:"email"`
	Password   string `json:"password"`
	BusinessID string `json:"business_id,omitempty"`
}

// LoginResponse carries the JWT, active context, and branch/warehouse/terminal catalog.
type LoginResponse struct {
	Token      string                        `json:"token"`
	Context    domain.TenantContext          `json:"context"`
	Businesses []db.GetUserBusinessContextsRow `json:"businesses"`
	Branches   []db.ListBranchesForBusinessRow   `json:"branches"`
	Warehouses []db.ListWarehousesForBusinessRow `json:"warehouses"`
	Terminals  []db.ListTerminalsForBranchRow    `json:"terminals"`
}

// RoleMatrixEntry represents one role and its assigned permission codes.
type RoleMatrixEntry struct {
	RoleID      uuid.UUID  `json:"role_id"`
	BusinessID  *uuid.UUID `json:"business_id,omitempty"`
	RoleCode    string     `json:"role_code"`
	RoleName    string     `json:"role_name"`
	Description string     `json:"description"`
	IsSystem    bool       `json:"is_system"`
	Permissions []string   `json:"permissions"`
}

// AuthUsecase handles authentication, server-side sessions, tenant/branch switching, RBAC caching, and supervisor PIN overrides.
type AuthUsecase struct {
	queries        *db.Queries
	redis          *redis.Client
	settings       *SettingsResolver
	hub            *ws.Hub
	mailer         PasswordResetMailer
	jwtSecret      []byte
	pinTokenSecret []byte
	companySlug    string
	dbName         string
}

// NewAuthUsecase constructs an AuthUsecase instance.
func NewAuthUsecase(queries *db.Queries, rdb *redis.Client, jwtSecret, pinTokenSecret string) *AuthUsecase {
	return &AuthUsecase{
		queries:        queries,
		redis:          rdb,
		jwtSecret:      []byte(jwtSecret),
		pinTokenSecret: []byte(pinTokenSecret),
	}
}

// SetTenantIdentity binds this AuthUsecase instance to a dedicated company portal slug & DB name.
func (a *AuthUsecase) SetTenantIdentity(slug, dbName string) {
	a.companySlug = strings.TrimSpace(slug)
	a.dbName = strings.TrimSpace(dbName)
}

// SetSettingsResolver attaches the 6-level settings resolver so session TTL/idle/rate limits inherit dynamically.
func (a *AuthUsecase) SetSettingsResolver(sr *SettingsResolver) {
	a.settings = sr
}

// SetHub attaches the tenant WebSocket hub to push real-time SESSION_REVOKED broadcasts.
func (a *AuthUsecase) SetHub(hub *ws.Hub) {
	a.hub = hub
}

// SetMailer attaches an SMTP mailer for self-service password reset verification emails.
func (a *AuthUsecase) SetMailer(m PasswordResetMailer) {
	a.mailer = m
}

// SummarizeDeviceLabel turns a raw HTTP User-Agent string into a crisp human-readable device tag.
func SummarizeDeviceLabel(userAgent string) string {
	ua := strings.TrimSpace(userAgent)
	if ua == "" {
		return "Web Client"
	}
	lower := strings.ToLower(ua)
	browser := "Browser"
	switch {
	case strings.Contains(lower, "edg/"):
		browser = "Edge"
	case strings.Contains(lower, "opr/") || strings.Contains(lower, "opera"):
		browser = "Opera"
	case strings.Contains(lower, "chrome/") && !strings.Contains(lower, "chromium"):
		browser = "Chrome"
	case strings.Contains(lower, "firefox/"):
		browser = "Firefox"
	case strings.Contains(lower, "safari/") && !strings.Contains(lower, "chrome/"):
		browser = "Safari"
	case strings.Contains(lower, "curl/"):
		browser = "cURL"
	case strings.Contains(lower, "pos-terminal") || strings.Contains(lower, "electron"):
		browser = "POS Desktop"
	}
	osName := ""
	switch {
	case strings.Contains(lower, "android"):
		osName = "Android"
	case strings.Contains(lower, "iphone") || strings.Contains(lower, "ipad") || strings.Contains(lower, "ios"):
		osName = "iOS"
	case strings.Contains(lower, "windows"):
		osName = "Windows"
	case strings.Contains(lower, "mac os") || strings.Contains(lower, "macintosh"):
		osName = "macOS"
	case strings.Contains(lower, "linux"):
		osName = "Linux"
	}
	if osName != "" {
		return browser + " · " + osName
	}
	return browser
}

// ResolveSessionPolicy evaluates effective security & rate-limit settings across System -> Business -> Branch -> Terminal.
func (a *AuthUsecase) ResolveSessionPolicy(ctx context.Context, businessID, branchID, terminalID uuid.UUID) domain.SessionPolicy {
	policy := domain.SessionPolicy{
		TTLHours:           24,
		IdleTimeoutMinutes: 480,
		MaxConcurrent:      5,
		RateLimitEnabled:   true,
		APIRPM:             240,
		LoginMaxAttempts:   10,
		PINMaxAttempts:     5,
	}
	if a == nil || a.settings == nil || businessID == uuid.Nil {
		return policy
	}
	var brPtr, termPtr *uuid.UUID
	if branchID != uuid.Nil {
		brCopy := branchID
		brPtr = &brCopy
	}
	if terminalID != uuid.Nil {
		tCopy := terminalID
		termPtr = &tCopy
	}
	sc := SettingsContext{
		BusinessID: businessID,
		BranchID:   brPtr,
		TerminalID: termPtr,
	}
	if v := a.settings.GetInt(ctx, sc, "security.session.ttl_hours", policy.TTLHours); v > 0 {
		if v > 720 {
			v = 720
		}
		policy.TTLHours = v
	}
	if v := a.settings.GetInt(ctx, sc, "security.session.idle_timeout_minutes", policy.IdleTimeoutMinutes); v >= 5 {
		if v > 43200 {
			v = 43200
		}
		policy.IdleTimeoutMinutes = v
	}
	if v := a.settings.GetInt(ctx, sc, "security.session.max_concurrent", policy.MaxConcurrent); v >= 0 {
		if v > 50 {
			v = 50
		}
		policy.MaxConcurrent = v
	}
	policy.RateLimitEnabled = a.settings.GetBool(ctx, sc, "security.rate_limit.enabled", policy.RateLimitEnabled)
	if v := a.settings.GetInt(ctx, sc, "security.rate_limit.api_rpm", policy.APIRPM); v >= 10 {
		policy.APIRPM = v
	}
	if v := a.settings.GetInt(ctx, sc, "security.rate_limit.login_max_attempts", policy.LoginMaxAttempts); v >= 3 {
		policy.LoginMaxAttempts = v
	}
	if v := a.settings.GetInt(ctx, sc, "security.rate_limit.pin_max_attempts", policy.PINMaxAttempts); v >= 3 {
		policy.PINMaxAttempts = v
	}
	return policy
}

// Login authenticates credentials, caches RBAC permissions in Redis, and issues a server-tracked tenant JWT.
func (a *AuthUsecase) Login(ctx context.Context, req LoginRequest) (*LoginResponse, error) {
	return a.LoginWithMeta(ctx, req, domain.SessionClientMeta{})
}

// LoginWithMeta authenticates credentials and records client session metadata (IP, User-Agent, Device).
func (a *AuthUsecase) LoginWithMeta(ctx context.Context, req LoginRequest, meta domain.SessionClientMeta) (*LoginResponse, error) {
	email := strings.ToLower(strings.TrimSpace(req.Email))
	user, err := a.queries.GetUserByEmail(ctx, email)
	if err != nil {
		return nil, errors.New("invalid email or password")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, errors.New("invalid email or password")
	}

	rawContexts, err := a.queries.GetUserBusinessContexts(ctx, user.ID)
	if err != nil || len(rawContexts) == 0 {
		return nil, errors.New("no active business memberships found for user")
	}

	contexts := make([]db.GetUserBusinessContextsRow, 0, len(rawContexts))
	for _, c := range rawContexts {
		if c.RoleCode == "SuperAdmin" {
			// Company login is strictly 1-to-1 for company staff/owners; Platform SuperAdmins authenticate at /admin/login.
			continue
		}
		contexts = append(contexts, c)
	}
	if len(contexts) == 0 {
		return nil, errors.New("platform superadmin accounts must sign in via the Platform Admin Portal")
	}

	selected := contexts[0]
	if req.BusinessID != "" {
		if targetID, parseErr := uuid.Parse(req.BusinessID); parseErr == nil {
			for _, c := range contexts {
				if c.BusinessID == targetID {
					selected = c
					break
				}
			}
		}
	}

	return a.issueSessionWithMeta(ctx, user.ID, user.Email, user.FullName, user.AvatarUrl, selected, uuid.Nil, uuid.Nil, uuid.Nil, meta, []db.GetUserBusinessContextsRow{selected})
}

// SwitchContext changes the active branch or terminal within the user's dedicated company database.
func (a *AuthUsecase) SwitchContext(ctx context.Context, current domain.TenantContext, businessID, branchID, terminalID uuid.UUID) (*LoginResponse, error) {
	return a.SwitchContextWithMeta(ctx, current, businessID, branchID, terminalID, domain.SessionClientMeta{})
}

// SwitchContextWithMeta updates branch/terminal scope while keeping or refreshing the live session record.
func (a *AuthUsecase) SwitchContextWithMeta(ctx context.Context, current domain.TenantContext, businessID, branchID, terminalID uuid.UUID, meta domain.SessionClientMeta) (*LoginResponse, error) {
	if businessID != uuid.Nil && businessID != current.BusinessID {
		return nil, errors.New("cross-company switching is disabled under strict database-per-company isolation")
	}
	businessID = current.BusinessID

	roleRow, err := a.queries.GetUserRoleForBusiness(ctx, db.GetUserRoleForBusinessParams{
		UserID:     current.UserID,
		BusinessID: businessID,
	})
	if err != nil {
		return nil, errors.New("user does not belong to target business tenant")
	}
	if roleRow.RoleCode == "SuperAdmin" {
		return nil, errors.New("platform superadmin accounts must use the Platform Admin Portal")
	}

	selected := db.GetUserBusinessContextsRow{
		UserBusinessRoleID: roleRow.UserBusinessRoleID,
		BusinessID:         roleRow.BusinessID,
		BusinessName:       roleRow.BusinessName,
		TradeName:          roleRow.TradeName,
		BaseCurrency:       roleRow.BaseCurrency,
		TaxRegistrationNo:  roleRow.TaxRegistrationNo,
		LogoLightUrl:       roleRow.LogoLightUrl,
		LogoDarkUrl:        roleRow.LogoDarkUrl,
		LogoReceiptUrl:     roleRow.LogoReceiptUrl,
		PrimaryColorHex:    roleRow.PrimaryColorHex,
		DefaultLanguage:    roleRow.DefaultLanguage,
		IndustryProfile:    roleRow.IndustryProfile,
		BranchID:           roleRow.BranchID,
		RoleID:             roleRow.RoleID,
		RoleCode:           roleRow.RoleCode,
		RoleName:           roleRow.RoleName,
		MaxPosDiscountPct:  roleRow.MaxPosDiscountPct,
		DesignationName:    roleRow.DesignationName,
		SupervisorPinHash:  roleRow.SupervisorPinHash,
	}

	return a.issueSessionWithMeta(ctx, roleRow.UserID, roleRow.Email, roleRow.FullName, roleRow.AvatarUrl, selected, branchID, terminalID, current.SessionID, meta, []db.GetUserBusinessContextsRow{selected})
}

// RefreshSession extends an authenticated user's live session expiry and issues a renewed JWT.
func (a *AuthUsecase) RefreshSession(ctx context.Context, current domain.TenantContext, meta domain.SessionClientMeta) (*LoginResponse, error) {
	if err := a.ValidateTenantSession(ctx, current); err != nil {
		return nil, err
	}
	return a.SwitchContextWithMeta(ctx, current, current.BusinessID, current.BranchID, current.TerminalID, meta)
}

// IsMultiBranchRole returns true ONLY for enterprise roles permitted to access, switch, or manage multiple branches.
func IsMultiBranchRole(roleCode string) bool {
	return roleCode == "SuperAdmin" || roleCode == "BusinessOwner"
}

func filterMultiBranchPermissions(roleCode string, perms []string) []string {
	multiBranch := IsMultiBranchRole(roleCode)
	filtered := make([]string, 0, len(perms))
	for _, p := range perms {
		if p == "platform:admin" {
			continue
		}
		if !multiBranch && (p == "branches:switch" || p == "branches:manage") {
			continue
		}
		filtered = append(filtered, p)
	}
	return filtered
}

type cachedTenantSession struct {
	SessionID         uuid.UUID `json:"session_id"`
	BusinessID        uuid.UUID `json:"business_id"`
	UserID            uuid.UUID `json:"user_id"`
	ExpiresAtUnix     int64     `json:"expires_at_unix"`
	IdleExpiresAtUnix int64     `json:"idle_expires_at_unix"`
	IdleMinutes       int       `json:"idle_minutes"`
	LastTouchUnix     int64     `json:"last_touch_unix"`
}

func tenantSessionRedisKey(businessID, sessionID uuid.UUID) string {
	return fmt.Sprintf("sess:tenant:%s:%s", businessID.String(), sessionID.String())
}

func adminSessionRedisKey(sessionID uuid.UUID) string {
	return fmt.Sprintf("sess:admin:%s", sessionID.String())
}

func (a *AuthUsecase) cacheTenantSession(ctx context.Context, businessID, sessionID, userID uuid.UUID, expiresAt, idleExpiresAt time.Time, idleMinutes int) {
	if a == nil || a.redis == nil || sessionID == uuid.Nil {
		return
	}
	now := time.Now()
	ttl := expiresAt.Sub(now)
	if ttl <= 0 {
		return
	}
	entry := cachedTenantSession{
		SessionID:         sessionID,
		BusinessID:        businessID,
		UserID:            userID,
		ExpiresAtUnix:     expiresAt.Unix(),
		IdleExpiresAtUnix: idleExpiresAt.Unix(),
		IdleMinutes:       idleMinutes,
		LastTouchUnix:     now.Unix(),
	}
	if raw, err := json.Marshal(entry); err == nil {
		_ = a.redis.Set(ctx, tenantSessionRedisKey(businessID, sessionID), raw, ttl).Err()
	}
}

func (a *AuthUsecase) evictTenantSessionCache(ctx context.Context, businessID, sessionID uuid.UUID) {
	if a == nil || a.redis == nil || sessionID == uuid.Nil {
		return
	}
	_ = a.redis.Del(ctx, tenantSessionRedisKey(businessID, sessionID)).Err()
}

func (a *AuthUsecase) broadcastSessionRevoked(businessID, sessionID, userID uuid.UUID, reason string) {
	if a == nil || a.hub == nil || businessID == uuid.Nil {
		return
	}
	a.hub.BroadcastTenant(businessID, "SESSION_REVOKED", map[string]any{
		"session_id": sessionID.String(),
		"user_id":    userID.String(),
		"reason":     reason,
	})
}

func (a *AuthUsecase) issueSessionWithMeta(
	ctx context.Context,
	userID uuid.UUID,
	email, fullName, avatarURL string,
	selected db.GetUserBusinessContextsRow,
	overrideBranchID, overrideTerminalID, existingSessionID uuid.UUID,
	meta domain.SessionClientMeta,
	contexts []db.GetUserBusinessContextsRow,
) (*LoginResponse, error) {
	rawPerms, err := a.queries.ListPermissionsForRole(ctx, selected.RoleID)
	if err != nil {
		return nil, err
	}
	perms := filterMultiBranchPermissions(selected.RoleCode, rawPerms)

	branches, err := a.queries.ListBranchesForBusiness(ctx, selected.BusinessID)
	if err != nil {
		return nil, err
	}
	warehouses, _ := a.queries.ListWarehousesForBusiness(ctx, selected.BusinessID)

	// Strictly enforce branch & warehouse visibility by role scope:
	// ONLY SuperAdmin and BusinessOwner can access/switch multiple branches.
	// All other roles (Cashier, BranchManager, Accountant, InventoryController, custom) are locked to 1 branch.
	isEnterpriseScope := IsMultiBranchRole(selected.RoleCode)
	activeBranchID := uuid.Nil
	if !isEnterpriseScope {
		var lockedBranch db.ListBranchesForBusinessRow
		found := false
		if selected.BranchID.Valid {
			for _, br := range branches {
				if br.ID == selected.BranchID.UUID {
					lockedBranch = br
					found = true
					break
				}
			}
		}
		if !found && len(branches) > 0 {
			lockedBranch = branches[0]
			found = true
		}
		if found {
			if overrideBranchID != uuid.Nil && overrideBranchID != lockedBranch.ID {
				return nil, errors.New("only Company Owner or SuperAdmin can access or switch multiple branches")
			}
			branches = []db.ListBranchesForBusinessRow{lockedBranch}
			activeBranchID = lockedBranch.ID
			scopedWarehouses := make([]db.ListWarehousesForBusinessRow, 0, len(warehouses))
			for _, wh := range warehouses {
				if wh.BranchID == uuid.Nil || wh.BranchID == lockedBranch.ID {
					scopedWarehouses = append(scopedWarehouses, wh)
				}
			}
			warehouses = scopedWarehouses
		} else {
			branches = []db.ListBranchesForBusinessRow{}
			warehouses = []db.ListWarehousesForBusinessRow{}
		}
	} else {
		if overrideBranchID != uuid.Nil {
			for _, br := range branches {
				if br.ID == overrideBranchID {
					activeBranchID = overrideBranchID
					break
				}
			}
		}
		if activeBranchID == uuid.Nil && selected.BranchID.Valid {
			for _, br := range branches {
				if br.ID == selected.BranchID.UUID {
					activeBranchID = selected.BranchID.UUID
					break
				}
			}
		}
		if activeBranchID == uuid.Nil && len(branches) > 0 {
			activeBranchID = branches[0].ID
		}
	}

	var terminals []db.ListTerminalsForBranchRow
	if activeBranchID != uuid.Nil {
		terminals, _ = a.queries.ListTerminalsForBranch(ctx, db.ListTerminalsForBranchParams{
			BusinessID: selected.BusinessID,
			BranchID:   activeBranchID,
		})
	}
	activeTerminalID := uuid.Nil
	if overrideTerminalID != uuid.Nil {
		for _, tm := range terminals {
			if tm.ID == overrideTerminalID {
				activeTerminalID = overrideTerminalID
				break
			}
		}
		if activeTerminalID == uuid.Nil && !isEnterpriseScope {
			if targetTm, tErr := a.queries.GetTerminalForBusiness(ctx, db.GetTerminalForBusinessParams{
				BusinessID: selected.BusinessID,
				ID:         overrideTerminalID,
			}); tErr == nil && targetTm.BranchID != activeBranchID {
				return nil, errors.New("terminal does not belong to your assigned branch")
			}
		}
	}
	if activeTerminalID == uuid.Nil && len(terminals) > 0 {
		activeTerminalID = terminals[0].ID
	}

	policy := a.ResolveSessionPolicy(ctx, selected.BusinessID, activeBranchID, activeTerminalID)
	now := time.Now()
	ttlDur := time.Duration(policy.TTLHours) * time.Hour
	if ttlDur < time.Hour {
		ttlDur = 24 * time.Hour
	}
	idleDur := time.Duration(policy.IdleTimeoutMinutes) * time.Minute
	if idleDur < 5*time.Minute {
		idleDur = 5 * time.Minute
	}
	if idleDur > ttlDur {
		idleDur = ttlDur
	}
	expiresAt := now.Add(ttlDur)
	idleExpiresAt := now.Add(idleDur)

	deviceLabel := strings.TrimSpace(meta.DeviceLabel)
	if deviceLabel == "" {
		deviceLabel = SummarizeDeviceLabel(meta.UserAgent)
	}

	var brNull, tmNull uuid.NullUUID
	if activeBranchID != uuid.Nil {
		brNull = uuid.NullUUID{UUID: activeBranchID, Valid: true}
	}
	if activeTerminalID != uuid.Nil {
		tmNull = uuid.NullUUID{UUID: activeTerminalID, Valid: true}
	}

	sessionID := existingSessionID
	reused := false
	if a.queries != nil {
		if sessionID != uuid.Nil {
			if row, gErr := a.queries.GetUserSessionByID(ctx, db.GetUserSessionByIDParams{
				BusinessID: selected.BusinessID,
				ID:         sessionID,
			}); gErr == nil && !row.RevokedAt.Valid && row.UserID == userID {
				if updErr := a.queries.UpdateUserSessionScopeAndExpiry(ctx, db.UpdateUserSessionScopeAndExpiryParams{
					BusinessID:    selected.BusinessID,
					ID:            sessionID,
					BranchID:      brNull,
					TerminalID:    tmNull,
					IdleExpiresAt: pgtype.Timestamptz{Time: idleExpiresAt, Valid: true},
					ExpiresAt:     pgtype.Timestamptz{Time: expiresAt, Valid: true},
				}); updErr == nil {
					reused = true
				}
			}
		}
		if !reused {
			sessionID = uuid.New()
			if policy.MaxConcurrent > 0 {
				if existingIDs, listErr := a.queries.ListUserActiveSessionIDsAsc(ctx, db.ListUserActiveSessionIDsAscParams{
					BusinessID: selected.BusinessID,
					UserID:     userID,
				}); listErr == nil && len(existingIDs) >= policy.MaxConcurrent {
					evictCount := len(existingIDs) - policy.MaxConcurrent + 1
					for i := 0; i < evictCount && i < len(existingIDs); i++ {
						evID := existingIDs[i]
						if _, revErr := a.queries.RevokeUserSession(ctx, db.RevokeUserSessionParams{
							BusinessID:    selected.BusinessID,
							ID:            evID,
							RevokedBy:     uuid.NullUUID{UUID: userID, Valid: true},
							RevokedReason: "concurrent_session_limit",
						}); revErr == nil {
							a.evictTenantSessionCache(ctx, selected.BusinessID, evID)
							a.broadcastSessionRevoked(selected.BusinessID, evID, userID, "concurrent_session_limit")
						}
					}
				}
			}
			if _, crErr := a.queries.CreateUserSession(ctx, db.CreateUserSessionParams{
				ID:            sessionID,
				BusinessID:    selected.BusinessID,
				UserID:        userID,
				BranchID:      brNull,
				TerminalID:    tmNull,
				RoleCode:      selected.RoleCode,
				IpAddress:     strings.TrimSpace(meta.IPAddress),
				UserAgent:     strings.TrimSpace(meta.UserAgent),
				DeviceLabel:   deviceLabel,
				IdleExpiresAt: pgtype.Timestamptz{Time: idleExpiresAt, Valid: true},
				ExpiresAt:     pgtype.Timestamptz{Time: expiresAt, Valid: true},
			}); crErr != nil {
				return nil, crErr
			}
		}
	} else if sessionID == uuid.Nil {
		sessionID = uuid.New()
	}

	a.cacheTenantSession(ctx, selected.BusinessID, sessionID, userID, expiresAt, idleExpiresAt, policy.IdleTimeoutMinutes)

	tradeName := selected.TradeName
	if tradeName == "" {
		tradeName = selected.BusinessName
	}
	primaryHex := selected.PrimaryColorHex
	if primaryHex == "" {
		primaryHex = "#877FC1"
	}
	defaultLang := selected.DefaultLanguage
	if defaultLang == "" {
		defaultLang = "en"
	}
	sidebarLogo := selected.LogoDarkUrl
	if sidebarLogo == "" {
		sidebarLogo = selected.LogoLightUrl
	}
	industryProfile := strings.TrimSpace(selected.IndustryProfile)
	if industryProfile == "" {
		industryProfile = "retail"
	}

	tc := domain.TenantContext{
		TokenScope:           "TENANT",
		SessionID:            sessionID,
		SessionExpiresAt:     &expiresAt,
		SessionIdleExpiresAt: &idleExpiresAt,
		CompanySlug:          a.companySlug,
		DBName:               a.dbName,
		UserID:               userID,
		Email:                email,
		FullName:             fullName,
		AvatarURL:            avatarURL,
		BusinessID:           selected.BusinessID,
		BusinessName:         selected.BusinessName,
		TradeName:            tradeName,
		BaseCurrency:         selected.BaseCurrency,
		TaxRegistrationNo:    selected.TaxRegistrationNo,
		LogoLightURL:         selected.LogoLightUrl,
		LogoDarkURL:          selected.LogoDarkUrl,
		LogoReceiptURL:       selected.LogoReceiptUrl,
		LogoSidebarURL:       sidebarLogo,
		PrimaryColorHex:      primaryHex,
		DefaultLanguage:      defaultLang,
		IndustryProfile:      industryProfile,
		BranchID:             activeBranchID,
		TerminalID:           activeTerminalID,
		RoleCode:             selected.RoleCode,
		RoleName:             selected.RoleName,
		DesignationName:      selected.DesignationName,
		MaxPOSDiscountPct:    selected.MaxPosDiscountPct,
		Permissions:          perms,
	}

	a.CacheUserPermissions(ctx, tc.BusinessID, tc.UserID, perms)

	claims := AuthJWTClaims{
		TokenScope:        "TENANT",
		CompanySlug:       a.companySlug,
		DBName:            a.dbName,
		UserID:            tc.UserID.String(),
		Email:             tc.Email,
		FullName:          tc.FullName,
		AvatarURL:         tc.AvatarURL,
		BusinessID:        tc.BusinessID.String(),
		BusinessName:      tc.BusinessName,
		TradeName:         tc.TradeName,
		BaseCurrency:      tc.BaseCurrency,
		PrimaryColorHex:   tc.PrimaryColorHex,
		DefaultLanguage:   tc.DefaultLanguage,
		IndustryProfile:   tc.IndustryProfile,
		BranchID:          tc.BranchID.String(),
		TerminalID:        tc.TerminalID.String(),
		RoleCode:          tc.RoleCode,
		RoleName:          tc.RoleName,
		DesignationName:   tc.DesignationName,
		MaxPOSDiscountPct: tc.MaxPOSDiscountPct.StringFixed(2),
		Permissions:       tc.Permissions,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        sessionID.String(),
			Subject:   tc.UserID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}

	tokenStr, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(a.jwtSecret)
	if err != nil {
		return nil, err
	}

	return &LoginResponse{
		Token:      tokenStr,
		Context:    tc,
		Businesses: contexts,
		Branches:   branches,
		Warehouses: warehouses,
		Terminals:  terminals,
	}, nil
}

// ValidateTenantSession verifies an active server-side session against Redis and PostgreSQL, honoring idle & absolute expiries.
func (a *AuthUsecase) ValidateTenantSession(ctx context.Context, tc domain.TenantContext) error {
	if a == nil || (a.queries == nil && a.redis == nil) {
		return nil
	}
	if tc.SessionID == uuid.Nil {
		return errors.New("missing session identifier; please sign in again")
	}

	now := time.Now()
	nowUnix := now.Unix()
	key := tenantSessionRedisKey(tc.BusinessID, tc.SessionID)

	if a.redis != nil {
		if raw, err := a.redis.Get(ctx, key).Result(); err == nil && raw != "" {
			var entry cachedTenantSession
			if jErr := json.Unmarshal([]byte(raw), &entry); jErr == nil {
				if entry.UserID != tc.UserID || entry.BusinessID != tc.BusinessID {
					return errors.New("session tenant mismatch")
				}
				if nowUnix > entry.ExpiresAtUnix {
					a.evictTenantSessionCache(ctx, tc.BusinessID, tc.SessionID)
					return errors.New("session expired; please sign in again")
				}
				if nowUnix > entry.IdleExpiresAtUnix {
					if a.queries != nil {
						_, _ = a.queries.RevokeUserSession(ctx, db.RevokeUserSessionParams{
							BusinessID:    tc.BusinessID,
							ID:            tc.SessionID,
							RevokedReason: "idle_timeout",
						})
					}
					a.evictTenantSessionCache(ctx, tc.BusinessID, tc.SessionID)
					return errors.New("session timed out due to inactivity")
				}
				// Throttled touch (every 60s) to keep idle deadline fresh without hot DB writes.
				if nowUnix-entry.LastTouchUnix >= 60 {
					idleMins := entry.IdleMinutes
					if idleMins < 5 {
						idleMins = 480
					}
					nextIdle := now.Add(time.Duration(idleMins) * time.Minute)
					exp := time.Unix(entry.ExpiresAtUnix, 0)
					if nextIdle.After(exp) {
						nextIdle = exp
					}
					a.cacheTenantSession(ctx, tc.BusinessID, tc.SessionID, tc.UserID, exp, nextIdle, idleMins)
					if a.queries != nil {
						_ = a.queries.TouchUserSession(ctx, db.TouchUserSessionParams{
							BusinessID:    tc.BusinessID,
							ID:            tc.SessionID,
							IdleExpiresAt: pgtype.Timestamptz{Time: nextIdle, Valid: true},
						})
					}
				}
				return nil
			}
		}
	}

	if a.queries == nil {
		return errors.New("session terminated or expired")
	}
	row, err := a.queries.GetUserSessionByID(ctx, db.GetUserSessionByIDParams{
		BusinessID: tc.BusinessID,
		ID:         tc.SessionID,
	})
	if err != nil {
		return errors.New("session not found or terminated")
	}
	if row.UserID != tc.UserID {
		return errors.New("session ownership mismatch")
	}
	if row.RevokedAt.Valid {
		if row.RevokedReason != "" {
			return fmt.Errorf("session revoked (%s)", row.RevokedReason)
		}
		return errors.New("session has been revoked")
	}
	if now.After(row.ExpiresAt.Time) {
		return errors.New("session expired; please sign in again")
	}
	if now.After(row.IdleExpiresAt.Time) {
		_, _ = a.queries.RevokeUserSession(ctx, db.RevokeUserSessionParams{
			BusinessID:    tc.BusinessID,
			ID:            tc.SessionID,
			RevokedReason: "idle_timeout",
		})
		return errors.New("session timed out due to inactivity")
	}

	policy := a.ResolveSessionPolicy(ctx, tc.BusinessID, tc.BranchID, tc.TerminalID)
	nextIdle := now.Add(time.Duration(policy.IdleTimeoutMinutes) * time.Minute)
	if nextIdle.After(row.ExpiresAt.Time) {
		nextIdle = row.ExpiresAt.Time
	}
	_ = a.queries.TouchUserSession(ctx, db.TouchUserSessionParams{
		BusinessID:    tc.BusinessID,
		ID:            tc.SessionID,
		IdleExpiresAt: pgtype.Timestamptz{Time: nextIdle, Valid: true},
	})
	a.cacheTenantSession(ctx, tc.BusinessID, tc.SessionID, tc.UserID, row.ExpiresAt.Time, nextIdle, policy.IdleTimeoutMinutes)
	return nil
}

// LogoutSession terminates the caller's active tenant session across PostgreSQL and Redis.
func (a *AuthUsecase) LogoutSession(ctx context.Context, businessID, userID, sessionID uuid.UUID) error {
	if sessionID == uuid.Nil {
		return nil
	}
	if a.queries != nil {
		_, _ = a.queries.RevokeUserSession(ctx, db.RevokeUserSessionParams{
			BusinessID:    businessID,
			ID:            sessionID,
			RevokedBy:     uuid.NullUUID{UUID: userID, Valid: userID != uuid.Nil},
			RevokedReason: "user_logout",
		})
	}
	a.evictTenantSessionCache(ctx, businessID, sessionID)
	a.broadcastSessionRevoked(businessID, sessionID, userID, "user_logout")
	return nil
}

// ListMySessions lists currently active sessions belonging to userID within businessID.
func (a *AuthUsecase) ListMySessions(ctx context.Context, businessID, userID, currentSessionID uuid.UUID) ([]domain.UserSessionSummary, error) {
	rows, err := a.queries.ListUserActiveSessions(ctx, db.ListUserActiveSessionsParams{
		BusinessID: businessID,
		UserID:     userID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]domain.UserSessionSummary, 0, len(rows))
	for _, r := range rows {
		var brPtr, tmPtr *uuid.UUID
		if r.BranchID.Valid {
			b := r.BranchID.UUID
			brPtr = &b
		}
		if r.TerminalID.Valid {
			t := r.TerminalID.UUID
			tmPtr = &t
		}
		out = append(out, domain.UserSessionSummary{
			ID:            r.ID,
			BusinessID:    r.BusinessID,
			UserID:        r.UserID,
			UserName:      r.UserName,
			UserEmail:     r.UserEmail,
			BranchID:      brPtr,
			BranchName:    r.BranchName,
			TerminalID:    tmPtr,
			TerminalName:  r.TerminalName,
			RoleCode:      r.RoleCode,
			IPAddress:     r.IpAddress,
			DeviceLabel:   r.DeviceLabel,
			CreatedAt:     r.CreatedAt.Time,
			LastSeenAt:    r.LastSeenAt.Time,
			IdleExpiresAt: r.IdleExpiresAt.Time,
			ExpiresAt:     r.ExpiresAt.Time,
			IsCurrent:     r.ID == currentSessionID,
		})
	}
	return out, nil
}

// ListBusinessSessions lists active sessions across the entire company tenant for security administrators.
func (a *AuthUsecase) ListBusinessSessions(ctx context.Context, businessID, currentSessionID uuid.UUID, limit int32) ([]domain.UserSessionSummary, error) {
	if limit <= 0 || limit > 250 {
		limit = 100
	}
	rows, err := a.queries.ListBusinessActiveSessions(ctx, db.ListBusinessActiveSessionsParams{
		BusinessID: businessID,
		Limit:      limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]domain.UserSessionSummary, 0, len(rows))
	for _, r := range rows {
		var brPtr, tmPtr *uuid.UUID
		if r.BranchID.Valid {
			b := r.BranchID.UUID
			brPtr = &b
		}
		if r.TerminalID.Valid {
			t := r.TerminalID.UUID
			tmPtr = &t
		}
		out = append(out, domain.UserSessionSummary{
			ID:            r.ID,
			BusinessID:    r.BusinessID,
			UserID:        r.UserID,
			UserName:      r.UserName,
			UserEmail:     r.UserEmail,
			BranchID:      brPtr,
			BranchName:    r.BranchName,
			TerminalID:    tmPtr,
			TerminalName:  r.TerminalName,
			RoleCode:      r.RoleCode,
			IPAddress:     r.IpAddress,
			DeviceLabel:   r.DeviceLabel,
			CreatedAt:     r.CreatedAt.Time,
			LastSeenAt:    r.LastSeenAt.Time,
			IdleExpiresAt: r.IdleExpiresAt.Time,
			ExpiresAt:     r.ExpiresAt.Time,
			IsCurrent:     r.ID == currentSessionID,
		})
	}
	return out, nil
}

// RevokeSession terminates one active tenant session (enforcing self-ownership unless allowAny is true).
func (a *AuthUsecase) RevokeSession(ctx context.Context, businessID, targetSessionID, actorUserID uuid.UUID, allowAny bool, reason string) error {
	row, err := a.queries.GetUserSessionByID(ctx, db.GetUserSessionByIDParams{
		BusinessID: businessID,
		ID:         targetSessionID,
	})
	if err != nil {
		return errors.New("session not found")
	}
	if !allowAny && row.UserID != actorUserID {
		return errors.New("forbidden: cannot revoke another user's session")
	}
	if reason == "" {
		reason = "manual_revoke"
	}
	rev, err := a.queries.RevokeUserSession(ctx, db.RevokeUserSessionParams{
		BusinessID:    businessID,
		ID:            targetSessionID,
		RevokedBy:     uuid.NullUUID{UUID: actorUserID, Valid: actorUserID != uuid.Nil},
		RevokedReason: reason,
	})
	if err != nil {
		return errors.New("session already revoked or closed")
	}
	a.evictTenantSessionCache(ctx, businessID, targetSessionID)
	a.broadcastSessionRevoked(businessID, rev.ID, rev.UserID, reason)
	return nil
}

// RevokeOtherSessions terminates every other active session for userID in businessID except keepSessionID.
func (a *AuthUsecase) RevokeOtherSessions(ctx context.Context, businessID, userID, keepSessionID uuid.UUID, reason string) (int, error) {
	if a.queries == nil {
		return 0, nil
	}
	if reason == "" {
		reason = "revoke_other_devices"
	}
	revoked, err := a.queries.RevokeUserSessionsExcept(ctx, db.RevokeUserSessionsExceptParams{
		BusinessID:    businessID,
		UserID:        userID,
		RevokedBy:     uuid.NullUUID{UUID: userID, Valid: userID != uuid.Nil},
		RevokedReason: reason,
		ID:            keepSessionID,
	})
	if err != nil {
		return 0, err
	}
	for _, r := range revoked {
		a.evictTenantSessionCache(ctx, businessID, r.ID)
		a.broadcastSessionRevoked(businessID, r.ID, r.UserID, reason)
	}
	return len(revoked), nil
}

// RevokeAllUserSessions terminates every active session for userID inside businessID immediately.
func (a *AuthUsecase) RevokeAllUserSessions(ctx context.Context, businessID, targetUserID, actorUserID uuid.UUID, reason string) (int, error) {
	if a.queries == nil {
		return 0, nil
	}
	if reason == "" {
		reason = "admin_force_logout"
	}
	revoked, err := a.queries.RevokeAllUserSessions(ctx, db.RevokeAllUserSessionsParams{
		BusinessID:    businessID,
		UserID:        targetUserID,
		RevokedBy:     uuid.NullUUID{UUID: actorUserID, Valid: actorUserID != uuid.Nil},
		RevokedReason: reason,
	})
	if err != nil {
		return 0, err
	}
	for _, r := range revoked {
		a.evictTenantSessionCache(ctx, businessID, r.ID)
		a.broadcastSessionRevoked(businessID, r.ID, r.UserID, reason)
	}
	return len(revoked), nil
}

// VerifySupervisorPIN validates a 6-digit supervisor PIN and emits a short-lived X-Supervisor-Override-Token.
func (a *AuthUsecase) VerifySupervisorPIN(ctx context.Context, businessID uuid.UUID, pin, action, reason string) (string, *domain.SupervisorClaim, error) {
	if len(pin) != 6 {
		return "", nil, errors.New("supervisor PIN must be 6 digits")
	}
	supervisors, err := a.queries.ListSupervisorsForBusiness(ctx, businessID)
	if err != nil {
		return "", nil, err
	}
	for _, sup := range supervisors {
		if err := bcrypt.CompareHashAndPassword([]byte(sup.SupervisorPinHash), []byte(pin)); err == nil {
			claims := OverrideJWTClaims{
				SupervisorID:   sup.UserID.String(),
				SupervisorName: sup.FullName,
				BusinessID:     businessID.String(),
				Action:         action,
				Reason:         reason,
				RegisteredClaims: jwt.RegisteredClaims{
					Subject:   sup.UserID.String(),
					IssuedAt:  jwt.NewNumericDate(time.Now()),
					ExpiresAt: jwt.NewNumericDate(time.Now().Add(5 * time.Minute)),
				},
			}
			tok, signErr := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(a.pinTokenSecret)
			if signErr != nil {
				return "", nil, signErr
			}
			return tok, &domain.SupervisorClaim{
				SupervisorID:   sup.UserID,
				SupervisorName: sup.FullName,
				BusinessID:     businessID,
				Action:         action,
				Reason:         reason,
			}, nil
		}
	}
	return "", nil, errors.New("invalid supervisor PIN")
}

const (
	passwordResetTTLMinutes = 15
	passwordResetMaxGuesses = 5
)

var ErrMailerNotConfigured = errors.New("email service is not configured: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM in .env")

func hashResetSecret(secret string, key []byte) string {
	clean := strings.TrimSpace(secret)
	if len(key) > 0 {
		mac := hmac.New(sha256.New, key)
		mac.Write([]byte(clean))
		return hex.EncodeToString(mac.Sum(nil))
	}
	sum := sha256.Sum256([]byte(clean))
	return hex.EncodeToString(sum[:])
}

func generateResetCodeAndToken() (code string, token string, err error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", "", err
	}
	code = fmt.Sprintf("%06d", n.Int64())

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", "", err
	}
	token = base64.RawURLEncoding.EncodeToString(raw)
	return code, token, nil
}

// RequestPasswordResetEmail generates a 6-digit OTP and URL reset token, stores SHA-256 HMAC hashes,
// and delivers the reset verification email to the user without leaking account existence.
func (a *AuthUsecase) RequestPasswordResetEmail(ctx context.Context, email, companySlug, requestedIP string) (uuid.UUID, *uuid.UUID, bool, error) {
	targetEmail := strings.ToLower(strings.TrimSpace(email))
	if targetEmail == "" || !strings.Contains(targetEmail, "@") {
		return uuid.Nil, nil, false, errors.New("valid account email is required")
	}
	if a.mailer == nil || !a.mailer.IsConfigured() {
		return uuid.Nil, nil, false, ErrMailerNotConfigured
	}

	user, err := a.queries.GetUserByEmail(ctx, targetEmail)
	if err != nil {
		// Return non-enumerating success indicator when email has no active user account.
		return uuid.Nil, nil, false, nil
	}

	contexts, cErr := a.queries.GetUserBusinessContexts(ctx, user.ID)
	if cErr != nil {
		contexts = nil
	}
	var auditBizID *uuid.UUID
	if len(contexts) > 0 {
		id := contexts[0].BusinessID
		auditBizID = &id
	}

	code, rawToken, err := generateResetCodeAndToken()
	if err != nil {
		return user.ID, auditBizID, false, err
	}

	if err := a.queries.InvalidateUnusedPasswordResetTokens(ctx, user.ID); err != nil {
		return user.ID, auditBizID, false, err
	}

	expiresAt := time.Now().UTC().Add(time.Duration(passwordResetTTLMinutes) * time.Minute)
	if _, err := a.queries.CreatePasswordResetToken(ctx, db.CreatePasswordResetTokenParams{
		UserID:      user.ID,
		Email:       targetEmail,
		CodeHash:    hashResetSecret(code, a.jwtSecret),
		TokenHash:   hashResetSecret(rawToken, a.jwtSecret),
		ExpiresAt:   pgtype.Timestamptz{Time: expiresAt, Valid: true},
		RequestedIp: strings.TrimSpace(requestedIP),
	}); err != nil {
		return user.ID, auditBizID, false, err
	}

	slug := strings.TrimSpace(companySlug)
	if slug == "" {
		slug = strings.TrimSpace(a.companySlug)
	}

	if sendErr := a.mailer.SendPasswordResetEmail(ctx, mailer.PasswordResetEmailInput{
		ToEmail:          targetEmail,
		FullName:         user.FullName,
		CompanySlug:      slug,
		Code:             code,
		ResetToken:       rawToken,
		ExpiresInMinutes: passwordResetTTLMinutes,
	}); sendErr != nil {
		_ = a.queries.InvalidateUnusedPasswordResetTokens(ctx, user.ID)
		return user.ID, auditBizID, false, sendErr
	}

	return user.ID, auditBizID, true, nil
}

// ResetPasswordWithVerification updates a user's password after verifying either their email verification OTP/token,
// current password, or an authorizing supervisor's email + 6-digit PIN within a shared business tenant.
func (a *AuthUsecase) ResetPasswordWithVerification(ctx context.Context, req ResetPasswordRequest) (uuid.UUID, *uuid.UUID, string, error) {
	targetEmail := strings.ToLower(strings.TrimSpace(req.Email))
	if targetEmail == "" || !strings.Contains(targetEmail, "@") {
		return uuid.Nil, nil, "", errors.New("valid account email is required")
	}
	if len(strings.TrimSpace(req.NewPassword)) < 8 {
		return uuid.Nil, nil, "", errors.New("new password must be at least 8 characters")
	}

	user, err := a.queries.GetUserByEmail(ctx, targetEmail)
	if err != nil {
		return uuid.Nil, nil, "", errors.New("verification failed: invalid account or credentials")
	}

	contexts, err := a.queries.GetUserBusinessContexts(ctx, user.ID)
	if err != nil {
		contexts = nil
	}
	var auditBizID *uuid.UUID
	if len(contexts) > 0 {
		id := contexts[0].BusinessID
		auditBizID = &id
	}

	mode := strings.ToLower(strings.TrimSpace(req.Mode))
	if mode == "" {
		mode = "current_password"
	}

	var matchedResetTokenID *uuid.UUID
	actorLabel := user.FullName
	switch mode {
	case "email_code", "email_token":
		rawToken := strings.TrimSpace(req.ResetToken)
		rawCode := strings.TrimSpace(req.EmailCode)
		if rawToken != "" {
			tokHash := hashResetSecret(rawToken, a.jwtSecret)
			rec, tErr := a.queries.GetActivePasswordResetTokenByTokenHash(ctx, tokHash)
			if tErr != nil || rec.UserID != user.ID || rec.Attempts >= passwordResetMaxGuesses {
				return uuid.Nil, auditBizID, "", errors.New("verification failed: invalid or expired email reset link")
			}
			idCopy := rec.ID
			matchedResetTokenID = &idCopy
			actorLabel = user.FullName + " (Email Link)"
		} else {
			if len(rawCode) != 6 {
				return uuid.Nil, auditBizID, "", errors.New("6-digit email verification code is required")
			}
			rec, cErr := a.queries.GetLatestActivePasswordResetTokenByEmail(ctx, db.GetLatestActivePasswordResetTokenByEmailParams{
				UserID: user.ID,
				Lower:  targetEmail,
			})
			if cErr != nil || rec.Attempts >= passwordResetMaxGuesses {
				return uuid.Nil, auditBizID, "", errors.New("verification failed: invalid or expired email verification code")
			}
			expectedHash := hashResetSecret(rawCode, a.jwtSecret)
			if !hmac.Equal([]byte(rec.CodeHash), []byte(expectedHash)) {
				updated, _ := a.queries.IncrementPasswordResetTokenAttempts(ctx, rec.ID)
				if updated.Attempts >= passwordResetMaxGuesses {
					return uuid.Nil, auditBizID, "", errors.New("too many incorrect email verification codes; please request a new reset email")
				}
				return uuid.Nil, auditBizID, "", errors.New("verification failed: incorrect email verification code")
			}
			idCopy := rec.ID
			matchedResetTokenID = &idCopy
			actorLabel = user.FullName + " (Email OTP)"
		}
	case "current_password":
		if strings.TrimSpace(req.CurrentPassword) == "" {
			return uuid.Nil, auditBizID, "", errors.New("current password is required")
		}
		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
			return uuid.Nil, auditBizID, "", errors.New("verification failed: current password is incorrect")
		}
	case "supervisor_pin":
		supEmail := strings.ToLower(strings.TrimSpace(req.SupervisorEmail))
		pin := strings.TrimSpace(req.SupervisorPIN)
		if supEmail == "" || len(pin) != 6 {
			return uuid.Nil, auditBizID, "", errors.New("authorizing manager email and 6-digit supervisor PIN are required")
		}
		supUser, supErr := a.queries.GetUserByEmail(ctx, supEmail)
		if supErr != nil {
			return uuid.Nil, auditBizID, "", errors.New("verification failed: invalid manager email or supervisor PIN")
		}
		verified := false
		for _, bizCtx := range contexts {
			sups, listErr := a.queries.ListSupervisorsForBusiness(ctx, bizCtx.BusinessID)
			if listErr != nil {
				continue
			}
			for _, sup := range sups {
				if sup.UserID == supUser.ID && bcrypt.CompareHashAndPassword([]byte(sup.SupervisorPinHash), []byte(pin)) == nil {
					verified = true
					bizIDCopy := bizCtx.BusinessID
					auditBizID = &bizIDCopy
					actorLabel = sup.FullName + " (" + sup.RoleCode + ")"
					break
				}
			}
			if verified {
				break
			}
		}
		if !verified {
			return uuid.Nil, auditBizID, "", errors.New("verification failed: invalid manager email or supervisor PIN")
		}
	default:
		return uuid.Nil, auditBizID, "", errors.New("unsupported password reset verification mode")
	}

	hashBytes, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return uuid.Nil, auditBizID, "", err
	}
	if err := a.queries.UpdateUserPasswordHash(ctx, db.UpdateUserPasswordHashParams{
		ID:           user.ID,
		PasswordHash: string(hashBytes),
	}); err != nil {
		return uuid.Nil, auditBizID, "", err
	}
	if matchedResetTokenID != nil {
		_ = a.queries.MarkPasswordResetTokenUsed(ctx, *matchedResetTokenID)
		_ = a.queries.InvalidateUnusedPasswordResetTokens(ctx, user.ID)
	}
	for _, bizCtx := range contexts {
		_, _ = a.RevokeAllUserSessions(ctx, bizCtx.BusinessID, user.ID, user.ID, "password_reset")
	}
	return user.ID, auditBizID, actorLabel, nil
}

// ChangePassword allows a signed-in user to rotate their own password using their current password.
func (a *AuthUsecase) ChangePassword(ctx context.Context, userID uuid.UUID, req ChangePasswordRequest) error {
	return a.ChangePasswordWithSession(ctx, uuid.Nil, userID, uuid.Nil, req)
}

// ChangePasswordWithSession updates the user's password and revokes all other active sessions.
func (a *AuthUsecase) ChangePasswordWithSession(ctx context.Context, businessID, userID, keepSessionID uuid.UUID, req ChangePasswordRequest) error {
	if strings.TrimSpace(req.CurrentPassword) == "" {
		return errors.New("current password is required")
	}
	if len(strings.TrimSpace(req.NewPassword)) < 8 {
		return errors.New("new password must be at least 8 characters")
	}
	user, err := a.queries.GetUserByIDForAuth(ctx, userID)
	if err != nil {
		return errors.New("active user account not found")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		return errors.New("current password is incorrect")
	}
	hashBytes, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if err := a.queries.UpdateUserPasswordHash(ctx, db.UpdateUserPasswordHashParams{
		ID:           user.ID,
		PasswordHash: string(hashBytes),
	}); err != nil {
		return err
	}
	if businessID != uuid.Nil {
		_, _ = a.RevokeOtherSessions(ctx, businessID, userID, keepSessionID, "password_changed")
	}
	return nil
}

// ParseJWT validates a bearer token and extracts TenantContext (explicitly rejecting PLATFORM_ADMIN tokens).
func (a *AuthUsecase) ParseJWT(tokenStr string) (domain.TenantContext, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &AuthJWTClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return a.jwtSecret, nil
	})
	if err != nil || !token.Valid {
		return domain.TenantContext{}, errors.New("invalid or expired token")
	}
	claims, ok := token.Claims.(*AuthJWTClaims)
	if !ok {
		return domain.TenantContext{}, errors.New("malformed token claims")
	}
	if claims.TokenScope == "PLATFORM_ADMIN" || (claims.TokenScope != "" && claims.TokenScope != "TENANT") {
		return domain.TenantContext{}, errors.New("token scope is not valid for company tenant portal")
	}
	if claims.RoleCode == "SuperAdmin" {
		return domain.TenantContext{}, errors.New("platform superadmin role is restricted to the Platform Admin Portal")
	}

	uid, err := uuid.Parse(claims.UserID)
	if err != nil {
		return domain.TenantContext{}, err
	}
	bizID, err := uuid.Parse(claims.BusinessID)
	if err != nil {
		return domain.TenantContext{}, err
	}
	sessionID, _ := uuid.Parse(strings.TrimSpace(claims.ID))
	var expPtr *time.Time
	if claims.ExpiresAt != nil {
		t := claims.ExpiresAt.Time
		expPtr = &t
	}
	brID, _ := uuid.Parse(claims.BranchID)
	termID, _ := uuid.Parse(claims.TerminalID)
	maxDisc := decimal.NewFromInt(100)
	if claims.MaxPOSDiscountPct != "" {
		if parsed, pErr := decimal.NewFromString(claims.MaxPOSDiscountPct); pErr == nil {
			maxDisc = parsed
		}
	}

	tradeName := claims.TradeName
	if tradeName == "" {
		tradeName = claims.BusinessName
	}
	primaryHex := claims.PrimaryColorHex
	if primaryHex == "" {
		primaryHex = "#877FC1"
	}
	defaultLang := claims.DefaultLanguage
	if defaultLang == "" {
		defaultLang = "en"
	}
	industryProfile := strings.TrimSpace(claims.IndustryProfile)
	if industryProfile == "" {
		industryProfile = "retail"
	}

	return domain.TenantContext{
		TokenScope:        "TENANT",
		SessionID:         sessionID,
		SessionExpiresAt:  expPtr,
		CompanySlug:       claims.CompanySlug,
		DBName:            claims.DBName,
		UserID:            uid,
		Email:             claims.Email,
		FullName:          claims.FullName,
		AvatarURL:         claims.AvatarURL,
		BusinessID:        bizID,
		BusinessName:      claims.BusinessName,
		TradeName:         tradeName,
		BaseCurrency:      claims.BaseCurrency,
		PrimaryColorHex:   primaryHex,
		DefaultLanguage:   defaultLang,
		IndustryProfile:   industryProfile,
		BranchID:          brID,
		TerminalID:        termID,
		RoleCode:          claims.RoleCode,
		RoleName:          claims.RoleName,
		DesignationName:   claims.DesignationName,
		MaxPOSDiscountPct: maxDisc,
		Permissions:       filterMultiBranchPermissions(claims.RoleCode, claims.Permissions),
	}, nil
}

// GetPublicBranding resolves white-label branding metadata for pre-authentication screens.
func (a *AuthUsecase) GetPublicBranding(ctx context.Context, businessID *uuid.UUID) (db.GetPublicBrandingDefaultRow, error) {
	if businessID != nil && *businessID != uuid.Nil {
		row, err := a.queries.GetPublicBrandingByID(ctx, *businessID)
		if err == nil {
			return db.GetPublicBrandingDefaultRow(row), nil
		}
	}
	return a.queries.GetPublicBrandingDefault(ctx)
}

// ParseOverrideToken validates an X-Supervisor-Override-Token for the active tenant and action.
func (a *AuthUsecase) ParseOverrideToken(tokenStr string, expectedBusinessID uuid.UUID, requiredAction string) (*domain.SupervisorClaim, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &OverrideJWTClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return a.pinTokenSecret, nil
	})
	if err != nil || !token.Valid {
		return nil, errors.New("invalid or expired supervisor override token")
	}
	claims, ok := token.Claims.(*OverrideJWTClaims)
	if !ok {
		return nil, errors.New("malformed override claims")
	}
	bizID, err := uuid.Parse(claims.BusinessID)
	if err != nil || bizID != expectedBusinessID {
		return nil, errors.New("supervisor override token tenant mismatch")
	}
	if claims.Action != "" && requiredAction != "" && claims.Action != requiredAction {
		return nil, errors.New("supervisor override token action mismatch")
	}
	supID, _ := uuid.Parse(claims.SupervisorID)
	return &domain.SupervisorClaim{
		SupervisorID:   supID,
		SupervisorName: claims.SupervisorName,
		BusinessID:     bizID,
		Action:         claims.Action,
		Reason:         claims.Reason,
	}, nil
}

// CacheUserPermissions stores the permission slice in Redis under rbac:biz:{id}:user:{id}.
func (a *AuthUsecase) CacheUserPermissions(ctx context.Context, businessID, userID uuid.UUID, perms []string) {
	if a.redis == nil {
		return
	}
	key := fmt.Sprintf("rbac:biz:%s:user:%s", businessID.String(), userID.String())
	if raw, err := json.Marshal(perms); err == nil {
		_ = a.redis.Set(ctx, key, raw, 15*time.Minute).Err()
	}
}

// GetEffectivePermissions returns cached permissions from Redis or falls back to JWT/DB.
func (a *AuthUsecase) GetEffectivePermissions(ctx context.Context, tc domain.TenantContext) []string {
	if a.redis != nil {
		key := fmt.Sprintf("rbac:biz:%s:user:%s", tc.BusinessID.String(), tc.UserID.String())
		if val, err := a.redis.Get(ctx, key).Result(); err == nil && val != "" {
			var cached []string
			if jsonErr := json.Unmarshal([]byte(val), &cached); jsonErr == nil {
				return filterMultiBranchPermissions(tc.RoleCode, cached)
			}
		}
	}
	return filterMultiBranchPermissions(tc.RoleCode, tc.Permissions)
}

// ListRoleMatrix returns all system roles and their permissions for the RBAC settings screen.
func (a *AuthUsecase) ListRoleMatrix(ctx context.Context) ([]RoleMatrixEntry, error) {
	rows, err := a.queries.ListRolesWithPermissions(ctx)
	if err != nil {
		return nil, err
	}
	return buildRoleMatrix(rows), nil
}

// ListRoleMatrixForBusiness returns system roles plus custom roles scoped to the active tenant business.
func (a *AuthUsecase) ListRoleMatrixForBusiness(ctx context.Context, businessID uuid.UUID) ([]RoleMatrixEntry, error) {
	rows, err := a.queries.ListRolesWithPermissionsForBusiness(ctx, uuid.NullUUID{UUID: businessID, Valid: businessID != uuid.Nil})
	if err != nil {
		return nil, err
	}
	return buildRoleMatrixFromBiz(rows), nil
}

func buildRoleMatrix(rows []db.ListRolesWithPermissionsRow) []RoleMatrixEntry {
	order := make([]uuid.UUID, 0)
	byRole := make(map[uuid.UUID]*RoleMatrixEntry)
	for _, r := range rows {
		if r.RoleCode == "SuperAdmin" {
			continue
		}
		entry, ok := byRole[r.RoleID]
		if !ok {
			var bizPtr *uuid.UUID
			if r.BusinessID.Valid {
				b := r.BusinessID.UUID
				bizPtr = &b
			}
			entry = &RoleMatrixEntry{
				RoleID:      r.RoleID,
				BusinessID:  bizPtr,
				RoleCode:    r.RoleCode,
				RoleName:    r.RoleName,
				Description: r.RoleDescription,
				IsSystem:    r.IsSystem,
				Permissions: []string{},
			}
			byRole[r.RoleID] = entry
			order = append(order, r.RoleID)
		}
		if r.PermissionCode.Valid && r.PermissionCode.String != "platform:admin" {
			entry.Permissions = append(entry.Permissions, r.PermissionCode.String)
		}
	}
	out := make([]RoleMatrixEntry, 0, len(order))
	for _, id := range order {
		out = append(out, *byRole[id])
	}
	return out
}

func buildRoleMatrixFromBiz(rows []db.ListRolesWithPermissionsForBusinessRow) []RoleMatrixEntry {
	order := make([]uuid.UUID, 0)
	byRole := make(map[uuid.UUID]*RoleMatrixEntry)
	for _, r := range rows {
		if r.RoleCode == "SuperAdmin" {
			continue
		}
		entry, ok := byRole[r.RoleID]
		if !ok {
			var bizPtr *uuid.UUID
			if r.BusinessID.Valid {
				b := r.BusinessID.UUID
				bizPtr = &b
			}
			entry = &RoleMatrixEntry{
				RoleID:      r.RoleID,
				BusinessID:  bizPtr,
				RoleCode:    r.RoleCode,
				RoleName:    r.RoleName,
				Description: r.RoleDescription,
				IsSystem:    r.IsSystem,
				Permissions: []string{},
			}
			byRole[r.RoleID] = entry
			order = append(order, r.RoleID)
		}
		if r.PermissionCode.Valid && r.PermissionCode.String != "platform:admin" {
			entry.Permissions = append(entry.Permissions, r.PermissionCode.String)
		}
	}
	out := make([]RoleMatrixEntry, 0, len(order))
	for _, id := range order {
		out = append(out, *byRole[id])
	}
	return out
}

// --- Platform Control Plane Authentication & SuperAdmin Management (Master DB Only) ---

type cachedAdminSession struct {
	SessionID         uuid.UUID `json:"session_id"`
	AdminID           uuid.UUID `json:"admin_id"`
	ExpiresAtUnix     int64     `json:"expires_at_unix"`
	IdleExpiresAtUnix int64     `json:"idle_expires_at_unix"`
	IdleMinutes       int       `json:"idle_minutes"`
	LastTouchUnix     int64     `json:"last_touch_unix"`
}

func (a *AuthUsecase) cacheAdminSession(ctx context.Context, sessionID, adminID uuid.UUID, expiresAt, idleExpiresAt time.Time, idleMinutes int) {
	if a == nil || a.redis == nil || sessionID == uuid.Nil {
		return
	}
	now := time.Now()
	ttl := expiresAt.Sub(now)
	if ttl <= 0 {
		return
	}
	entry := cachedAdminSession{
		SessionID:         sessionID,
		AdminID:           adminID,
		ExpiresAtUnix:     expiresAt.Unix(),
		IdleExpiresAtUnix: idleExpiresAt.Unix(),
		IdleMinutes:       idleMinutes,
		LastTouchUnix:     now.Unix(),
	}
	if raw, err := json.Marshal(entry); err == nil {
		_ = a.redis.Set(ctx, adminSessionRedisKey(sessionID), raw, ttl).Err()
	}
}

func (a *AuthUsecase) evictAdminSessionCache(ctx context.Context, sessionID uuid.UUID) {
	if a == nil || a.redis == nil || sessionID == uuid.Nil {
		return
	}
	_ = a.redis.Del(ctx, adminSessionRedisKey(sessionID)).Err()
}

func (a *AuthUsecase) issuePlatformAdminJWTWithMeta(
	ctx context.Context,
	adminID uuid.UUID,
	email, fullName, title string,
	existingSessionID uuid.UUID,
	meta domain.SessionClientMeta,
) (*PlatformAdminLoginResponse, error) {
	now := time.Now()
	const adminIdleMins = 240
	expiresAt := now.Add(12 * time.Hour)
	idleExpiresAt := now.Add(adminIdleMins * time.Minute)
	deviceLabel := strings.TrimSpace(meta.DeviceLabel)
	if deviceLabel == "" {
		deviceLabel = SummarizeDeviceLabel(meta.UserAgent)
	}

	sessionID := existingSessionID
	reused := false
	if a.queries != nil {
		if sessionID != uuid.Nil {
			if row, gErr := a.queries.GetPlatformAdminSessionByID(ctx, sessionID); gErr == nil && !row.RevokedAt.Valid && row.AdminID == adminID {
				if rErr := a.queries.RefreshPlatformAdminSessionExpiry(ctx, db.RefreshPlatformAdminSessionExpiryParams{
					ID:            sessionID,
					IdleExpiresAt: pgtype.Timestamptz{Time: idleExpiresAt, Valid: true},
					ExpiresAt:     pgtype.Timestamptz{Time: expiresAt, Valid: true},
				}); rErr == nil {
					reused = true
				}
			}
		}
		if !reused {
			sessionID = uuid.New()
			if _, crErr := a.queries.CreatePlatformAdminSession(ctx, db.CreatePlatformAdminSessionParams{
				ID:            sessionID,
				AdminID:       adminID,
				IpAddress:     strings.TrimSpace(meta.IPAddress),
				UserAgent:     strings.TrimSpace(meta.UserAgent),
				DeviceLabel:   deviceLabel,
				IdleExpiresAt: pgtype.Timestamptz{Time: idleExpiresAt, Valid: true},
				ExpiresAt:     pgtype.Timestamptz{Time: expiresAt, Valid: true},
			}); crErr != nil {
				return nil, crErr
			}
		}
	} else if sessionID == uuid.Nil {
		sessionID = uuid.New()
	}

	a.cacheAdminSession(ctx, sessionID, adminID, expiresAt, idleExpiresAt, adminIdleMins)

	claims := PlatformAdminJWTClaims{
		TokenScope: "PLATFORM_ADMIN",
		AdminID:    adminID.String(),
		Email:      email,
		FullName:   fullName,
		Title:      title,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        sessionID.String(),
			Subject:   adminID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}
	tokenStr, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(a.jwtSecret)
	if err != nil {
		return nil, err
	}
	return &PlatformAdminLoginResponse{
		Token: tokenStr,
		Admin: domain.PlatformAdminContext{
			TokenScope:           "PLATFORM_ADMIN",
			SessionID:            sessionID,
			SessionExpiresAt:     &expiresAt,
			SessionIdleExpiresAt: &idleExpiresAt,
			AdminID:              adminID,
			Email:                email,
			FullName:             fullName,
			Title:                title,
		},
	}, nil
}

// GetPlatformSetupStatus reports whether the Platform Control Plane requires first-time SuperAdmin setup.
func (a *AuthUsecase) GetPlatformSetupStatus(ctx context.Context) (map[string]any, error) {
	count, err := a.queries.CountPlatformAdmins(ctx)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"admin_count":     count,
		"needs_bootstrap": count == 0,
	}, nil
}

// BootstrapFirstPlatformAdmin creates the initial Platform SuperAdmin only when zero admins exist.
func (a *AuthUsecase) BootstrapFirstPlatformAdmin(ctx context.Context, req PlatformAdminSaveRequest) (*PlatformAdminLoginResponse, error) {
	return a.BootstrapFirstPlatformAdminWithMeta(ctx, req, domain.SessionClientMeta{})
}

// BootstrapFirstPlatformAdminWithMeta initializes the root Platform SuperAdmin with client session metadata.
func (a *AuthUsecase) BootstrapFirstPlatformAdminWithMeta(ctx context.Context, req PlatformAdminSaveRequest, meta domain.SessionClientMeta) (*PlatformAdminLoginResponse, error) {
	count, err := a.queries.CountPlatformAdmins(ctx)
	if err != nil {
		return nil, err
	}
	if count > 0 {
		return nil, errors.New("platform already initialized; sign in as an existing Platform SuperAdmin to add more admins")
	}
	created, err := a.CreatePlatformAdmin(ctx, req)
	if err != nil {
		return nil, err
	}
	return a.issuePlatformAdminJWTWithMeta(ctx, created.ID, created.Email, created.FullName, created.Title, uuid.Nil, meta)
}

// PlatformAdminLogin authenticates exclusively against platform_admins in the Master Control Plane DB.
func (a *AuthUsecase) PlatformAdminLogin(ctx context.Context, req PlatformAdminLoginRequest) (*PlatformAdminLoginResponse, error) {
	return a.PlatformAdminLoginWithMeta(ctx, req, domain.SessionClientMeta{})
}

// PlatformAdminLoginWithMeta authenticates a Platform SuperAdmin and records a Master Control Plane session.
func (a *AuthUsecase) PlatformAdminLoginWithMeta(ctx context.Context, req PlatformAdminLoginRequest, meta domain.SessionClientMeta) (*PlatformAdminLoginResponse, error) {
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || strings.TrimSpace(req.Password) == "" {
		return nil, errors.New("platform email and password are required")
	}
	admin, err := a.queries.GetPlatformAdminByEmail(ctx, email)
	if err != nil {
		return nil, errors.New("invalid platform admin credentials")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(admin.PasswordHash), []byte(req.Password)); err != nil {
		return nil, errors.New("invalid platform admin credentials")
	}
	return a.issuePlatformAdminJWTWithMeta(ctx, admin.ID, admin.Email, admin.FullName, admin.Title, uuid.Nil, meta)
}

// ParsePlatformAdminJWT validates a bearer token and guarantees TokenScope == "PLATFORM_ADMIN".
func (a *AuthUsecase) ParsePlatformAdminJWT(tokenStr string) (domain.PlatformAdminContext, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &PlatformAdminJWTClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return a.jwtSecret, nil
	})
	if err != nil || !token.Valid {
		return domain.PlatformAdminContext{}, errors.New("invalid or expired platform admin token")
	}
	claims, ok := token.Claims.(*PlatformAdminJWTClaims)
	if !ok || claims.TokenScope != "PLATFORM_ADMIN" {
		return domain.PlatformAdminContext{}, errors.New("company tenant token cannot access platform admin portal")
	}
	adminID, err := uuid.Parse(claims.AdminID)
	if err != nil || adminID == uuid.Nil {
		return domain.PlatformAdminContext{}, errors.New("malformed platform admin token claims")
	}
	sessionID, _ := uuid.Parse(strings.TrimSpace(claims.ID))
	var expPtr *time.Time
	if claims.ExpiresAt != nil {
		t := claims.ExpiresAt.Time
		expPtr = &t
	}
	return domain.PlatformAdminContext{
		TokenScope:       "PLATFORM_ADMIN",
		SessionID:        sessionID,
		SessionExpiresAt: expPtr,
		AdminID:          adminID,
		Email:            claims.Email,
		FullName:         claims.FullName,
		Title:            claims.Title,
	}, nil
}

// ValidatePlatformAdminSession verifies that the Master Control Plane session has not expired or been revoked.
func (a *AuthUsecase) ValidatePlatformAdminSession(ctx context.Context, adminCtx domain.PlatformAdminContext) error {
	if a == nil || (a.queries == nil && a.redis == nil) {
		return nil
	}
	if adminCtx.SessionID == uuid.Nil {
		return errors.New("missing platform admin session identifier; please sign in again")
	}

	now := time.Now()
	nowUnix := now.Unix()
	if a.redis != nil {
		if raw, err := a.redis.Get(ctx, adminSessionRedisKey(adminCtx.SessionID)).Result(); err == nil && raw != "" {
			var entry cachedAdminSession
			if jErr := json.Unmarshal([]byte(raw), &entry); jErr == nil {
				if entry.AdminID != adminCtx.AdminID {
					return errors.New("platform session owner mismatch")
				}
				if nowUnix > entry.ExpiresAtUnix {
					a.evictAdminSessionCache(ctx, adminCtx.SessionID)
					return errors.New("platform admin session expired")
				}
				if nowUnix > entry.IdleExpiresAtUnix {
					if a.queries != nil {
						_, _ = a.queries.RevokePlatformAdminSession(ctx, db.RevokePlatformAdminSessionParams{
							ID:            adminCtx.SessionID,
							RevokedReason: "idle_timeout",
						})
					}
					a.evictAdminSessionCache(ctx, adminCtx.SessionID)
					return errors.New("platform admin session timed out due to inactivity")
				}
				if nowUnix-entry.LastTouchUnix >= 60 {
					idleMins := entry.IdleMinutes
					if idleMins <= 0 {
						idleMins = 240
					}
					nextIdle := now.Add(time.Duration(idleMins) * time.Minute)
					exp := time.Unix(entry.ExpiresAtUnix, 0)
					if nextIdle.After(exp) {
						nextIdle = exp
					}
					a.cacheAdminSession(ctx, adminCtx.SessionID, adminCtx.AdminID, exp, nextIdle, idleMins)
					if a.queries != nil {
						_ = a.queries.TouchPlatformAdminSession(ctx, db.TouchPlatformAdminSessionParams{
							ID:            adminCtx.SessionID,
							IdleExpiresAt: pgtype.Timestamptz{Time: nextIdle, Valid: true},
						})
					}
				}
				return nil
			}
		}
	}

	if a.queries == nil {
		return errors.New("platform admin session expired or terminated")
	}
	row, err := a.queries.GetPlatformAdminSessionByID(ctx, adminCtx.SessionID)
	if err != nil {
		return errors.New("platform admin session not found or terminated")
	}
	if row.AdminID != adminCtx.AdminID {
		return errors.New("platform admin session mismatch")
	}
	if row.RevokedAt.Valid {
		return errors.New("platform admin session has been revoked")
	}
	if now.After(row.ExpiresAt.Time) {
		return errors.New("platform admin session expired")
	}
	if now.After(row.IdleExpiresAt.Time) {
		_, _ = a.queries.RevokePlatformAdminSession(ctx, db.RevokePlatformAdminSessionParams{
			ID:            adminCtx.SessionID,
			RevokedReason: "idle_timeout",
		})
		return errors.New("platform admin session timed out due to inactivity")
	}

	nextIdle := now.Add(240 * time.Minute)
	if nextIdle.After(row.ExpiresAt.Time) {
		nextIdle = row.ExpiresAt.Time
	}
	_ = a.queries.TouchPlatformAdminSession(ctx, db.TouchPlatformAdminSessionParams{
		ID:            adminCtx.SessionID,
		IdleExpiresAt: pgtype.Timestamptz{Time: nextIdle, Valid: true},
	})
	a.cacheAdminSession(ctx, adminCtx.SessionID, adminCtx.AdminID, row.ExpiresAt.Time, nextIdle, 240)
	return nil
}

// RefreshPlatformAdminSession extends an active Platform SuperAdmin session and re-signs its JWT.
func (a *AuthUsecase) RefreshPlatformAdminSession(ctx context.Context, adminCtx domain.PlatformAdminContext, meta domain.SessionClientMeta) (*PlatformAdminLoginResponse, error) {
	if err := a.ValidatePlatformAdminSession(ctx, adminCtx); err != nil {
		return nil, err
	}
	return a.issuePlatformAdminJWTWithMeta(ctx, adminCtx.AdminID, adminCtx.Email, adminCtx.FullName, adminCtx.Title, adminCtx.SessionID, meta)
}

// LogoutPlatformAdminSession revokes the current Platform SuperAdmin session cleanly.
func (a *AuthUsecase) LogoutPlatformAdminSession(ctx context.Context, sessionID uuid.UUID) error {
	if sessionID == uuid.Nil {
		return nil
	}
	if a.queries != nil {
		_, _ = a.queries.RevokePlatformAdminSession(ctx, db.RevokePlatformAdminSessionParams{
			ID:            sessionID,
			RevokedReason: "admin_logout",
		})
	}
	a.evictAdminSessionCache(ctx, sessionID)
	return nil
}

// ListPlatformAdminSessions lists active Master Control Plane SuperAdmin sessions.
func (a *AuthUsecase) ListPlatformAdminSessions(ctx context.Context, currentSessionID uuid.UUID, limit int32) ([]domain.PlatformAdminSessionSummary, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := a.queries.ListPlatformAdminSessions(ctx, limit)
	if err != nil {
		return nil, err
	}
	out := make([]domain.PlatformAdminSessionSummary, 0, len(rows))
	for _, r := range rows {
		out = append(out, domain.PlatformAdminSessionSummary{
			ID:            r.ID,
			AdminID:       r.AdminID,
			AdminEmail:    r.AdminEmail,
			AdminName:     r.AdminName,
			AdminTitle:    r.AdminTitle,
			IPAddress:     r.IpAddress,
			DeviceLabel:   r.DeviceLabel,
			CreatedAt:     r.CreatedAt.Time,
			LastSeenAt:    r.LastSeenAt.Time,
			IdleExpiresAt: r.IdleExpiresAt.Time,
			ExpiresAt:     r.ExpiresAt.Time,
			IsCurrent:     r.ID == currentSessionID,
		})
	}
	return out, nil
}

// RevokePlatformAdminSession terminates a specific Master Control Plane SuperAdmin session.
func (a *AuthUsecase) RevokePlatformAdminSession(ctx context.Context, targetSessionID uuid.UUID, reason string) error {
	if reason == "" {
		reason = "admin_manual_revoke"
	}
	if _, err := a.queries.RevokePlatformAdminSession(ctx, db.RevokePlatformAdminSessionParams{
		ID:            targetSessionID,
		RevokedReason: reason,
	}); err != nil {
		return errors.New("platform admin session not found or already closed")
	}
	a.evictAdminSessionCache(ctx, targetSessionID)
	return nil
}

// RevokeOtherPlatformAdminSessions revokes all other active Master sessions belonging to adminID.
func (a *AuthUsecase) RevokeOtherPlatformAdminSessions(ctx context.Context, adminID, keepSessionID uuid.UUID) (int, error) {
	revoked, err := a.queries.RevokeOtherPlatformAdminSessions(ctx, db.RevokeOtherPlatformAdminSessionsParams{
		AdminID:       adminID,
		ID:            keepSessionID,
		RevokedReason: "admin_revoke_others",
	})
	if err != nil {
		return 0, err
	}
	for _, r := range revoked {
		a.evictAdminSessionCache(ctx, r.ID)
	}
	return len(revoked), nil
}

// ListPlatformAdmins lists all Platform SuperAdmin accounts stored in Master Control Plane.
func (a *AuthUsecase) ListPlatformAdmins(ctx context.Context) ([]db.ListPlatformAdminsRow, error) {
	return a.queries.ListPlatformAdmins(ctx)
}

// CreatePlatformAdmin provisions a new Platform SuperAdmin user in the Master Control Plane DB.
func (a *AuthUsecase) CreatePlatformAdmin(ctx context.Context, req PlatformAdminSaveRequest) (db.CreatePlatformAdminRow, error) {
	email := strings.ToLower(strings.TrimSpace(req.Email))
	fullName := strings.TrimSpace(req.FullName)
	password := strings.TrimSpace(req.Password)
	title := strings.TrimSpace(req.Title)
	if email == "" || !strings.Contains(email, "@") {
		return db.CreatePlatformAdminRow{}, errors.New("valid platform admin email is required")
	}
	if fullName == "" {
		return db.CreatePlatformAdminRow{}, errors.New("full name is required")
	}
	if len(password) < 8 {
		return db.CreatePlatformAdminRow{}, errors.New("password must be at least 8 characters")
	}
	if title == "" {
		title = "Platform SuperAdmin"
	}
	hashBytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return db.CreatePlatformAdminRow{}, err
	}
	return a.queries.CreatePlatformAdmin(ctx, db.CreatePlatformAdminParams{
		Email:        email,
		FullName:     fullName,
		PasswordHash: string(hashBytes),
		Title:        title,
	})
}

// UpdatePlatformAdmin updates a Platform SuperAdmin's display details or active status.
func (a *AuthUsecase) UpdatePlatformAdmin(ctx context.Context, id uuid.UUID, actorID uuid.UUID, fullName, title string, isActive bool) (db.UpdatePlatformAdminRow, error) {
	if id == actorID && !isActive {
		return db.UpdatePlatformAdminRow{}, errors.New("you cannot deactivate your own active platform admin account")
	}
	updated, err := a.queries.UpdatePlatformAdmin(ctx, db.UpdatePlatformAdminParams{
		ID:       id,
		Column2:  strings.TrimSpace(fullName),
		Column3:  strings.TrimSpace(title),
		IsActive: isActive,
	})
	if err == nil && !isActive && a.queries != nil {
		if revoked, revErr := a.queries.RevokeAllPlatformAdminSessions(ctx, db.RevokeAllPlatformAdminSessionsParams{
			AdminID:       id,
			RevokedReason: "admin_deactivated",
		}); revErr == nil {
			for _, r := range revoked {
				a.evictAdminSessionCache(ctx, r.ID)
			}
		}
	}
	return updated, err
}

// ListPublicCompanies lists registered active company portals for 1-to-1 login resolution.
func (a *AuthUsecase) ListPublicCompanies(ctx context.Context) ([]db.ListPublicPlatformCompaniesRow, error) {
	return a.queries.ListPublicPlatformCompanies(ctx)
}

