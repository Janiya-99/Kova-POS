package tenant

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"

	dbinfra "github.com/enterprise-pos/backend/internal/infrastructure/db"
	"github.com/enterprise-pos/backend/internal/infrastructure/mailer"
	"github.com/enterprise-pos/backend/internal/infrastructure/ws"
	"github.com/enterprise-pos/backend/internal/repository/sqlc/db"
	"github.com/enterprise-pos/backend/internal/usecase"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

const (
	zonaRetailID        = "11111111-1111-1111-1111-111111111111"
	zonaRetailSlug      = "zona-retail"
	zonaRetailDB        = "pos_tenant_zona_retail"
	nordicDemoID        = "22222222-2222-2222-2222-222222222222"
	legacyOwnerID       = "11111111-cccc-1111-1111-111111111101"
	legacyAdminEmail    = "admin@zonaretail.com"
	legacyAdminUserID   = "11111111-cccc-1111-1111-111111111106"
	defaultTenantMaxCon = 10
)

// TenantBundle holds the dedicated PostgreSQL pool and scoped usecases for one isolated company DB.
type TenantBundle struct {
	CompanyID   uuid.UUID
	Slug        string
	DBName      string
	Pool        *pgxpool.Pool
	Queries     *db.Queries
	Auth        *usecase.AuthUsecase
	Settings    *usecase.SettingsResolver
	Inventory   *usecase.InventoryFIFOUsecase
	POS         *usecase.POSCheckoutUsecase
	Accounting  *usecase.AccountingGLUsecase
	Analytics   *usecase.AnalyticsUsecase
	Catalog     *usecase.CatalogCompanyUsecase
	PrintStudio *usecase.PrintStudioUsecase
	Branches    *usecase.BranchTerminalUsecase
}

// TenantManager manages lazy physical database pools and per-company usecase bundles.
type TenantManager struct {
	masterPool      *pgxpool.Pool
	masterQueries   *db.Queries
	baseDatabaseURL string
	migrationsDir   string
	redis           *redis.Client
	hub             *ws.Hub
	mailer          *mailer.Mailer
	enqueuer        usecase.LowStockEnqueuer
	jwtSecret       string
	pinTokenSecret  string

	mu     sync.RWMutex
	bySlug map[string]*TenantBundle
	byID   map[uuid.UUID]*TenantBundle
	byDB   map[string]*TenantBundle
}

// SetMailer attaches an outbound SMTP mailer to the manager and all active tenant auth bundles.
func (m *TenantManager) SetMailer(mail *mailer.Mailer) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.mailer = mail
	for _, b := range m.byID {
		if b != nil && b.Auth != nil {
			b.Auth.SetMailer(mail)
		}
	}
}

// NewTenantManager constructs the Master-to-Tenant database router and connection pool cache.
func NewTenantManager(
	masterPool *pgxpool.Pool,
	masterQueries *db.Queries,
	baseDatabaseURL string,
	migrationsDir string,
	rdb *redis.Client,
	hub *ws.Hub,
	enqueuer usecase.LowStockEnqueuer,
	jwtSecret string,
	pinTokenSecret string,
) *TenantManager {
	return &TenantManager{
		masterPool:      masterPool,
		masterQueries:   masterQueries,
		baseDatabaseURL: baseDatabaseURL,
		migrationsDir:   migrationsDir,
		redis:           rdb,
		hub:             hub,
		enqueuer:        enqueuer,
		jwtSecret:       jwtSecret,
		pinTokenSecret:  pinTokenSecret,
		bySlug:          make(map[string]*TenantBundle),
		byID:            make(map[uuid.UUID]*TenantBundle),
		byDB:            make(map[string]*TenantBundle),
	}
}

func (m *TenantManager) openPool(ctx context.Context, dbName string) (*pgxpool.Pool, error) {
	connStr, err := dbinfra.BuildDatabaseURLWithDB(m.baseDatabaseURL, dbName)
	if err != nil {
		return nil, err
	}
	cfg, err := pgxpool.ParseConfig(connStr)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = defaultTenantMaxCon
	cfg.MinConns = 0
	return pgxpool.NewWithConfig(ctx, cfg)
}

func (m *TenantManager) buildBundle(companyID uuid.UUID, slug, dbName string, pool *pgxpool.Pool) *TenantBundle {
	queries := db.New(pool)
	settingsUC := usecase.NewSettingsResolver(queries, m.redis, m.hub)

	inventoryUC := usecase.NewInventoryFIFOUsecase(pool, queries)
	inventoryUC.SetSettingsResolver(settingsUC)
	inventoryUC.SetHub(m.hub)

	posUC := usecase.NewPOSCheckoutUsecase(pool, queries, m.redis, settingsUC, m.hub, m.enqueuer)
	accountingUC := usecase.NewAccountingGLUsecase(queries)
	analyticsUC := usecase.NewAnalyticsUsecase(queries)
	catalogUC := usecase.NewCatalogCompanyUsecase(queries, settingsUC)
	catalogUC.SetInventory(inventoryUC)
	catalogUC.SetRedis(m.redis)
	printStudioUC := usecase.NewPrintStudioUsecase(pool, queries, m.hub)
	branchUC := usecase.NewBranchTerminalUsecase(pool, queries)

	authUC := usecase.NewAuthUsecase(queries, m.redis, m.jwtSecret, m.pinTokenSecret)
	authUC.SetTenantIdentity(slug, dbName)
	authUC.SetSettingsResolver(settingsUC)
	authUC.SetHub(m.hub)
	authUC.SetMailer(m.mailer)

	return &TenantBundle{
		CompanyID:   companyID,
		Slug:        strings.ToLower(slug),
		DBName:      dbName,
		Pool:        pool,
		Queries:     queries,
		Auth:        authUC,
		Settings:    settingsUC,
		Inventory:   inventoryUC,
		POS:         posUC,
		Accounting:  accountingUC,
		Analytics:   analyticsUC,
		Catalog:     catalogUC,
		PrintStudio: printStudioUC,
		Branches:    branchUC,
	}
}

func (m *TenantManager) cacheBundle(b *TenantBundle) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.bySlug[strings.ToLower(b.Slug)] = b
	m.byID[b.CompanyID] = b
	m.byDB[b.DBName] = b
}

func (m *TenantManager) evictBundle(companyID uuid.UUID, slug, dbName string) {
	m.mu.Lock()
	var pool *pgxpool.Pool
	if b, ok := m.byID[companyID]; ok {
		pool = b.Pool
	}
	delete(m.byID, companyID)
	delete(m.bySlug, strings.ToLower(slug))
	delete(m.byDB, dbName)
	m.mu.Unlock()
	if pool != nil {
		pool.Close()
	}
}

// GetBySlug resolves an active company's isolated database bundle using its 1-to-1 portal slug.
func (m *TenantManager) GetBySlug(ctx context.Context, slug string) (*TenantBundle, error) {
	norm := strings.ToLower(strings.TrimSpace(slug))
	if norm == "" {
		return nil, errors.New("company portal slug is required")
	}

	m.mu.RLock()
	if b, ok := m.bySlug[norm]; ok {
		m.mu.RUnlock()
		return b, nil
	}
	m.mu.RUnlock()

	comp, err := m.masterQueries.GetPlatformCompanyBySlug(ctx, norm)
	if err != nil {
		return nil, fmt.Errorf("company portal %q not found", norm)
	}
	if !comp.IsActive {
		return nil, fmt.Errorf("company workspace %q is suspended", comp.Slug)
	}
	return m.openAndCacheFromRecord(ctx, comp.ID, comp.Slug, comp.DbName)
}

// GetByBusinessID resolves an active company's isolated database bundle using its registered business UUID.
func (m *TenantManager) GetByBusinessID(ctx context.Context, businessID uuid.UUID) (*TenantBundle, error) {
	if businessID == uuid.Nil {
		return nil, errors.New("business_id is required")
	}

	m.mu.RLock()
	if b, ok := m.byID[businessID]; ok {
		m.mu.RUnlock()
		return b, nil
	}
	m.mu.RUnlock()

	comp, err := m.masterQueries.GetPlatformCompanyByID(ctx, businessID)
	if err != nil {
		return nil, errors.New("company database registration not found")
	}
	if !comp.IsActive {
		return nil, fmt.Errorf("company workspace %q is suspended", comp.Slug)
	}
	return m.openAndCacheFromRecord(ctx, comp.ID, comp.Slug, comp.DbName)
}

// GetInventoryUsecase returns the tenant-scoped InventoryFIFOUsecase for Asynq background workers.
func (m *TenantManager) GetInventoryUsecase(ctx context.Context, businessID uuid.UUID) (*usecase.InventoryFIFOUsecase, error) {
	b, err := m.GetByBusinessID(ctx, businessID)
	if err != nil {
		return nil, err
	}
	return b.Inventory, nil
}

func (m *TenantManager) openAndCacheFromRecord(ctx context.Context, companyID uuid.UUID, slug, dbName string) (*TenantBundle, error) {
	pool, err := m.openPool(ctx, dbName)
	if err != nil {
		return nil, fmt.Errorf("open tenant database %s: %w", dbName, err)
	}
	if err := dbinfra.RunTenantMigrations(ctx, pool, m.migrationsDir, false); err != nil {
		pool.Close()
		return nil, fmt.Errorf("migrate tenant database %s: %w", dbName, err)
	}
	bundle := m.buildBundle(companyID, slug, dbName, pool)
	m.cacheBundle(bundle)
	return bundle, nil
}

// ProvisionTenantDatabase creates a dedicated PostgreSQL database and runs the 3NF tenant schema migrations.
func (m *TenantManager) ProvisionTenantDatabase(ctx context.Context, dbName string) (*pgxpool.Pool, *db.Queries, *usecase.SettingsResolver, error) {
	if err := dbinfra.CreateDatabase(ctx, m.masterPool, dbName); err != nil {
		return nil, nil, nil, err
	}
	pool, err := m.openPool(ctx, dbName)
	if err != nil {
		_ = dbinfra.DropDatabase(context.Background(), m.masterPool, dbName)
		return nil, nil, nil, err
	}
	if err := dbinfra.RunTenantMigrations(ctx, pool, m.migrationsDir, false); err != nil {
		pool.Close()
		_ = dbinfra.DropDatabase(context.Background(), m.masterPool, dbName)
		return nil, nil, nil, err
	}
	queries := db.New(pool)
	settings := usecase.NewSettingsResolver(queries, m.redis, m.hub)
	return pool, queries, settings, nil
}

// RegisterAndCacheTenant registers an already-provisioned company DB pool into the live cache.
func (m *TenantManager) RegisterAndCacheTenant(_ context.Context, businessID uuid.UUID, slug, dbName string, pool *pgxpool.Pool) error {
	bundle := m.buildBundle(businessID, slug, dbName, pool)
	m.cacheBundle(bundle)
	return nil
}

// SyncTenantCompanyProfile propagates Admin Portal metadata/status edits into the isolated tenant DB.
func (m *TenantManager) SyncTenantCompanyProfile(ctx context.Context, businessID uuid.UUID, slug, dbName string, req usecase.UpdateCompanyAdminRequest) error {
	var pool *pgxpool.Pool
	var settingsUC *usecase.SettingsResolver
	var queries *db.Queries

	m.mu.RLock()
	cached, ok := m.byID[businessID]
	m.mu.RUnlock()
	if ok {
		pool = cached.Pool
		queries = cached.Queries
		settingsUC = cached.Settings
	} else {
		p, err := m.openPool(ctx, dbName)
		if err != nil {
			return err
		}
		defer p.Close()
		pool = p
		queries = db.New(pool)
		settingsUC = usecase.NewSettingsResolver(queries, m.redis, m.hub)
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	_, err := queries.UpdateCompanyAdminProfile(ctx, db.UpdateCompanyAdminProfileParams{
		ID:       businessID,
		Column2:  strings.TrimSpace(req.Name),
		Column3:  strings.TrimSpace(req.TradeName),
		Column4:  strings.ToUpper(strings.TrimSpace(req.BaseCurrency)),
		Column5:  strings.TrimSpace(req.IndustryProfile),
		IsActive: isActive,
	})
	if err != nil {
		return err
	}

	if settingsUC != nil {
		if req.IndustryProfile != "" {
			rawMode, _ := json.Marshal(req.IndustryProfile)
			_ = settingsUC.UpsertOverrideQuiet(ctx, businessID, uuid.Nil, "pos.ui.layout_mode", "BUSINESS", &businessID, rawMode)
			for k, enabled := range usecase.IndustryPresetFlags(req.IndustryProfile) {
				bRaw, _ := json.Marshal(enabled)
				_ = settingsUC.UpsertOverrideQuiet(ctx, businessID, uuid.Nil, k, "BUSINESS", &businessID, bRaw)
			}
		}
		if normCurr := strings.ToUpper(strings.TrimSpace(req.BaseCurrency)); normCurr != "" {
			rawCurr, _ := json.Marshal(normCurr)
			_ = settingsUC.UpsertOverrideQuiet(ctx, businessID, uuid.Nil, "accounting.base_currency", "BUSINESS", &businessID, rawCurr)
		}
		settingsUC.InvalidateAndWarmBusiness(ctx, businessID, "pos.ui.layout_mode", "BUSINESS")
	}

	if req.IsActive != nil && !*req.IsActive {
		m.evictBundle(businessID, slug, dbName)
	}
	return nil
}

// DropTenantDatabase terminates pooled connections and removes a tenant database cleanly.
func (m *TenantManager) DropTenantDatabase(ctx context.Context, dbName string) error {
	m.mu.Lock()
	if b, ok := m.byDB[dbName]; ok {
		b.Pool.Close()
		delete(m.byDB, dbName)
		delete(m.bySlug, strings.ToLower(b.Slug))
		delete(m.byID, b.CompanyID)
	}
	m.mu.Unlock()
	return dbinfra.DropDatabase(ctx, m.masterPool, dbName)
}

// FetchTenantStats reads live operational counts directly from an active or idle tenant DB.
func (m *TenantManager) FetchTenantStats(ctx context.Context, businessID uuid.UUID, dbName string) (branchCount, terminalCount, userCount, invoiceCount int64) {
	m.mu.RLock()
	b, ok := m.byID[businessID]
	m.mu.RUnlock()

	var q *db.Queries
	if ok {
		q = b.Queries
	} else {
		p, err := m.openPool(ctx, dbName)
		if err != nil {
			return 0, 0, 0, 0
		}
		defer p.Close()
		q = db.New(p)
	}

	stats, err := q.GetTenantDatabaseStats(ctx, businessID)
	if err != nil {
		return 0, 0, 0, 0
	}
	return stats.BranchCount, stats.TerminalCount, stats.UserCount, stats.InvoiceCount
}

// CloseAll closes every cached tenant database pool cleanly on shutdown.
func (m *TenantManager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, b := range m.byID {
		if b.Pool != nil {
			b.Pool.Close()
		}
	}
	m.byID = make(map[uuid.UUID]*TenantBundle)
	m.bySlug = make(map[string]*TenantBundle)
	m.byDB = make(map[string]*TenantBundle)
}

// BootstrapZonaRetailTenantDB ensures `pos_tenant_zona_retail` exists as a completely separate physical DB
// for Zona Retail Ltd, migrating existing live data from enterprise_pos (or cleanly seeding on fresh volumes)
// while removing Nordic Minimal Co demo rows and legacy SuperAdmin user from the tenant DB.
func (m *TenantManager) BootstrapZonaRetailTenantDB(ctx context.Context) error {
	exists, err := dbinfra.DatabaseExists(ctx, m.masterPool, zonaRetailDB)
	if err != nil {
		return err
	}
	if exists {
		pool, err := m.openPool(ctx, zonaRetailDB)
		if err != nil {
			return err
		}
		if err := dbinfra.RunTenantMigrations(ctx, pool, m.migrationsDir, false); err != nil {
			pool.Close()
			return err
		}
		_, _ = pool.Exec(ctx, `
			DELETE FROM user_business_roles ubr
			USING roles r
			WHERE ubr.role_id = r.id AND r.code = 'SuperAdmin'
		`)
		bizUUID := uuid.MustParse(zonaRetailID)
		m.cacheBundle(m.buildBundle(bizUUID, zonaRetailSlug, zonaRetailDB, pool))
		log.Printf("Verified standalone tenant DB %s (%s)", zonaRetailDB, zonaRetailSlug)
		return nil
	}

	log.Printf("Provisioning standalone tenant DB %s for Zona Retail...", zonaRetailDB)
	if err := dbinfra.CreateDatabase(ctx, m.masterPool, zonaRetailDB); err != nil {
		return err
	}
	tenantPool, err := m.openPool(ctx, zonaRetailDB)
	if err != nil {
		_ = dbinfra.DropDatabase(context.Background(), m.masterPool, zonaRetailDB)
		return err
	}

	var hasZonaInMaster bool
	_ = m.masterPool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM businesses WHERE id = $1::UUID)`, zonaRetailID).Scan(&hasZonaInMaster)

	if err := dbinfra.RunTenantMigrations(ctx, tenantPool, m.migrationsDir, !hasZonaInMaster); err != nil {
		tenantPool.Close()
		_ = dbinfra.DropDatabase(context.Background(), m.masterPool, zonaRetailDB)
		return err
	}

	if hasZonaInMaster {
		if err := copyZonaRetailFromMaster(ctx, m.masterPool, tenantPool); err != nil {
			tenantPool.Close()
			_ = dbinfra.DropDatabase(context.Background(), m.masterPool, zonaRetailDB)
			return fmt.Errorf("copy Zona Retail into %s: %w", zonaRetailDB, err)
		}
	} else {
		_, _ = tenantPool.Exec(ctx, `DELETE FROM businesses WHERE id = $1::UUID`, nordicDemoID)
		_, _ = tenantPool.Exec(ctx, `DELETE FROM users WHERE LOWER(email) = $1`, legacyAdminEmail)
	}

	bizUUID := uuid.MustParse(zonaRetailID)
	m.cacheBundle(m.buildBundle(bizUUID, zonaRetailSlug, zonaRetailDB, tenantPool))
	log.Printf("Successfully provisioned & isolated %s (%s)", zonaRetailDB, zonaRetailSlug)
	return nil
}

type tableCopySpec struct {
	table string
	where string
	order string
}

func copyZonaRetailFromMaster(ctx context.Context, src, dst *pgxpool.Pool) error {
	specs := []tableCopySpec{
		{table: "businesses", where: fmt.Sprintf("id = '%s'::UUID", zonaRetailID)},
		{table: "branches", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "warehouses", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "terminals", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "departments", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "designations", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "roles", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "role_permissions", where: fmt.Sprintf("role_id IN (SELECT id FROM roles WHERE business_id = '%s'::UUID)", zonaRetailID)},
		{table: "users", where: fmt.Sprintf("id IN (SELECT DISTINCT user_id FROM user_business_roles WHERE business_id = '%s'::UUID UNION SELECT '%s'::UUID) OR LOWER(email) = '%s'", zonaRetailID, legacyAdminUserID, legacyAdminEmail)},
		{table: "user_business_roles", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "scoped_settings", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "tax_groups", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "tax_rules", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "categories", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID), order: "parent_id NULLS FIRST, business_category_id NULLS FIRST, created_at ASC"},
		{table: "products", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "product_barcodes", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "customers", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "suppliers", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "purchase_orders", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "purchase_order_items", where: fmt.Sprintf("po_id IN (SELECT id FROM purchase_orders WHERE business_id = '%s'::UUID)", zonaRetailID)},
		{table: "goods_received_notes", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "grn_items", where: fmt.Sprintf("grn_id IN (SELECT id FROM goods_received_notes WHERE business_id = '%s'::UUID)", zonaRetailID)},
		{table: "inventory_batches", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "stock_movements", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "stock_ledger_entries", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "warehouse_approval_logs", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "purchase_invoices", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "pos_shifts", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "suspended_bills", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "suspended_bill_items", where: fmt.Sprintf("suspended_bill_id IN (SELECT id FROM suspended_bills WHERE business_id = '%s'::UUID)", zonaRetailID)},
		{table: "sales_invoices", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "sales_invoice_items", where: fmt.Sprintf("invoice_id IN (SELECT id FROM sales_invoices WHERE business_id = '%s'::UUID)", zonaRetailID)},
		{table: "sales_invoice_taxes", where: fmt.Sprintf("invoice_id IN (SELECT id FROM sales_invoices WHERE business_id = '%s'::UUID)", zonaRetailID)},
		{table: "invoice_payments", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "chart_of_accounts", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID), order: "parent_id NULLS FIRST, code ASC"},
		{table: "fiscal_periods", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "journal_entries", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "journal_lines", where: fmt.Sprintf("journal_entry_id IN (SELECT id FROM journal_entries WHERE business_id = '%s'::UUID)", zonaRetailID)},
		{table: "system_notifications", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
		{table: "print_templates", where: fmt.Sprintf("business_id = '%s'::UUID", zonaRetailID)},
	}

	tx, err := dst.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Bypass replication/ledger triggers cleanly during bulk historical copy inside tx; resets automatically on commit.
	_, _ = tx.Exec(ctx, `SET LOCAL session_replication_role = 'replica'`)

	for _, spec := range specs {
		if err := copySingleTable(ctx, src, tx, spec); err != nil {
			return fmt.Errorf("copy table %s: %w", spec.table, err)
		}
	}

	// Reassign any legacy references created under admin@zonaretail.com -> owner@zonaretail.com and purge SuperAdmin user from tenant DB.
	fkRemaps := []string{
		`UPDATE scoped_settings SET updated_by = $1::UUID WHERE updated_by = $2::UUID`,
		`UPDATE goods_received_notes SET received_by = $1::UUID WHERE received_by = $2::UUID`,
		`UPDATE goods_received_notes SET approved_by = $1::UUID WHERE approved_by = $2::UUID`,
		`UPDATE purchase_orders SET created_by = $1::UUID WHERE created_by = $2::UUID`,
		`UPDATE stock_movements SET created_by = $1::UUID WHERE created_by = $2::UUID`,
		`UPDATE pos_shifts SET cashier_user_id = $1::UUID WHERE cashier_user_id = $2::UUID`,
		`UPDATE suspended_bills SET cashier_user_id = $1::UUID WHERE cashier_user_id = $2::UUID`,
		`UPDATE sales_invoices SET cashier_user_id = $1::UUID WHERE cashier_user_id = $2::UUID`,
		`UPDATE sales_invoices SET override_supervisor_id = $1::UUID WHERE override_supervisor_id = $2::UUID`,
		`UPDATE fiscal_periods SET locked_by = $1::UUID WHERE locked_by = $2::UUID`,
		`UPDATE journal_entries SET posted_by = $1::UUID WHERE posted_by = $2::UUID`,
		`UPDATE warehouse_approval_logs SET actor_user_id = $1::UUID WHERE actor_user_id = $2::UUID`,
		`UPDATE stock_ledger_entries SET created_by = $1::UUID WHERE created_by = $2::UUID`,
		`UPDATE print_templates SET created_by = $1::UUID WHERE created_by = $2::UUID`,
	}
	for _, stmt := range fkRemaps {
		if _, err := tx.Exec(ctx, stmt, legacyOwnerID, legacyAdminUserID); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `DELETE FROM user_business_roles WHERE user_id = $1::UUID OR role_id IN (SELECT id FROM roles WHERE code = 'SuperAdmin')`, legacyAdminUserID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM users WHERE id = $1::UUID OR LOWER(email) = $2`, legacyAdminUserID, legacyAdminEmail); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func copySingleTable(ctx context.Context, src *pgxpool.Pool, tx pgx.Tx, spec tableCopySpec) error {
	colRows, err := src.Query(ctx, `
		SELECT column_name, data_type
		FROM information_schema.columns
		WHERE table_schema = 'public'
		  AND table_name = $1
		  AND is_generated = 'NEVER'
		ORDER BY ordinal_position
	`, spec.table)
	if err != nil {
		return err
	}
	var cols []string
	var selectExprs []string
	for colRows.Next() {
		var c, dataType string
		if sErr := colRows.Scan(&c, &dataType); sErr != nil {
			colRows.Close()
			return sErr
		}
		cols = append(cols, c)
		quoted := pgx.Identifier{c}.Sanitize()
		// Preserve raw JSON text for json/jsonb columns so pgx.CopyFrom does not
		// send unquoted scalar strings back into jsonb columns.
		if dataType == "json" || dataType == "jsonb" {
			selectExprs = append(selectExprs, quoted+"::text")
		} else {
			selectExprs = append(selectExprs, quoted)
		}
	}
	colRows.Close()
	if len(cols) == 0 {
		return nil
	}

	query := fmt.Sprintf(`SELECT %s FROM %s`, strings.Join(selectExprs, ", "), pgx.Identifier{spec.table}.Sanitize())
	if spec.where != "" {
		query += " WHERE " + spec.where
	}
	if spec.order != "" {
		query += " ORDER BY " + spec.order
	}

	dataRows, err := src.Query(ctx, query)
	if err != nil {
		return err
	}
	var records [][]any
	for dataRows.Next() {
		vals, vErr := dataRows.Values()
		if vErr != nil {
			dataRows.Close()
			return vErr
		}
		records = append(records, vals)
	}
	dataRows.Close()
	if err := dataRows.Err(); err != nil {
		return err
	}
	if len(records) == 0 {
		return nil
	}

	_, err = tx.CopyFrom(ctx, pgx.Identifier{spec.table}, cols, pgx.CopyFromRows(records))
	return err
}
