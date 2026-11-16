package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"strings"
	"time"

	"github.com/enterprise-pos/backend/internal/config"
	"github.com/enterprise-pos/backend/internal/domain"
	dbinfra "github.com/enterprise-pos/backend/internal/infrastructure/db"
	"github.com/enterprise-pos/backend/internal/infrastructure/tenant"
	"github.com/enterprise-pos/backend/internal/repository/sqlc/db"
	"github.com/enterprise-pos/backend/internal/usecase"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
	"golang.org/x/crypto/bcrypt"
)

type mobileSKU struct {
	SKU           string
	Name          string
	CategorySlug  string
	BrandSlug     string
	Description   string
	ImageURL      string
	BasePrice     float64
	SalePrice     float64
	CostPrice     float64
	DiscountPct   float64
	ReorderPoint  float64
	ReorderQty    float64
	SerialIMEI    bool
	WarrantyTerms string
	VariantsJSON  string
	ModifiersJSON string
	UOMJSON       string
}

type batchTrack struct {
	ID           uuid.UUID
	BranchIdx    int
	ProductIdx   int
	UnitCost     decimal.Decimal
	RemainingQty decimal.Decimal
}

func main() {
	startTime := time.Now()
	cfg := config.Load()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	masterPool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect master db: %v", err)
	}
	defer masterPool.Close()

	if err := dbinfra.RunMigrations(ctx, masterPool, "./migrations"); err != nil {
		log.Fatalf("master migrations: %v", err)
	}

	log.Println("Step 1/5: Wiping all legacy tenant databases and old workspace records...")
	if err := wipeAllLegacyTenants(ctx, masterPool); err != nil {
		log.Fatalf("wipe legacy tenants: %v", err)
	}

	masterQueries := db.New(masterPool)
	masterAuth := usecase.NewAuthUsecase(masterQueries, nil, cfg.JWTSecret, cfg.PinTokenSecret)
	tenantMgr := tenant.NewTenantManager(
		masterPool,
		masterQueries,
		cfg.DatabaseURL,
		"./migrations",
		nil,
		nil,
		nil,
		cfg.JWTSecret,
		cfg.PinTokenSecret,
	)
	defer tenantMgr.CloseAll()

	adminAuditUC := usecase.NewAdminAuditUsecase(masterPool, masterQueries, nil, nil)
	adminAuditUC.SetProvisioner(tenantMgr)

	// Fetch active KOVA SuperAdmin identity for audit attribution
	rootAdmin, err := masterQueries.GetPlatformAdminByEmail(ctx, "admin@kovapos.com")
	if err != nil {
		log.Fatalf("missing admin@kovapos.com platform admin: %v", err)
	}
	actor := domain.PlatformAdminContext{
		TokenScope: "PLATFORM_ADMIN",
		AdminID:    rootAdmin.ID,
		Email:      rootAdmin.Email,
		FullName:   rootAdmin.FullName,
		Title:      rootAdmin.Title,
	}

	log.Println("Step 2/5: Provisioning fresh Mobile & Electronics company (Kova Mobile Hub)...")
	createdRes, err := adminAuditUC.CreateCompany(ctx, actor, usecase.CreateCompanyRequest{
		Slug:              "kova-mobile",
		Name:              "Kova Mobile Hub",
		TradeName:         "Kova Mobile Hub",
		LegalName:         "Kova Mobile Hub (Pvt) Ltd",
		IndustryProfile:   "mobile",
		BaseCurrency:      "LKR",
		DefaultLanguage:   "en",
		TaxRegistrationNo: "114892310-7000",
		PrimaryColorHex:   "#4F46E5",
		ApplySLTax:        true,
		BranchName:        "Colombo Flagship Tech Lounge",
		BranchCode:        "COL-01",
		CountryCode:       "LK",
		CountryName:       "Sri Lanka",
		City:              "Colombo",
		Address:           "42 Galle Road, Colombo 03",
		OwnerFullName:     "Kavinda Perera",
		OwnerEmail:        "owner@kovamobile.lk",
		OwnerPassword:     "Kova@2026!",
		SupervisorPIN:     "123456",
	})
	if err != nil {
		log.Fatalf("provision mobile company: %v", err)
	}
	compMeta := createdRes["company"].(map[string]any)
	bizID := compMeta["id"].(uuid.UUID)
	colBranchID := compMeta["branch_id"].(uuid.UUID)
	colTermID := compMeta["terminal_id"].(uuid.UUID)
	ownerUserID := compMeta["owner_user_id"].(uuid.UUID)

	bundle, err := tenantMgr.GetByBusinessID(ctx, bizID)
	if err != nil {
		log.Fatalf("resolve new tenant bundle: %v", err)
	}
	pool := bundle.Pool

	log.Println("Step 3/5: Seeding multi-branch stores, RBAC staff, suppliers, customers & 36 mobile products...")
	seedSummary, err := seedRichMobileStoreData(ctx, pool, bizID, colBranchID, colTermID, ownerUserID)
	if err != nil {
		log.Fatalf("seed mobile shop data: %v", err)
	}

	// Ensure Master audit trail reflects the clean Mobile Hub provisioning
	adminAuditUC.RecordEvent(ctx, usecase.AuditEventInput{
		BusinessID:  &bizID,
		CompanySlug: "kova-mobile",
		CompanyName: "Kova Mobile Hub",
		DBName:      "pos_tenant_kova_mobile",
		ActorEmail:  rootAdmin.Email,
		ActorName:   rootAdmin.FullName,
		ActorRole:   "KovaPlatformSuperAdmin",
		Module:      "PLATFORM",
		Action:      "MOBILE_STORE_SEEDED",
		EntityType:  "company",
		EntityID:    bizID.String(),
		Summary: fmt.Sprintf(
			"Provisioned fresh Mobile & Electronics dataset: %d products, %d customers, %d POs, %d invoices (2023-2027)",
			seedSummary.ProductCount, seedSummary.CustomerCount, seedSummary.POCount, seedSummary.InvoiceCount,
		),
		Status: "SUCCESS",
	})

	_ = masterAuth
	log.Printf(
		"Completed fresh Kova Mobile Hub provisioning in %s! (%d products, %d customers, %d suppliers, %d POs, %d GRNs, %d invoices, %d line items, %d GL journals)",
		time.Since(startTime).Round(time.Millisecond),
		seedSummary.ProductCount,
		seedSummary.CustomerCount,
		seedSummary.SupplierCount,
		seedSummary.POCount,
		seedSummary.GRNCount,
		seedSummary.InvoiceCount,
		seedSummary.InvoiceItemCount,
		seedSummary.JournalCount,
	)
}

func wipeAllLegacyTenants(ctx context.Context, masterPool *pgxpool.Pool) error {
	rows, err := masterPool.Query(ctx, `SELECT datname FROM pg_database WHERE datname LIKE 'pos_tenant_%'`)
	if err != nil {
		return err
	}
	var dbs []string
	for rows.Next() {
		var name string
		if sErr := rows.Scan(&name); sErr == nil {
			dbs = append(dbs, name)
		}
	}
	rows.Close()

	for _, dbName := range dbs {
		log.Printf("Dropping legacy tenant database %s...", dbName)
		if err := dbinfra.DropDatabase(ctx, masterPool, dbName); err != nil {
			return fmt.Errorf("drop %s: %w", dbName, err)
		}
	}

	cleanupSQL := []string{
		`TRUNCATE TABLE audit_logs, platform_companies, password_reset_tokens, user_sessions, system_notifications, warehouse_approval_logs, journal_lines, journal_entries, fiscal_periods, invoice_payments, sales_invoice_taxes, sales_invoice_items, sales_invoices, suspended_bill_items, suspended_bills, pos_shifts, stock_ledger_entries, stock_movements, inventory_batches, grn_items, goods_received_notes, purchase_invoices, purchase_order_items, purchase_orders, product_barcodes, products, categories, tax_rules, tax_groups, suppliers, customers, scoped_settings, print_templates, user_business_roles, designations, departments, terminals, warehouses, branches, chart_of_accounts, businesses, users RESTART IDENTITY CASCADE`,
	}
	for _, stmt := range cleanupSQL {
		if _, err := masterPool.Exec(ctx, stmt); err != nil {
			return fmt.Errorf("master cleanup (%s): %w", stmt, err)
		}
	}
	return nil
}

type mobileSeedSummary struct {
	ProductCount     int
	CustomerCount    int
	SupplierCount    int
	POCount          int
	GRNCount         int
	InvoiceCount     int
	InvoiceItemCount int
	JournalCount     int
}

func seedRichMobileStoreData(
	ctx context.Context,
	pool *pgxpool.Pool,
	bizID, colBranchID, colTermID, ownerUserID uuid.UUID,
) (*mobileSeedSummary, error) {
	rng := rand.New(rand.NewSource(20261116))
	summary := &mobileSeedSummary{}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Fetch existing tax groups, roles, COA accounts, departments, designations seeded by CreateCompany
	var stdTG, zeroTG uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT id FROM tax_groups WHERE business_id = $1 AND code = 'STD_DEFAULT'`, bizID).Scan(&stdTG); err != nil {
		return nil, fmt.Errorf("lookup STD_DEFAULT tax group: %w", err)
	}
	_ = tx.QueryRow(ctx, `SELECT id FROM tax_groups WHERE business_id = $1 AND code = 'ZERO_TAX'`, bizID).Scan(&zeroTG)

	// Tax rule IDs for invoice tax breakdowns (18% VAT + 2.5% SSCL)
	var vatRuleID, ssclRuleID uuid.UUID
	_ = tx.QueryRow(ctx, `SELECT id FROM tax_rules WHERE business_id = $1 AND code = 'SL_VAT_18' LIMIT 1`, bizID).Scan(&vatRuleID)
	_ = tx.QueryRow(ctx, `SELECT id FROM tax_rules WHERE business_id = $1 AND code = 'SL_SSCL_2_5' LIMIT 1`, bizID).Scan(&ssclRuleID)

	coa := make(map[string]uuid.UUID)
	coaRows, err := tx.Query(ctx, `SELECT code, id FROM chart_of_accounts WHERE business_id = $1`, bizID)
	if err != nil {
		return nil, err
	}
	for coaRows.Next() {
		var code string
		var id uuid.UUID
		if sErr := coaRows.Scan(&code, &id); sErr == nil {
			coa[code] = id
		}
	}
	coaRows.Close()

	roleIDs := make(map[string]uuid.UUID)
	rRows, _ := tx.Query(ctx, `SELECT code, id FROM roles`)
	for rRows.Next() {
		var code string
		var id uuid.UUID
		if sErr := rRows.Scan(&code, &id); sErr == nil {
			roleIDs[code] = id
		}
	}
	rRows.Close()

	desigIDs := make(map[string]uuid.UUID)
	dRows, _ := tx.Query(ctx, `SELECT code, id FROM designations WHERE business_id = $1`, bizID)
	for dRows.Next() {
		var code string
		var id uuid.UUID
		if sErr := dRows.Scan(&code, &id); sErr == nil {
			desigIDs[code] = id
		}
	}
	dRows.Close()

	// Add 2 extra branches + warehouses + terminals (Total 3 branches, 4 terminals)
	var kndBranchID, galBranchID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO branches (business_id, code, name, country_code, country_name, city, address, is_warehouse, is_active)
		VALUES ($1, 'KND-02', 'Kandy City Tech Lounge', 'LK', 'Sri Lanka', 'Kandy', '18 Dalada Veediya, Kandy', TRUE, TRUE)
		RETURNING id
	`, bizID).Scan(&kndBranchID); err != nil {
		return nil, err
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO branches (business_id, code, name, country_code, country_name, city, address, is_warehouse, is_active)
		VALUES ($1, 'GAL-03', 'Galle Fort Mobile Hub', 'LK', 'Sri Lanka', 'Galle', '74 Wakwella Rd, Galle', TRUE, TRUE)
		RETURNING id
	`, bizID).Scan(&galBranchID); err != nil {
		return nil, err
	}
	for _, wb := range []struct {
		br   uuid.UUID
		code string
		name string
	}{
		{kndBranchID, "KND-02-WH", "Kandy City Tech Warehouse"},
		{galBranchID, "GAL-03-WH", "Galle Fort Hub Warehouse"},
	} {
		if _, err := tx.Exec(ctx, `
			INSERT INTO warehouses (business_id, branch_id, code, name, is_active)
			VALUES ($1, $2, $3, $4, TRUE)
		`, bizID, wb.br, wb.code, wb.name); err != nil {
			return nil, err
		}
	}

	var kndTerm1, kndTerm2, galTerm1 uuid.UUID
	_ = tx.QueryRow(ctx, `INSERT INTO terminals (business_id, branch_id, code, name, hardware_serial, is_active) VALUES ($1, $2, 'POS-02', 'Kandy Express #02', 'KOVA-MOB-KND-02', TRUE) RETURNING id`, bizID, kndBranchID).Scan(&kndTerm1)
	_ = tx.QueryRow(ctx, `INSERT INTO terminals (business_id, branch_id, code, name, hardware_serial, is_active) VALUES ($1, $2, 'POS-03', 'Kandy Warranty Desk #03', 'KOVA-MOB-KND-03', TRUE) RETURNING id`, bizID, kndBranchID).Scan(&kndTerm2)
	_ = tx.QueryRow(ctx, `INSERT INTO terminals (business_id, branch_id, code, name, hardware_serial, is_active) VALUES ($1, $2, 'POS-04', 'Galle Counter #04', 'KOVA-MOB-GAL-04', TRUE) RETURNING id`, bizID, galBranchID).Scan(&galTerm1)

	branches := []uuid.UUID{colBranchID, kndBranchID, galBranchID}
	terminals := []uuid.UUID{colTermID, kndTerm1, kndTerm2, galTerm1}

	// Seed 5 additional RBAC staff logins cleanly
	pwHash, _ := bcrypt.GenerateFromPassword([]byte("Kova@2026!"), bcrypt.DefaultCost)
	pinHash, _ := bcrypt.GenerateFromPassword([]byte("123456"), bcrypt.DefaultCost)

	staffSeeds := []struct {
		email     string
		name      string
		role      string
		desig     string
		branchID  *uuid.UUID
		pin       string
		avatarURL string
	}{
		{"manager@kovamobile.lk", "Nimali Silva", "BranchManager", "MGR", &colBranchID, string(pinHash), "/avatars/alia.svg"},
		{"specialist@kovamobile.lk", "Kasun Fernando", "BranchManager", "SPECIALIST", &kndBranchID, string(pinHash), "/avatars/marcus.svg"},
		{"cashier@kovamobile.lk", "Dinithi Jayawardena", "Cashier", "CASHIER", &colBranchID, "", "/avatars/maya.svg"},
		{"accountant@kovamobile.lk", "Rohan Wickramasinghe", "Accountant", "ACCT", &colBranchID, "", "/avatars/julian.svg"},
		{"inventory@kovamobile.lk", "Tharindu Bandara", "InventoryController", "INV", &colBranchID, "", "/avatars/liam.svg"},
	}

	staffIDs := []uuid.UUID{ownerUserID}
	var accountantID uuid.UUID
	for _, s := range staffSeeds {
		var uid uuid.UUID
		if err := tx.QueryRow(ctx, `
			INSERT INTO users (email, full_name, password_hash, avatar_url, is_active)
			VALUES ($1, $2, $3, $4, TRUE)
			RETURNING id
		`, s.email, s.name, string(pwHash), s.avatarURL).Scan(&uid); err != nil {
			return nil, fmt.Errorf("insert user %s: %w", s.email, err)
		}
		var brNull uuid.NullUUID
		allowedBranches := []uuid.UUID{}
		allowedTerms := []uuid.UUID{}
		allBranchesAccess := false
		if s.branchID != nil {
			brNull = uuid.NullUUID{UUID: *s.branchID, Valid: true}
			allowedBranches = []uuid.UUID{*s.branchID}
		}
		if s.email == "manager@kovamobile.lk" {
			// Store & Warranty Manager manages Colombo + Kandy branches and their POS registers
			allowedBranches = []uuid.UUID{colBranchID, kndBranchID}
			allowedTerms = []uuid.UUID{colTermID, kndTerm1, kndTerm2}
		} else if s.email == "accountant@kovamobile.lk" {
			// Senior Accountant audits across all company branches
			allBranchesAccess = true
			allowedBranches = []uuid.UUID{colBranchID, kndBranchID, galBranchID}
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO user_business_roles (
				user_id, business_id, branch_id, role_id, designation_id, supervisor_pin_hash, is_active,
				all_branches_access, allowed_branch_ids, allowed_terminal_ids
			)
			VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $9)
		`, uid, bizID, brNull, roleIDs[s.role], desigIDs[s.desig], s.pin, allBranchesAccess, allowedBranches, allowedTerms); err != nil {
			return nil, fmt.Errorf("assign role %s: %w", s.email, err)
		}
		staffIDs = append(staffIDs, uid)
		if s.role == "Accountant" {
			accountantID = uid
		}
	}

	// Ensure 6 well-structured categories (reuse the 2 created by CreateCompany + 4 more)
	catBySlug := make(map[string]uuid.UUID)
	catRows, _ := tx.Query(ctx, `SELECT slug, id FROM categories WHERE business_id = $1`, bizID)
	for catRows.Next() {
		var sl string
		var id uuid.UUID
		if catRows.Scan(&sl, &id) == nil {
			catBySlug[sl] = id
		}
	}
	catRows.Close()

	// Upgrade initial starter categories to Mobile & Electronics segments
	_, _ = tx.Exec(ctx, `UPDATE categories SET gender_segment = 'Devices & Handsets' WHERE business_id = $1 AND slug = 'smartphones'`, bizID)
	_, _ = tx.Exec(ctx, `UPDATE categories SET gender_segment = 'Power & Accessories' WHERE business_id = $1 AND slug = 'mobile-accessories'`, bizID)

	extraCats := []struct {
		name    string
		slug    string
		segment string
	}{
		{"Tablets & Foldables", "tablets-foldables", "Devices & Handsets"},
		{"Audio & Wearables", "audio-wearables", "Audio & Wearables"},
		{"Power, Chargers & Cables", "power-chargers", "Power & Accessories"},
		{"Cases & Screen Armor", "cases-armor", "Power & Accessories"},
		{"5G Networking & Storage", "networking-storage", "Networking & Services"},
	}
	for _, c := range extraCats {
		if _, ok := catBySlug[c.slug]; ok {
			continue
		}
		var cid uuid.UUID
		if err := tx.QueryRow(ctx, `
			INSERT INTO categories (business_id, tax_group_id, name, slug, gender_segment)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING id
		`, bizID, stdTG, c.name, c.slug, c.segment).Scan(&cid); err != nil {
			return nil, err
		}
		catBySlug[c.slug] = cid
	}

	// Fallback alias to smartphones category
	smartphonesCat := catBySlug["smartphones"]
	if smartphonesCat == uuid.Nil {
		for _, id := range catBySlug {
			smartphonesCat = id
			break
		}
	}

	resolveCat := func(slug string) uuid.UUID {
		if id, ok := catBySlug[slug]; ok && id != uuid.Nil {
			return id
		}
		return smartphonesCat
	}

	// Ensure all 16 Mobile & Electronics starter brands exist cleanly in brands table
	txQueries := db.New(tx)
	if err := usecase.EnsureIndustryBrands(ctx, txQueries, bizID, "mobile"); err != nil {
		return nil, err
	}
	brandBySlug := make(map[string]uuid.UUID)
	brQRows, _ := tx.Query(ctx, `SELECT slug, id FROM brands WHERE business_id = $1`, bizID)
	for brQRows.Next() {
		var sl string
		var id uuid.UUID
		if brQRows.Scan(&sl, &id) == nil {
			brandBySlug[sl] = id
		}
	}
	brQRows.Close()

	resolveBrand := func(slug string) uuid.NullUUID {
		if id, ok := brandBySlug[slug]; ok && id != uuid.Nil {
			return uuid.NullUUID{UUID: id, Valid: true}
		}
		return uuid.NullUUID{}
	}

	// 40 Realistic Mobile & Electronics Products with genuine product photography + Brand links
	skus := buildMobileCatalogSKUs()
	type prodRecord struct {
		ID   uuid.UUID
		Meta mobileSKU
	}
	products := make([]prodRecord, 0, len(skus))

	for idx, item := range skus {
		var pid uuid.UUID
		variants := item.VariantsJSON
		if variants == "" {
			variants = "[]"
		}
		mods := item.ModifiersJSON
		if mods == "" {
			mods = "[]"
		}
		uoms := item.UOMJSON
		if uoms == "" {
			uoms = "[]"
		}
		if err := tx.QueryRow(ctx, `
			INSERT INTO products (
				business_id, category_id, brand_id, tax_group_id, sku, name, description, image_url,
				unit_of_measure, base_price, sale_price, discount_percent, reorder_point, reorder_qty,
				track_expiry, enable_serial_tracking, variants_json, modifiers_json, uom_options_json,
				warranty_terms, is_active, created_at
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8,
				'PCS', $9, $10, $11, $12, $13,
				FALSE, $14, $15::jsonb, $16::jsonb, $17::jsonb,
				$18, TRUE, '2023-01-01T08:00:00Z'::timestamptz
			)
			RETURNING id
		`,
			bizID, resolveCat(item.CategorySlug), resolveBrand(item.BrandSlug), stdTG, item.SKU, item.Name, item.Description, item.ImageURL,
			decimal.NewFromFloat(item.BasePrice), decimal.NewFromFloat(item.SalePrice), decimal.NewFromFloat(item.DiscountPct),
			decimal.NewFromFloat(item.ReorderPoint), decimal.NewFromFloat(item.ReorderQty),
			item.SerialIMEI, variants, mods, uoms, item.WarrantyTerms,
		).Scan(&pid); err != nil {
			return nil, fmt.Errorf("insert product %s: %w", item.SKU, err)
		}

		barcode := fmt.Sprintf("8901900%06d", idx+101)
		if _, err := tx.Exec(ctx, `
			INSERT INTO product_barcodes (business_id, product_id, barcode, is_primary)
			VALUES ($1, $2, $3, TRUE)
		`, bizID, pid, barcode); err != nil {
			return nil, err
		}
		products = append(products, prodRecord{ID: pid, Meta: item})
	}
	summary.ProductCount = len(products)

	// 18 Mobile & Tech Suppliers
	supplierNames := []struct{ code, name, city string }{
		{"SUP-AAPL", "Apple Asia Authorized Distribution", "Singapore"},
		{"SUP-SAMS", "Samsung Mobile Lanka Imports", "Colombo"},
		{"SUP-ANKR", "Anker Innovations APAC", "Shenzhen"},
		{"SUP-SONY", "Sony Personal Audio Supply", "Tokyo"},
		{"SUP-GOOG", "Google Pixel Hardware Channel", "Singapore"},
		{"SUP-XIAI", "Xiaomi Global Ecosystem", "Colombo"},
		{"SUP-ONEP", "OnePlus Mobile Direct", "Bengaluru"},
		{"SUP-SPIG", "Spigen Armor & Cases Corp", "Seoul"},
		{"SUP-BELK", "Belkin Connected Hardware", "Hong Kong"},
		{"SUP-SAND", "SanDisk / WD Flash Storage", "Penang"},
		{"SUP-GARM", "Garmin Smart Wearables LK", "Colombo"},
		{"SUP-UGRE", "Ugreen GaN Power Supply", "Shenzhen"},
		{"SUP-TPLK", "TP-Link / Omada 5G Networks", "Colombo"},
		{"SUP-ZAGG", "Zagg InvisibleShield Armor", "Dubai"},
		{"SUP-BASE", "Baseus Smart Accessories", "Guangzhou"},
		{"SUP-JBLH", "Harman / JBL Audio Lanka", "Colombo"},
		{"SUP-KEYC", "Keychron & Tech Docks", "Taipei"},
		{"SUP-KOVV", "Kova Certified Pre-Owned Vault", "Colombo"},
	}
	supplierIDs := make([]uuid.UUID, 0, len(supplierNames))
	for idx, sup := range supplierNames {
		var sid uuid.UUID
		if err := tx.QueryRow(ctx, `
			INSERT INTO suppliers (business_id, code, name, email, phone, tax_id, payment_terms_days)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			RETURNING id
		`,
			bizID, sup.code, sup.name,
			fmt.Sprintf("orders+%s@supply.kovamobile.lk", strings.ToLower(strings.TrimPrefix(sup.code, "SUP-"))),
			fmt.Sprintf("+94112%06d", 500100+idx),
			fmt.Sprintf("TIN-%08d", 99100000+idx),
			30,
		).Scan(&sid); err != nil {
			return nil, err
		}
		supplierIDs = append(supplierIDs, sid)
	}
	summary.SupplierCount = len(supplierIDs)

	// 180 Customers (1 existing Walk-in + 179 realistic retail/enterprise customers across tiers)
	var walkInID uuid.UUID
	_ = tx.QueryRow(ctx, `SELECT id FROM customers WHERE business_id = $1 AND is_walk_in = TRUE LIMIT 1`, bizID).Scan(&walkInID)
	customerIDs := []uuid.UUID{walkInID}

	firstNames := []string{"Amaya", "Kasun", "Dulani", "Thilina", "Nethmi", "Sahan", "Ishara", "Pasindu", "Chathura", "Ravindu", "Malith", "Hashini", "Devinda", "Dilshan", "Kavisha", "Nimasha", "Sachin", "Anushka", "Oshadi", "Yohan"}
	lastNames := []string{"Perera", "Fernando", "Silva", "Jayawardena", "Rajapaksa", "Dissanayake", "Senanayake", "Gunawardena", "Wickramasinghe", "Herath", "Bandara", "Karunaratne", "Samaraweera", "Ratnayake", "Mendis", "De Alwis", "Wijesinghe", "Alahakoon"}
	tiers := []string{"Bronze", "Silver", "Gold", "Standard"}
	avatars := []string{"/avatars/alia.svg", "/avatars/austin.svg", "/avatars/elena.svg", "/avatars/kobi.svg", "/avatars/millie.svg"}

	for i := 1; i <= 179; i++ {
		fn := firstNames[i%len(firstNames)]
		ln := lastNames[(i*3)%len(lastNames)]
		fullName := fmt.Sprintf("%s %s", fn, ln)
		if i%12 == 0 {
			fullName = fmt.Sprintf("%s Tech Enterprises #%d", ln, i/12)
		}
		tier := tiers[i%len(tiers)]
		creditEnabled := i%5 == 0 || tier == "Gold"
		creditLimit := decimal.Zero
		if creditEnabled {
			creditLimit = decimal.NewFromInt(int64(250000 + (i%6)*150000))
		}
		createdAt := time.Date(2023, 1, 2, 9, 0, 0, 0, time.UTC).Add(time.Duration(i*7) * 24 * time.Hour)
		if createdAt.After(time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)) {
			createdAt = time.Date(2026, 10, 15, 10, 0, 0, 0, time.UTC)
		}
		var cid uuid.UUID
		if err := tx.QueryRow(ctx, `
			INSERT INTO customers (business_id, name, email, phone, tier, loyalty_points, avatar_url, credit_enabled, credit_limit, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			RETURNING id
		`,
			bizID, fullName,
			fmt.Sprintf("%s.%s.%d@mail.lk", strings.ToLower(fn), strings.ToLower(strings.ReplaceAll(ln, " ", "")), i),
			fmt.Sprintf("+9477%07d", 1000000+i*137),
			tier, 150+(i*45)%4500, avatars[i%len(avatars)],
			creditEnabled, creditLimit, createdAt,
		).Scan(&cid); err != nil {
			return nil, err
		}
		customerIDs = append(customerIDs, cid)
	}
	summary.CustomerCount = len(customerIDs)

	// Ensure Fiscal Periods cover ALL quarters from 2023-Q1 through 2027-Q4 (20 quarters total, unlocked during seeding!)
	fpByKey := make(map[string]uuid.UUID)
	fpRows, _ := tx.Query(ctx, `SELECT period_name, id FROM fiscal_periods WHERE business_id = $1`, bizID)
	for fpRows.Next() {
		var pname string
		var id uuid.UUID
		if fpRows.Scan(&pname, &id) == nil {
			fpByKey[pname] = id
		}
	}
	fpRows.Close()

	for yr := 2023; yr <= 2027; yr++ {
		qDefs := []struct {
			name  string
			start string
			end   string
		}{
			{fmt.Sprintf("FY%d-Q1", yr), fmt.Sprintf("%d-01-01", yr), fmt.Sprintf("%d-03-31", yr)},
			{fmt.Sprintf("FY%d-Q2", yr), fmt.Sprintf("%d-04-01", yr), fmt.Sprintf("%d-06-30", yr)},
			{fmt.Sprintf("FY%d-Q3", yr), fmt.Sprintf("%d-07-01", yr), fmt.Sprintf("%d-09-30", yr)},
			{fmt.Sprintf("FY%d-Q4", yr), fmt.Sprintf("%d-10-01", yr), fmt.Sprintf("%d-12-31", yr)},
		}
		for _, q := range qDefs {
			if _, exists := fpByKey[q.name]; exists {
				continue
			}
			var fpid uuid.UUID
			if err := tx.QueryRow(ctx, `
				INSERT INTO fiscal_periods (business_id, period_name, start_date, end_date, is_locked)
				VALUES ($1, $2, $3::DATE, $4::DATE, FALSE)
				RETURNING id
			`, bizID, q.name, q.start, q.end).Scan(&fpid); err != nil {
				return nil, err
			}
			fpByKey[q.name] = fpid
		}
	}

	fiscalForTime := func(t time.Time) uuid.UUID {
		q := ((int(t.Month()) - 1) / 3) + 1
		key := fmt.Sprintf("FY%d-Q%d", t.Year(), q)
		if id, ok := fpByKey[key]; ok {
			return id
		}
		return fpByKey["FY2026-Q4"]
	}

	// Seed 3 crisp Print Templates (A4_INVOICE, THERMAL_80MM, THERMAL_58MM) for Kova Mobile Hub
	if err := seedDefaultPrintTemplates(ctx, tx, bizID, ownerUserID); err != nil {
		return nil, fmt.Errorf("seed print templates: %w", err)
	}

	// Commit baseline entities first so master setup + products + periods are visible immediately
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	// Step 4/5: Procurement (84 Approved GRNs spanning 2023-2026 + 12 Future Scheduled 2027 POs)
	log.Println("Step 4/5: Seeding 2023-2027 Purchase Orders, GRNs, FIFO batches & balanced GL entries...")
	batchesByBrProd := make(map[string][]*batchTrack)
	allBatches := make([]*batchTrack, 0, 500)
	journalSeq := 1

	procTx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = procTx.Rollback(ctx) }()

	grnDates := make([]time.Time, 0, 84)
	for m := 0; m < 47; m++ {
		d1 := time.Date(2023, 1, 3, 10, 0, 0, 0, time.UTC).AddDate(0, m, 0)
		grnDates = append(grnDates, d1)
		if m%2 == 0 {
			grnDates = append(grnDates, d1.AddDate(0, 0, 14))
		}
	}
	for grnIdx, grnDate := range grnDates {
		brIdx := grnIdx % len(branches)
		brID := branches[brIdx]
		supID := supplierIDs[grnIdx%len(supplierIDs)]
		actorID := staffIDs[grnIdx%len(staffIDs)]
		poNum := fmt.Sprintf("PO-%d-%04d", grnDate.Year(), grnIdx+1)
		grnNum := fmt.Sprintf("GRN-%d-%04d", grnDate.Year(), grnIdx+1)

		// Each GRN stocks 5–6 SKUs generously so FIFO depth covers 1,240+ invoices plus future stock
		startProd := (grnIdx * 4) % len(products)
		lineCount := 6
		poTotal := decimal.Zero

		var poID uuid.UUID
		if err := procTx.QueryRow(ctx, `
			INSERT INTO purchase_orders (business_id, branch_id, supplier_id, po_number, status, expected_date, total_amount, notes, created_by, created_at)
			VALUES ($1, $2, $3, $4, 'RECEIVED', $5::DATE, 0, 'Authorized Mobile Hub Stock Intake', $6, $7)
			RETURNING id
		`, bizID, brID, supID, poNum, grnDate.Format("2006-01-02"), actorID, grnDate).Scan(&poID); err != nil {
			return nil, err
		}
		summary.POCount++

		var grnID uuid.UUID
		if err := procTx.QueryRow(ctx, `
			INSERT INTO goods_received_notes (business_id, branch_id, po_id, supplier_id, grn_number, supplier_invoice_no, attachment_name, status, total_cost, received_by, approved_by, approved_at, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, 'APPROVED', 0, $8, $9, $10, $10)
			RETURNING id
		`, bizID, brID, poID, supID, grnNum, fmt.Sprintf("VINV-%05d", 1000+grnIdx), fmt.Sprintf("%s_packing.pdf", grnNum), actorID, ownerUserID, grnDate).Scan(&grnID); err != nil {
			return nil, err
		}
		summary.GRNCount++

		for li := 0; li < lineCount; li++ {
			pIdx := (startProd + li) % len(products)
			prod := products[pIdx]
			qty := decimal.NewFromInt(38)
			if !prod.Meta.SerialIMEI {
				qty = decimal.NewFromInt(90)
			}
			// Keep 2 slow/low-stock accessories lower for Auto-PO demo visibility on late batches
			if pIdx == 31 && grnIdx > len(grnDates)-3 {
				qty = decimal.NewFromInt(6)
			}
			unitCost := decimal.NewFromFloat(prod.Meta.CostPrice).Round(4)
			lineTotal := qty.Mul(unitCost).Round(4)
			poTotal = poTotal.Add(lineTotal)

			_, _ = procTx.Exec(ctx, `
				INSERT INTO purchase_order_items (business_id, po_id, product_id, ordered_qty, received_qty, unit_cost)
				VALUES ($1, $2, $3, $4, $4, $5)
			`, bizID, poID, prod.ID, qty, unitCost)

			batchNum := fmt.Sprintf("BAT-%d-%02d-%03d", grnDate.Year(), grnDate.Month(), pIdx+1)
			var expDate any = nil
			if prod.Meta.SerialIMEI {
				// Warranty support / hardware recall window into future 2027-2028
				expDate = grnDate.AddDate(2, 0, 0).Format("2006-01-02")
			}
			var grnItemID uuid.UUID
			if err := procTx.QueryRow(ctx, `
				INSERT INTO grn_items (business_id, grn_id, product_id, batch_number, expiry_date, qty_received, unit_cost, line_total)
				VALUES ($1, $2, $3, $4, $5::DATE, $6, $7, $8)
				RETURNING id
			`, bizID, grnID, prod.ID, batchNum, expDate, qty, unitCost, lineTotal).Scan(&grnItemID); err != nil {
				return nil, err
			}

			var batchID uuid.UUID
			if err := procTx.QueryRow(ctx, `
				INSERT INTO inventory_batches (business_id, branch_id, product_id, grn_item_id, batch_number, received_at, expiry_date, unit_cost, initial_qty, remaining_qty, created_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7::DATE, $8, $9, $9, $6)
				RETURNING id
			`, bizID, brID, prod.ID, grnItemID, batchNum, grnDate, expDate, unitCost, qty).Scan(&batchID); err != nil {
				return nil, err
			}

			bt := &batchTrack{ID: batchID, BranchIdx: brIdx, ProductIdx: pIdx, UnitCost: unitCost, RemainingQty: qty}
			allBatches = append(allBatches, bt)
			k := fmt.Sprintf("%d:%d", brIdx, pIdx)
			batchesByBrProd[k] = append(batchesByBrProd[k], bt)

			_, _ = procTx.Exec(ctx, `
				INSERT INTO stock_movements (business_id, branch_id, product_id, batch_id, movement_type, qty_delta, unit_cost, reference_type, reference_id, created_by, created_at)
				VALUES ($1, $2, $3, $4, 'IN_GRN', $5, $6, 'GRN', $7, $8, $9)
			`, bizID, brID, prod.ID, batchID, qty, unitCost, grnID, actorID, grnDate)
		}

		_, _ = procTx.Exec(ctx, `UPDATE purchase_orders SET total_amount = $1 WHERE id = $2`, poTotal, poID)
		_, _ = procTx.Exec(ctx, `UPDATE goods_received_notes SET total_cost = $1 WHERE id = $2`, poTotal, grnID)
		_, _ = procTx.Exec(ctx, `
			INSERT INTO purchase_invoices (business_id, branch_id, po_id, supplier_id, invoice_number, status, subtotal, tax_total, grand_total, due_date, auto_generated, notes, created_at)
			VALUES ($1, $2, $3, $4, $5, 'PAID', $6, 0, $6, $7::DATE, FALSE, 'Supplier Tax Invoice Settled', $8)
		`, bizID, brID, poID, supID, fmt.Sprintf("PINV-%05d", grnIdx+1), poTotal, grnDate.AddDate(0, 0, 30).Format("2006-01-02"), grnDate)
		_, _ = procTx.Exec(ctx, `
			INSERT INTO warehouse_approval_logs (business_id, document_type, document_id, action, actor_user_id, notes, created_at)
			VALUES ($1, 'GRN', $2, 'APPROVED', $3, 'Verified IMEI manifest & approved FIFO receipt', $4)
		`, bizID, grnID, ownerUserID, grnDate)

		// Balanced Double-Entry GL for GRN Inventory Intake (Debit 1200 Inventory = Credit 2000 AP)
		if poTotal.GreaterThan(decimal.Zero) {
			var jeID uuid.UUID
			jeNum := fmt.Sprintf("JE-GRN-%05d", journalSeq)
			journalSeq++
			if err := procTx.QueryRow(ctx, `
				INSERT INTO journal_entries (business_id, branch_id, fiscal_period_id, entry_number, source_type, source_id, description, entry_date, posted_by, created_at)
				VALUES ($1, $2, $3, $4, 'GRN_APPROVAL', $5, $6, $7::DATE, $8, $9)
				RETURNING id
			`, bizID, brID, fiscalForTime(grnDate), jeNum, grnID, "FIFO Inventory Intake "+grnNum, grnDate.Format("2006-01-02"), ownerUserID, grnDate).Scan(&jeID); err != nil {
				return nil, err
			}
			if _, err := procTx.Exec(ctx, `
				INSERT INTO journal_lines (business_id, journal_entry_id, account_id, debit, credit, memo)
				VALUES
					($1, $2, $3, $4, 0, 'FIFO Asset Increase'),
					($1, $2, $5, 0, $4, 'Supplier Payable')
			`, bizID, jeID, coa["1200"], poTotal, coa["2000"]); err != nil {
				return nil, err
			}
			summary.JournalCount++
		}
	}

	// Add 12 Future Scheduled / Submitted Purchase Orders for late 2026 & 2027 supply planning
	for fpIdx := 0; fpIdx < 12; fpIdx++ {
		brID := branches[fpIdx%len(branches)]
		supID := supplierIDs[(fpIdx*3)%len(supplierIDs)]
		expDate := time.Date(2026, 12, 5, 10, 0, 0, 0, time.UTC).AddDate(0, fpIdx/2, (fpIdx%2)*14)
		pIdx := fpIdx % len(products)
		prod := products[pIdx]
		qty := decimal.NewFromInt(20)
		unitCost := decimal.NewFromFloat(prod.Meta.CostPrice).Round(4)
		totalAmt := qty.Mul(unitCost).Round(4)

		var poID uuid.UUID
		if err := procTx.QueryRow(ctx, `
			INSERT INTO purchase_orders (business_id, branch_id, supplier_id, po_number, status, expected_date, total_amount, auto_generated, notes, created_by, created_at)
			VALUES ($1, $2, $3, $4, $5, $6::DATE, $7, $8, 'Scheduled Future Preorder Allocation 2027', $9, NOW())
			RETURNING id
		`,
			bizID, brID, supID,
			fmt.Sprintf("PO-FUT-%04d", fpIdx+1),
			map[bool]string{true: "SUBMITTED", false: "DRAFT"}[fpIdx%2 == 0],
			expDate.Format("2006-01-02"), totalAmt, fpIdx%3 == 0, ownerUserID,
		).Scan(&poID); err != nil {
			return nil, err
		}
		_, _ = procTx.Exec(ctx, `
			INSERT INTO purchase_order_items (business_id, po_id, product_id, ordered_qty, received_qty, unit_cost)
			VALUES ($1, $2, $3, $4, 0, $5)
		`, bizID, poID, prod.ID, qty, unitCost)
		summary.POCount++
	}

	if err := procTx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit procurement tx: %w", err)
	}

	// Step 5/5: 1,240 Multi-Year Sales Invoices (2023-01-05 -> 2027-06-28) + Line Items + Taxes + Payments + Balanced GL Journals!
	log.Println("Step 5/5: Seeding 1,240 multi-year sales invoices (2023 -> 2027), IMEI lines & GL journals...")
	vatRate := decimal.NewFromFloat(0.18)
	ssclRate := decimal.NewFromFloat(0.025)
	payMethods := []string{"CARD", "CASH", "MOBILE_WALLET", "SPLIT"}
	shiftIDs := make([]uuid.UUID, 0, 48)

	// Open 1 live POS shift + 45 historical closed shifts
	shiftTx, _ := pool.Begin(ctx)
	for sIdx := 0; sIdx < 46; sIdx++ {
		var shID uuid.UUID
		brID := branches[sIdx%len(branches)]
		termID := terminals[sIdx%len(terminals)]
		cashierID := staffIDs[sIdx%len(staffIDs)]
		openedAt := time.Date(2023, 1, 5, 8, 30, 0, 0, time.UTC).AddDate(0, sIdx, 0)
		status := "CLOSED"
		var closedAt any = openedAt.Add(11 * time.Hour)
		closingCash := decimal.NewFromInt(int64(185000 + (sIdx%7)*45000))
		if sIdx == 45 {
			status = "OPEN"
			openedAt = time.Now().UTC().Add(-2 * time.Hour)
			closedAt = nil
			closingCash = decimal.Zero
		}
		_ = shiftTx.QueryRow(ctx, `
			INSERT INTO pos_shifts (business_id, branch_id, terminal_id, cashier_user_id, opened_at, closed_at, opening_float, closing_cash, status)
			VALUES ($1, $2, $3, $4, $5, $6, 25000.0000, $7, $8)
			RETURNING id
		`, bizID, brID, termID, cashierID, openedAt, closedAt, closingCash, status).Scan(&shID)
		shiftIDs = append(shiftIDs, shID)
	}
	_ = shiftTx.Commit(ctx)

	const totalInvoices = 1240
	const batchSize = 100
	baseStart := time.Date(2023, 1, 5, 9, 15, 0, 0, time.UTC)
	futureThreshold := time.Date(2026, 11, 16, 0, 0, 0, 0, time.UTC)

	for chunkStart := 0; chunkStart < totalInvoices; chunkStart += batchSize {
		invTx, err := pool.Begin(ctx)
		if err != nil {
			return nil, err
		}

		chunkEnd := chunkStart + batchSize
		if chunkEnd > totalInvoices {
			chunkEnd = totalInvoices
		}

		for invIdx := chunkStart; invIdx < chunkEnd; invIdx++ {
			// Spread 1,190 invoices cleanly across 2023-01-05 -> 2026-11-15 (~1.18 days/invoice)
			// Spread final 50 invoices across 2026-11-17 -> 2027-06-30 (Future preorders & annual service contracts)
			var invDate time.Time
			if invIdx < 1190 {
				invDate = baseStart.Add(time.Duration(invIdx) * 28 * time.Hour).Add(time.Duration(rng.Intn(8)) * time.Hour)
			} else {
				offsetDays := (invIdx - 1190) * 4
				invDate = futureThreshold.AddDate(0, 0, 2+offsetDays).Add(time.Duration(10+rng.Intn(7)) * time.Hour)
			}

			brIdx := invIdx % len(branches)
			brID := branches[brIdx]
			termID := terminals[invIdx%len(terminals)]
			cashierID := staffIDs[invIdx%len(staffIDs)]
			custID := customerIDs[invIdx%len(customerIDs)]
			shiftID := shiftIDs[invIdx%len(shiftIDs)]
			invNum := fmt.Sprintf("INV-KM-%d-%05d", invDate.Year(), invIdx+1)

			// 2–3 line items per invoice (first item prioritizes phones/devices, others accessories)
			numItems := 2 + (invIdx % 2)
			subtotal := decimal.Zero
			discountTotal := decimal.Zero
			totalCOGS := decimal.Zero

			type pendingLine struct {
				prod     prodRecord
				qty      decimal.Decimal
				price    decimal.Decimal
				disc     decimal.Decimal
				tax      decimal.Decimal
				total    decimal.Decimal
				cogs     decimal.Decimal
				metaJSON string
			}
			lines := make([]pendingLine, 0, numItems)

			type pendingMove struct {
				prodID   uuid.UUID
				batchID  uuid.UUID
				qtyDelta decimal.Decimal
				unitCost decimal.Decimal
			}
			moves := make([]pendingMove, 0, numItems)

			for li := 0; li < numItems; li++ {
				pIdx := (invIdx*3 + li*7) % len(products)
				if pIdx == 31 {
					pIdx = 30 // leave SKU 31 near low-stock threshold
				}
				prod := products[pIdx]
				qty := decimal.NewFromInt(1)
				if !prod.Meta.SerialIMEI && li > 0 {
					qty = decimal.NewFromInt(int64(1 + (invIdx % 2)))
				}

				k := fmt.Sprintf("%d:%d", brIdx, pIdx)
				cands := batchesByBrProd[k]
				if len(cands) == 0 {
					// fallback to Colombo branch batch if specific branch batch absent
					cands = batchesByBrProd[fmt.Sprintf("0:%d", pIdx)]
				}
				var matchedBatch *batchTrack
				for _, bt := range cands {
					if bt.RemainingQty.GreaterThanOrEqual(qty) {
						matchedBatch = bt
						break
					}
				}
				unitCost := decimal.NewFromFloat(prod.Meta.CostPrice).Round(4)
				if matchedBatch != nil {
					matchedBatch.RemainingQty = matchedBatch.RemainingQty.Sub(qty)
					unitCost = matchedBatch.UnitCost
					moves = append(moves, pendingMove{
						prodID:   prod.ID,
						batchID:  matchedBatch.ID,
						qtyDelta: qty.Neg(),
						unitCost: unitCost,
					})
				}

				unitPrice := decimal.NewFromFloat(prod.Meta.SalePrice).Round(4)
				gross := unitPrice.Mul(qty).Round(4)
				discAmt := decimal.Zero
				if invIdx%6 == 0 {
					discAmt = gross.Mul(decimal.NewFromFloat(0.05)).Round(4)
				}
				netLine := gross.Sub(discAmt)
				cogs := unitCost.Mul(qty).Round(4)

				subtotal = subtotal.Add(netLine)
				discountTotal = discountTotal.Add(discAmt)
				totalCOGS = totalCOGS.Add(cogs)

				metaJSON := "{}"
				if prod.Meta.SerialIMEI {
					imei := fmt.Sprintf("358910%02d%07d", pIdx+10, 1000000+invIdx*17+li)
					meta := map[string]string{
						"imei":     imei,
						"warranty": prod.Meta.WarrantyTerms,
					}
					raw, _ := json.Marshal(meta)
					metaJSON = string(raw)
				}

				lines = append(lines, pendingLine{
					prod:     prod,
					qty:      qty,
					price:    unitPrice,
					disc:     discAmt,
					total:    netLine,
					cogs:     cogs,
					metaJSON: metaJSON,
				})
			}

			vatAmt := subtotal.Mul(vatRate).Round(4)
			ssclAmt := subtotal.Mul(ssclRate).Round(4)
			taxTotal := vatAmt.Add(ssclAmt)
			grandTotal := subtotal.Add(taxTotal)

			// Prorate item-level tax cleanly
			for i := range lines {
				if subtotal.GreaterThan(decimal.Zero) {
					lines[i].tax = lines[i].total.Div(subtotal).Mul(taxTotal).Round(4)
				}
			}

			var invoiceID uuid.UUID
			idempKey := uuid.New()
			if err := invTx.QueryRow(ctx, `
				INSERT INTO sales_invoices (
					business_id, branch_id, terminal_id, shift_id, cashier_user_id, customer_id,
					invoice_number, idempotency_key, invoice_type, status,
					subtotal, discount_total, tax_total, grand_total, total_cogs,
					order_channel, created_at
				) VALUES (
					$1, $2, $3, $4, $5, $6,
					$7, $8, 'SALE', 'PAID',
					$9, $10, $11, $12, $13,
					'COUNTER', $14
				)
				RETURNING id
			`,
				bizID, brID, termID, shiftID, cashierID, custID,
				invNum, idempKey,
				subtotal, discountTotal, taxTotal, grandTotal, totalCOGS,
				invDate,
			).Scan(&invoiceID); err != nil {
				_ = invTx.Rollback(ctx)
				return nil, fmt.Errorf("insert invoice %s: %w", invNum, err)
			}
			summary.InvoiceCount++

			for _, ln := range lines {
				if _, err := invTx.Exec(ctx, `
					INSERT INTO sales_invoice_items (
						business_id, invoice_id, product_id, qty, unit_price,
						discount_amount, tax_amount, line_total, batch_cogs, item_meta_json
					) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
				`, bizID, invoiceID, ln.prod.ID, ln.qty, ln.price, ln.disc, ln.tax, ln.total.Add(ln.tax), ln.cogs, ln.metaJSON); err != nil {
					_ = invTx.Rollback(ctx)
					return nil, err
				}
				summary.InvoiceItemCount++
			}

			if vatRuleID != uuid.Nil {
				_, _ = invTx.Exec(ctx, `
					INSERT INTO sales_invoice_taxes (business_id, invoice_id, tax_rule_id, tax_name, tax_type, rate_percent, taxable_base, tax_amount)
					VALUES ($1, $2, $3, 'VAT (18%)', 'EXCLUSIVE', 18.0000, $4, $5)
				`, bizID, invoiceID, vatRuleID, subtotal, vatAmt)
			}
			if ssclRuleID != uuid.Nil {
				_, _ = invTx.Exec(ctx, `
					INSERT INTO sales_invoice_taxes (business_id, invoice_id, tax_rule_id, tax_name, tax_type, rate_percent, taxable_base, tax_amount)
					VALUES ($1, $2, $3, 'SSCL (2.5%)', 'EXCLUSIVE', 2.5000, $4, $5)
				`, bizID, invoiceID, ssclRuleID, subtotal, ssclAmt)
			}

			method := payMethods[invIdx%len(payMethods)]
			_, _ = invTx.Exec(ctx, `
				INSERT INTO invoice_payments (business_id, invoice_id, payment_method, amount, tendered_amount, change_given, reference_no, paid_at)
				VALUES ($1, $2, $3, $4, $4, 0, $5, $6)
			`, bizID, invoiceID, method, grandTotal, fmt.Sprintf("PAY-%06d", invIdx+1), invDate)

			for _, mv := range moves {
				_, _ = invTx.Exec(ctx, `
					INSERT INTO stock_movements (business_id, branch_id, product_id, batch_id, movement_type, qty_delta, unit_cost, reference_type, reference_id, created_by, created_at)
					VALUES ($1, $2, $3, $4, 'OUT_SALE', $5, $6, 'INVOICE', $7, $8, $9)
				`, bizID, brID, mv.prodID, mv.batchID, mv.qtyDelta, mv.unitCost, invoiceID, cashierID, invDate)
			}

			// Balanced Double-Entry GL Journal per Invoice (Debit Cash/Card + COGS = Credit Revenue + Tax + Inventory)
			assetAcc := coa["1010"]
			if method == "CARD" {
				assetAcc = coa["1020"]
			}
			var jeID uuid.UUID
			jeNum := fmt.Sprintf("JE-POS-%05d", journalSeq)
			journalSeq++
			if err := invTx.QueryRow(ctx, `
				INSERT INTO journal_entries (business_id, branch_id, fiscal_period_id, entry_number, source_type, source_id, description, entry_date, posted_by, created_at)
				VALUES ($1, $2, $3, $4, 'POS_SALE', $5, $6, $7::DATE, $8, $9)
				RETURNING id
			`, bizID, brID, fiscalForTime(invDate), jeNum, invoiceID, "Mobile POS Sale "+invNum, invDate.Format("2006-01-02"), cashierID, invDate).Scan(&jeID); err != nil {
				_ = invTx.Rollback(ctx)
				return nil, err
			}

			if _, err := invTx.Exec(ctx, `
				INSERT INTO journal_lines (business_id, journal_entry_id, account_id, debit, credit, memo)
				VALUES
					($1, $2, $3, $4, 0, 'POS Tender Received'),
					($1, $2, $5, 0, $6, 'Mobile Hardware & Accessory Revenue'),
					($1, $2, $7, 0, $8, 'SL VAT 18% + SSCL 2.5% Payable')
			`, bizID, jeID, assetAcc, grandTotal, coa["4000"], subtotal, coa["2100"], taxTotal); err != nil {
				_ = invTx.Rollback(ctx)
				return nil, err
			}
			if totalCOGS.GreaterThan(decimal.Zero) {
				if _, err := invTx.Exec(ctx, `
					INSERT INTO journal_lines (business_id, journal_entry_id, account_id, debit, credit, memo)
					VALUES
						($1, $2, $3, $4, 0, 'FIFO COGS Recognition'),
						($1, $2, $5, 0, $4, 'FIFO Inventory Depletion')
				`, bizID, jeID, coa["5000"], totalCOGS, coa["1200"]); err != nil {
					_ = invTx.Rollback(ctx)
					return nil, err
				}
			}
			summary.JournalCount++
		}

		if err := invTx.Commit(ctx); err != nil {
			return nil, fmt.Errorf("commit invoice chunk starting %d: %w", chunkStart, err)
		}
	}

	// Finalize batch remaining_qty, add active Held Bills, notifications, and lock historical FY2023-FY2025 periods
	finTx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = finTx.Rollback(ctx) }()

	for _, bt := range allBatches {
		if _, err := finTx.Exec(ctx, `UPDATE inventory_batches SET remaining_qty = $1 WHERE id = $2`, bt.RemainingQty, bt.ID); err != nil {
			return nil, err
		}
	}

	// Lock completed fiscal quarters FY2023-Q1 through FY2025-Q4 cleanly
	_, _ = finTx.Exec(ctx, `
		UPDATE fiscal_periods
		SET is_locked = TRUE, locked_by = $2, locked_at = NOW()
		WHERE business_id = $1
		  AND (period_name LIKE 'FY2023-%' OR period_name LIKE 'FY2024-%' OR period_name LIKE 'FY2025-%')
	`, bizID, accountantID)

	// 12 Held Bills (Device Reservations & Corporate IMEI Quotes into 2026-2027)
	for hbIdx := 0; hbIdx < 12; hbIdx++ {
		prod := products[hbIdx%10]
		price := decimal.NewFromFloat(prod.Meta.SalePrice)
		tax := price.Mul(decimal.NewFromFloat(0.205)).Round(4)
		grand := price.Add(tax)
		var hbID uuid.UUID
		if err := finTx.QueryRow(ctx, `
			INSERT INTO suspended_bills (
				business_id, branch_id, terminal_id, cashier_user_id, customer_id,
				hold_code, notes, subtotal, tax_total, grand_total, status, order_channel, held_at
			) VALUES ($1, $2, $3, $4, $5, $6, 'Customer device trade-in inspection & IMEI hold', $7, $8, $9, 'HELD', 'COUNTER', NOW())
			RETURNING id
		`,
			bizID, branches[hbIdx%len(branches)], terminals[hbIdx%len(terminals)], ownerUserID,
			customerIDs[(hbIdx+1)%len(customerIDs)], fmt.Sprintf("IMEI-HOLD-%03d", hbIdx+1),
			price, tax, grand,
		).Scan(&hbID); err != nil {
			return nil, err
		}
		_, _ = finTx.Exec(ctx, `
			INSERT INTO suspended_bill_items (business_id, suspended_bill_id, product_id, qty, unit_price, discount_percent)
			VALUES ($1, $2, $3, 1, $4, 0)
		`, bizID, hbID, prod.ID, price)
	}

	// Realistic Mobile Alerts & Low-Stock Auto-PO Notifications
	notifs := []struct{ cat, sev, title, body string }{
		{"LOW_STOCK", "warning", "Low Stock: iPhone 16 Pro Max Privacy Glass", "Kandy & Colombo branch stock below reorder threshold (15 PCS). Draft PO queued."},
		{"AUTO_PO", "info", "2027 Flagship Supply Allocation Created", "12 scheduled forward Purchase Orders queued across FY2026-2027 quarters."},
		{"INVOICE", "info", "SL IRD VAT 18% + SSCL 2.5% Active", "Tax rules verified across all multi-year mobile hardware invoices."},
		{"SYSTEM", "info", "FY2023-FY2025 Fiscal Periods Locked", "12 historical accounting quarters locked after verified double-entry balancing."},
	}
	for _, n := range notifs {
		_, _ = finTx.Exec(ctx, `
			INSERT INTO system_notifications (business_id, branch_id, category, severity, title, body, reference_type, is_read)
			VALUES ($1, $2, $3, $4, $5, $6, 'SYSTEM', FALSE)
		`, bizID, colBranchID, n.cat, n.sev, n.title, n.body)
	}

	if err := finTx.Commit(ctx); err != nil {
		return nil, err
	}

	// Force SQL query planner stats refresh after bulk seed for optimal EXPLAIN ANALYZE plans
	_, _ = pool.Exec(ctx, `ANALYZE`)
	return summary, nil
}

func seedDefaultPrintTemplates(ctx context.Context, tx pgx.Tx, bizID, creatorID uuid.UUID) error {
	templates := []struct {
		name, docType, schema, profile string
		w, h, grid                     float64
	}{
		{
			name:    "Kova Mobile A4 Tax & IMEI Invoice",
			docType: "A4_INVOICE",
			w:       210, h: 297, grid: 5,
			schema:  `{"version":1,"snap_to_grid":true,"show_guides":true,"blocks":[{"id":"a4-biz","type":"variable","label":"Business Name","x_mm":15,"y_mm":16,"width_mm":120,"height_mm":10,"content":"{Business_Name}","style":{"fontSizePt":16,"bold":true,"align":"left","color":"#111315","backgroundColor":"transparent","borderWidth":0,"borderColor":"#E2E8F0","paddingMm":0}},{"id":"a4-items","type":"item_table","label":"Device & IMEI Items","x_mm":15,"y_mm":46,"width_mm":180,"height_mm":80,"content":"Line Items & IMEI","columns":["item","qty","total"],"showHeader":true,"rowHeightMm":8,"style":{"fontSizePt":9,"bold":false,"align":"left","color":"#111315","backgroundColor":"#FFFFFF","borderWidth":1,"borderColor":"#CBD5E1","paddingMm":1}},{"id":"a4-total","type":"variable","label":"Grand Total","x_mm":120,"y_mm":134,"width_mm":75,"height_mm":10,"content":"TOTAL: {Total_Amount}","style":{"fontSizePt":12,"bold":true,"align":"right","color":"#111315","backgroundColor":"#F8FAFC","borderWidth":1,"borderColor":"#111315","paddingMm":1.5}}]}`,
			profile: `{"transport":"pdf","deviceName":"System A4 PDF Printer","paperWidth":"A4","autoKickDrawer":false,"cutPaper":false}`,
		},
		{
			name:    "Kova Mobile 80mm Warranty Thermal Receipt",
			docType: "THERMAL_80MM",
			w:       80, h: 210, grid: 2,
			schema:  `{"version":1,"snap_to_grid":true,"show_guides":true,"blocks":[{"id":"t80-biz","type":"variable","label":"Shop Title","x_mm":4,"y_mm":8,"width_mm":72,"height_mm":9,"content":"{Business_Name}","style":{"fontSizePt":13,"bold":true,"align":"center","color":"#111315","backgroundColor":"transparent","borderWidth":0,"borderColor":"#CBD5E1","paddingMm":0}},{"id":"t80-items","type":"item_table","label":"Items & IMEI","x_mm":4,"y_mm":24,"width_mm":72,"height_mm":64,"content":"Items","columns":["item","qty","total"],"showHeader":true,"rowHeightMm":6.5,"style":{"fontSizePt":8.5,"bold":false,"align":"left","color":"#111315","backgroundColor":"#FFFFFF","borderWidth":1,"borderColor":"#CBD5E1","paddingMm":1}},{"id":"t80-total","type":"variable","label":"Receipt Total","x_mm":4,"y_mm":94,"width_mm":72,"height_mm":10,"content":"TOTAL: {Total_Amount}","style":{"fontSizePt":12,"bold":true,"align":"right","color":"#111315","backgroundColor":"#F8FAFC","borderWidth":1,"borderColor":"#111315","paddingMm":1.5}}]}`,
			profile: `{"transport":"webusb","deviceName":"Kova 80mm Thermal Roll","paperWidth":"80mm","autoKickDrawer":true,"cutPaper":true}`,
		},
		{
			name:    "Kova Mobile 58mm Compact Slip",
			docType: "THERMAL_58MM",
			w:       58, h: 190, grid: 2,
			schema:  `{"version":1,"snap_to_grid":true,"show_guides":true,"blocks":[{"id":"t58-biz","type":"variable","label":"Shop Title","x_mm":3,"y_mm":6,"width_mm":52,"height_mm":8,"content":"{Business_Name}","style":{"fontSizePt":11,"bold":true,"align":"center","color":"#111315","backgroundColor":"transparent","borderWidth":0,"borderColor":"#CBD5E1","paddingMm":0}},{"id":"t58-total","type":"variable","label":"Receipt Total","x_mm":3,"y_mm":72,"width_mm":52,"height_mm":8,"content":"TOTAL: {Total_Amount}","style":{"fontSizePt":10,"bold":true,"align":"right","color":"#111315","backgroundColor":"#F8FAFC","borderWidth":1,"borderColor":"#111315","paddingMm":1}}]}`,
			profile: `{"transport":"webserial","deviceName":"58mm Bluetooth Mobile Slip","paperWidth":"58mm","autoKickDrawer":false,"cutPaper":true}`,
		},
	}
	for _, tp := range templates {
		if _, err := tx.Exec(ctx, `
			INSERT INTO print_templates (
				business_id, branch_id, name, document_type, paper_width_mm, paper_height_mm,
				snap_grid_mm, is_default, canvas_schema, printer_profile, created_by
			) VALUES ($1, NULL, $2, $3, $4, $5, $6, TRUE, $7::jsonb, $8::jsonb, $9)
			ON CONFLICT DO NOTHING
		`, bizID, tp.name, tp.docType, tp.w, tp.h, tp.grid, tp.schema, tp.profile, creatorID); err != nil {
			return err
		}
	}
	return nil
}

func buildMobileCatalogSKUs() []mobileSKU {
	phoneMods := `["TRCSL Approved", "1Yr Screen Shield", "eSIM Setup", "Trade-In Credit"]`
	phoneVars := `[{"sku_suffix":"BLK-256","color":"Obsidian Black","size":"256GB"},{"sku_suffix":"TIT-512","color":"Natural Titanium","size":"512GB"}]`
	watchVars := `[{"sku_suffix":"45M-BLK","color":"Midnight","size":"45mm"},{"sku_suffix":"49M-TIT","color":"Titanium","size":"49mm"}]`
	packUOM := `[{"label":"Unit","factor":1},{"label":"Shop Pack (5)","factor":5}]`

	return []mobileSKU{
		// Apple Flagships
		{"KM-IPH16PM", "iPhone 16 Pro Max 512GB", "smartphones", "apple", "Grade-5 Titanium A18 Pro flagship with 5x telephoto prism camera.", "/products/mobile/iphone-pro-max.jpg", 495000, 479000, 428000, 3.2, 8, 20, true, "12-Month AppleCare & TRCSL Warranty", phoneVars, phoneMods, ""},
		{"KM-IPH16P", "iPhone 16 Pro 256GB", "smartphones", "apple", "ProMotion 120Hz Super Retina XDR display & USB-C 10Gbps transfer.", "/products/mobile/iphone-pro-max.jpg", 398000, 385000, 342000, 3.2, 10, 25, true, "12-Month AppleCare & TRCSL Warranty", phoneVars, phoneMods, ""},
		{"KM-IPH16", "iPhone 16 128GB", "smartphones", "apple", "A18 silicon dual-camera smartphone with Action Button.", "/products/mobile/iphone-base.jpg", 295000, 282000, 249000, 4.4, 12, 30, true, "12-Month Official Warranty", phoneVars, phoneMods, ""},
		{"KM-IPH15", "iPhone 15 128GB", "smartphones", "apple", "Dynamic Island USB-C flagship everyday smartphone.", "/products/mobile/iphone-base.jpg", 248000, 236000, 205000, 4.8, 12, 30, true, "12-Month Official Warranty", phoneVars, phoneMods, ""},

		// OPPO & Infinix Flagships / Gaming Series
		{"KM-OPPX8P", "OPPO Find X8 Pro 512GB", "smartphones", "oppo", "Hasselblad quad-50MP periscope flagship with Dimensity 9400 & 80W SuperVOOC.", "/products/mobile/oppo-find-x8.jpg", 338000, 322000, 279000, 4.7, 8, 20, true, "24-Month OPPO Official Care", phoneVars, phoneMods, ""},
		{"KM-OPPR13", "OPPO Reno 13 Pro 5G 256GB", "smartphones", "oppo", "Ultra-slim AI portrait phone with IP69 durability & underwater studio mode.", "/products/mobile/oppo-find-x8.jpg", 188000, 178000, 152000, 5.3, 12, 30, true, "24-Month OPPO Official Care", phoneVars, phoneMods, ""},
		{"KM-INFN50", "Infinix Note 50 Pro 5G 256GB", "smartphones", "infinix", "144Hz AMOLED Bio-Active Halo AI smartphone with 90W All-Round FastCharge.", "/products/mobile/infinix-gaming-phone.jpg", 98500, 92000, 76500, 6.6, 15, 40, true, "12-Month CarlCare Official Warranty", phoneVars, phoneMods, ""},
		{"KM-INFGT20", "Infinix GT 20 Pro 256GB", "smartphones", "infinix", "Dedicated Pixelworks esports display chip & Cyber Mecha RGB gaming phone.", "/products/mobile/infinix-gaming-phone.jpg", 118000, 111000, 92000, 5.9, 15, 35, true, "12-Month CarlCare Official Warranty", phoneVars, phoneMods, ""},

		// Samsung, Google, Xiaomi & OnePlus Smartphones
		{"KM-S25U", "Galaxy S25 Ultra 512GB", "smartphones", "samsung", "Embedded S-Pen titanium AI camera phone with 200MP sensor.", "/products/mobile/samsung-galaxy-ultra.jpg", 465000, 449000, 396000, 3.4, 8, 20, true, "24-Month Samsung Lanka Warranty", phoneVars, phoneMods, ""},
		{"KM-S25P", "Galaxy S25+ 256GB", "smartphones", "samsung", "QHD+ AMOLED 120Hz flagship with Armor Aluminum frame.", "/products/mobile/samsung-galaxy-ultra.jpg", 358000, 344000, 301000, 3.9, 10, 25, true, "24-Month Samsung Lanka Warranty", phoneVars, phoneMods, ""},
		{"KM-A56", "Galaxy A56 5G 256GB", "smartphones", "samsung", "Mid-range Super AMOLED 5G phone with IP67 durability.", "/products/mobile/samsung-galaxy-ultra.jpg", 142000, 134000, 114000, 5.6, 15, 40, true, "12-Month Official Warranty", phoneVars, phoneMods, ""},
		{"KM-PIX9P", "Google Pixel 9 Pro XL", "smartphones", "google", "Tensor G4 pro camera bar with Super Actua LTPO OLED display.", "/products/mobile/pixel-smartphone.jpg", 369000, 355000, 312000, 3.8, 8, 20, true, "12-Month Kova Official Care", phoneVars, phoneMods, ""},
		{"KM-PIX9", "Google Pixel 9 256GB", "smartphones", "google", "Compact AI photography smartphone with 7 years of OS updates.", "/products/mobile/pixel-smartphone.jpg", 268000, 256000, 224000, 4.5, 10, 25, true, "12-Month Kova Official Care", phoneVars, phoneMods, ""},
		{"KM-OP13", "OnePlus 13 5G 512GB", "smartphones", "oneplus", "Hasselblad triple-lens camera & 100W SuperVOOC charging.", "/products/mobile/oneplus-smartphone.jpg", 278000, 265000, 232000, 4.7, 10, 25, true, "12-Month Official Warranty", phoneVars, phoneMods, ""},
		{"KM-XI15U", "Xiaomi 15 Ultra 512GB", "smartphones", "xiaomi", "Leica Summilux optical flagship with 1-inch sensor.", "/products/mobile/xiaomi-smartphone.jpg", 342000, 329000, 288000, 3.8, 8, 20, true, "12-Month Official Warranty", phoneVars, phoneMods, ""},
		{"KM-RN14P", "Redmi Note 14 Pro 5G", "smartphones", "xiaomi", "200MP OIS curved AMOLED high-velocity bestseller.", "/products/mobile/xiaomi-smartphone.jpg", 112000, 106000, 89500, 5.4, 20, 50, true, "12-Month Official Warranty", phoneVars, phoneMods, ""},

		// Foldables & Pro Tablets
		{"KM-ZFOLD6", "Galaxy Z Fold6 512GB", "tablets-foldables", "samsung", "Dual-screen foldable workstation smartphone with Flex Hinge.", "/products/mobile/foldable-phone.jpg", 585000, 562000, 498000, 3.9, 5, 12, true, "24-Month Screen & Hinge Care", phoneVars, phoneMods, ""},
		{"KM-OPPOFN3", "OPPO Find N3 Flip 256GB", "tablets-foldables", "oppo", "Pocketable Hasselblad vertical-cover AMOLED foldable.", "/products/mobile/oppo-smartphone.jpg", 289000, 274000, 238000, 5.2, 6, 15, true, "24-Month OPPO Official Care", phoneVars, phoneMods, ""},
		{"KM-IPADP13", "iPad Pro 13 M4 512GB", "tablets-foldables", "apple", "Tandem OLED Ultra Retina XDR workstation tablet.", "/products/mobile/tablet-pro.jpg", 455000, 439000, 389000, 3.5, 6, 15, true, "12-Month AppleCare Warranty", phoneVars, `["Apple Pencil Pro Bundle", "Screen Care"]`, ""},
		{"KM-IPADAIR", "iPad Air 11 M2 256GB", "tablets-foldables", "apple", "Featherlight creative tablet with Landscape FaceTime camera.", "/products/mobile/tablet-pro.jpg", 229000, 219000, 192000, 4.4, 10, 25, true, "12-Month AppleCare Warranty", phoneVars, `["Folio Keyboard Combo"]`, ""},
		{"KM-TABS10U", "Galaxy Tab S10 Ultra 5G", "tablets-foldables", "samsung", "14.6-inch anti-reflective AMOLED tablet with S-Pen.", "/products/mobile/tablet-pro.jpg", 385000, 369000, 326000, 4.1, 6, 15, true, "24-Month Official Care", phoneVars, `["Book Cover Keyboard"]`, ""},

		// Audio (Soundcore, Apple, Samsung) & Wearables (Apple, Garmin)
		{"KM-SC-SPACE", "Soundcore Space One Pro ANC", "audio-wearables", "soundcore", "FlexiCurve foldable adaptive ANC wireless over-ear headphones (60h battery).", "/products/mobile/soundcore-headphones-overear.jpg", 58500, 54900, 42500, 6.2, 12, 30, true, "18-Month Soundcore Care", "", "", ""},
		{"KM-SC-AERO", "Soundcore AeroFit 2 Pro Open-Ear", "audio-wearables", "soundcore", "Dual-form open-ear + adaptive ANC Hi-Res wireless earbuds.", "/products/mobile/soundcore-headphones.jpg", 49500, 45900, 35500, 7.3, 12, 30, true, "18-Month Soundcore Care", "", "", ""},
		{"KM-SC-LIB4", "Soundcore Liberty 4 Pro ANC", "audio-wearables", "soundcore", "ACAA studio coaxial dual-driver earbuds with smart OLED display case.", "/products/mobile/soundcore-earbuds.jpg", 42500, 39500, 30200, 7.1, 15, 35, true, "18-Month Soundcore Care", "", "", ""},
		{"KM-SC-BOOM2", "Soundcore Boom 2 Waterproof 80W", "audio-wearables", "soundcore", "BassUp 2.0 RGB IPX7 floatable wireless outdoor party speaker.", "/products/mobile/soundcore-speaker.jpg", 44500, 41500, 32400, 6.7, 12, 30, true, "18-Month Soundcore Care", "", "", ""},
		{"KM-AIRP2", "AirPods Pro 2 USB-C", "audio-wearables", "apple", "Active Noise Canceling earbuds with Adaptive Transparency & MagSafe.", "/products/mobile/soundcore-earbuds.jpg", 84500, 79500, 66000, 5.9, 15, 40, true, "12-Month Official Warranty", "", `["Gift Box", "Silicone Case"]`, ""},
		{"KM-BUDS3P", "Galaxy Buds3 Pro Hi-Fi", "audio-wearables", "samsung", "Dual-amp 24-bit Hi-Fi ANC wireless earbuds.", "/products/mobile/soundcore-earbuds.jpg", 64500, 59500, 49000, 7.8, 15, 40, true, "12-Month Official Warranty", "", "", ""},
		{"KM-AWU2", "Apple Watch Ultra 2 Titanium", "audio-wearables", "apple", "49mm rugged cellular GPS smartwatch with 3000-nit display.", "/products/mobile/smartwatch-ultra.jpg", 289000, 276000, 241000, 4.5, 6, 15, true, "12-Month AppleCare Warranty", watchVars, `["Alpine Loop Extra"]`, ""},
		{"KM-AWS10", "Apple Watch Series 10 46mm", "audio-wearables", "apple", "Wide-angle OLED slim titanium smartwatch.", "/products/mobile/smartwatch-ultra.jpg", 158000, 149500, 129000, 5.4, 10, 25, true, "12-Month AppleCare Warranty", watchVars, "", ""},
		{"KM-GARMIN", "Garmin Epix Pro Gen 2 AMOLED", "audio-wearables", "garmin", "Multi-band GNSS titanium fitness expedition watch.", "/products/mobile/smartwatch-ultra.jpg", 268000, 254000, 218000, 5.2, 5, 12, true, "24-Month Garmin Care", watchVars, "", ""},

		// Power, Chargers & Cables
		{"KM-GAN140", "Anker 140W GaN Prime 4-Port", "power-chargers", "anker", "4-port PD 3.1 GaN fast wall charger for MacBooks and phones.", "/products/mobile/gan-charger.jpg", 32500, 29800, 22400, 8.3, 18, 45, false, "18-Month Replacement Warranty", "", "", packUOM},
		{"KM-GAN65", "Ugreen Nexode 65W GaN Duo", "power-chargers", "ugreen", "Compact dual-USB-C 65W PPS travel charger.", "/products/mobile/gan-charger.jpg", 14500, 13200, 9200, 9.0, 25, 60, false, "12-Month Replacement Warranty", "", "", packUOM},
		{"KM-MAG10K", "Anker MagGo 10K Qi2 Slim", "power-chargers", "anker", "Qi2 15W magnetic snap wireless power bank with stand.", "/products/mobile/magsafe-powerbank.jpg", 24500, 22500, 16200, 8.2, 18, 50, false, "18-Month Replacement Warranty", "", "", ""},
		{"KM-ANK20K", "Anker Prime 20,000mAh 200W", "power-chargers", "anker", "Flight-approved 200W smart OLED laptop & phone power bank.", "/products/mobile/magsafe-powerbank.jpg", 46500, 42900, 32500, 7.7, 12, 30, false, "18-Month Replacement Warranty", "", "", ""},
		{"KM-USBC240", "Belkin Braided USB-C 240W 2m", "power-chargers", "belkin", "Aramid-braided PD 3.1 240W fast charging & data cable.", "/products/mobile/usbc-cable.jpg", 7800, 6900, 4100, 11.5, 30, 80, false, "24-Month Cable Guarantee", "", "", packUOM},
		{"KM-THUND4", "Apple USB-C 96W Studio Adapter", "power-chargers", "apple", "Genuine Apple fast charging GaN brick for iPad Pro & phones.", "/products/mobile/gan-charger.jpg", 28500, 26500, 20500, 7.0, 12, 30, false, "12-Month Official Warranty", "", "", ""},

		// Cases, Screen Armor, Certified Pre-Owned & 5G Networking/Storage
		{"KM-ARMOR16", "Spigen Rugged Armor MagFit Case", "cases-armor", "spigen", "Air-cushion corner shockproof case with MagSafe ring.", "/products/mobile/phone-case-armor.jpg", 11500, 9800, 5600, 14.8, 25, 70, false, "6-Month Hinge/Ring Guarantee", "", "", packUOM},
		{"KM-PRIVACY", "Kova 3D Anti-Spy Matte Glass", "cases-armor", "kova-certified", "28-degree privacy filter matte gaming screen protector.", "/products/mobile/screen-protector.jpg", 5500, 4800, 2100, 12.7, 30, 80, false, "Free Counter Installation", "", "", packUOM},
		{"KM-SNDSSD", "SanDisk Extreme 1TB Portable SSD", "networking-storage", "sandisk", "IP65 ruggedized 1050MB/s USB-C ProRes capture drive.", "/products/mobile/portable-ssd.jpg", 46500, 42900, 34200, 7.7, 10, 25, true, "36-Month SanDisk Care", "", "", ""},
		{"KM-MINI5G", "TP-Link Archer NX600 5G Router", "networking-storage", "tp-link", "Dual-SIM 5G NR Wi-Fi 6 home & branch backup gateway.", "/products/mobile/wifi-router-5g.jpg", 78500, 74500, 59800, 5.1, 8, 20, true, "24-Month 5G Hardware Care", "", "", ""},
	}
}
