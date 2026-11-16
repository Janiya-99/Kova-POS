package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/enterprise-pos/backend/internal/repository/sqlc/db"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/redis/go-redis/v9"
	"github.com/shopspring/decimal"
	"golang.org/x/crypto/bcrypt"
)

// CreateCustomerRequest validates CRM customer registration fields.
type CreateCustomerRequest struct {
	Name          string          `json:"name"`
	Phone         string          `json:"phone"`
	Email         string          `json:"email"`
	AvatarURL     string          `json:"avatar_url"`
	CreditEnabled bool            `json:"credit_enabled"`
	CreditLimit   decimal.Decimal `json:"credit_limit"`
	Tier          string          `json:"tier"`
}

// SaveProductRequest validates Product (Item) Management form fields & Level-6 override.
type SaveProductRequest struct {
	CategoryID             uuid.UUID        `json:"category_id"`
	BrandID                *uuid.UUID       `json:"brand_id,omitempty"`
	TaxGroupID             *uuid.UUID       `json:"tax_group_id,omitempty"`
	SKU                    string           `json:"sku"`
	Barcode                string           `json:"barcode"`
	Name                   string           `json:"name"`
	Description            string           `json:"description"`
	ImageURLs              []string         `json:"image_urls"`
	UnitOfMeasure          string           `json:"unit_of_measure"`
	BasePrice              decimal.Decimal  `json:"base_price"`
	SalePrice              decimal.Decimal  `json:"sale_price"`
	DiscountPercent        *decimal.Decimal `json:"discount_percent,omitempty"`
	ReorderPoint           decimal.Decimal  `json:"reorder_point"`
	ReorderQty             decimal.Decimal  `json:"reorder_qty"`
	AllowNegativeStockMode string           `json:"allow_negative_stock_mode"` // "INHERIT" | "ALLOW" | "BLOCK"
	EnableSerialTracking   *bool            `json:"enable_serial_tracking,omitempty"`
	IsServiceLabor         *bool            `json:"is_service_labor,omitempty"`
	AllowFractionalQty     *bool            `json:"allow_fractional_qty,omitempty"`
	VariantsJSON           json.RawMessage  `json:"variants_json,omitempty"`
	ModifiersJSON          json.RawMessage  `json:"modifiers_json,omitempty"`
	UOMOptionsJSON         json.RawMessage  `json:"uom_options_json,omitempty"`
	WarrantyTerms          *string          `json:"warranty_terms,omitempty"`
}

// BulkProductDiscountRequest applies or removes a promotional percentage discount across multiple selected SKUs.
type BulkProductDiscountRequest struct {
	ProductIDs      []uuid.UUID     `json:"product_ids"`
	DiscountPercent decimal.Decimal `json:"discount_percent"`
}

// UpdateCompanySettingsRequest handles Brand Assets, White-Label Theme, Locale/i18n, and Warehouse Approvals.
type UpdateCompanySettingsRequest struct {
	Name               string `json:"name"`
	TradeName          string `json:"trade_name"`
	LegalName          string `json:"legal_name"`
	TaxRegistrationNo  string `json:"tax_registration_no"`
	BaseCurrency       string `json:"base_currency"`
	LogoLightURL       string `json:"logo_light_url"`
	LogoDarkURL        string `json:"logo_dark_url"`
	LogoReceiptURL     string `json:"logo_receipt_url"`
	PrimaryColorHex    string `json:"primary_color_hex"`
	DefaultLanguage    string `json:"default_language"`
	IndustryProfile    string `json:"industry_profile"`
	RequirePOApproval  *bool  `json:"require_po_approval,omitempty"`
	RequireGRNApproval *bool  `json:"require_grn_approval,omitempty"`
}

// NormalizeIndustryProfile validates and normalizes the supported POS industry modes.
func NormalizeIndustryProfile(raw string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "retail", "restaurant", "hardware", "garage", "mobile", "stationery":
		return strings.ToLower(strings.TrimSpace(raw)), true
	default:
		return "retail", false
	}
}

// IndustryPresetFlags returns the recommended Level-2 settings flags for an industry profile.
func IndustryPresetFlags(mode string) map[string]bool {
	flags := map[string]bool{
		"pos.layout.show_categories_pane":       true,
		"pos.layout.show_outgoing_orders_pane":  true,
		"pos.layout.footer_quick_edit_sidebar":  true,
		"pos.features.enable_tables":            false,
		"pos.features.enable_kot":               false,
		"pos.features.allow_fractional_qty":     false,
		"pos.features.multi_uom_toggle":         false,
		"pos.features.require_vehicle_plate":    false,
		"pos.features.split_labor_parts":        false,
		"pos.features.matrix_variants":          false,
		"pos.features.require_serial_imei":      false,
		"pos.features.enable_bundles":           false,
	}
	switch mode {
	case "restaurant":
		flags["pos.features.enable_tables"] = true
		flags["pos.features.enable_kot"] = true
	case "hardware":
		flags["pos.features.allow_fractional_qty"] = true
		flags["pos.features.multi_uom_toggle"] = true
	case "garage":
		flags["pos.features.require_vehicle_plate"] = true
		flags["pos.features.split_labor_parts"] = true
	case "retail":
		flags["pos.features.matrix_variants"] = true
	case "mobile":
		flags["pos.features.require_serial_imei"] = true
	case "stationery":
		flags["pos.layout.show_outgoing_orders_pane"] = false
		flags["pos.features.enable_bundles"] = true
	}
	return flags
}

// SaveCategoryRequest validates category creation and edits.
type SaveCategoryRequest struct {
	Name          string     `json:"name"`
	Slug          string     `json:"slug"`
	GenderSegment string     `json:"gender_segment"`
	TaxGroupID    *uuid.UUID `json:"tax_group_id,omitempty"`
}

// SaveAccessUserRequest validates creating or editing staff/admin logins in Manage Access.
type SaveAccessUserRequest struct {
	FullName           string      `json:"full_name"`
	Email              string      `json:"email"`
	Password           string      `json:"password,omitempty"`
	RoleID             uuid.UUID   `json:"role_id"`
	DesignationID      *uuid.UUID  `json:"designation_id,omitempty"`
	BranchID           *uuid.UUID  `json:"branch_id,omitempty"`
	AllBranchesAccess  *bool       `json:"all_branches_access,omitempty"`
	AllowedBranchIDs   []uuid.UUID `json:"allowed_branch_ids,omitempty"`
	AllowedTerminalIDs []uuid.UUID `json:"allowed_terminal_ids,omitempty"`
	DefaultTerminalID  *uuid.UUID  `json:"default_terminal_id,omitempty"`
	IsActive           bool        `json:"is_active"`
	SupervisorPIN      string      `json:"supervisor_pin,omitempty"`
}

// SaveDepartmentRequest validates department creation in RBAC & Staff Access.
type SaveDepartmentRequest struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

// SaveDesignationRequest validates designation creation/updates with discount cap limits.
type SaveDesignationRequest struct {
	DepartmentID      uuid.UUID       `json:"department_id"`
	Code              string          `json:"code"`
	Name              string          `json:"name"`
	MaxPOSDiscountPct decimal.Decimal `json:"max_pos_discount_pct"`
}

// SaveCustomRoleRequest validates tenant-scoped custom RBAC role creation and permission assignment.
type SaveCustomRoleRequest struct {
	Code        string   `json:"code"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Permissions []string `json:"permissions"`
}

// SaveTaxGroupRequest validates tax group creation/updates scoped to a business.
type SaveTaxGroupRequest struct {
	Code      string `json:"code"`
	Name      string `json:"name"`
	IsDefault bool   `json:"is_default"`
}

// SaveTaxRuleRequest validates multi-tier tax rule creation/updates inside a tax group.
type SaveTaxRuleRequest struct {
	TaxGroupID  uuid.UUID       `json:"tax_group_id"`
	Code        string          `json:"code"`
	Name        string          `json:"name"`
	TaxType     string          `json:"tax_type"`
	RatePercent decimal.Decimal `json:"rate_percent"`
	Priority    int32           `json:"priority"`
	IsActive    bool            `json:"is_active"`
}

// ApplySLTaxPresetRequest applies Sri Lankan VAT (18%) and SSCL (2.5%) preset configuration cleanly.
type ApplySLTaxPresetRequest struct {
	ApplyVAT             bool   `json:"apply_vat"`
	ApplySSCL            bool   `json:"apply_sscl"`
	TaxRegistrationNo    string `json:"tax_registration_no"`
	RoundingMode         string `json:"rounding_mode"`
	ApplyToAllCategories bool   `json:"apply_to_all_categories"`
}

// CatalogCompanyUsecase handles CRM Customers, Product Management Forms, Categories, Notifications, Access, and Company Settings.
type CatalogCompanyUsecase struct {
	queries   *db.Queries
	settings  *SettingsResolver
	inventory *InventoryFIFOUsecase
	redis     *redis.Client
}

// NewCatalogCompanyUsecase constructs a CatalogCompanyUsecase.
func NewCatalogCompanyUsecase(queries *db.Queries, settings *SettingsResolver) *CatalogCompanyUsecase {
	return &CatalogCompanyUsecase{queries: queries, settings: settings}
}

// SetInventory attaches InventoryFIFOUsecase so product threshold changes trigger immediate low-stock scans.
func (c *CatalogCompanyUsecase) SetInventory(inv *InventoryFIFOUsecase) {
	c.inventory = inv
}

// SetRedis attaches Redis for RBAC cache invalidation when access assignments change.
func (c *CatalogCompanyUsecase) SetRedis(rdb *redis.Client) {
	c.redis = rdb
}

// ListCustomers returns all CRM customers for the tenant business.
func (c *CatalogCompanyUsecase) ListCustomers(ctx context.Context, businessID uuid.UUID) ([]db.ListCustomersForBusinessRow, error) {
	return c.queries.ListCustomersForBusiness(ctx, businessID)
}

// CreateCustomer normalizes phone input (Postel's Law) and creates a new CRM customer.
func (c *CatalogCompanyUsecase) CreateCustomer(ctx context.Context, businessID uuid.UUID, req CreateCustomerRequest) (db.CreateCustomerRow, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return db.CreateCustomerRow{}, errors.New("full name is required")
	}

	normalizedPhone := normalizePhoneNumber(req.Phone)
	tier := strings.TrimSpace(req.Tier)
	switch tier {
	case "Bronze", "Silver", "Gold":
	default:
		tier = "Bronze"
	}

	creditLimit := req.CreditLimit
	if !req.CreditEnabled || creditLimit.IsNegative() {
		creditLimit = decimal.Zero
	}

	return c.queries.CreateCustomer(ctx, db.CreateCustomerParams{
		BusinessID:    businessID,
		Name:          name,
		Email:         strings.TrimSpace(req.Email),
		Phone:         normalizedPhone,
		Tier:          tier,
		AvatarUrl:     strings.TrimSpace(req.AvatarURL),
		CreditEnabled: req.CreditEnabled,
		CreditLimit:   creditLimit.Round(4),
	})
}

// SaveProduct creates or updates a SKU, its up to 5 images, barcode, and Level-6 Allow Negative Stock override.
func (c *CatalogCompanyUsecase) SaveProduct(
	ctx context.Context,
	businessID, userID uuid.UUID,
	productID *uuid.UUID,
	req SaveProductRequest,
) (map[string]any, error) {
	name := strings.TrimSpace(req.Name)
	sku := strings.ToUpper(strings.TrimSpace(req.SKU))
	if name == "" || sku == "" {
		return nil, errors.New("item name and SKU are required")
	}
	if req.CategoryID == uuid.Nil {
		return nil, errors.New("category_id is required")
	}

	discPct := decimal.Zero
	if req.DiscountPercent != nil {
		if req.DiscountPercent.IsNegative() || req.DiscountPercent.GreaterThan(decimal.NewFromInt(95)) {
			return nil, errors.New("discount percent must be between 0 and 95")
		}
		discPct = req.DiscountPercent.Round(4)
	} else if productID != nil && *productID != uuid.Nil {
		if existing, gErr := c.queries.GetProductByID(ctx, db.GetProductByIDParams{
			BusinessID: businessID,
			ID:         *productID,
		}); gErr == nil {
			if existing.DiscountPercent.GreaterThan(decimal.Zero) && req.SalePrice.LessThan(req.BasePrice) && req.BasePrice.GreaterThan(decimal.Zero) {
				discPct = req.BasePrice.Sub(req.SalePrice).Mul(decimal.NewFromInt(100)).Div(req.BasePrice).Round(4)
			}
		}
	}

	basePrice := req.BasePrice.Round(4)
	salePrice := req.SalePrice.Round(4)
	if discPct.GreaterThan(decimal.Zero) {
		listAnchor := basePrice
		if salePrice.GreaterThan(basePrice) && req.DiscountPercent != nil {
			listAnchor = salePrice
			basePrice = salePrice
		}
		if listAnchor.GreaterThan(decimal.Zero) {
			salePrice = listAnchor.Mul(decimal.NewFromInt(100).Sub(discPct)).Div(decimal.NewFromInt(100)).Round(2)
		}
	} else if salePrice.LessThan(basePrice) {
		return nil, errors.New("selling price must be greater than or equal to cost price")
	}
	if salePrice.LessThanOrEqual(decimal.Zero) {
		return nil, errors.New("selling price must be greater than 0")
	}

	imgs := req.ImageURLs
	if len(imgs) > 5 {
		imgs = imgs[:5]
	}
	if len(imgs) == 0 {
		imgs = []string{}
	}
	primaryImage := ""
	if len(imgs) > 0 {
		primaryImage = imgs[0]
	}
	imgBytes, _ := json.Marshal(imgs)

	var negOverride pgtype.Bool
	switch strings.ToUpper(strings.TrimSpace(req.AllowNegativeStockMode)) {
	case "ALLOW":
		negOverride = pgtype.Bool{Bool: true, Valid: true}
	case "BLOCK":
		negOverride = pgtype.Bool{Bool: false, Valid: true}
	default:
		negOverride = pgtype.Bool{Valid: false}
	}

	uom := strings.ToUpper(strings.TrimSpace(req.UnitOfMeasure))
	if uom == "" {
		uom = "PCS"
	}
	reorderQty := req.ReorderQty
	if reorderQty.LessThanOrEqual(decimal.Zero) {
		reorderQty = decimal.NewFromInt(25)
	}

	enableSerial := false
	isServiceLabor := false
	allowFractional := false
	variantsJSON := []byte("[]")
	modifiersJSON := []byte("[]")
	uomOptionsJSON := []byte("[]")
	warrantyTerms := ""

	if productID != nil && *productID != uuid.Nil {
		if existing, gErr := c.queries.GetProductByID(ctx, db.GetProductByIDParams{
			BusinessID: businessID,
			ID:         *productID,
		}); gErr == nil {
			enableSerial = existing.EnableSerialTracking
			isServiceLabor = existing.IsServiceLabor
			allowFractional = existing.AllowFractionalQty
			if len(existing.VariantsJson) > 0 {
				variantsJSON = existing.VariantsJson
			}
			if len(existing.ModifiersJson) > 0 {
				modifiersJSON = existing.ModifiersJson
			}
			if len(existing.UomOptionsJson) > 0 {
				uomOptionsJSON = existing.UomOptionsJson
			}
			warrantyTerms = existing.WarrantyTerms
		}
	}

	if req.EnableSerialTracking != nil {
		enableSerial = *req.EnableSerialTracking
	}
	if req.IsServiceLabor != nil {
		isServiceLabor = *req.IsServiceLabor
	}
	if req.AllowFractionalQty != nil {
		allowFractional = *req.AllowFractionalQty
	}
	if len(req.VariantsJSON) > 0 && string(req.VariantsJSON) != "null" {
		variantsJSON = req.VariantsJSON
	}
	if len(req.ModifiersJSON) > 0 && string(req.ModifiersJSON) != "null" {
		modifiersJSON = req.ModifiersJSON
	}
	if len(req.UOMOptionsJSON) > 0 && string(req.UOMOptionsJSON) != "null" {
		uomOptionsJSON = req.UOMOptionsJSON
	}
	if req.WarrantyTerms != nil {
		warrantyTerms = strings.TrimSpace(*req.WarrantyTerms)
	}

	var savedID uuid.UUID
	var out any

	var brandNull uuid.NullUUID
	if req.BrandID != nil && *req.BrandID != uuid.Nil {
		brandNull = uuid.NullUUID{UUID: *req.BrandID, Valid: true}
	}

	if productID == nil || *productID == uuid.Nil {
		var tg uuid.NullUUID
		if req.TaxGroupID != nil && *req.TaxGroupID != uuid.Nil {
			tg = uuid.NullUUID{UUID: *req.TaxGroupID, Valid: true}
		}
		row, err := c.queries.CreateProduct(ctx, db.CreateProductParams{
			BusinessID:           businessID,
			CategoryID:           req.CategoryID,
			BrandID:              brandNull,
			TaxGroupID:           tg,
			Sku:                  sku,
			Name:                 name,
			Description:          strings.TrimSpace(req.Description),
			ImageUrl:             primaryImage,
			ImageUrls:            imgBytes,
			UnitOfMeasure:        uom,
			BasePrice:            basePrice,
			SalePrice:            salePrice,
			DiscountPercent:      discPct,
			ReorderPoint:         req.ReorderPoint.Round(4),
			ReorderQty:           reorderQty.Round(4),
			AllowNegativeStock:   negOverride,
			EnableSerialTracking: enableSerial,
			IsServiceLabor:       isServiceLabor,
			AllowFractionalQty:   allowFractional,
			VariantsJson:         variantsJSON,
			ModifiersJson:        modifiersJSON,
			UomOptionsJson:       uomOptionsJSON,
			WarrantyTerms:        warrantyTerms,
		})
		if err != nil {
			return nil, err
		}
		savedID = row.ID
		out = row
	} else {
		row, err := c.queries.UpdateProduct(ctx, db.UpdateProductParams{
			BusinessID:           businessID,
			ID:                   *productID,
			CategoryID:           req.CategoryID,
			BrandID:              brandNull,
			Sku:                  sku,
			Name:                 name,
			Description:          strings.TrimSpace(req.Description),
			ImageUrl:             primaryImage,
			ImageUrls:            imgBytes,
			UnitOfMeasure:        uom,
			BasePrice:            basePrice,
			SalePrice:            salePrice,
			DiscountPercent:      discPct,
			ReorderPoint:         req.ReorderPoint.Round(4),
			ReorderQty:           reorderQty.Round(4),
			AllowNegativeStock:   negOverride,
			EnableSerialTracking: enableSerial,
			IsServiceLabor:       isServiceLabor,
			AllowFractionalQty:   allowFractional,
			VariantsJson:         variantsJSON,
			ModifiersJson:        modifiersJSON,
			UomOptionsJson:       uomOptionsJSON,
			WarrantyTerms:        warrantyTerms,
		})
		if err != nil {
			return nil, err
		}
		savedID = row.ID
		out = row
	}

	barcode := strings.TrimSpace(req.Barcode)
	if barcode != "" {
		_ = c.queries.UpsertPrimaryBarcode(ctx, db.UpsertPrimaryBarcodeParams{
			BusinessID: businessID,
			ProductID:  savedID,
			Barcode:    barcode,
		})
	}

	// Sync Level-6 Scoped Settings Override cleanly
	if c.settings != nil {
		if negOverride.Valid {
			val := json.RawMessage(`false`)
			if negOverride.Bool {
				val = json.RawMessage(`true`)
			}
			_ = c.settings.UpsertOverride(ctx, businessID, userID, "pos.allow_negative_fifo_stock", "PRODUCT", &savedID, val)
		} else {
			_ = c.settings.ResetOverride(ctx, businessID, "pos.allow_negative_fifo_stock", "PRODUCT", &savedID)
		}
	}

	return map[string]any{
		"product": out,
	}, nil
}

// ComputeDiscountedProductPricing calculates deterministic decimal pricing when applying or clearing a product promo discount.
func ComputeDiscountedProductPricing(basePrice, salePrice, currentDiscPct, targetDiscPct decimal.Decimal) (newBase, newSale, newDisc decimal.Decimal) {
	hundred := decimal.NewFromInt(100)
	if targetDiscPct.GreaterThan(decimal.Zero) {
		listPrice := basePrice
		if currentDiscPct.Equal(decimal.Zero) && salePrice.GreaterThan(basePrice) {
			listPrice = salePrice
		}
		return listPrice.Round(4), listPrice.Mul(hundred.Sub(targetDiscPct)).Div(hundred).Round(2).Round(4), targetDiscPct.Round(4)
	}
	restoredSale := salePrice
	if currentDiscPct.GreaterThan(decimal.Zero) || salePrice.LessThan(basePrice) {
		restoredSale = basePrice
	}
	return basePrice.Round(4), restoredSale.Round(4), decimal.Zero
}

// BulkUpdateProductDiscounts atomically sets or clears a percentage discount across selected SKUs for a business.
func (c *CatalogCompanyUsecase) BulkUpdateProductDiscounts(
	ctx context.Context,
	businessID uuid.UUID,
	req BulkProductDiscountRequest,
) (map[string]any, error) {
	seen := make(map[uuid.UUID]struct{}, len(req.ProductIDs))
	ids := make([]uuid.UUID, 0, len(req.ProductIDs))
	for _, id := range req.ProductIDs {
		if id == uuid.Nil {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return nil, errors.New("select at least one product to apply a discount")
	}
	if req.DiscountPercent.IsNegative() || req.DiscountPercent.GreaterThan(decimal.NewFromInt(95)) {
		return nil, errors.New("discount percent must be between 0 and 95")
	}

	pct := req.DiscountPercent.Round(4)
	rows, err := c.queries.BulkUpdateProductDiscount(ctx, db.BulkUpdateProductDiscountParams{
		BusinessID:      businessID,
		ProductIds:      ids,
		DiscountPercent: pct,
	})
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"updated_count":    len(rows),
		"discount_percent": pct.StringFixed(2),
		"products":         rows,
	}, nil
}

// DeleteOrArchiveProduct performs soft-archive if historical transactions exist, otherwise deletes cleanly.
func (c *CatalogCompanyUsecase) DeleteOrArchiveProduct(ctx context.Context, businessID, productID uuid.UUID) (string, error) {
	hasHistory, err := c.queries.CheckProductUsage(ctx, db.CheckProductUsageParams{
		BusinessID: businessID,
		ProductID:  productID,
	})
	if err != nil {
		return "", err
	}
	if hasHistory {
		if err := c.queries.ArchiveProduct(ctx, db.ArchiveProductParams{
			BusinessID: businessID,
			ID:         productID,
		}); err != nil {
			return "", err
		}
		return "ARCHIVED", nil
	}
	if err := c.queries.DeleteProductHard(ctx, db.DeleteProductHardParams{
		BusinessID: businessID,
		ID:         productID,
	}); err != nil {
		return "", err
	}
	return "DELETED", nil
}

// GetCompanySettings returns business profile, logo URLs, VAT reg, and global warehouse approval flags.
func (c *CatalogCompanyUsecase) GetCompanySettings(ctx context.Context, businessID uuid.UUID) (map[string]any, error) {
	prof, err := c.queries.GetBusinessProfile(ctx, businessID)
	if err != nil {
		return nil, err
	}
	requirePO := false
	requireGRN := false
	if c.settings != nil {
		sc := SettingsContext{BusinessID: businessID}
		requirePO = c.settings.GetBool(ctx, sc, "warehouse.po.require_approval", false)
		requireGRN = c.settings.GetBool(ctx, sc, "warehouse.grn.require_approval", false)
	}
	return map[string]any{
		"profile":              prof,
		"require_po_approval":  requirePO,
		"require_grn_approval": requireGRN,
	}, nil
}

var validHexColor = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

// UpdateCompanySettings updates white-label brand assets, primary color, language, currency, and Redis-cached approval settings.
func (c *CatalogCompanyUsecase) UpdateCompanySettings(
	ctx context.Context,
	businessID, userID uuid.UUID,
	req UpdateCompanySettingsRequest,
) (map[string]any, error) {
	tradeName := strings.TrimSpace(req.TradeName)
	displayName := strings.TrimSpace(req.Name)
	if tradeName == "" {
		tradeName = displayName
	}
	if displayName == "" {
		displayName = tradeName
	}

	primaryHex := strings.TrimSpace(req.PrimaryColorHex)
	if !validHexColor.MatchString(primaryHex) {
		primaryHex = ""
	} else {
		primaryHex = strings.ToUpper(primaryHex)
	}

	lang := ""
	if strings.TrimSpace(req.DefaultLanguage) != "" {
		lang = normalizeLanguageCode(req.DefaultLanguage)
	}
	industry := ""
	if strings.TrimSpace(req.IndustryProfile) != "" {
		if normInd, ok := NormalizeIndustryProfile(req.IndustryProfile); ok {
			industry = normInd
		}
	}

	prof, err := c.queries.UpdateBusinessProfile(ctx, db.UpdateBusinessProfileParams{
		ID:                businessID,
		Column2:           displayName,
		Column3:           tradeName,
		Column4:           strings.TrimSpace(req.LegalName),
		TaxRegistrationNo: strings.TrimSpace(req.TaxRegistrationNo),
		Column6:           strings.ToUpper(strings.TrimSpace(req.BaseCurrency)),
		LogoLightUrl:      strings.TrimSpace(req.LogoLightURL),
		LogoDarkUrl:       strings.TrimSpace(req.LogoDarkURL),
		LogoReceiptUrl:    strings.TrimSpace(req.LogoReceiptURL),
		Column10:          primaryHex,
		Column11:          lang,
		Column12:          industry,
	})
	if err != nil {
		return nil, err
	}

	if c.settings != nil {
		if normCurr := strings.ToUpper(strings.TrimSpace(req.BaseCurrency)); normCurr != "" {
			if rawCurr, mErr := json.Marshal(normCurr); mErr == nil {
				_ = c.settings.UpsertOverrideQuiet(ctx, businessID, userID, "accounting.base_currency", "BUSINESS", &businessID, rawCurr)
			}
		}
		if prof.DefaultLanguage != "" {
			if rawLang, mErr := json.Marshal(normalizeLanguageCode(prof.DefaultLanguage)); mErr == nil {
				_ = c.settings.UpsertOverrideQuiet(ctx, businessID, userID, "system.default_language", "BUSINESS", &businessID, rawLang)
			}
		}
		if industry != "" {
			_ = c.applyIndustryPresetQuiet(ctx, businessID, userID, industry)
		}
	}

	requirePO := false
	requireGRN := false
	if c.settings != nil {
		sc := SettingsContext{BusinessID: businessID}
		if req.RequirePOApproval != nil {
			requirePO = *req.RequirePOApproval
			raw := json.RawMessage(`false`)
			if requirePO {
				raw = json.RawMessage(`true`)
			}
			_ = c.settings.UpsertOverrideQuiet(ctx, businessID, userID, "warehouse.po.require_approval", "BUSINESS", &businessID, raw)
		} else {
			requirePO = c.settings.GetBool(ctx, sc, "warehouse.po.require_approval", false)
		}
		if req.RequireGRNApproval != nil {
			requireGRN = *req.RequireGRNApproval
			raw := json.RawMessage(`false`)
			if requireGRN {
				raw = json.RawMessage(`true`)
			}
			_ = c.settings.UpsertOverrideQuiet(ctx, businessID, userID, "warehouse.grn.require_approval", "BUSINESS", &businessID, raw)
		} else {
			requireGRN = c.settings.GetBool(ctx, sc, "warehouse.grn.require_approval", false)
		}
	}

	return map[string]any{
		"profile":              prof,
		"require_po_approval":  requirePO,
		"require_grn_approval": requireGRN,
	}, nil
}

// ApplyIndustryPreset persists a business-level industry profile and seeds matching Level-2 POS layout/feature defaults.
func (c *CatalogCompanyUsecase) ApplyIndustryPreset(ctx context.Context, businessID, userID uuid.UUID, rawMode string) (string, error) {
	mode, ok := NormalizeIndustryProfile(rawMode)
	if !ok {
		return "", fmt.Errorf("unsupported industry layout mode %q", rawMode)
	}
	if err := c.queries.UpdateBusinessIndustryProfile(ctx, db.UpdateBusinessIndustryProfileParams{
		ID:              businessID,
		IndustryProfile: mode,
	}); err != nil {
		return "", err
	}
	if err := c.applyIndustryPresetQuiet(ctx, businessID, userID, mode); err != nil {
		return "", err
	}
	if c.settings != nil {
		c.settings.InvalidateAndWarmBusiness(ctx, businessID, "pos.ui.layout_mode", "BUSINESS")
	}
	return mode, nil
}

func (c *CatalogCompanyUsecase) applyIndustryPresetQuiet(ctx context.Context, businessID, userID uuid.UUID, mode string) error {
	if c.settings != nil {
		for k, val := range IndustryBusinessSettingValues(mode) {
			if err := c.settings.UpsertOverrideQuiet(ctx, businessID, userID, k, "BUSINESS", &businessID, val); err != nil {
				return err
			}
		}
	}
	_, _ = EnsureIndustryDepartmentsAndDesignations(ctx, c.queries, businessID, mode)
	_ = EnsureIndustryBrands(ctx, c.queries, businessID, mode)
	return nil
}

func normalizePhoneNumber(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	var b strings.Builder
	for idx, r := range trimmed {
		if (r >= '0' && r <= '9') || (r == '+' && idx == 0) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

var nonSlugChars = regexp.MustCompile(`[^a-z0-9]+`)

func normalizeCategorySlug(rawName, rawSlug string) string {
	base := strings.TrimSpace(rawSlug)
	if base == "" {
		base = strings.TrimSpace(rawName)
	}
	s := strings.ToLower(base)
	s = nonSlugChars.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		return "category"
	}
	return s
}

// UpdateCustomer updates an existing CRM customer profile and credit line.
func (c *CatalogCompanyUsecase) UpdateCustomer(ctx context.Context, businessID, customerID uuid.UUID, req CreateCustomerRequest) (db.UpdateCustomerRow, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return db.UpdateCustomerRow{}, errors.New("full name is required")
	}
	normalizedPhone := normalizePhoneNumber(req.Phone)
	tier := strings.TrimSpace(req.Tier)
	switch tier {
	case "Standard", "Bronze", "Silver", "Gold":
	default:
		tier = "Bronze"
	}
	creditLimit := req.CreditLimit
	if !req.CreditEnabled || creditLimit.IsNegative() {
		creditLimit = decimal.Zero
	}
	return c.queries.UpdateCustomer(ctx, db.UpdateCustomerParams{
		BusinessID:    businessID,
		ID:            customerID,
		Name:          name,
		Email:         strings.TrimSpace(req.Email),
		Phone:         normalizedPhone,
		Tier:          tier,
		AvatarUrl:     strings.TrimSpace(req.AvatarURL),
		CreditEnabled: req.CreditEnabled,
		CreditLimit:   creditLimit.Round(4),
	})
}

// CheckLowStockOnProductSave evaluates active branches when product minimum thresholds are updated.
func (c *CatalogCompanyUsecase) CheckLowStockOnProductSave(ctx context.Context, businessID, branchID, productID uuid.UUID) {
	if c.inventory == nil || branchID == uuid.Nil || productID == uuid.Nil {
		return
	}
	_, _, _ = c.inventory.CheckAndDraftLowStockPO(ctx, businessID, branchID, productID)
}

// ListCategories returns all tenant product categories with active SKU counts.
func (c *CatalogCompanyUsecase) ListCategories(ctx context.Context, businessID uuid.UUID) ([]db.ListCategoriesWithCountsRow, error) {
	return c.queries.ListCategoriesWithCounts(ctx, businessID)
}

// SaveCategory creates or updates a product category for the tenant business.
func (c *CatalogCompanyUsecase) SaveCategory(ctx context.Context, businessID uuid.UUID, categoryID *uuid.UUID, req SaveCategoryRequest) (any, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("category name is required")
	}
	slug := normalizeCategorySlug(name, req.Slug)
	seg := strings.TrimSpace(req.GenderSegment)
	if seg == "" {
		seg = "General"
	}
	var tg uuid.NullUUID
	if req.TaxGroupID != nil && *req.TaxGroupID != uuid.Nil {
		tg = uuid.NullUUID{UUID: *req.TaxGroupID, Valid: true}
	}
	if categoryID == nil || *categoryID == uuid.Nil {
		return c.queries.CreateCategory(ctx, db.CreateCategoryParams{
			BusinessID:    businessID,
			ParentID:      uuid.NullUUID{},
			TaxGroupID:    tg,
			Name:          name,
			Slug:          slug,
			GenderSegment: seg,
		})
	}
	return c.queries.UpdateCategory(ctx, db.UpdateCategoryParams{
		BusinessID:    businessID,
		ID:            *categoryID,
		TaxGroupID:    tg,
		Name:          name,
		Slug:          slug,
		GenderSegment: seg,
	})
}

// DeleteCategory removes an unused category or rejects cleanly if active products depend on it.
func (c *CatalogCompanyUsecase) DeleteCategory(ctx context.Context, businessID, categoryID uuid.UUID) error {
	used, err := c.queries.CheckCategoryUsage(ctx, db.CheckCategoryUsageParams{
		BusinessID: businessID,
		CategoryID: categoryID,
	})
	if err != nil {
		return err
	}
	if used {
		return errors.New("cannot delete category while active products are assigned to it")
	}
	return c.queries.DeleteCategory(ctx, db.DeleteCategoryParams{
		BusinessID: businessID,
		ID:         categoryID,
	})
}

// SaveBrandRequest validates product brand creation or updates.
type SaveBrandRequest struct {
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Country     string `json:"country"`
	Website     string `json:"website"`
	LogoURL     string `json:"logo_url"`
	Description string `json:"description"`
	IsActive    *bool  `json:"is_active,omitempty"`
}

// ListBrands returns all tenant product brands with active SKU and stock counts.
func (c *CatalogCompanyUsecase) ListBrands(ctx context.Context, businessID uuid.UUID) ([]db.ListBrandsWithCountsRow, error) {
	return c.queries.ListBrandsWithCounts(ctx, businessID)
}

// SaveBrand creates or updates a product brand for the tenant business.
func (c *CatalogCompanyUsecase) SaveBrand(ctx context.Context, businessID uuid.UUID, brandID *uuid.UUID, req SaveBrandRequest) (any, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("brand name is required")
	}
	slug := normalizeCategorySlug(name, req.Slug)
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	if brandID == nil || *brandID == uuid.Nil {
		return c.queries.CreateBrand(ctx, db.CreateBrandParams{
			BusinessID:  businessID,
			Name:        name,
			Slug:        slug,
			Country:     strings.TrimSpace(req.Country),
			Website:     strings.TrimSpace(req.Website),
			LogoUrl:     strings.TrimSpace(req.LogoURL),
			Description: strings.TrimSpace(req.Description),
			IsActive:    isActive,
		})
	}
	return c.queries.UpdateBrand(ctx, db.UpdateBrandParams{
		BusinessID:  businessID,
		ID:          *brandID,
		Name:        name,
		Slug:        slug,
		Country:     strings.TrimSpace(req.Country),
		Website:     strings.TrimSpace(req.Website),
		LogoUrl:     strings.TrimSpace(req.LogoURL),
		Description: strings.TrimSpace(req.Description),
		IsActive:    isActive,
	})
}

// DeleteBrand removes an unused brand or rejects cleanly if active products are linked to it.
func (c *CatalogCompanyUsecase) DeleteBrand(ctx context.Context, businessID, brandID uuid.UUID) error {
	used, err := c.queries.CheckBrandUsage(ctx, db.CheckBrandUsageParams{
		BusinessID: businessID,
		BrandID:    uuid.NullUUID{UUID: brandID, Valid: true},
	})
	if err != nil {
		return err
	}
	if used {
		return errors.New("cannot delete brand while active products are assigned to it")
	}
	return c.queries.DeleteBrand(ctx, db.DeleteBrandParams{
		BusinessID: businessID,
		ID:         brandID,
	})
}

// ListAccessUsers returns row-wise business user logins, tenant-visible roles, departments, designations, branches, terminals, and PIN readiness.
func (c *CatalogCompanyUsecase) ListAccessUsers(ctx context.Context, businessID uuid.UUID, includeSuperAdmin bool) (map[string]any, error) {
	users, err := c.queries.ListBusinessAccessUsers(ctx, businessID)
	if err != nil {
		return nil, err
	}
	rawRoles, _ := c.queries.ListRolesCatalogForBusiness(ctx, uuid.NullUUID{UUID: businessID, Valid: businessID != uuid.Nil})
	roles := make([]db.ListRolesCatalogForBusinessRow, 0, len(rawRoles))
	for _, r := range rawRoles {
		if !includeSuperAdmin && r.Code == "SuperAdmin" {
			continue
		}
		roles = append(roles, r)
	}
	departments, _ := c.queries.ListDepartmentsForBusiness(ctx, businessID)
	designations, _ := c.queries.ListDesignationsForBusiness(ctx, businessID)
	branches, _ := c.queries.ListBranchesForBusiness(ctx, businessID)
	terminals, _ := c.queries.ListTerminalsWithBranchForBusiness(ctx, db.ListTerminalsWithBranchForBusinessParams{
		BusinessID: businessID,
		Column2:    uuid.Nil,
	})
	return map[string]any{
		"users":        users,
		"roles":        roles,
		"departments":  departments,
		"designations": designations,
		"branches":     branches,
		"terminals":    terminals,
	}, nil
}

// resolveUserBranchAndTerminalScope validates multi-branch & multi-terminal staff assignments for any role.
func (c *CatalogCompanyUsecase) resolveUserBranchAndTerminalScope(
	ctx context.Context,
	businessID uuid.UUID,
	roleCode string,
	req SaveAccessUserRequest,
) (uuid.NullUUID, bool, []uuid.UUID, []uuid.UUID, uuid.NullUUID, error) {
	allBranches := IsMultiBranchRole(roleCode)
	if req.AllBranchesAccess != nil && *req.AllBranchesAccess {
		allBranches = true
	}

	seenBranches := make(map[uuid.UUID]bool)
	allowedBranches := make([]uuid.UUID, 0, len(req.AllowedBranchIDs)+1)
	for _, bid := range req.AllowedBranchIDs {
		if bid == uuid.Nil || seenBranches[bid] {
			continue
		}
		if _, err := c.queries.GetBranchForBusiness(ctx, db.GetBranchForBusinessParams{
			BusinessID: businessID,
			ID:         bid,
		}); err != nil {
			return uuid.NullUUID{}, false, nil, nil, uuid.NullUUID{}, errors.New("one or more selected branches do not belong to this business")
		}
		seenBranches[bid] = true
		allowedBranches = append(allowedBranches, bid)
	}

	var primaryBranch uuid.NullUUID
	if req.BranchID != nil && *req.BranchID != uuid.Nil {
		if _, err := c.queries.GetBranchForBusiness(ctx, db.GetBranchForBusinessParams{
			BusinessID: businessID,
			ID:         *req.BranchID,
		}); err != nil {
			return uuid.NullUUID{}, false, nil, nil, uuid.NullUUID{}, errors.New("selected branch does not belong to this business")
		}
		primaryBranch = uuid.NullUUID{UUID: *req.BranchID, Valid: true}
		if !seenBranches[*req.BranchID] && !allBranches {
			seenBranches[*req.BranchID] = true
			allowedBranches = append([]uuid.UUID{*req.BranchID}, allowedBranches...)
		}
	} else if len(allowedBranches) > 0 && !allBranches {
		primaryBranch = uuid.NullUUID{UUID: allowedBranches[0], Valid: true}
	}

	if !allBranches && !primaryBranch.Valid && len(allowedBranches) == 0 {
		return uuid.NullUUID{}, false, nil, nil, uuid.NullUUID{}, errors.New("at least one branch (or All Branches access) is required")
	}
	if allBranches && req.AllBranchesAccess != nil && *req.AllBranchesAccess && req.BranchID == nil {
		primaryBranch = uuid.NullUUID{}
	}

	seenTerms := make(map[uuid.UUID]bool)
	allowedTerms := make([]uuid.UUID, 0, len(req.AllowedTerminalIDs))
	for _, tid := range req.AllowedTerminalIDs {
		if tid == uuid.Nil || seenTerms[tid] {
			continue
		}
		tmRow, err := c.queries.GetTerminalForBusiness(ctx, db.GetTerminalForBusinessParams{
			BusinessID: businessID,
			ID:         tid,
		})
		if err != nil {
			return uuid.NullUUID{}, false, nil, nil, uuid.NullUUID{}, errors.New("one or more selected terminals do not belong to this business")
		}
		if !allBranches && len(allowedBranches) > 0 && !seenBranches[tmRow.BranchID] {
			continue
		}
		seenTerms[tid] = true
		allowedTerms = append(allowedTerms, tid)
	}

	var defaultTerm uuid.NullUUID
	if req.DefaultTerminalID != nil && *req.DefaultTerminalID != uuid.Nil {
		if _, err := c.queries.GetTerminalForBusiness(ctx, db.GetTerminalForBusinessParams{
			BusinessID: businessID,
			ID:         *req.DefaultTerminalID,
		}); err == nil {
			defaultTerm = uuid.NullUUID{UUID: *req.DefaultTerminalID, Valid: true}
		}
	} else if len(allowedTerms) > 0 {
		defaultTerm = uuid.NullUUID{UUID: allowedTerms[0], Valid: true}
	}

	return primaryBranch, allBranches, allowedBranches, allowedTerms, defaultTerm, nil
}

// CreateAccessUser registers or links a user account with an assigned role/designation in this business.
func (c *CatalogCompanyUsecase) CreateAccessUser(ctx context.Context, businessID uuid.UUID, includeSuperAdmin bool, req SaveAccessUserRequest) (map[string]any, error) {
	fullName := strings.TrimSpace(req.FullName)
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if fullName == "" || email == "" || !strings.Contains(email, "@") {
		return nil, errors.New("valid full name and email are required")
	}
	if req.RoleID == uuid.Nil {
		return nil, errors.New("role_id is required")
	}

	roleRow, rErr := c.queries.GetRoleForBusiness(ctx, db.GetRoleForBusinessParams{
		ID:         req.RoleID,
		BusinessID: uuid.NullUUID{UUID: businessID, Valid: businessID != uuid.Nil},
	})
	if rErr != nil {
		return nil, errors.New("selected role does not belong to this business")
	}
	if roleRow.Code == "SuperAdmin" && !includeSuperAdmin {
		return nil, errors.New("only platform SuperAdmins may assign the SuperAdmin role")
	}

	brID, allBranches, allowedBranches, allowedTerms, defaultTerm, brErr := c.resolveUserBranchAndTerminalScope(ctx, businessID, roleRow.Code, req)
	if brErr != nil {
		return nil, brErr
	}

	var userID uuid.UUID
	existing, err := c.queries.GetUserByEmailAny(ctx, email)
	if err == nil {
		userID = existing.ID
		exists, chkErr := c.queries.CheckUserBusinessRoleExists(ctx, db.CheckUserBusinessRoleExistsParams{
			UserID:     userID,
			BusinessID: businessID,
			RoleID:     req.RoleID,
		})
		if chkErr == nil && exists {
			return nil, errors.New("staff account already holds this role in the active business")
		}
	} else {
		pw := strings.TrimSpace(req.Password)
		if pw == "" {
			pw = "PosAdmin2026!"
		}
		hashBytes, hErr := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
		if hErr != nil {
			return nil, hErr
		}
		created, cErr := c.queries.CreateAccessUser(ctx, db.CreateAccessUserParams{
			Email:        email,
			FullName:     fullName,
			PasswordHash: string(hashBytes),
			AvatarUrl:    "",
		})
		if cErr != nil {
			return nil, cErr
		}
		userID = created.ID
	}

	var desigID uuid.NullUUID
	if req.DesignationID != nil && *req.DesignationID != uuid.Nil {
		desigID = uuid.NullUUID{UUID: *req.DesignationID, Valid: true}
	}
	pinHash := ""
	pin := strings.TrimSpace(req.SupervisorPIN)
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

	ubr, err := c.queries.InsertUserBusinessRole(ctx, db.InsertUserBusinessRoleParams{
		UserID:             userID,
		BusinessID:         businessID,
		BranchID:           brID,
		RoleID:             req.RoleID,
		DesignationID:      desigID,
		SupervisorPinHash:  pinHash,
		IsActive:           true,
		AllBranchesAccess:  allBranches,
		AllowedBranchIds:   allowedBranches,
		AllowedTerminalIds: allowedTerms,
		DefaultTerminalID:  defaultTerm,
	})
	if err != nil {
		return nil, err
	}
	if c.redis != nil {
		_ = c.redis.Del(ctx, fmt.Sprintf("rbac:biz:%s:user:%s", businessID.String(), userID.String())).Err()
	}
	return map[string]any{"assignment": ubr, "email": email, "full_name": fullName, "role_code": roleRow.Code}, nil
}

// UpdateAccessUser updates user full name, role, designation, multi-branch/terminal scope, active status, and optional 6-digit PIN.
func (c *CatalogCompanyUsecase) UpdateAccessUser(ctx context.Context, businessID, ubrID, userID uuid.UUID, includeSuperAdmin bool, req SaveAccessUserRequest) (map[string]any, error) {
	if req.RoleID == uuid.Nil {
		return nil, errors.New("role_id is required")
	}

	currentUBR, err := c.queries.GetUserBusinessRoleByID(ctx, db.GetUserBusinessRoleByIDParams{
		BusinessID: businessID,
		ID:         ubrID,
	})
	if err != nil {
		return nil, errors.New("staff assignment not found for active business")
	}

	roleRow, rErr := c.queries.GetRoleForBusiness(ctx, db.GetRoleForBusinessParams{
		ID:         req.RoleID,
		BusinessID: uuid.NullUUID{UUID: businessID, Valid: businessID != uuid.Nil},
	})
	if rErr != nil {
		return nil, errors.New("selected role does not belong to this business")
	}
	if roleRow.Code == "SuperAdmin" && !includeSuperAdmin {
		return nil, errors.New("only platform SuperAdmins may assign the SuperAdmin role")
	}

	// Preserve existing multi-branch/terminal assignments when inline row updates only toggle role, designation, or active flag.
	if req.AllBranchesAccess == nil && len(req.AllowedBranchIDs) == 0 && req.BranchID == nil {
		existingAll := currentUBR.AllBranchesAccess
		req.AllBranchesAccess = &existingAll
		req.AllowedBranchIDs = currentUBR.AllowedBranchIds
		if currentUBR.BranchID.Valid {
			bCopy := currentUBR.BranchID.UUID
			req.BranchID = &bCopy
		}
	}
	if len(req.AllowedTerminalIDs) == 0 && req.DefaultTerminalID == nil && len(currentUBR.AllowedTerminalIds) > 0 {
		req.AllowedTerminalIDs = currentUBR.AllowedTerminalIds
		if currentUBR.DefaultTerminalID.Valid {
			tCopy := currentUBR.DefaultTerminalID.UUID
			req.DefaultTerminalID = &tCopy
		}
	}

	brID, allBranches, allowedBranches, allowedTerms, defaultTerm, brErr := c.resolveUserBranchAndTerminalScope(ctx, businessID, roleRow.Code, req)
	if brErr != nil {
		return nil, brErr
	}

	targetUserID := currentUBR.UserID
	if userID != uuid.Nil {
		targetUserID = userID
	}
	if strings.TrimSpace(req.FullName) != "" && targetUserID != uuid.Nil {
		_ = c.queries.UpdateAccessUserDetails(ctx, db.UpdateAccessUserDetailsParams{
			ID:      targetUserID,
			Column2: strings.TrimSpace(req.FullName),
		})
	}
	var desigID uuid.NullUUID
	if req.DesignationID != nil && *req.DesignationID != uuid.Nil {
		desigID = uuid.NullUUID{UUID: *req.DesignationID, Valid: true}
	}
	updated, err := c.queries.UpdateUserBusinessRoleAssignment(ctx, db.UpdateUserBusinessRoleAssignmentParams{
		BusinessID:         businessID,
		ID:                 ubrID,
		RoleID:             req.RoleID,
		DesignationID:      desigID,
		BranchID:           brID,
		IsActive:           req.IsActive,
		AllBranchesAccess:  allBranches,
		AllowedBranchIds:   allowedBranches,
		AllowedTerminalIds: allowedTerms,
		DefaultTerminalID:  defaultTerm,
	})
	if err != nil {
		return nil, err
	}
	pin := strings.TrimSpace(req.SupervisorPIN)
	if pin != "" {
		if len(pin) != 6 {
			return nil, errors.New("supervisor PIN must be exactly 6 digits")
		}
		pb, pErr := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.DefaultCost)
		if pErr != nil {
			return nil, pErr
		}
		if err := c.queries.UpdateUserBusinessRolePIN(ctx, db.UpdateUserBusinessRolePINParams{
			BusinessID:        businessID,
			ID:                ubrID,
			SupervisorPinHash: string(pb),
		}); err != nil {
			return nil, err
		}
	}
	if c.redis != nil {
		_ = c.redis.Del(ctx, fmt.Sprintf("rbac:biz:%s:user:%s", businessID.String(), updated.UserID.String())).Err()
	}
	return map[string]any{"assignment": updated, "role_code": roleRow.Code}, nil
}

// ListNotifications returns persistent tenant alerts and unread badge count.
func (c *CatalogCompanyUsecase) ListNotifications(ctx context.Context, businessID uuid.UUID) (map[string]any, error) {
	items, err := c.queries.ListSystemNotifications(ctx, businessID)
	if err != nil {
		return nil, err
	}
	unread, _ := c.queries.CountUnreadNotifications(ctx, businessID)
	return map[string]any{
		"items":        items,
		"unread_count": unread,
	}, nil
}

// MarkNotificationRead marks a single tenant notification as read.
func (c *CatalogCompanyUsecase) MarkNotificationRead(ctx context.Context, businessID, notifID uuid.UUID) error {
	return c.queries.MarkNotificationRead(ctx, db.MarkNotificationReadParams{
		BusinessID: businessID,
		ID:         notifID,
	})
}

// MarkAllNotificationsRead marks all unread notifications for the business as read.
func (c *CatalogCompanyUsecase) MarkAllNotificationsRead(ctx context.Context, businessID uuid.UUID) error {
	return c.queries.MarkAllNotificationsRead(ctx, businessID)
}

// ListAllPermissions returns tenant-assignable permissions (excluding cross-company platform:admin).
func (c *CatalogCompanyUsecase) ListAllPermissions(ctx context.Context) ([]db.Permission, error) {
	rows, err := c.queries.ListAllPermissions(ctx)
	if err != nil {
		return nil, err
	}
	filtered := make([]db.Permission, 0, len(rows))
	for _, p := range rows {
		if p.Code == "platform:admin" {
			continue
		}
		filtered = append(filtered, p)
	}
	return filtered, nil
}

// CreateCustomRole creates a tenant-scoped custom role and assigns its permission set.
func (c *CatalogCompanyUsecase) CreateCustomRole(ctx context.Context, businessID uuid.UUID, req SaveCustomRoleRequest) (map[string]any, error) {
	code := strings.TrimSpace(req.Code)
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("role name is required")
	}
	if code == "" {
		code = slugifyIdentifier(name)
	}
	code = strings.ReplaceAll(strings.ToUpper(code), "-", "_")

	role, err := c.queries.CreateCustomRole(ctx, db.CreateCustomRoleParams{
		BusinessID:  uuid.NullUUID{UUID: businessID, Valid: true},
		Code:        code,
		Name:        name,
		Description: strings.TrimSpace(req.Description),
	})
	if err != nil {
		return nil, err
	}
	c.assignRolePermissions(ctx, role.ID, req.Permissions)
	return map[string]any{"role": role, "permissions": req.Permissions}, nil
}

// UpdateCustomRole updates a business-owned custom role and invalidates Redis permission caches.
func (c *CatalogCompanyUsecase) UpdateCustomRole(ctx context.Context, businessID, roleID uuid.UUID, req SaveCustomRoleRequest) (map[string]any, error) {
	existing, err := c.queries.GetRoleForBusiness(ctx, db.GetRoleForBusinessParams{
		ID:         roleID,
		BusinessID: uuid.NullUUID{UUID: businessID, Valid: true},
	})
	if err != nil {
		return nil, errors.New("role not found for this business")
	}
	if existing.IsSystem || !existing.BusinessID.Valid || existing.BusinessID.UUID != businessID {
		return nil, errors.New("system baseline roles cannot be edited; create a custom role instead")
	}

	updated, err := c.queries.UpdateCustomRole(ctx, db.UpdateCustomRoleParams{
		ID:          roleID,
		BusinessID:  uuid.NullUUID{UUID: businessID, Valid: true},
		Column3:     strings.TrimSpace(req.Name),
		Description: strings.TrimSpace(req.Description),
	})
	if err != nil {
		return nil, err
	}
	if err := c.queries.DeleteRolePermissions(ctx, roleID); err != nil {
		return nil, err
	}
	c.assignRolePermissions(ctx, roleID, req.Permissions)

	if c.redis != nil {
		userIDs, _ := c.queries.ListUserIDsByRoleAndBusiness(ctx, db.ListUserIDsByRoleAndBusinessParams{
			BusinessID: businessID,
			RoleID:     roleID,
		})
		for _, uid := range userIDs {
			_ = c.redis.Del(ctx, fmt.Sprintf("rbac:biz:%s:user:%s", businessID.String(), uid.String())).Err()
		}
	}
	return map[string]any{"role": updated, "permissions": req.Permissions}, nil
}

func (c *CatalogCompanyUsecase) assignRolePermissions(ctx context.Context, roleID uuid.UUID, permCodes []string) {
	seen := make(map[string]struct{}, len(permCodes))
	for _, raw := range permCodes {
		code := strings.TrimSpace(raw)
		if code == "" || code == "platform:admin" {
			// Tenant custom roles must never grant cross-tenant platform:admin access.
			continue
		}
		if _, ok := seen[code]; ok {
			continue
		}
		seen[code] = struct{}{}
		_ = c.queries.InsertRolePermissionByCode(ctx, db.InsertRolePermissionByCodeParams{
			RoleID: roleID,
			Code:   code,
		})
	}
}

// ListDepartmentsAndDesignations returns departments and designations with max POS discount caps for the tenant.
func (c *CatalogCompanyUsecase) ListDepartmentsAndDesignations(ctx context.Context, businessID uuid.UUID) (map[string]any, error) {
	departments, err := c.queries.ListDepartmentsForBusiness(ctx, businessID)
	if err != nil {
		return nil, err
	}
	designations, err := c.queries.ListDesignationsForBusiness(ctx, businessID)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"departments":  departments,
		"designations": designations,
	}, nil
}

// CreateDepartment creates a tenant department row cleanly.
func (c *CatalogCompanyUsecase) CreateDepartment(ctx context.Context, businessID uuid.UUID, req SaveDepartmentRequest) (db.Department, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return db.Department{}, errors.New("department name is required")
	}
	code := strings.ToUpper(strings.TrimSpace(req.Code))
	if code == "" {
		code = strings.ToUpper(slugifyIdentifier(name))
	}
	return c.queries.CreateDepartment(ctx, db.CreateDepartmentParams{
		BusinessID: businessID,
		Code:       code,
		Name:       name,
	})
}

// CreateDesignation creates a tenant designation with department reference and POS discount percentage limit.
func (c *CatalogCompanyUsecase) CreateDesignation(ctx context.Context, businessID uuid.UUID, req SaveDesignationRequest) (db.Designation, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return db.Designation{}, errors.New("designation name is required")
	}
	if req.DepartmentID == uuid.Nil {
		depts, _ := c.queries.ListDepartmentsForBusiness(ctx, businessID)
		if len(depts) > 0 {
			req.DepartmentID = depts[0].ID
		} else {
			created, dErr := c.CreateDepartment(ctx, businessID, SaveDepartmentRequest{Code: "GEN", Name: "General Operations"})
			if dErr != nil {
				return db.Designation{}, dErr
			}
			req.DepartmentID = created.ID
		}
	}
	code := strings.ToUpper(strings.TrimSpace(req.Code))
	if code == "" {
		code = strings.ToUpper(slugifyIdentifier(name))
	}
	maxDisc := req.MaxPOSDiscountPct
	if maxDisc.LessThan(decimal.Zero) {
		maxDisc = decimal.Zero
	}
	if maxDisc.GreaterThan(decimal.NewFromInt(100)) {
		maxDisc = decimal.NewFromInt(100)
	}
	return c.queries.CreateDesignation(ctx, db.CreateDesignationParams{
		BusinessID:        businessID,
		DepartmentID:      req.DepartmentID,
		Code:              code,
		Name:              name,
		MaxPosDiscountPct: maxDisc.Round(2),
	})
}

// UpdateDesignation updates an existing tenant designation and discount ceiling.
func (c *CatalogCompanyUsecase) UpdateDesignation(ctx context.Context, businessID, designationID uuid.UUID, req SaveDesignationRequest) (db.Designation, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return db.Designation{}, errors.New("designation name is required")
	}
	code := strings.ToUpper(strings.TrimSpace(req.Code))
	if code == "" {
		code = strings.ToUpper(slugifyIdentifier(name))
	}
	maxDisc := req.MaxPOSDiscountPct
	if maxDisc.LessThan(decimal.Zero) {
		maxDisc = decimal.Zero
	}
	if maxDisc.GreaterThan(decimal.NewFromInt(100)) {
		maxDisc = decimal.NewFromInt(100)
	}
	return c.queries.UpdateDesignation(ctx, db.UpdateDesignationParams{
		BusinessID:        businessID,
		ID:                designationID,
		DepartmentID:      req.DepartmentID,
		Code:              code,
		Name:              name,
		MaxPosDiscountPct: maxDisc.Round(2),
	})
}

// ListTaxGroupsAndRules returns tenant tax groups, multi-tier tax rules, VAT reg number, and active rounding mode.
func (c *CatalogCompanyUsecase) ListTaxGroupsAndRules(ctx context.Context, businessID uuid.UUID) (map[string]any, error) {
	groups, err := c.queries.ListTaxGroupsForBusiness(ctx, businessID)
	if err != nil {
		return nil, err
	}
	rules, err := c.queries.ListAllTaxRulesDetailedForBusiness(ctx, businessID)
	if err != nil {
		return nil, err
	}
	prof, err := c.queries.GetBusinessProfile(ctx, businessID)
	if err != nil {
		return nil, err
	}
	roundingMode := "HALF_UP"
	if c.settings != nil {
		roundingMode = c.settings.GetString(ctx, SettingsContext{BusinessID: businessID}, "tax.rounding_mode", "HALF_UP")
	}
	return map[string]any{
		"tax_groups":          groups,
		"tax_rules":           rules,
		"tax_registration_no": prof.TaxRegistrationNo,
		"rounding_mode":       roundingMode,
	}, nil
}

// SaveTaxGroup creates or updates a tenant-isolated tax group.
func (c *CatalogCompanyUsecase) SaveTaxGroup(ctx context.Context, businessID, userID uuid.UUID, groupID *uuid.UUID, req SaveTaxGroupRequest) (db.TaxGroup, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return db.TaxGroup{}, errors.New("tax group name is required")
	}
	code := strings.ToUpper(strings.TrimSpace(req.Code))
	if code == "" {
		code = strings.ToUpper(slugifyIdentifier(name))
	}
	if req.IsDefault {
		_ = c.queries.ClearDefaultTaxGroupsForBusiness(ctx, businessID)
	}
	var out db.TaxGroup
	var err error
	if groupID == nil || *groupID == uuid.Nil {
		out, err = c.queries.CreateTaxGroup(ctx, db.CreateTaxGroupParams{
			BusinessID: businessID,
			Code:       code,
			Name:       name,
			IsDefault:  req.IsDefault,
		})
	} else {
		out, err = c.queries.UpdateTaxGroup(ctx, db.UpdateTaxGroupParams{
			BusinessID: businessID,
			ID:         *groupID,
			Code:       code,
			Name:       name,
			IsDefault:  req.IsDefault,
		})
	}
	if err == nil && c.settings != nil {
		c.settings.InvalidateAndWarmBusiness(ctx, businessID, "tax.rounding_mode", "BUSINESS")
	}
	return out, err
}

// SaveTaxRule creates or updates a multi-tier tax rule inside a tenant tax group.
func (c *CatalogCompanyUsecase) SaveTaxRule(ctx context.Context, businessID uuid.UUID, ruleID *uuid.UUID, req SaveTaxRuleRequest) (db.TaxRule, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return db.TaxRule{}, errors.New("tax rule name is required")
	}
	if req.TaxGroupID == uuid.Nil {
		return db.TaxRule{}, errors.New("tax_group_id is required")
	}
	if _, err := c.queries.GetTaxGroupByID(ctx, db.GetTaxGroupByIDParams{
		BusinessID: businessID,
		ID:         req.TaxGroupID,
	}); err != nil {
		return db.TaxRule{}, errors.New("tax group not found for this business")
	}
	taxType := strings.ToUpper(strings.TrimSpace(req.TaxType))
	switch taxType {
	case "EXCLUSIVE", "INCLUSIVE", "COMPOUND":
	default:
		taxType = "EXCLUSIVE"
	}
	rate := req.RatePercent
	if rate.LessThan(decimal.Zero) {
		rate = decimal.Zero
	}
	priority := req.Priority
	if priority <= 0 {
		priority = 1
	}
	code := strings.ToUpper(strings.TrimSpace(req.Code))
	if code == "" {
		code = strings.ToUpper(slugifyIdentifier(name))
	}

	if ruleID == nil || *ruleID == uuid.Nil {
		return c.queries.CreateTaxRule(ctx, db.CreateTaxRuleParams{
			BusinessID:  businessID,
			TaxGroupID:  req.TaxGroupID,
			Code:        code,
			Name:        name,
			TaxType:     taxType,
			RatePercent: rate.Round(4),
			Priority:    priority,
			IsActive:    req.IsActive,
		})
	}
	return c.queries.UpdateTaxRule(ctx, db.UpdateTaxRuleParams{
		BusinessID:  businessID,
		ID:          *ruleID,
		Code:        code,
		Name:        name,
		TaxType:     taxType,
		RatePercent: rate.Round(4),
		Priority:    priority,
		IsActive:    req.IsActive,
	})
}

// DeleteTaxRule deletes a single tax rule owned by the active business.
func (c *CatalogCompanyUsecase) DeleteTaxRule(ctx context.Context, businessID, ruleID uuid.UUID) error {
	return c.queries.DeleteTaxRule(ctx, db.DeleteTaxRuleParams{
		BusinessID: businessID,
		ID:         ruleID,
	})
}

// ApplySLTaxPreset configures Sri Lankan IRD VAT (18%) and SSCL (2.5%), VAT reg number, and rounding mode for the tenant.
func (c *CatalogCompanyUsecase) ApplySLTaxPreset(ctx context.Context, businessID, userID uuid.UUID, req ApplySLTaxPresetRequest) (map[string]any, error) {
	prof, err := c.queries.GetBusinessProfile(ctx, businessID)
	if err != nil {
		return nil, err
	}

	if reg := strings.TrimSpace(req.TaxRegistrationNo); reg != "" {
		_, err = c.queries.UpdateBusinessProfile(ctx, db.UpdateBusinessProfileParams{
			ID:                businessID,
			Column2:           prof.Name,
			Column3:           prof.TradeName,
			Column4:           prof.LegalName,
			TaxRegistrationNo: reg,
			Column6:           prof.BaseCurrency,
			LogoLightUrl:      prof.LogoLightUrl,
			LogoDarkUrl:       prof.LogoDarkUrl,
			LogoReceiptUrl:    prof.LogoReceiptUrl,
			Column10:          prof.PrimaryColorHex,
			Column11:          prof.DefaultLanguage,
			Column12:          prof.IndustryProfile,
		})
		if err != nil {
			return nil, err
		}
	}

	if c.settings != nil && strings.TrimSpace(req.RoundingMode) != "" {
		if rawRound, mErr := json.Marshal(strings.ToUpper(strings.TrimSpace(req.RoundingMode))); mErr == nil {
			_ = c.settings.UpsertOverride(ctx, businessID, userID, "tax.rounding_mode", "BUSINESS", &businessID, rawRound)
		}
	}

	groups, err := c.queries.ListTaxGroupsForBusiness(ctx, businessID)
	if err != nil {
		return nil, err
	}
	var stdGroupID uuid.UUID
	for _, g := range groups {
		if g.IsDefault || g.Code == "STD_DEFAULT" || g.Code == "STD_APPAREL" {
			stdGroupID = g.ID
			break
		}
	}
	if stdGroupID == uuid.Nil {
		created, gErr := c.queries.CreateTaxGroup(ctx, db.CreateTaxGroupParams{
			BusinessID: businessID,
			Code:       "STD_DEFAULT",
			Name:       "Sri Lanka Standard VAT & SSCL",
			IsDefault:  true,
		})
		if gErr != nil {
			return nil, gErr
		}
		stdGroupID = created.ID
	}

	_ = c.queries.DeactivateOtherTaxRulesInGroup(ctx, db.DeactivateOtherTaxRulesInGroupParams{
		BusinessID: businessID,
		TaxGroupID: stdGroupID,
		Code:       "SL_VAT_18",
		Code_2:     "SL_SSCL_2_5",
	})

	if _, err := c.queries.UpsertTaxRuleByCode(ctx, db.UpsertTaxRuleByCodeParams{
		BusinessID:  businessID,
		TaxGroupID:  stdGroupID,
		Code:        "SL_VAT_18",
		Name:        "VAT (18%)",
		TaxType:     "EXCLUSIVE",
		RatePercent: decimal.NewFromInt(18),
		Priority:    1,
		IsActive:    req.ApplyVAT,
	}); err != nil {
		return nil, err
	}

	if _, err := c.queries.UpsertTaxRuleByCode(ctx, db.UpsertTaxRuleByCodeParams{
		BusinessID:  businessID,
		TaxGroupID:  stdGroupID,
		Code:        "SL_SSCL_2_5",
		Name:        "SSCL (2.5%)",
		TaxType:     "EXCLUSIVE",
		RatePercent: decimal.RequireFromString("2.5000"),
		Priority:    2,
		IsActive:    req.ApplySSCL,
	}); err != nil {
		return nil, err
	}

	if req.ApplyToAllCategories {
		_ = c.queries.AssignCategoriesDefaultTaxGroup(ctx, db.AssignCategoriesDefaultTaxGroupParams{
			BusinessID: businessID,
			TaxGroupID: uuid.NullUUID{UUID: stdGroupID, Valid: true},
		})
	}

	return c.ListTaxGroupsAndRules(ctx, businessID)
}

func slugifyIdentifier(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	s = strings.ReplaceAll(s, " ", "-")
	var out strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			out.WriteRune(r)
		}
	}
	res := strings.Trim(out.String(), "-_")
	if res == "" {
		return "custom"
	}
	return res
}

