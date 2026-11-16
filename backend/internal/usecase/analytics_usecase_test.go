package usecase

import (
	"testing"
	"time"

	"github.com/enterprise-pos/backend/internal/domain"
	"github.com/enterprise-pos/backend/internal/repository/sqlc/db"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"
)

func TestAnalyticsDecimalReportCalculations(t *testing.T) {
	profit, margin := computeProfitAndMargin(
		decimal.RequireFromString("1250.50"),
		decimal.RequireFromString("500.20"),
	)
	if !profit.Equal(decimal.RequireFromString("750.30")) {
		t.Fatalf("expected gross profit 750.30, got %s", profit)
	}
	if !margin.Equal(decimal.RequireFromString("60.00")) {
		t.Fatalf("expected margin 60.00%%, got %s", margin)
	}

	// Zero or negative revenue must safely return 0 margin without divide-by-zero
	zeroProfit, zeroMargin := computeProfitAndMargin(decimal.Zero, decimal.NewFromInt(25))
	if !zeroProfit.Equal(decimal.NewFromInt(-25)) || !zeroMargin.Equal(decimal.Zero) {
		t.Fatalf("unexpected zero revenue result: profit=%s margin=%s", zeroProfit, zeroMargin)
	}

	share := computeSharePct(
		decimal.RequireFromString("311.00"),
		decimal.RequireFromString("1000.00"),
	)
	if !share.Equal(decimal.RequireFromString("31.10")) {
		t.Fatalf("expected share 31.10%%, got %s", share)
	}
	if !computeSharePct(decimal.NewFromInt(50), decimal.Zero).Equal(decimal.Zero) {
		t.Fatalf("expected zero share on empty total")
	}

	aov := computeAverageOrderValue(decimal.RequireFromString("1026.02"), 5)
	if !aov.Equal(decimal.RequireFromString("205.20")) {
		t.Fatalf("expected AOV 205.20, got %s", aov)
	}
	if !computeAverageOrderValue(decimal.NewFromInt(500), 0).Equal(decimal.Zero) {
		t.Fatalf("expected zero AOV when order count is 0")
	}
}

func TestResolveOverviewWindowPeriods(t *testing.T) {
	now := time.Date(2026, 11, 14, 12, 30, 0, 0, time.UTC)

	dayWin := resolveOverviewWindow("day", now)
	if dayWin.Period != "day" || dayWin.SQLGranularity != "hour" {
		t.Fatalf("unexpected day window: %+v", dayWin)
	}
	if dayWin.To.Sub(dayWin.From) != 24*time.Hour {
		t.Fatalf("expected 24h day span, got %v", dayWin.To.Sub(dayWin.From))
	}

	weekWin := resolveOverviewWindow("week", now)
	if weekWin.Period != "week" || weekWin.SQLGranularity != "day" {
		t.Fatalf("unexpected week window: %+v", weekWin)
	}
	if weekWin.From.Format("2006-01-02") != "2026-11-08" {
		t.Fatalf("expected week start 2026-11-08, got %s", weekWin.From.Format("2006-01-02"))
	}

	monthWin := resolveOverviewWindow("unknown_fallback", now)
	if monthWin.Period != "month" || monthWin.SQLGranularity != "day" {
		t.Fatalf("expected default month fallback, got %+v", monthWin)
	}

	yearWin := resolveOverviewWindow("year", now)
	if yearWin.Period != "year" || yearWin.SQLGranularity != "month" {
		t.Fatalf("unexpected year window: %+v", yearWin)
	}
	if yearWin.From.Format("2006-01-02") != "2025-12-01" {
		t.Fatalf("expected 12-month start 2025-12-01, got %s", yearWin.From.Format("2006-01-02"))
	}
}

func TestResolveOverviewPersonaRestrictions(t *testing.T) {
	cashierPersona, cashierCaps := resolveOverviewPersona(domain.TenantContext{
		RoleCode:    "Cashier",
		Permissions: []string{"analytics:view", "pos:view", "pos:checkout", "pos:hold_bill", "catalog:view"},
	})
	if cashierPersona != "CASHIER" {
		t.Fatalf("expected CASHIER persona, got %s", cashierPersona)
	}
	if cashierCaps["can_view_gl"] || cashierCaps["can_view_profit"] || cashierCaps["can_view_inventory"] || cashierCaps["can_switch_branch"] {
		t.Fatalf("cashier received restricted financial/inventory/branch capabilities: %+v", cashierCaps)
	}
	if !cashierCaps["can_view_pos"] || !cashierCaps["can_view_catalog"] {
		t.Fatalf("cashier missing POS/catalog capabilities: %+v", cashierCaps)
	}

	invPersona, invCaps := resolveOverviewPersona(domain.TenantContext{
		RoleCode:    "InventoryController",
		Permissions: []string{"analytics:view", "inventory:view", "catalog:view"},
	})
	if invPersona != "INVENTORY" || !invCaps["can_view_inventory"] {
		t.Fatalf("expected INVENTORY persona with inventory capability, got %s %+v", invPersona, invCaps)
	}
	if invCaps["can_view_gl"] || invCaps["can_view_profit"] || invCaps["can_view_pos"] {
		t.Fatalf("inventory role must not access GL/profit/POS: %+v", invCaps)
	}

	acctPersona, acctCaps := resolveOverviewPersona(domain.TenantContext{
		RoleCode:    "Accountant",
		Permissions: []string{"analytics:view", "accounting:view", "settings:view"},
	})
	if acctPersona != "ACCOUNTANT" || !acctCaps["can_view_gl"] || !acctCaps["can_view_profit"] {
		t.Fatalf("expected ACCOUNTANT persona with GL/profit, got %s %+v", acctPersona, acctCaps)
	}
}

func TestComputeGrowthAndSeriesRedaction(t *testing.T) {
	if got := computeGrowthPct(decimal.NewFromInt(200), decimal.NewFromInt(100)); got != 100 {
		t.Fatalf("expected +100%% growth, got %d", got)
	}
	if got := computeGrowthPct(decimal.NewFromInt(150), decimal.Zero); got != 100 {
		t.Fatalf("expected +100%% from zero base, got %d", got)
	}
	if got := computeGrowthPct(decimal.Zero, decimal.Zero); got != 0 {
		t.Fatalf("expected 0%% when both zero, got %d", got)
	}

	now := time.Date(2026, 11, 14, 12, 0, 0, 0, time.UTC)
	win := resolveOverviewWindow("week", now)
	rows := []db.ListOverviewSalesTimeBucketsRow{
		{
			BucketTs:    pgtype.Timestamptz{Time: now, Valid: true},
			PaidRevenue: decimal.RequireFromString("311.00"),
			TotalCogs:   decimal.RequireFromString("134.00"),
			TotalTaxes:  decimal.RequireFromString("23.36"),
			OrderCount:  1,
			UnitsSold:   decimal.NewFromInt(5),
		},
	}

	seriesNoProfit, bars, spark := buildRealTimeSeries(win, rows, false)
	if len(seriesNoProfit) != 7 || len(bars) != 7 || len(spark) != 7 {
		t.Fatalf("expected 7 daily slots for week window, got %d/%d/%d", len(seriesNoProfit), len(bars), len(spark))
	}
	if _, leaked := seriesNoProfit[6]["cogs"]; leaked {
		t.Fatalf("cogs must be redacted from non-financial series")
	}
	if seriesNoProfit[6]["revenue"] != 311.00 {
		t.Fatalf("expected real bucket revenue 311.00 on final day, got %v", seriesNoProfit[6]["revenue"])
	}
}

