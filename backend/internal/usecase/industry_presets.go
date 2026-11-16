package usecase

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/enterprise-pos/backend/internal/repository/sqlc/db"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// IndustryDepartmentSeed defines a default department auto-provisioned for a business vertical.
type IndustryDepartmentSeed struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

// IndustryDesignationSeed defines a role designation & POS discount ceiling tailored to an industry vertical.
type IndustryDesignationSeed struct {
	DeptCode          string  `json:"dept_code"`
	Code              string  `json:"code"`
	Name              string  `json:"name"`
	MaxPOSDiscountPct float64 `json:"max_pos_discount_pct"`
}

// IndustryStarterCategory defines an initial product category created during company provisioning.
type IndustryStarterCategory struct {
	Name string `json:"name"`
	Slug string `json:"slug"`
}

// IndustryStarterBrand defines an initial vendor/product brand auto-provisioned for a business vertical.
type IndustryStarterBrand struct {
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Country     string `json:"country"`
	Website     string `json:"website"`
	Description string `json:"description"`
}

// IndustryBlueprint defines the full operational defaults migrated automatically per business vertical.
type IndustryBlueprint struct {
	Mode                 string                      `json:"mode"`
	DefaultBranchName    string                      `json:"default_branch_name"`
	DefaultBranchCode    string                      `json:"default_branch_code"`
	ThermalPaperWidth    string                      `json:"thermal_paper_width"`
	MaxCashierDiscount   int                         `json:"max_cashier_discount_pct"`
	LoyaltyPointsPerUnit int                         `json:"loyalty_points_per_unit"`
	RequirePOApproval    bool                        `json:"require_po_approval"`
	RequireGRNApproval   bool                        `json:"require_grn_approval"`
	OwnerDesignationCode string                      `json:"owner_designation_code"`
	Departments          []IndustryDepartmentSeed    `json:"departments"`
	Designations         []IndustryDesignationSeed   `json:"designations"`
	Categories           []IndustryStarterCategory   `json:"categories"`
	Brands               []IndustryStarterBrand      `json:"brands"`
}

// BlueprintForIndustry returns the authoritative operational defaults for the given business vertical.
func BlueprintForIndustry(rawMode string) IndustryBlueprint {
	mode, _ := NormalizeIndustryProfile(rawMode)
	switch mode {
	case "restaurant":
		return IndustryBlueprint{
			Mode:                 "restaurant",
			DefaultBranchName:    "Main Dining Room",
			DefaultBranchCode:    "DINE-01",
			ThermalPaperWidth:    "80mm",
			MaxCashierDiscount:   10,
			LoyaltyPointsPerUnit: 2,
			RequirePOApproval:    false,
			RequireGRNApproval:   false,
			OwnerDesignationCode: "OWNER",
			Departments: []IndustryDepartmentSeed{
				{Code: "EXEC", Name: "Ownership & Management"},
				{Code: "KITCHEN", Name: "Culinary & Kitchen Line"},
				{Code: "FOH", Name: "Dining Room & Front-of-House"},
				{Code: "OPS", Name: "Pantry, Costing & Accounts"},
			},
			Designations: []IndustryDesignationSeed{
				{DeptCode: "EXEC", Code: "OWNER", Name: "Restaurant Proprietor", MaxPOSDiscountPct: 100},
				{DeptCode: "EXEC", Code: "MGR", Name: "Floor & Shift Manager", MaxPOSDiscountPct: 30},
				{DeptCode: "KITCHEN", Code: "CHEF", Name: "Head Chef / KOT Lead", MaxPOSDiscountPct: 15},
				{DeptCode: "FOH", Code: "SERVER", Name: "Waiter / Table Server", MaxPOSDiscountPct: 10},
				{DeptCode: "FOH", Code: "CASHIER", Name: "Counter & Takeaway Cashier", MaxPOSDiscountPct: 10},
				{DeptCode: "OPS", Code: "ACCT", Name: "Senior Accountant", MaxPOSDiscountPct: 15},
				{DeptCode: "OPS", Code: "INV", Name: "Pantry & Supply Controller", MaxPOSDiscountPct: 5},
			},
			Categories: []IndustryStarterCategory{
				{Name: "Main Kitchen", Slug: "main-kitchen"},
				{Name: "Beverages & Bar", Slug: "beverages-bar"},
				{Name: "Desserts & Pastry", Slug: "desserts-pastry"},
			},
			Brands: []IndustryStarterBrand{
				{Name: "Chef Signature", Slug: "chef-signature", Country: "Sri Lanka", Website: "", Description: "House culinary specials & signature menu items"},
				{Name: "Lavazza", Slug: "lavazza", Country: "Italy", Website: "https://lavazza.com", Description: "Single-origin & espresso roast blends"},
				{Name: "Dilmah", Slug: "dilmah", Country: "Sri Lanka", Website: "https://dilmahtea.com", Description: "Ceylon leaf & gourmet iced tea selections"},
				{Name: "San Pellegrino", Slug: "san-pellegrino", Country: "Italy", Website: "https://sanpellegrino.com", Description: "Sparkling mineral water & citrus beverages"},
				{Name: "Valrhona", Slug: "valrhona", Country: "France", Website: "https://valrhona.com", Description: "Fine artisan chocolate & pastry coverings"},
			},
		}
	case "hardware":
		return IndustryBlueprint{
			Mode:                 "hardware",
			DefaultBranchName:    "Central Hardware Yard",
			DefaultBranchCode:    "YARD-01",
			ThermalPaperWidth:    "80mm",
			MaxCashierDiscount:   20,
			LoyaltyPointsPerUnit: 1,
			RequirePOApproval:    true,
			RequireGRNApproval:   true,
			OwnerDesignationCode: "OWNER",
			Departments: []IndustryDepartmentSeed{
				{Code: "EXEC", Name: "Proprietorship"},
				{Code: "DESK", Name: "Trade & Contractor Desk"},
				{Code: "YARD", Name: "Timber, Dispatch & Warehouse"},
				{Code: "OPS", Name: "Finance & Costing"},
			},
			Designations: []IndustryDesignationSeed{
				{DeptCode: "EXEC", Code: "OWNER", Name: "Hardware Proprietor", MaxPOSDiscountPct: 100},
				{DeptCode: "EXEC", Code: "MGR", Name: "Yard & Branch Manager", MaxPOSDiscountPct: 35},
				{DeptCode: "DESK", Code: "DESK", Name: "Contractor Account Rep", MaxPOSDiscountPct: 20},
				{DeptCode: "DESK", Code: "CASHIER", Name: "Counter & Scale Cashier", MaxPOSDiscountPct: 10},
				{DeptCode: "OPS", Code: "ACCT", Name: "Senior Accountant", MaxPOSDiscountPct: 15},
				{DeptCode: "YARD", Code: "INV", Name: "Warehouse Stock Controller", MaxPOSDiscountPct: 5},
			},
			Categories: []IndustryStarterCategory{
				{Name: "Building Materials", Slug: "building-materials"},
				{Name: "Power Tools & Fasteners", Slug: "power-tools"},
			},
			Brands: []IndustryStarterBrand{
				{Name: "Bosch", Slug: "bosch", Country: "Germany", Website: "https://bosch-professional.com", Description: "Rotary hammers, drills & laser levels"},
				{Name: "Makita", Slug: "makita", Country: "Japan", Website: "https://makita.com", Description: "Brushless 18V LXT cordless site tools"},
				{Name: "DeWalt", Slug: "dewalt", Country: "USA", Website: "https://dewalt.com", Description: "Heavy-duty XR construction power tools"},
				{Name: "Dulux", Slug: "dulux", Country: "UK", Website: "https://dulux.com", Description: "Weathershield exterior & matte paints"},
				{Name: "3M", Slug: "3m", Country: "USA", Website: "https://3m.com", Description: "Industrial adhesives, abrasives & safety PPE"},
				{Name: "Hilti", Slug: "hilti", Country: "Liechtenstein", Website: "https://hilti.com", Description: "Structural concrete anchors & fasteners"},
			},
		}
	case "garage":
		return IndustryBlueprint{
			Mode:                 "garage",
			DefaultBranchName:    "Main Service Bays",
			DefaultBranchCode:    "BAY-01",
			ThermalPaperWidth:    "80mm",
			MaxCashierDiscount:   15,
			LoyaltyPointsPerUnit: 1,
			RequirePOApproval:    true,
			RequireGRNApproval:   false,
			OwnerDesignationCode: "OWNER",
			Departments: []IndustryDepartmentSeed{
				{Code: "EXEC", Name: "Workshop Management"},
				{Code: "BAY", Name: "Service Bays & Diagnostics"},
				{Code: "PARTS", Name: "Spare Parts & Service Counter"},
				{Code: "OPS", Name: "Billing & Accounting"},
			},
			Designations: []IndustryDesignationSeed{
				{DeptCode: "EXEC", Code: "OWNER", Name: "Workshop Owner", MaxPOSDiscountPct: 100},
				{DeptCode: "EXEC", Code: "ADVISOR", Name: "Service Advisor", MaxPOSDiscountPct: 25},
				{DeptCode: "BAY", Code: "TECH", Name: "Lead Mechanic / Technician", MaxPOSDiscountPct: 10},
				{DeptCode: "PARTS", Code: "CASHIER", Name: "Billing & Parts Cashier", MaxPOSDiscountPct: 10},
				{DeptCode: "OPS", Code: "ACCT", Name: "Senior Accountant", MaxPOSDiscountPct: 15},
				{DeptCode: "PARTS", Code: "INV", Name: "Spare Parts Controller", MaxPOSDiscountPct: 5},
			},
			Categories: []IndustryStarterCategory{
				{Name: "Service & Labor", Slug: "service-labor"},
				{Name: "Spare Parts & Fluids", Slug: "spare-parts"},
			},
			Brands: []IndustryStarterBrand{
				{Name: "Toyota Genuine", Slug: "toyota-genuine", Country: "Japan", Website: "https://toyota.com", Description: "OEM factory filters, belts & service kits"},
				{Name: "Mobil 1", Slug: "mobil-1", Country: "USA", Website: "https://mobil.com", Description: "Full-synthetic engine & transmission lubricants"},
				{Name: "Brembo", Slug: "brembo", Country: "Italy", Website: "https://brembo.com", Description: "Ceramic brake pads & ventilated disc rotors"},
				{Name: "Michelin", Slug: "michelin", Country: "France", Website: "https://michelin.com", Description: "All-season passenger & SUV performance tires"},
				{Name: "Bosch Auto", Slug: "bosch-auto", Country: "Germany", Website: "https://boschaftermarket.com", Description: "AGM batteries, wipers, spark plugs & OBD sensors"},
				{Name: "Castrol", Slug: "castrol", Country: "UK", Website: "https://castrol.com", Description: "EDGE motor oil & radiator coolants"},
			},
		}
	case "mobile":
		return IndustryBlueprint{
			Mode:                 "mobile",
			DefaultBranchName:    "Flagship Device Lounge",
			DefaultBranchCode:    "TECH-01",
			ThermalPaperWidth:    "80mm",
			MaxCashierDiscount:   10,
			LoyaltyPointsPerUnit: 1,
			RequirePOApproval:    true,
			RequireGRNApproval:   true,
			OwnerDesignationCode: "OWNER",
			Departments: []IndustryDepartmentSeed{
				{Code: "EXEC", Name: "Executive & Warranty"},
				{Code: "RETAIL", Name: "Device Sales & Activation"},
				{Code: "TECH", Name: "Diagnostics & Repairs"},
				{Code: "OPS", Name: "Serialized Inventory & Audit"},
			},
			Designations: []IndustryDesignationSeed{
				{DeptCode: "EXEC", Code: "OWNER", Name: "Store Director", MaxPOSDiscountPct: 100},
				{DeptCode: "EXEC", Code: "MGR", Name: "Store & Warranty Manager", MaxPOSDiscountPct: 25},
				{DeptCode: "TECH", Code: "SPECIALIST", Name: "Device & IMEI Specialist", MaxPOSDiscountPct: 15},
				{DeptCode: "RETAIL", Code: "CASHIER", Name: "Sales Associate", MaxPOSDiscountPct: 10},
				{DeptCode: "OPS", Code: "ACCT", Name: "Senior Accountant", MaxPOSDiscountPct: 15},
				{DeptCode: "OPS", Code: "INV", Name: "Serialized Stock Controller", MaxPOSDiscountPct: 5},
			},
			Categories: []IndustryStarterCategory{
				{Name: "Smartphones & Devices", Slug: "smartphones"},
				{Name: "Accessories & Chargers", Slug: "mobile-accessories"},
			},
			Brands: []IndustryStarterBrand{
				{Name: "Apple", Slug: "apple", Country: "USA", Website: "https://apple.com", Description: "iPhone Pro Max, iPad Pro, Watch Ultra & AirPods hardware"},
				{Name: "OPPO", Slug: "oppo", Country: "China", Website: "https://oppo.com", Description: "Find X flagship & Reno Pro Hasselblad camera smartphones"},
				{Name: "Infinix", Slug: "infinix", Country: "Hong Kong", Website: "https://infinixmobility.com", Description: "GT gaming smartphones, Note Pro & Zero Ultra devices"},
				{Name: "Soundcore", Slug: "soundcore", Country: "China / USA", Website: "https://soundcore.com", Description: "Liberty Pro earbuds, Space ANC headphones & Boom speakers"},
				{Name: "Samsung", Slug: "samsung", Country: "South Korea", Website: "https://samsung.com", Description: "Galaxy S-Series Ultra, Z Foldables & AMOLED smartphones"},
				{Name: "Google", Slug: "google", Country: "USA", Website: "https://store.google.com", Description: "Pixel Pro XL & Tensor AI flagship smartphones"},
				{Name: "Xiaomi", Slug: "xiaomi", Country: "China", Website: "https://mi.com", Description: "Xiaomi Leica camera flagships & HyperCharge ecosystems"},
				{Name: "OnePlus", Slug: "oneplus", Country: "China", Website: "https://oneplus.com", Description: "OxygenOS performance flagships & Nord 5G smartphones"},
				{Name: "Anker", Slug: "anker", Country: "China / USA", Website: "https://anker.com", Description: "MagGo Qi2 magnetic power banks & GaN fast chargers"},
				{Name: "Ugreen", Slug: "ugreen", Country: "China", Website: "https://ugreen.com", Description: "Nexode 140W/65W GaN chargers & 240W braided cables"},
				{Name: "Garmin", Slug: "garmin", Country: "Switzerland", Website: "https://garmin.com", Description: "Fenix titanium GPS & AMOLED multisport smartwatches"},
				{Name: "Belkin", Slug: "belkin", Country: "USA", Website: "https://belkin.com", Description: "UltraGlass shields & BoostCharge MagSafe accessories"},
				{Name: "Spigen", Slug: "spigen", Country: "South Korea", Website: "https://spigen.com", Description: "Ultra Hybrid, Mag Armor & protective mobile cases"},
				{Name: "TP-Link", Slug: "tp-link", Country: "Singapore", Website: "https://tp-link.com", Description: "Deco Wi-Fi 7 mesh & 5G CPE mobile broadband routers"},
				{Name: "SanDisk", Slug: "sandisk", Country: "USA", Website: "https://westerndigital.com", Description: "Extreme Pro portable NVMe SSDs & high-speed storage"},
				{Name: "Kova Certified", Slug: "kova-certified", Country: "Sri Lanka", Website: "https://kovamobile.lk", Description: "Diagnostics-verified pre-owned smartphones & hub bundles"},
			},
		}
	case "stationery":
		return IndustryBlueprint{
			Mode:                 "stationery",
			DefaultBranchName:    "Express Flagship Counter",
			DefaultBranchCode:    "FAST-01",
			ThermalPaperWidth:    "58mm",
			MaxCashierDiscount:   10,
			LoyaltyPointsPerUnit: 2,
			RequirePOApproval:    false,
			RequireGRNApproval:   false,
			OwnerDesignationCode: "OWNER",
			Departments: []IndustryDepartmentSeed{
				{Code: "EXEC", Name: "Management"},
				{Code: "POS", Name: "Express Checkout Lane"},
				{Code: "OPS", Name: "Bulk Packs & Supply"},
			},
			Designations: []IndustryDesignationSeed{
				{DeptCode: "EXEC", Code: "OWNER", Name: "Business Proprietor", MaxPOSDiscountPct: 100},
				{DeptCode: "EXEC", Code: "MGR", Name: "Floor Supervisor", MaxPOSDiscountPct: 25},
				{DeptCode: "POS", Code: "CASHIER", Name: "Express Lane Cashier", MaxPOSDiscountPct: 10},
				{DeptCode: "OPS", Code: "ACCT", Name: "Senior Accountant", MaxPOSDiscountPct: 15},
				{DeptCode: "OPS", Code: "INV", Name: "Pack & Supply Controller", MaxPOSDiscountPct: 5},
			},
			Categories: []IndustryStarterCategory{
				{Name: "Paper & Notebooks", Slug: "paper-notebooks"},
				{Name: "Office Supplies", Slug: "office-supplies"},
			},
			Brands: []IndustryStarterBrand{
				{Name: "Faber-Castell", Slug: "faber-castell", Country: "Germany", Website: "https://faber-castell.com", Description: "Technical pens, art pencils & drafting tools"},
				{Name: "Casio", Slug: "casio", Country: "Japan", Website: "https://casio.com", Description: "Scientific calculators & desktop printing units"},
				{Name: "Moleskine", Slug: "moleskine", Country: "Italy", Website: "https://moleskine.com", Description: "Hardcover executive notebooks & planners"},
				{Name: "HP", Slug: "hp", Country: "USA", Website: "https://hp.com", Description: "LaserJet toners, ink packs & thermal rolls"},
				{Name: "PaperOne", Slug: "paperone", Country: "Singapore", Website: "https://paperone.com", Description: "High-bright A4/A3 digital copier reams"},
				{Name: "Logitech", Slug: "logitech", Country: "Switzerland", Website: "https://logitech.com", Description: "MX desk keyboards, mice & webcams"},
			},
		}
	default:
		return IndustryBlueprint{
			Mode:                 "retail",
			DefaultBranchName:    "Main Boutique",
			DefaultBranchCode:    "SHOP-01",
			ThermalPaperWidth:    "80mm",
			MaxCashierDiscount:   15,
			LoyaltyPointsPerUnit: 1,
			RequirePOApproval:    false,
			RequireGRNApproval:   false,
			OwnerDesignationCode: "OWNER",
			Departments: []IndustryDepartmentSeed{
				{Code: "EXEC", Name: "Executive & Ownership"},
				{Code: "SALES", Name: "Floor Styling & POS"},
				{Code: "OPS", Name: "Merchandising & Finance"},
			},
			Designations: []IndustryDesignationSeed{
				{DeptCode: "EXEC", Code: "OWNER", Name: "Brand Owner", MaxPOSDiscountPct: 100},
				{DeptCode: "EXEC", Code: "MGR", Name: "Store Manager", MaxPOSDiscountPct: 35},
				{DeptCode: "SALES", Code: "STYLIST", Name: "Floor Stylist / Advisor", MaxPOSDiscountPct: 15},
				{DeptCode: "SALES", Code: "CASHIER", Name: "POS Sales Cashier", MaxPOSDiscountPct: 10},
				{DeptCode: "OPS", Code: "ACCT", Name: "Senior Accountant", MaxPOSDiscountPct: 15},
				{DeptCode: "OPS", Code: "INV", Name: "Inventory Controller", MaxPOSDiscountPct: 5},
			},
			Categories: []IndustryStarterCategory{
				{Name: "Core Collection", Slug: "core-collection"},
				{Name: "Accessories", Slug: "accessories"},
			},
			Brands: []IndustryStarterBrand{
				{Name: "Nike", Slug: "nike", Country: "USA", Website: "https://nike.com", Description: "Athletic footwear, Dri-FIT apparel & lifestyle bags"},
				{Name: "Adidas", Slug: "adidas", Country: "Germany", Website: "https://adidas.com", Description: "Originals sneakers & performance essentials"},
				{Name: "Zara", Slug: "zara", Country: "Spain", Website: "https://zara.com", Description: "Seasonal tailored apparel & studio basics"},
				{Name: "Uniqlo", Slug: "uniqlo", Country: "Japan", Website: "https://uniqlo.com", Description: "LifeWear Supima cotton & AIRism collections"},
				{Name: "Levi's", Slug: "levis", Country: "USA", Website: "https://levi.com", Description: "Selvedge denim jeans & utility outerwear"},
				{Name: "Ray-Ban", Slug: "ray-ban", Country: "Italy", Website: "https://ray-ban.com", Description: "Polarized eyewear & classic optical frames"},
			},
		}
	}
}

// IndustryBusinessSettingValues returns all Level-2 BUSINESS setting key -> raw JSON values for a vertical.
func IndustryBusinessSettingValues(mode string) map[string]json.RawMessage {
	bp := BlueprintForIndustry(mode)
	out := make(map[string]json.RawMessage, 18)

	rawMode, _ := json.Marshal(bp.Mode)
	out["pos.ui.layout_mode"] = rawMode

	rawPaper, _ := json.Marshal(bp.ThermalPaperWidth)
	out["pos.thermal_paper_width"] = rawPaper

	rawMaxDisc, _ := json.Marshal(bp.MaxCashierDiscount)
	out["pos.max_cashier_discount_pct"] = rawMaxDisc

	rawLoyalty, _ := json.Marshal(bp.LoyaltyPointsPerUnit)
	out["pos.loyalty_points_per_unit"] = rawLoyalty

	rawPO, _ := json.Marshal(bp.RequirePOApproval)
	out["warehouse.po.require_approval"] = rawPO

	rawGRN, _ := json.Marshal(bp.RequireGRNApproval)
	out["warehouse.grn.require_approval"] = rawGRN

	for k, enabled := range IndustryPresetFlags(bp.Mode) {
		if enabled {
			out[k] = json.RawMessage(`true`)
		} else {
			out[k] = json.RawMessage(`false`)
		}
	}
	return out
}

// EnsureIndustryDepartmentsAndDesignations idempotently seeds missing departments and designations for the vertical.
func EnsureIndustryDepartmentsAndDesignations(
	ctx context.Context,
	queries *db.Queries,
	businessID uuid.UUID,
	rawMode string,
) (uuid.UUID, error) {
	if queries == nil || businessID == uuid.Nil {
		return uuid.Nil, nil
	}
	bp := BlueprintForIndustry(rawMode)

	existingDepts, err := queries.ListDepartmentsForBusiness(ctx, businessID)
	if err != nil {
		return uuid.Nil, err
	}
	deptByCode := make(map[string]uuid.UUID, len(existingDepts))
	for _, d := range existingDepts {
		deptByCode[strings.ToUpper(strings.TrimSpace(d.Code))] = d.ID
	}

	for _, d := range bp.Departments {
		code := strings.ToUpper(strings.TrimSpace(d.Code))
		if _, ok := deptByCode[code]; ok {
			continue
		}
		created, cErr := queries.CreateDepartment(ctx, db.CreateDepartmentParams{
			BusinessID: businessID,
			Code:       code,
			Name:       d.Name,
		})
		if cErr != nil {
			return uuid.Nil, cErr
		}
		deptByCode[code] = created.ID
	}

	existingDesigs, err := queries.ListDesignationsForBusiness(ctx, businessID)
	if err != nil {
		return uuid.Nil, err
	}
	desigByCode := make(map[string]uuid.UUID, len(existingDesigs))
	for _, dg := range existingDesigs {
		desigByCode[strings.ToUpper(strings.TrimSpace(dg.Code))] = dg.ID
	}

	var fallbackDeptID uuid.UUID
	for _, id := range deptByCode {
		fallbackDeptID = id
		break
	}

	for _, dg := range bp.Designations {
		code := strings.ToUpper(strings.TrimSpace(dg.Code))
		if _, ok := desigByCode[code]; ok {
			continue
		}
		deptID, ok := deptByCode[strings.ToUpper(strings.TrimSpace(dg.DeptCode))]
		if !ok {
			deptID = fallbackDeptID
		}
		if deptID == uuid.Nil {
			continue
		}
		created, dErr := queries.CreateDesignation(ctx, db.CreateDesignationParams{
			BusinessID:        businessID,
			DepartmentID:      deptID,
			Code:              code,
			Name:              dg.Name,
			MaxPosDiscountPct: decimal.NewFromFloat(dg.MaxPOSDiscountPct).Round(2),
		})
		if dErr != nil {
			return uuid.Nil, dErr
		}
		desigByCode[code] = created.ID
	}

	ownerDesigID := desigByCode[strings.ToUpper(bp.OwnerDesignationCode)]
	if ownerDesigID == uuid.Nil {
		for _, id := range desigByCode {
			ownerDesigID = id
			break
		}
	}
	return ownerDesigID, nil
}

// EnsureIndustryBrands idempotently seeds starter vertical brands without overwriting existing custom brands.
func EnsureIndustryBrands(
	ctx context.Context,
	queries *db.Queries,
	businessID uuid.UUID,
	rawMode string,
) error {
	if queries == nil || businessID == uuid.Nil {
		return nil
	}
	bp := BlueprintForIndustry(rawMode)
	existing, err := queries.ListBrandsForBusiness(ctx, businessID)
	if err != nil {
		return err
	}
	seenSlug := make(map[string]bool, len(existing))
	seenName := make(map[string]bool, len(existing))
	for _, b := range existing {
		seenSlug[strings.ToLower(strings.TrimSpace(b.Slug))] = true
		seenName[strings.ToLower(strings.TrimSpace(b.Name))] = true
	}
	for _, sb := range bp.Brands {
		sl := strings.ToLower(strings.TrimSpace(sb.Slug))
		nm := strings.ToLower(strings.TrimSpace(sb.Name))
		if seenSlug[sl] || seenName[nm] {
			continue
		}
		if _, err := queries.CreateBrand(ctx, db.CreateBrandParams{
			BusinessID:  businessID,
			Name:        sb.Name,
			Slug:        sl,
			Country:     sb.Country,
			Website:     sb.Website,
			LogoUrl:     "",
			Description: sb.Description,
			IsActive:    true,
		}); err == nil {
			seenSlug[sl] = true
			seenName[nm] = true
		}
	}
	return nil
}

