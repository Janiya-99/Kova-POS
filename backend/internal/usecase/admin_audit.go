package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/enterprise-pos/backend/internal/domain"
	"github.com/enterprise-pos/backend/internal/infrastructure/ws"
	"github.com/enterprise-pos/backend/internal/repository/sqlc/db"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

// CompanyProvisioner decouples usecase company orchestration from concrete DB-per-tenant connection pool management.
type CompanyProvisioner interface {
	ProvisionTenantDatabase(ctx context.Context, dbName string) (*pgxpool.Pool, *db.Queries, *SettingsResolver, error)
	RegisterAndCacheTenant(ctx context.Context, businessID uuid.UUID, slug, dbName string, pool *pgxpool.Pool) error
	SyncTenantCompanyProfile(ctx context.Context, businessID uuid.UUID, slug, dbName string, req UpdateCompanyAdminRequest) error
	DropTenantDatabase(ctx context.Context, dbName string) error
	FetchTenantStats(ctx context.Context, businessID uuid.UUID, dbName string) (branchCount, terminalCount, userCount, invoiceCount int64)
}

// CreateCompanyRequest defines the Platform SuperAdmin payload for provisioning a new company in its own dedicated DB.
type CreateCompanyRequest struct {
	Slug              string `json:"slug"`
	Name              string `json:"name"`
	TradeName         string `json:"trade_name"`
	LegalName         string `json:"legal_name"`
	IndustryProfile   string `json:"industry_profile"`
	BaseCurrency      string `json:"base_currency"`
	DefaultLanguage   string `json:"default_language"`
	TaxRegistrationNo string `json:"tax_registration_no"`
	PrimaryColorHex   string `json:"primary_color_hex"`
	ApplySLTax        bool   `json:"apply_sl_tax"`

	BranchName  string `json:"branch_name"`
	BranchCode  string `json:"branch_code"`
	CountryCode string `json:"country_code"`
	CountryName string `json:"country_name"`
	City        string `json:"city"`
	Address     string `json:"address"`

	OwnerFullName string `json:"owner_full_name"`
	OwnerEmail    string `json:"owner_email"`
	OwnerPassword string `json:"owner_password"`
	SupervisorPIN string `json:"supervisor_pin"`
}

// UpdateCompanyAdminRequest defines editable platform-level company attributes.
type UpdateCompanyAdminRequest struct {
	Name            string `json:"name"`
	TradeName       string `json:"trade_name"`
	BaseCurrency    string `json:"base_currency"`
	IndustryProfile string `json:"industry_profile"`
	IsActive        *bool  `json:"is_active"`
}

// AdminCompanySummary combines Master registry metadata with live statistics from the company's dedicated DB.
type AdminCompanySummary struct {
	ID                uuid.UUID `json:"id"`
	Slug              string    `json:"slug"`
	DBName            string    `json:"db_name"`
	LoginPath         string    `json:"login_path"`
	Name              string    `json:"name"`
	TradeName         string    `json:"trade_name"`
	LegalName         string    `json:"legal_name"`
	TaxRegistrationNo string    `json:"tax_registration_no"`
	BaseCurrency      string    `json:"base_currency"`
	DefaultLanguage   string    `json:"default_language"`
	PrimaryColorHex   string    `json:"primary_color_hex"`
	IndustryProfile   string    `json:"industry_profile"`
	OwnerEmail        string    `json:"owner_email"`
	IsActive          bool      `json:"is_active"`
	CreatedAt         time.Time `json:"created_at"`
	BranchCount       int64     `json:"branch_count"`
	TerminalCount     int64     `json:"terminal_count"`
	UserCount         int64     `json:"user_count"`
	InvoiceCount      int64     `json:"invoice_count"`
}

// AuditEventInput defines an immutable audit trail event recorded across platform modules into the Master DB.
type AuditEventInput struct {
	BusinessID  *uuid.UUID
	CompanySlug string
	CompanyName string
	DBName      string
	BranchID    *uuid.UUID
	BranchName  string
	ActorUserID *uuid.UUID
	ActorEmail  string
	ActorName   string
	ActorRole   string
	Module      string
	Action      string
	EntityType  string
	EntityID    string
	Summary     string
	Metadata    any
	IPAddress   string
	Status      string
}

// ListAuditLogsFilter filters cross-company logs for Platform SuperAdmin inspection.
type ListAuditLogsFilter struct {
	BusinessID uuid.UUID
	Module     string
	Status     string
	Search     string
	Limit      int32
	Offset     int32
}

// AdminAuditUsecase handles Master Control Plane provisioning, platform audit logs, and registry management.
type AdminAuditUsecase struct {
	pool        *pgxpool.Pool
	queries     *db.Queries
	redis       *redis.Client
	provisioner CompanyProvisioner
	hub         *ws.Hub
}

// NewAdminAuditUsecase constructs an AdminAuditUsecase backed by the Master Control Plane DB.
func NewAdminAuditUsecase(pool *pgxpool.Pool, queries *db.Queries, _ *SettingsResolver, rdb *redis.Client) *AdminAuditUsecase {
	return &AdminAuditUsecase{
		pool:    pool,
		queries: queries,
		redis:   rdb,
	}
}

// SetProvisioner attaches the physical Database-per-Tenant manager to the Admin usecase.
func (u *AdminAuditUsecase) SetProvisioner(p CompanyProvisioner) {
	u.provisioner = p
}

// SetHub attaches the WebSocket hub for real-time Platform Control Plane telemetry updates.
func (u *AdminAuditUsecase) SetHub(hub *ws.Hub) {
	u.hub = hub
}

// RecordEvent writes an audit trail row safely into the Master DB without aborting the parent HTTP flow.
func (u *AdminAuditUsecase) RecordEvent(ctx context.Context, ev AuditEventInput) {
	if u == nil || u.queries == nil {
		return
	}
	var bizNull, brNull, actorNull uuid.NullUUID
	if ev.BusinessID != nil && *ev.BusinessID != uuid.Nil {
		bizNull = uuid.NullUUID{UUID: *ev.BusinessID, Valid: true}
	}
	if ev.BranchID != nil && *ev.BranchID != uuid.Nil {
		brNull = uuid.NullUUID{UUID: *ev.BranchID, Valid: true}
	}
	if ev.ActorUserID != nil && *ev.ActorUserID != uuid.Nil {
		actorNull = uuid.NullUUID{UUID: *ev.ActorUserID, Valid: true}
	}

	compSlug := strings.TrimSpace(ev.CompanySlug)
	compName := strings.TrimSpace(ev.CompanyName)
	dbName := strings.TrimSpace(ev.DBName)
	if bizNull.Valid && (compSlug == "" || compName == "" || dbName == "") {
		if comp, err := u.queries.GetPlatformCompanyByID(ctx, bizNull.UUID); err == nil {
			if compSlug == "" {
				compSlug = comp.Slug
			}
			if compName == "" {
				compName = comp.TradeName
			}
			if dbName == "" {
				dbName = comp.DbName
			}
		}
	}

	metaBytes := json.RawMessage(`{}`)
	if ev.Metadata != nil {
		if raw, err := json.Marshal(ev.Metadata); err == nil && len(raw) > 0 {
			metaBytes = raw
		}
	}
	status := strings.ToUpper(strings.TrimSpace(ev.Status))
	if status != "ERROR" && status != "DENIED" {
		status = "SUCCESS"
	}
	module := strings.ToUpper(strings.TrimSpace(ev.Module))
	if module == "" {
		module = "SYSTEM"
	}
	_, _ = u.queries.InsertAuditLog(ctx, db.InsertAuditLogParams{
		BusinessID:   bizNull,
		CompanySlug:  compSlug,
		CompanyName:  compName,
		DbName:       dbName,
		BranchID:     brNull,
		BranchName:   strings.TrimSpace(ev.BranchName),
		ActorUserID:  actorNull,
		ActorEmail:   strings.TrimSpace(ev.ActorEmail),
		ActorName:    strings.TrimSpace(ev.ActorName),
		ActorRole:    strings.TrimSpace(ev.ActorRole),
		Module:       module,
		Action:       strings.ToUpper(strings.TrimSpace(ev.Action)),
		EntityType:   strings.ToLower(strings.TrimSpace(ev.EntityType)),
		EntityID:     strings.TrimSpace(ev.EntityID),
		Summary:      strings.TrimSpace(ev.Summary),
		MetadataJson: metaBytes,
		IpAddress:    strings.TrimSpace(ev.IPAddress),
		Status:       status,
	})
	if u.hub != nil {
		u.hub.BroadcastAdmin("ADMIN_SYNC", map[string]any{
			"module":       module,
			"action":       strings.ToUpper(strings.TrimSpace(ev.Action)),
			"company_slug": compSlug,
			"status":       status,
		})
	}
}

// RecordTenantEvent records an audit entry attributed to the verified TenantContext.
func (u *AdminAuditUsecase) RecordTenantEvent(ctx context.Context, tc domain.TenantContext, module, action, entityType, entityID, summary, ipAddress, status string, metadata any) {
	bizID := tc.BusinessID
	brID := tc.BranchID
	uid := tc.UserID
	u.RecordEvent(ctx, AuditEventInput{
		BusinessID:  &bizID,
		CompanySlug: tc.CompanySlug,
		CompanyName: tc.TradeName,
		DBName:      tc.DBName,
		BranchID:    &brID,
		ActorUserID: &uid,
		ActorEmail:  tc.Email,
		ActorName:   tc.FullName,
		ActorRole:   tc.RoleCode,
		Module:      module,
		Action:      action,
		EntityType:  entityType,
		EntityID:    entityID,
		Summary:     summary,
		Metadata:    metadata,
		IPAddress:   ipAddress,
		Status:      status,
	})
}

// ListCompanies returns all registered platform companies paired with dedicated DB names, 1-to-1 login links, and live stats.
func (u *AdminAuditUsecase) ListCompanies(ctx context.Context) ([]AdminCompanySummary, error) {
	rows, err := u.queries.ListPlatformCompanies(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]AdminCompanySummary, 0, len(rows))
	for _, r := range rows {
		var brCnt, tmCnt, usrCnt, invCnt int64
		if u.provisioner != nil {
			brCnt, tmCnt, usrCnt, invCnt = u.provisioner.FetchTenantStats(ctx, r.ID, r.DbName)
		}
		out = append(out, AdminCompanySummary{
			ID:                r.ID,
			Slug:              r.Slug,
			DBName:            r.DbName,
			LoginPath:         "/c/" + r.Slug + "/login",
			Name:              r.Name,
			TradeName:         r.TradeName,
			LegalName:         r.LegalName,
			TaxRegistrationNo: r.TaxRegistrationNo,
			BaseCurrency:      r.BaseCurrency,
			DefaultLanguage:   r.DefaultLanguage,
			PrimaryColorHex:   r.PrimaryColorHex,
			IndustryProfile:   r.IndustryProfile,
			OwnerEmail:        r.OwnerEmail,
			IsActive:          r.IsActive,
			CreatedAt:         r.CreatedAt.Time,
			BranchCount:       brCnt,
			TerminalCount:     tmCnt,
			UserCount:         usrCnt,
			InvoiceCount:      invCnt,
		})
	}
	return out, nil
}

// UpdateCompanyAdmin updates company profile fields in Master DB and syncs them into the isolated tenant DB.
func (u *AdminAuditUsecase) UpdateCompanyAdmin(ctx context.Context, companyID uuid.UUID, req UpdateCompanyAdminRequest) (db.PlatformCompany, error) {
	industry := ""
	if strings.TrimSpace(req.IndustryProfile) != "" {
		norm, ok := NormalizeIndustryProfile(req.IndustryProfile)
		if !ok {
			return db.PlatformCompany{}, fmt.Errorf("invalid industry_profile %q", req.IndustryProfile)
		}
		industry = norm
	}

	existing, err := u.queries.GetPlatformCompanyByID(ctx, companyID)
	if err != nil {
		return db.PlatformCompany{}, errors.New("company not found")
	}

	isActive := existing.IsActive
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	name := strings.TrimSpace(req.Name)
	tradeName := strings.TrimSpace(req.TradeName)
	if name == "" && tradeName != "" {
		name = tradeName
	}
	if tradeName == "" && name != "" {
		tradeName = name
	}

	updated, err := u.queries.UpdatePlatformCompanyMaster(ctx, db.UpdatePlatformCompanyMasterParams{
		ID:       companyID,
		Column2:  name,
		Column3:  tradeName,
		Column4:  strings.ToUpper(strings.TrimSpace(req.BaseCurrency)),
		Column5:  industry,
		IsActive: isActive,
	})
	if err != nil {
		return db.PlatformCompany{}, err
	}

	if u.provisioner != nil {
		_ = u.provisioner.SyncTenantCompanyProfile(ctx, companyID, updated.Slug, updated.DbName, UpdateCompanyAdminRequest{
			Name:            name,
			TradeName:       tradeName,
			BaseCurrency:    strings.ToUpper(strings.TrimSpace(req.BaseCurrency)),
			IndustryProfile: industry,
			IsActive:        &isActive,
		})
	}
	return updated, nil
}

// SyncRegistryFromTenant updates Master Control Plane company metadata after a tenant updates its profile/industry.
func (u *AdminAuditUsecase) SyncRegistryFromTenant(ctx context.Context, businessID uuid.UUID, tradeName, baseCurrency, defaultLang, primaryHex, industry, logoLightURL, taxReg string) {
	if u == nil || u.pool == nil || businessID == uuid.Nil {
		return
	}
	_, _ = u.pool.Exec(ctx, `
		UPDATE platform_companies
		SET
			trade_name = COALESCE(NULLIF($2::TEXT, ''), trade_name),
			base_currency = COALESCE(NULLIF($3::TEXT, ''), base_currency),
			default_language = COALESCE(NULLIF($4::TEXT, ''), default_language),
			primary_color_hex = COALESCE(NULLIF($5::TEXT, ''), primary_color_hex),
			industry_profile = COALESCE(NULLIF($6::TEXT, ''), industry_profile),
			logo_light_url = COALESCE(NULLIF($7::TEXT, ''), logo_light_url),
			tax_registration_no = COALESCE(NULLIF($8::TEXT, ''), tax_registration_no),
			updated_at = NOW()
		WHERE id = $1
	`, businessID, strings.TrimSpace(tradeName), strings.ToUpper(strings.TrimSpace(baseCurrency)), strings.TrimSpace(defaultLang), strings.TrimSpace(primaryHex), strings.TrimSpace(industry), strings.TrimSpace(logoLightURL), strings.TrimSpace(taxReg))
}

// CreateCompany provisions a standalone PostgreSQL database for the new company, applies tenant schema,
// seeds company basics + first Owner/Admin user inside that DB, and registers it in Master Control Plane.
func (u *AdminAuditUsecase) CreateCompany(ctx context.Context, actor domain.PlatformAdminContext, req CreateCompanyRequest) (map[string]any, error) {
	if u.provisioner == nil {
		return nil, errors.New("tenant database provisioner is not configured")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = strings.TrimSpace(req.TradeName)
	}
	if name == "" {
		return nil, errors.New("company name is required")
	}
	tradeName := strings.TrimSpace(req.TradeName)
	if tradeName == "" {
		tradeName = name
	}
	legalName := strings.TrimSpace(req.LegalName)
	if legalName == "" {
		legalName = name + " Pvt Ltd"
	}

	// Check duplicate company name across platform registry cleanly
	if existingCompanies, lErr := u.queries.ListPlatformCompanies(ctx); lErr == nil {
		for _, ec := range existingCompanies {
			if strings.EqualFold(strings.TrimSpace(ec.Name), name) {
				return nil, fmt.Errorf("a company named %q already exists", name)
			}
		}
	}

	rawSlug := strings.TrimSpace(req.Slug)
	slugAutoGenerated := false
	if rawSlug == "" {
		rawSlug = name
		slugAutoGenerated = true
	}
	baseSlug := normalizeCompanySlug(rawSlug)
	if baseSlug == "" || len(baseSlug) < 2 {
		return nil, errors.New("valid company portal slug is required (e.g. lanka-spice)")
	}
	if baseSlug == "admin" || baseSlug == "login" || baseSlug == "platform" || baseSlug == "api" {
		if slugAutoGenerated {
			baseSlug = baseSlug + "-co"
		} else {
			return nil, fmt.Errorf("slug %q is reserved by the platform", baseSlug)
		}
	}
	slug := baseSlug
	if slugAutoGenerated {
		for suffix := 2; suffix <= 99; suffix++ {
			if _, existsErr := u.queries.GetPlatformCompanyBySlug(ctx, slug); existsErr != nil {
				break
			}
			slug = fmt.Sprintf("%s-%d", strings.TrimSuffix(baseSlug, "-"), suffix)
		}
	}
	if _, existsErr := u.queries.GetPlatformCompanyBySlug(ctx, slug); existsErr == nil {
		return nil, fmt.Errorf("a company with portal slug %q already exists", slug)
	}
	dbName := makeTenantDBName(slug)

	industry, ok := NormalizeIndustryProfile(req.IndustryProfile)
	if !ok {
		return nil, errors.New("business type / industry_profile must be one of retail, restaurant, hardware, garage, mobile, stationery")
	}
	bp := BlueprintForIndustry(industry)

	baseCurrency := strings.ToUpper(strings.TrimSpace(req.BaseCurrency))
	if len(baseCurrency) != 3 {
		baseCurrency = "LKR"
		if !req.ApplySLTax && strings.EqualFold(strings.TrimSpace(req.CountryCode), "US") {
			baseCurrency = "USD"
		}
	}
	defaultLang := normalizeLanguageCode(req.DefaultLanguage)
	if defaultLang == "" {
		defaultLang = "en"
	}
	primaryHex := strings.TrimSpace(req.PrimaryColorHex)
	if !validHexColor.MatchString(primaryHex) {
		primaryHex = "#877FC1"
	} else {
		primaryHex = strings.ToUpper(primaryHex)
	}

	branchName := strings.TrimSpace(req.BranchName)
	if branchName == "" {
		branchName = bp.DefaultBranchName
	}
	branchCode := strings.ToUpper(strings.TrimSpace(req.BranchCode))
	if branchCode == "" {
		branchCode = bp.DefaultBranchCode
	}
	countryCode := strings.ToUpper(strings.TrimSpace(req.CountryCode))
	if countryCode == "" {
		if baseCurrency == "LKR" || req.ApplySLTax {
			countryCode = "LK"
		} else {
			countryCode = "US"
		}
	}
	countryName := strings.TrimSpace(req.CountryName)
	if countryName == "" {
		if countryCode == "LK" {
			countryName = "Sri Lanka"
		} else {
			countryName = "USA"
		}
	}

	ownerEmail := strings.ToLower(strings.TrimSpace(req.OwnerEmail))
	ownerName := strings.TrimSpace(req.OwnerFullName)
	if ownerName == "" {
		ownerName = tradeName + " Owner"
	}
	ownerPassword := strings.TrimSpace(req.OwnerPassword)
	if ownerEmail == "" || !strings.Contains(ownerEmail, "@") {
		return nil, errors.New("valid company admin / owner email is required")
	}
	if len(ownerPassword) < 6 {
		return nil, errors.New("company admin password must be at least 6 characters")
	}
	pin := strings.TrimSpace(req.SupervisorPIN)
	pinHash := ""
	if pin != "" {
		if len(pin) != 6 {
			return nil, errors.New("supervisor PIN must be exactly 6 digits")
		}
		pb, pErr := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.DefaultCost)
		if pErr != nil {
			return nil, pErr
		}
		pinHash = string(pb)
	}

	// Step 1: Physically create dedicated PostgreSQL database pos_tenant_<slug> and apply 3NF tenant schema.
	tenantPool, _, tenantSettings, err := u.provisioner.ProvisionTenantDatabase(ctx, dbName)
	if err != nil {
		return nil, err
	}
	provisionedCommitted := false
	defer func() {
		if !provisionedCommitted {
			_ = u.provisioner.DropTenantDatabase(context.Background(), dbName)
		}
	}()

	tx, err := tenantPool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var bizID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO businesses (
			name, trade_name, legal_name, tax_registration_no, base_currency,
			default_language, primary_color_hex, industry_profile, is_active
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
		RETURNING id
	`,
		name, tradeName, legalName, strings.TrimSpace(req.TaxRegistrationNo),
		baseCurrency, defaultLang, primaryHex, industry,
	).Scan(&bizID); err != nil {
		return nil, err
	}

	var branchID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO branches (
			business_id, code, name, country_code, country_name, city, address, is_warehouse, is_active
		) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, TRUE)
		RETURNING id
	`,
		bizID, branchCode, branchName, countryCode, countryName,
		strings.TrimSpace(req.City), strings.TrimSpace(req.Address),
	).Scan(&branchID); err != nil {
		return nil, err
	}

	var warehouseID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO warehouses (business_id, branch_id, code, name, is_active)
		VALUES ($1, $2, $3, $4, TRUE)
		RETURNING id
	`,
		bizID, branchID, branchCode+"-WH", branchName+" Warehouse",
	).Scan(&warehouseID); err != nil {
		return nil, err
	}

	var terminalID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO terminals (business_id, branch_id, code, name, hardware_serial, is_active)
		VALUES ($1, $2, 'POS-01', 'Terminal #01', $3, TRUE)
		RETURNING id
	`,
		bizID, branchID, "ZPRO-"+strings.ToUpper(bizID.String()[:8])+"-01",
	).Scan(&terminalID); err != nil {
		return nil, err
	}

	// Standard Chart of Accounts inside the new company DB.
	coaSeeds := []struct {
		code  string
		name  string
		atype string
	}{
		{"1010", "Cash on Hand", "ASSET"},
		{"1020", "Card Clearing Receivable", "ASSET"},
		{"1200", "Inventory Asset (FIFO)", "ASSET"},
		{"2000", "Accounts Payable", "LIABILITY"},
		{"2100", "Sales Tax Payable", "LIABILITY"},
		{"3000", "Owner Equity", "EQUITY"},
		{"4000", "Sales Revenue", "REVENUE"},
		{"4100", "Sales Returns & Allowances", "REVENUE"},
		{"5000", "Cost of Goods Sold", "COGS"},
	}
	for _, coa := range coaSeeds {
		if _, err := tx.Exec(ctx, `
			INSERT INTO chart_of_accounts (business_id, code, name, account_type, is_system, is_active)
			VALUES ($1, $2, $3, $4, TRUE, TRUE)
		`, bizID, coa.code, coa.name, coa.atype); err != nil {
			return nil, err
		}
	}

	nowY := time.Now().UTC().Year()
	quarters := []struct {
		name  string
		start string
		end   string
	}{
		{fmt.Sprintf("FY%d-Q1", nowY), fmt.Sprintf("%d-01-01", nowY), fmt.Sprintf("%d-03-31", nowY)},
		{fmt.Sprintf("FY%d-Q2", nowY), fmt.Sprintf("%d-04-01", nowY), fmt.Sprintf("%d-06-30", nowY)},
		{fmt.Sprintf("FY%d-Q3", nowY), fmt.Sprintf("%d-07-01", nowY), fmt.Sprintf("%d-09-30", nowY)},
		{fmt.Sprintf("FY%d-Q4", nowY), fmt.Sprintf("%d-10-01", nowY), fmt.Sprintf("%d-12-31", nowY)},
	}
	for _, q := range quarters {
		if _, err := tx.Exec(ctx, `
			INSERT INTO fiscal_periods (business_id, period_name, start_date, end_date, is_locked)
			VALUES ($1, $2, $3::DATE, $4::DATE, FALSE)
		`, bizID, q.name, q.start, q.end); err != nil {
			return nil, err
		}
	}

	var stdTaxGroupID, zeroTaxGroupID uuid.UUID
	stdTaxName := "Standard Sales Tax"
	if req.ApplySLTax || baseCurrency == "LKR" {
		stdTaxName = "SL Standard VAT (18%) & SSCL (2.5%)"
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO tax_groups (business_id, code, name, is_default)
		VALUES ($1, 'STD_DEFAULT', $2, TRUE)
		RETURNING id
	`, bizID, stdTaxName).Scan(&stdTaxGroupID); err != nil {
		return nil, err
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO tax_groups (business_id, code, name, is_default)
		VALUES ($1, 'ZERO_TAX', 'Zero-Rated / Exempt', FALSE)
		RETURNING id
	`, bizID).Scan(&zeroTaxGroupID); err != nil {
		return nil, err
	}
	if req.ApplySLTax || baseCurrency == "LKR" {
		if _, err := tx.Exec(ctx, `
			INSERT INTO tax_rules (business_id, tax_group_id, code, name, tax_type, rate_percent, priority, is_active)
			VALUES
				($1, $2, 'SL_VAT_18', 'VAT (18%)', 'EXCLUSIVE', 18.0000, 1, TRUE),
				($1, $2, 'SL_SSCL_2_5', 'SSCL (2.5%)', 'EXCLUSIVE', 2.5000, 2, TRUE),
				($1, $3, 'EXEMPT', 'Zero-Rated Supply', 'EXCLUSIVE', 0.0000, 1, TRUE)
		`, bizID, stdTaxGroupID, zeroTaxGroupID); err != nil {
			return nil, err
		}
	} else {
		if _, err := tx.Exec(ctx, `
			INSERT INTO tax_rules (business_id, tax_group_id, code, name, tax_type, rate_percent, priority, is_active)
			VALUES
				($1, $2, 'STD_VAT', 'Standard Tax (10%)', 'EXCLUSIVE', 10.0000, 1, TRUE),
				($1, $3, 'EXEMPT', 'Zero-Rated Supply', 'EXCLUSIVE', 0.0000, 1, TRUE)
		`, bizID, stdTaxGroupID, zeroTaxGroupID); err != nil {
			return nil, err
		}
	}

	for _, cat := range bp.Categories {
		if _, err := tx.Exec(ctx, `
			INSERT INTO categories (business_id, tax_group_id, name, slug, gender_segment)
			VALUES ($1, $2, $3, $4, 'Unisex')
		`, bizID, stdTaxGroupID, cat.Name, cat.Slug); err != nil {
			return nil, err
		}
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO customers (business_id, name, tier, is_walk_in)
		VALUES ($1, 'Walk-in Guest', 'Standard', TRUE)
	`, bizID); err != nil {
		return nil, err
	}

	// Auto-migrate vertical-tailored Departments & Designations cleanly from the shared Industry Blueprint.
	txQueries := db.New(tx)
	ownerDesigID, dErr := EnsureIndustryDepartmentsAndDesignations(ctx, txQueries, bizID, industry)
	if dErr != nil {
		return nil, dErr
	}
	var ownerDesigNull uuid.NullUUID
	if ownerDesigID != uuid.Nil {
		ownerDesigNull = uuid.NullUUID{UUID: ownerDesigID, Valid: true}
	}

	// Provision First Company Owner / Admin user exclusively inside the dedicated tenant DB before scoped_settings FK usage.
	pwHash, hErr := bcrypt.GenerateFromPassword([]byte(ownerPassword), bcrypt.DefaultCost)
	if hErr != nil {
		return nil, hErr
	}
	var ownerUserID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO users (email, full_name, password_hash, avatar_url, is_active)
		VALUES ($1, $2, $3, '', TRUE)
		RETURNING id
	`, ownerEmail, ownerName, string(pwHash)).Scan(&ownerUserID); err != nil {
		return nil, err
	}

	var ownerRoleID uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT id FROM roles WHERE code = 'BusinessOwner' LIMIT 1`).Scan(&ownerRoleID); err != nil {
		return nil, errors.New("BusinessOwner system role missing")
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO user_business_roles (
			user_id, business_id, branch_id, role_id, designation_id, supervisor_pin_hash, is_active
		) VALUES ($1, $2, NULL, $3, $4, $5, TRUE)
	`, ownerUserID, bizID, ownerRoleID, ownerDesigNull, pinHash); err != nil {
		return nil, err
	}

	// Business-level Settings scoped strictly to the new tenant DB (all industry flags + operational rules + localization).
	rawCurrency, _ := json.Marshal(baseCurrency)
	rawLang, _ := json.Marshal(defaultLang)
	bizSettings := IndustryBusinessSettingValues(industry)
	bizSettings["accounting.base_currency"] = rawCurrency
	bizSettings["system.default_language"] = rawLang

	for key, valJSON := range bizSettings {
		if _, err := tx.Exec(ctx, `
			INSERT INTO scoped_settings (business_id, setting_key, scope_level, scope_target_id, value_json, updated_by)
			VALUES ($1, $2, 'BUSINESS', $1, $3::jsonb, $4)
			ON CONFLICT DO NOTHING
		`, bizID, key, string(valJSON), ownerUserID); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	// Step 2: Register company + database mapping in Master Control Plane DB.
	if _, err := u.queries.InsertPlatformCompany(ctx, db.InsertPlatformCompanyParams{
		ID:                bizID,
		Slug:              slug,
		DbName:            dbName,
		Name:              name,
		TradeName:         tradeName,
		LegalName:         legalName,
		IndustryProfile:   industry,
		BaseCurrency:      baseCurrency,
		DefaultLanguage:   defaultLang,
		TaxRegistrationNo: strings.TrimSpace(req.TaxRegistrationNo),
		PrimaryColorHex:   primaryHex,
		LogoLightUrl:      "",
		OwnerEmail:        ownerEmail,
	}); err != nil {
		return nil, fmt.Errorf("register company in master registry: %w", err)
	}

	provisionedCommitted = true
	_ = u.provisioner.RegisterAndCacheTenant(ctx, bizID, slug, dbName, tenantPool)
	if tenantSettings != nil {
		tenantSettings.InvalidateAndWarmBusiness(ctx, bizID, "pos.ui.layout_mode", "BUSINESS")
	}

	_ = actor // actor metadata recorded by handler in Master audit_logs
	return map[string]any{
		"company": map[string]any{
			"id":               bizID,
			"slug":             slug,
			"db_name":          dbName,
			"login_path":       "/c/" + slug + "/login",
			"name":             name,
			"trade_name":       tradeName,
			"industry_profile": industry,
			"base_currency":    baseCurrency,
			"default_language": defaultLang,
			"branch_id":        branchID,
			"warehouse_id":     warehouseID,
			"terminal_id":      terminalID,
			"owner_user_id":    ownerUserID,
			"owner_email":      ownerEmail,
		},
	}, nil
}

// ListAuditLogs returns paginated platform-wide audit logs and total count across all isolated company databases.
func (u *AdminAuditUsecase) ListAuditLogs(ctx context.Context, filter ListAuditLogsFilter) (map[string]any, error) {
	limit := filter.Limit
	if limit <= 0 || limit > 250 {
		limit = 100
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	rows, err := u.queries.ListAuditLogs(ctx, db.ListAuditLogsParams{
		Column1: filter.BusinessID,
		Column2: strings.TrimSpace(filter.Module),
		Column3: strings.TrimSpace(filter.Status),
		Column4: strings.TrimSpace(filter.Search),
		Column5: limit,
		Column6: offset,
	})
	if err != nil {
		return nil, err
	}

	total, err := u.queries.CountAuditLogs(ctx, db.CountAuditLogsParams{
		Column1: filter.BusinessID,
		Column2: strings.TrimSpace(filter.Module),
		Column3: strings.TrimSpace(filter.Status),
		Column4: strings.TrimSpace(filter.Search),
	})
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"logs":   rows,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	}, nil
}

func normalizeCompanySlug(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	var b strings.Builder
	prevDash := false
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			prevDash = false
		} else if !prevDash && b.Len() > 0 {
			b.WriteRune('-')
			prevDash = true
		}
		if b.Len() >= 40 {
			break
		}
	}
	out := strings.Trim(b.String(), "-")
	if len(out) > 0 && out[0] >= '0' && out[0] <= '9' {
		out = "c-" + out
	}
	return out
}

func makeTenantDBName(slug string) string {
	safe := strings.ReplaceAll(slug, "-", "_")
	if len(safe) > 45 {
		safe = safe[:45]
	}
	return "pos_tenant_" + strings.Trim(safe, "_")
}
