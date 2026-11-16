package usecase

import (
	"testing"

	"github.com/enterprise-pos/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

func TestSriLankanVATAndSSCLMultiTierTax(t *testing.T) {
	rules := []domain.TaxRuleSpec{
		{
			RuleID:      uuid.New(),
			Code:        "SL_VAT_18",
			Name:        "VAT (18%)",
			TaxType:     "EXCLUSIVE",
			RatePercent: decimal.RequireFromString("18.0000"),
			Priority:    1,
		},
		{
			RuleID:      uuid.New(),
			Code:        "SL_SSCL_2_5",
			Name:        "SSCL (2.5%)",
			TaxType:     "EXCLUSIVE",
			RatePercent: decimal.RequireFromString("2.5000"),
			Priority:    2,
		},
	}

	res := CalculateMultiTierTaxes(decimal.RequireFromString("1000.00"), rules, "HALF_UP")
	if !res.NetAmount.Equal(decimal.RequireFromString("1000.00")) {
		t.Fatalf("expected net amount 1000.00, got %s", res.NetAmount)
	}
	if !res.TotalTax.Equal(decimal.RequireFromString("205.00")) {
		t.Fatalf("expected total SL tax 205.00 (180 + 25), got %s", res.TotalTax)
	}
	if !res.GrossAmount.Equal(decimal.RequireFromString("1205.00")) {
		t.Fatalf("expected gross 1205.00, got %s", res.GrossAmount)
	}
	if len(res.Lines) != 2 {
		t.Fatalf("expected 2 tax lines, got %d", len(res.Lines))
	}
}

func TestIndustryPresetsAndStarterCategories(t *testing.T) {
	for _, industry := range []string{"retail", "restaurant", "hardware", "garage", "mobile", "stationery"} {
		norm, ok := NormalizeIndustryProfile(industry)
		if !ok || norm != industry {
			t.Fatalf("expected valid normalized industry %q, got %q (ok=%v)", industry, norm, ok)
		}
		flags := IndustryPresetFlags(industry)
		if len(flags) == 0 {
			t.Fatalf("expected preset flags for %q", industry)
		}
		cats := BlueprintForIndustry(industry).Categories
		if len(cats) < 2 {
			t.Fatalf("expected at least 2 starter categories for %q", industry)
		}
		brands := BlueprintForIndustry(industry).Brands
		if len(brands) < 5 {
			t.Fatalf("expected at least 5 starter brands for %q", industry)
		}
	}

	mobileBrands := map[string]bool{}
	for _, b := range BlueprintForIndustry("mobile").Brands {
		mobileBrands[b.Name] = true
	}
	for _, req := range []string{"Apple", "OPPO", "Infinix", "Soundcore"} {
		if !mobileBrands[req] {
			t.Fatalf("expected mobile blueprint starter brand %q", req)
		}
	}

	restFlags := IndustryPresetFlags("restaurant")
	if !restFlags["pos.features.enable_tables"] || !restFlags["pos.features.enable_kot"] {
		t.Fatalf("expected restaurant preset to enable tables and KOT")
	}
	if restFlags["pos.features.require_serial_imei"] {
		t.Fatalf("expected restaurant preset not to enable IMEI serial capture")
	}

	if got := slugifyIdentifier("Floor Supervisor #1!"); got != "floor-supervisor-1" {
		t.Fatalf("expected sanitized identifier floor-supervisor-1, got %q", got)
	}
}

