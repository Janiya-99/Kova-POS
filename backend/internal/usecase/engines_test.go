package usecase

import (
	"encoding/json"
	"testing"

	"github.com/enterprise-pos/backend/internal/domain"
	"github.com/enterprise-pos/backend/internal/repository/sqlc/db"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

func TestResolveSettingsHierarchyPrecedence(t *testing.T) {
	bizID := uuid.New()
	branchID := uuid.New()
	otherBranchID := uuid.New()
	termID := uuid.New()
	catID := uuid.New()
	prodID := uuid.New()

	defs := []db.SettingDefinition{
		{
			Key:          "pos.max_cashier_discount_pct",
			ValueType:    "NUMBER",
			DefaultValue: json.RawMessage(`10`),
			Category:     "POS Rules",
			Label:        "Max Cashier Discount",
		},
		{
			Key:          "pos.thermal_paper_width",
			ValueType:    "STRING",
			DefaultValue: json.RawMessage(`"80mm"`),
			Category:     "Hardware",
			Label:        "Thermal Paper Width",
		},
	}

	overrides := []db.ScopedSetting{
		{
			BusinessID:    bizID,
			SettingKey:    "pos.max_cashier_discount_pct",
			ScopeLevel:    "BUSINESS",
			ScopeTargetID: uuid.NullUUID{UUID: bizID, Valid: true},
			ValueJson:     json.RawMessage(`12`),
		},
		{
			BusinessID:    bizID,
			SettingKey:    "pos.max_cashier_discount_pct",
			ScopeLevel:    "BRANCH",
			ScopeTargetID: uuid.NullUUID{UUID: otherBranchID, Valid: true},
			ValueJson:     json.RawMessage(`20`), // must NOT leak to branchID
		},
		{
			BusinessID:    bizID,
			SettingKey:    "pos.max_cashier_discount_pct",
			ScopeLevel:    "CATEGORY",
			ScopeTargetID: uuid.NullUUID{UUID: catID, Valid: true},
			ValueJson:     json.RawMessage(`15`),
		},
		{
			BusinessID:    bizID,
			SettingKey:    "pos.max_cashier_discount_pct",
			ScopeLevel:    "PRODUCT",
			ScopeTargetID: uuid.NullUUID{UUID: prodID, Valid: true},
			ValueJson:     json.RawMessage(`5`),
		},
		{
			BusinessID:    bizID,
			SettingKey:    "pos.thermal_paper_width",
			ScopeLevel:    "TERMINAL",
			ScopeTargetID: uuid.NullUUID{UUID: termID, Valid: true},
			ValueJson:     json.RawMessage(`"58mm"`),
		},
	}

	// Full 6-level resolution with matching product -> PRODUCT (5) wins, TERMINAL ("58mm") wins
	res := ResolveSettingsHierarchy(defs, overrides, SettingsContext{
		BusinessID: bizID,
		BranchID:   &branchID,
		TerminalID: &termID,
		CategoryID: &catID,
		ProductID:  &prodID,
	})

	if res[0].EffectiveJSON != "5" || res[0].InheritedFrom != "PRODUCT" {
		t.Fatalf("expected PRODUCT override 5, got %s from %s", res[0].EffectiveJSON, res[0].InheritedFrom)
	}
	if res[1].EffectiveJSON != `"58mm"` || res[1].InheritedFrom != "TERMINAL" {
		t.Fatalf("expected TERMINAL override \"58mm\", got %s from %s", res[1].EffectiveJSON, res[1].InheritedFrom)
	}

	// Without product context, CATEGORY (15) wins over BUSINESS (12) and ignores otherBranchID (20)
	resCat := ResolveSettingsHierarchy(defs, overrides, SettingsContext{
		BusinessID: bizID,
		BranchID:   &branchID,
		CategoryID: &catID,
	})
	if resCat[0].EffectiveJSON != "15" || resCat[0].InheritedFrom != "CATEGORY" {
		t.Fatalf("expected CATEGORY override 15, got %s from %s", resCat[0].EffectiveJSON, resCat[0].InheritedFrom)
	}
}

func TestCalculateMultiTierCompoundTaxes(t *testing.T) {
	rules := []domain.TaxRuleSpec{
		{
			RuleID:      uuid.New(),
			Code:        "STATE",
			Name:        "State Retail Tax",
			TaxType:     "EXCLUSIVE",
			RatePercent: decimal.NewFromInt(6),
			Priority:    1,
		},
		{
			RuleID:      uuid.New(),
			Code:        "CITY",
			Name:        "Municipal Surtax",
			TaxType:     "COMPOUND",
			RatePercent: decimal.NewFromInt(2),
			Priority:    2,
		},
	}

	// 100.00 base: 6% EXCLUSIVE = 6.00; 2% COMPOUND on (100 + 6 = 106.00) = 2.12 -> Total Tax 8.12, Gross 108.12
	res := CalculateMultiTierTaxes(decimal.NewFromInt(100), rules, "HALF_UP")
	if !res.NetAmount.Equal(decimal.RequireFromString("100.00")) {
		t.Fatalf("expected net 100.00, got %s", res.NetAmount)
	}
	if !res.TotalTax.Equal(decimal.RequireFromString("8.12")) {
		t.Fatalf("expected compound tax 8.12, got %s", res.TotalTax)
	}
	if !res.GrossAmount.Equal(decimal.RequireFromString("108.12")) {
		t.Fatalf("expected gross 108.12, got %s", res.GrossAmount)
	}
}

func TestCalculateInclusiveTaxBackCalculation(t *testing.T) {
	rules := []domain.TaxRuleSpec{
		{
			RuleID:      uuid.New(),
			Code:        "VAT",
			Name:        "Included VAT",
			TaxType:     "INCLUSIVE",
			RatePercent: decimal.NewFromInt(10),
			Priority:    1,
		},
	}
	// Shelf price 110.00 with 10% inclusive -> Net 100.00, Tax 10.00, Gross 110.00
	res := CalculateMultiTierTaxes(decimal.NewFromInt(110), rules, "HALF_UP")
	if !res.NetAmount.Equal(decimal.RequireFromString("100.00")) || !res.TotalTax.Equal(decimal.RequireFromString("10.00")) {
		t.Fatalf("unexpected inclusive result: net=%s tax=%s", res.NetAmount, res.TotalTax)
	}
}

func TestComputeFIFODepletionMultiBatch(t *testing.T) {
	b1 := uuid.New()
	b2 := uuid.New()
	batches := []FIFOBatchSlice{
		{BatchID: b1, BatchNumber: "B1", UnitCost: decimal.RequireFromString("24.00"), RemainingQty: decimal.NewFromInt(3)},
		{BatchID: b2, BatchNumber: "B2", UnitCost: decimal.RequireFromString("26.50"), RemainingQty: decimal.NewFromInt(10)},
	}

	// Deplete 5 units: 3 from B1 ($72.00) + 2 from B2 ($53.00) = $125.00 exact COGS
	consumptions, totalCOGS, err := ComputeFIFODepletion(batches, decimal.NewFromInt(5), false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(consumptions) != 2 {
		t.Fatalf("expected 2 batch slices consumed, got %d", len(consumptions))
	}
	if !totalCOGS.Equal(decimal.RequireFromString("125.0000")) {
		t.Fatalf("expected weighted COGS 125.0000, got %s", totalCOGS)
	}
	if !consumptions[0].NewRemQty.Equal(decimal.Zero) || !consumptions[1].NewRemQty.Equal(decimal.NewFromInt(8)) {
		t.Fatalf("unexpected remaining quantities: b1=%s b2=%s", consumptions[0].NewRemQty, consumptions[1].NewRemQty)
	}

	// Requesting 20 units with allowNegative=false must fail cleanly
	if _, _, err := ComputeFIFODepletion(batches, decimal.NewFromInt(20), false); err == nil {
		t.Fatalf("expected insufficient FIFO stock error")
	}
}

func TestIndustryPresetFlagsAndNormalization(t *testing.T) {
	modes := []string{"restaurant", "hardware", "garage", "retail", "mobile", "stationery"}
	for _, m := range modes {
		norm, ok := NormalizeIndustryProfile(m)
		if !ok || norm != m {
			t.Fatalf("expected valid industry mode %s, got %s (ok=%v)", m, norm, ok)
		}
	}
	if _, ok := NormalizeIndustryProfile("unknown_mode"); ok {
		t.Fatalf("expected unknown industry mode to return ok=false")
	}

	if !IndustryPresetFlags("restaurant")["pos.features.enable_kot"] || !IndustryPresetFlags("restaurant")["pos.features.enable_tables"] {
		t.Fatalf("restaurant preset must enable KOT and tables")
	}
	if !IndustryPresetFlags("hardware")["pos.features.allow_fractional_qty"] || !IndustryPresetFlags("hardware")["pos.features.multi_uom_toggle"] {
		t.Fatalf("hardware preset must enable fractional qty and multi-UOM")
	}
	if !IndustryPresetFlags("garage")["pos.features.require_vehicle_plate"] || !IndustryPresetFlags("garage")["pos.features.split_labor_parts"] {
		t.Fatalf("garage preset must require vehicle plate and split labor/parts")
	}
	if !IndustryPresetFlags("mobile")["pos.features.require_serial_imei"] {
		t.Fatalf("mobile preset must require IMEI / serial tracking")
	}
	stationery := IndustryPresetFlags("stationery")
	if stationery["pos.layout.show_outgoing_orders_pane"] {
		t.Fatalf("stationery preset must hide Pane 3 Outgoing Orders to expand Product Grid")
	}
	if !stationery["pos.features.enable_bundles"] {
		t.Fatalf("stationery preset must enable bundles")
	}
}

func TestResolveApprovedUOMFactor(t *testing.T) {
	opts := []byte(`[{"label":"Yard","factor":1},{"label":"Bolt (5 Yd)","factor":5}]`)
	if got := resolveApprovedUOMFactor(opts, map[string]any{"uom_label": "Bolt (5 Yd)"}); !got.Equal(decimal.NewFromInt(5)) {
		t.Fatalf("expected UOM factor 5, got %s", got.String())
	}
	if got := resolveApprovedUOMFactor(opts, map[string]any{"uom_label": "Unknown"}); !got.Equal(decimal.NewFromInt(1)) {
		t.Fatalf("expected fallback factor 1 for unapproved label, got %s", got.String())
	}
}

func TestSettingsHierarchyWithPhase9POSKeys(t *testing.T) {
	bizID := uuid.New()
	termID := uuid.New()
	defs := []db.SettingDefinition{
		{
			Key:          "pos.ui.layout_mode",
			ValueType:    "STRING",
			DefaultValue: json.RawMessage(`"retail"`),
			Category:     "POS Terminal",
			Label:        "Industry Terminal Mode",
		},
		{
			Key:          "pos.layout.show_outgoing_orders_pane",
			ValueType:    "BOOLEAN",
			DefaultValue: json.RawMessage(`true`),
			Category:     "POS Terminal",
			Label:        "Show Outgoing Orders Pane",
		},
	}
	overrides := []db.ScopedSetting{
		{
			BusinessID:    bizID,
			SettingKey:    "pos.ui.layout_mode",
			ScopeLevel:    "BUSINESS",
			ScopeTargetID: uuid.NullUUID{UUID: bizID, Valid: true},
			ValueJson:     json.RawMessage(`"restaurant"`),
		},
		{
			BusinessID:    bizID,
			SettingKey:    "pos.layout.show_outgoing_orders_pane",
			ScopeLevel:    "TERMINAL",
			ScopeTargetID: uuid.NullUUID{UUID: termID, Valid: true},
			ValueJson:     json.RawMessage(`false`),
		},
	}

	resolved := ResolveSettingsHierarchy(defs, overrides, SettingsContext{
		BusinessID: bizID,
		TerminalID: &termID,
	})
	if resolved[0].EffectiveJSON != `"restaurant"` || resolved[0].InheritedFrom != "BUSINESS" {
		t.Fatalf("expected pos.ui.layout_mode restaurant from BUSINESS, got %s (%s)", resolved[0].EffectiveJSON, resolved[0].InheritedFrom)
	}
	if resolved[1].EffectiveJSON != "false" || resolved[1].InheritedFrom != "TERMINAL" {
		t.Fatalf("expected TERMINAL override false for outgoing pane, got %s (%s)", resolved[1].EffectiveJSON, resolved[1].InheritedFrom)
	}
}

func TestBulkDiscountPricingMath(t *testing.T) {
	// 1. Regular SKU (base 68, sale 68, disc 0) -> apply 20% => base 68, sale 54.40, disc 20
	b1, s1, d1 := ComputeDiscountedProductPricing(
		decimal.RequireFromString("68.00"),
		decimal.RequireFromString("68.00"),
		decimal.Zero,
		decimal.RequireFromString("20"),
	)
	if !b1.Equal(decimal.RequireFromString("68.00")) || !s1.Equal(decimal.RequireFromString("54.40")) || !d1.Equal(decimal.RequireFromString("20")) {
		t.Fatalf("unexpected regular discount pricing: base=%s sale=%s disc=%s", b1, s1, d1)
	}

	// 2. Already discounted SKU (base 55, sale 52.25, disc 5) -> re-discount to 20% => base 55, sale 44.00 (no compounding!)
	b2, s2, d2 := ComputeDiscountedProductPricing(
		decimal.RequireFromString("55.00"),
		decimal.RequireFromString("52.25"),
		decimal.RequireFromString("5"),
		decimal.RequireFromString("20"),
	)
	if !b2.Equal(decimal.RequireFromString("55.00")) || !s2.Equal(decimal.RequireFromString("44.00")) || !d2.Equal(decimal.RequireFromString("20")) {
		t.Fatalf("expected non-compounded re-discount from list price 55 -> 44.00, got base=%s sale=%s disc=%s", b2, s2, d2)
	}

	// 3. Cost-anchored custom SKU (base 35 cost, sale 50, disc 0) -> apply 20% => promotes list 50 -> sale 40.00
	b3, s3, d3 := ComputeDiscountedProductPricing(
		decimal.RequireFromString("35.00"),
		decimal.RequireFromString("50.00"),
		decimal.Zero,
		decimal.RequireFromString("20"),
	)
	if !b3.Equal(decimal.RequireFromString("50.00")) || !s3.Equal(decimal.RequireFromString("40.00")) || !d3.Equal(decimal.RequireFromString("20")) {
		t.Fatalf("expected cost-anchored SKU to promote list 50 -> sale 40.00, got base=%s sale=%s disc=%s", b3, s3, d3)
	}

	// 4. Clearing discount back to 0% restores full list price 55.00
	b4, s4, d4 := ComputeDiscountedProductPricing(b2, s2, d2, decimal.Zero)
	if !b4.Equal(decimal.RequireFromString("55.00")) || !s4.Equal(decimal.RequireFromString("55.00")) || !d4.Equal(decimal.Zero) {
		t.Fatalf("expected clearing discount to restore 55.00, got base=%s sale=%s disc=%s", b4, s4, d4)
	}
}

func TestPOSCheckoutAutoProductDiscountNoDoubleDiscount(t *testing.T) {
	vatRule := []domain.TaxRuleSpec{
		{
			RuleID:      uuid.New(),
			Code:        "VAT",
			Name:        "VAT 10%",
			TaxType:     "EXCLUSIVE",
			RatePercent: decimal.NewFromInt(10),
			Priority:    1,
		},
	}

	// Discounted SKU: base=55.00, sale=52.25, disc=5%.
	// Both nil override (API auto) and explicit 5% (cart auto) must discount from 55.00 -> net 52.25 (never 49.64 double-discount).
	explicitFive := decimal.NewFromInt(5)
	for _, override := range []*decimal.Decimal{nil, &explicitFive} {
		unitGross, discAmt, taxRes := ComputePOSCheckoutLine(
			decimal.RequireFromString("55.00"),
			decimal.RequireFromString("52.25"),
			decimal.RequireFromString("5.00"),
			decimal.NewFromInt(2),
			decimal.NewFromInt(1),
			override,
			vatRule,
			"HALF_UP",
		)
		if !unitGross.Equal(decimal.RequireFromString("55.00")) {
			t.Fatalf("expected gross unit price 55.00, got %s", unitGross)
		}
		if !discAmt.Equal(decimal.RequireFromString("5.50")) {
			t.Fatalf("expected auto discount 5.50 on 2x55.00, got %s", discAmt)
		}
		if !taxRes.NetAmount.Equal(decimal.RequireFromString("104.50")) {
			t.Fatalf("expected net after discount 104.50, got %s", taxRes.NetAmount)
		}
		if !taxRes.TotalTax.Equal(decimal.RequireFromString("10.45")) || !taxRes.GrossAmount.Equal(decimal.RequireFromString("114.95")) {
			t.Fatalf("unexpected tax/gross on discounted checkout line: tax=%s gross=%s", taxRes.TotalTax, taxRes.GrossAmount)
		}
	}

	// Non-promo cost-based SKU: base=35.00, sale=50.00, disc=0% -> charges 50.00, zero discount.
	unitGross2, discAmt2, taxRes2 := ComputePOSCheckoutLine(
		decimal.RequireFromString("35.00"),
		decimal.RequireFromString("50.00"),
		decimal.Zero,
		decimal.NewFromInt(1),
		decimal.NewFromInt(1),
		nil,
		vatRule,
		"HALF_UP",
	)
	if !unitGross2.Equal(decimal.RequireFromString("50.00")) || !discAmt2.Equal(decimal.Zero) || !taxRes2.NetAmount.Equal(decimal.RequireFromString("50.00")) {
		t.Fatalf("unexpected non-promo line: unit=%s disc=%s net=%s", unitGross2, discAmt2, taxRes2.NetAmount)
	}
}


