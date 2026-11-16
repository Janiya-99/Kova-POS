package domain

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// TenantContext represents the verified JWT identity and active tenant/branch/terminal scope.
type TenantContext struct {
	TokenScope           string          `json:"token_scope"` // "TENANT"
	SessionID            uuid.UUID       `json:"session_id,omitempty"`
	SessionExpiresAt     *time.Time      `json:"session_expires_at,omitempty"`
	SessionIdleExpiresAt *time.Time      `json:"session_idle_expires_at,omitempty"`
	CompanySlug          string          `json:"company_slug"`
	DBName               string          `json:"db_name,omitempty"`
	UserID               uuid.UUID       `json:"user_id"`
	Email                string          `json:"email"`
	FullName             string          `json:"full_name"`
	AvatarURL            string          `json:"avatar_url"`
	BusinessID           uuid.UUID       `json:"business_id"`
	BusinessName         string          `json:"business_name"`
	TradeName            string          `json:"trade_name"`
	BaseCurrency         string          `json:"base_currency"`
	TaxRegistrationNo    string          `json:"tax_registration_no"`
	LogoLightURL         string          `json:"logo_light_url"`
	LogoDarkURL          string          `json:"logo_dark_url"`
	LogoReceiptURL       string          `json:"logo_receipt_url"`
	LogoSidebarURL       string          `json:"logo_sidebar_url"`
	PrimaryColorHex      string          `json:"primary_color_hex"`
	DefaultLanguage      string          `json:"default_language"`
	IndustryProfile      string          `json:"industry_profile"`
	BranchID             uuid.UUID       `json:"branch_id"`
	TerminalID           uuid.UUID       `json:"terminal_id"`
	RoleCode             string          `json:"role_code"`
	RoleName             string          `json:"role_name"`
	DesignationName      string          `json:"designation_name"`
	MaxPOSDiscountPct    decimal.Decimal `json:"max_pos_discount_pct"`
	Permissions          []string        `json:"permissions"`
}

// PlatformAdminContext represents a verified Platform Control-Plane JWT identity.
type PlatformAdminContext struct {
	TokenScope           string     `json:"token_scope"` // "PLATFORM_ADMIN"
	SessionID            uuid.UUID  `json:"session_id,omitempty"`
	SessionExpiresAt     *time.Time `json:"session_expires_at,omitempty"`
	SessionIdleExpiresAt *time.Time `json:"session_idle_expires_at,omitempty"`
	AdminID              uuid.UUID  `json:"admin_id"`
	Email                string     `json:"email"`
	FullName             string     `json:"full_name"`
	Title                string     `json:"title"`
}

// SessionClientMeta captures client network and device descriptors attached to server sessions.
type SessionClientMeta struct {
	IPAddress   string `json:"ip_address"`
	UserAgent   string `json:"user_agent"`
	DeviceLabel string `json:"device_label"`
}

// SessionPolicy captures effective 6-level resolved session & rate-limit limits.
type SessionPolicy struct {
	TTLHours           int  `json:"ttl_hours"`
	IdleTimeoutMinutes int  `json:"idle_timeout_minutes"`
	MaxConcurrent      int  `json:"max_concurrent"`
	RateLimitEnabled   bool `json:"rate_limit_enabled"`
	APIRPM             int  `json:"api_rpm"`
	LoginMaxAttempts   int  `json:"login_max_attempts"`
	PINMaxAttempts     int  `json:"pin_max_attempts"`
}

// UserSessionSummary describes a live tenant user session returned to security/profile UI.
type UserSessionSummary struct {
	ID            uuid.UUID  `json:"id"`
	BusinessID    uuid.UUID  `json:"business_id"`
	UserID        uuid.UUID  `json:"user_id"`
	UserName      string     `json:"user_name"`
	UserEmail     string     `json:"user_email"`
	BranchID      *uuid.UUID `json:"branch_id,omitempty"`
	BranchName    string     `json:"branch_name"`
	TerminalID    *uuid.UUID `json:"terminal_id,omitempty"`
	TerminalName  string     `json:"terminal_name"`
	RoleCode      string     `json:"role_code"`
	IPAddress     string     `json:"ip_address"`
	DeviceLabel   string     `json:"device_label"`
	CreatedAt     time.Time  `json:"created_at"`
	LastSeenAt    time.Time  `json:"last_seen_at"`
	IdleExpiresAt time.Time  `json:"idle_expires_at"`
	ExpiresAt     time.Time  `json:"expires_at"`
	IsCurrent     bool       `json:"is_current"`
}

// PlatformAdminSessionSummary describes an active Master Control Plane session.
type PlatformAdminSessionSummary struct {
	ID            uuid.UUID `json:"id"`
	AdminID       uuid.UUID `json:"admin_id"`
	AdminEmail    string    `json:"admin_email"`
	AdminName     string    `json:"admin_name"`
	AdminTitle    string    `json:"admin_title"`
	IPAddress     string    `json:"ip_address"`
	DeviceLabel   string    `json:"device_label"`
	CreatedAt     time.Time `json:"created_at"`
	LastSeenAt    time.Time `json:"last_seen_at"`
	IdleExpiresAt time.Time `json:"idle_expires_at"`
	ExpiresAt     time.Time `json:"expires_at"`
	IsCurrent     bool      `json:"is_current"`
}

// SupervisorClaim represents a validated short-lived supervisor override token.
type SupervisorClaim struct {
	SupervisorID   uuid.UUID `json:"supervisor_id"`
	SupervisorName string    `json:"supervisor_name"`
	BusinessID     uuid.UUID `json:"business_id"`
	Action         string    `json:"action"`
	Reason         string    `json:"reason"`
}

// TaxRuleSpec describes a single tax rule fed to the multi-tier tax engine.
type TaxRuleSpec struct {
	RuleID      uuid.UUID
	Code        string
	Name        string
	TaxType     string // EXCLUSIVE | INCLUSIVE | COMPOUND
	RatePercent decimal.Decimal
	Priority    int
}

// TaxLineResult is the computed tax output for one rule.
type TaxLineResult struct {
	RuleID      uuid.UUID       `json:"tax_rule_id"`
	Code        string          `json:"code"`
	Name        string          `json:"name"`
	TaxType     string          `json:"tax_type"`
	RatePercent decimal.Decimal `json:"rate_percent"`
	TaxableBase decimal.Decimal `json:"taxable_base"`
	TaxAmount   decimal.Decimal `json:"tax_amount"`
}

// TaxCalculationResult summarizes net, total tax, gross, and breakdown lines.
type TaxCalculationResult struct {
	NetAmount   decimal.Decimal `json:"net_amount"`
	TotalTax    decimal.Decimal `json:"total_tax"`
	GrossAmount decimal.Decimal `json:"gross_amount"`
	Lines       []TaxLineResult `json:"lines"`
}

// SettingScopeOrder defines the 6-level inheritance priority from lowest to highest precedence.
var SettingScopeOrder = []string{
	"SYSTEM",
	"BUSINESS",
	"BRANCH",
	"TERMINAL",
	"CATEGORY",
	"PRODUCT",
}

// ResolvedSetting captures the effective setting value and which scope supplied it.
type ResolvedSetting struct {
	Key           string `json:"key"`
	Label         string `json:"label"`
	Category      string `json:"category"`
	Description   string `json:"description"`
	ValueType     string `json:"value_type"`
	EffectiveJSON string `json:"effective_json"`
	InheritedFrom string `json:"inherited_from"`
	ScopeTargetID string `json:"scope_target_id,omitempty"`
	IsOverridden  bool   `json:"is_overridden"`
}

