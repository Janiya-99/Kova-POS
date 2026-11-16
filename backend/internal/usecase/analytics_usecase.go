package usecase

import (
	"context"
	"encoding/json"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/enterprise-pos/backend/internal/domain"
	"github.com/enterprise-pos/backend/internal/repository/sqlc/db"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"
)

type overviewPeriodWindow struct {
	Period         string
	Label          string
	PrevLabel      string
	From           time.Time
	To             time.Time
	PrevFrom       time.Time
	PrevTo         time.Time
	SQLGranularity string
}

func resolveOverviewWindow(rawPeriod string, now time.Time) overviewPeriodWindow {
	p := strings.ToLower(strings.TrimSpace(rawPeriod))
	utcNow := now.UTC()
	dayStart := time.Date(utcNow.Year(), utcNow.Month(), utcNow.Day(), 0, 0, 0, 0, time.UTC)

	switch p {
	case "day":
		from := utcNow.Add(-24 * time.Hour)
		return overviewPeriodWindow{
			Period:         "day",
			Label:          "Last 24 Hours",
			PrevLabel:      "Prev 24h",
			From:           from,
			To:             utcNow,
			PrevFrom:       from.Add(-24 * time.Hour),
			PrevTo:         from.Add(-time.Nanosecond),
			SQLGranularity: "hour",
		}
	case "week":
		from := dayStart.AddDate(0, 0, -6)
		return overviewPeriodWindow{
			Period:         "week",
			Label:          "Last 7 Days",
			PrevLabel:      "Prev 7 Days",
			From:           from,
			To:             utcNow,
			PrevFrom:       from.AddDate(0, 0, -7),
			PrevTo:         from.Add(-time.Nanosecond),
			SQLGranularity: "day",
		}
	case "year":
		monthStart := time.Date(utcNow.Year(), utcNow.Month(), 1, 0, 0, 0, 0, time.UTC)
		from := monthStart.AddDate(0, -11, 0)
		return overviewPeriodWindow{
			Period:         "year",
			Label:          "Last 12 Months",
			PrevLabel:      "Prev 12 Months",
			From:           from,
			To:             utcNow,
			PrevFrom:       from.AddDate(-1, 0, 0),
			PrevTo:         from.Add(-time.Nanosecond),
			SQLGranularity: "month",
		}
	default:
		from := dayStart.AddDate(0, 0, -29)
		return overviewPeriodWindow{
			Period:         "month",
			Label:          "Last 30 Days",
			PrevLabel:      "Prev 30 Days",
			From:           from,
			To:             utcNow,
			PrevFrom:       from.AddDate(0, 0, -30),
			PrevTo:         from.Add(-time.Nanosecond),
			SQLGranularity: "day",
		}
	}
}

func resolveOverviewPersona(tc domain.TenantContext) (string, map[string]bool) {
	permSet := make(map[string]bool, len(tc.Permissions))
	for _, p := range tc.Permissions {
		permSet[p] = true
	}
	has := func(code string) bool { return permSet[code] }

	role := "LIMITED"
	switch tc.RoleCode {
	case "SuperAdmin", "BusinessOwner":
		role = "EXECUTIVE"
	case "BranchManager":
		role = "BRANCH_MANAGER"
	case "Accountant":
		role = "ACCOUNTANT"
	case "InventoryController":
		role = "INVENTORY"
	case "Cashier":
		role = "CASHIER"
	default:
		switch {
		case has("accounting:view") && has("inventory:view") && has("pos:view"):
			role = "EXECUTIVE"
		case has("accounting:view"):
			role = "ACCOUNTANT"
		case has("inventory:view"):
			role = "INVENTORY"
		case has("pos:view"):
			role = "CASHIER"
		}
	}

	caps := map[string]bool{
		"can_view_gl":         role == "EXECUTIVE" || role == "ACCOUNTANT" || has("accounting:view"),
		"can_view_profit":     role == "EXECUTIVE" || role == "ACCOUNTANT" || role == "BRANCH_MANAGER",
		"can_view_tax_detail": role == "EXECUTIVE" || role == "ACCOUNTANT" || has("accounting:view"),
		"can_view_inventory":  role == "EXECUTIVE" || role == "INVENTORY" || role == "BRANCH_MANAGER" || has("inventory:view"),
		"can_view_pos":        role == "EXECUTIVE" || role == "BRANCH_MANAGER" || role == "CASHIER" || has("pos:view"),
		"can_view_customers":  has("customers:view"),
		"can_view_catalog":    has("catalog:view"),
		"can_view_print":      has("print:view"),
		"can_export_reports":  role == "EXECUTIVE" || role == "ACCOUNTANT" || has("analytics:export"),
		"can_switch_branch":   tc.HasMultiBranchAccess(),
		"can_manage_settings": has("settings:view"),
	}
	return role, caps
}

func computeGrowthPct(current, previous decimal.Decimal) int {
	if previous.GreaterThan(decimal.Zero) {
		val, _ := current.Sub(previous).Div(previous).Mul(decimal.NewFromInt(100)).Float64()
		return int(math.Round(val))
	}
	if current.GreaterThan(decimal.Zero) {
		return 100
	}
	return 0
}

func decodeStringSliceJSON(raw json.RawMessage) []string {
	if len(raw) == 0 {
		return []string{}
	}
	var out []string
	if err := json.Unmarshal(raw, &out); err != nil {
		return []string{}
	}
	cleaned := make([]string, 0, len(out))
	for _, s := range out {
		if strings.TrimSpace(s) != "" {
			cleaned = append(cleaned, s)
		}
	}
	return cleaned
}

// AnalyticsUsecase aggregates live 3NF sales, regional revenue, product performance, and KPI metrics.
type AnalyticsUsecase struct {
	queries *db.Queries
}

// NewAnalyticsUsecase constructs an AnalyticsUsecase.
func NewAnalyticsUsecase(queries *db.Queries) *AnalyticsUsecase {
	return &AnalyticsUsecase{queries: queries}
}

// GetOverviewDashboard builds the real-data, multi-period, role-scoped Overview Bento payload from PostgreSQL.
func (a *AnalyticsUsecase) GetOverviewDashboard(
	ctx context.Context,
	tc domain.TenantContext,
	period string,
	requestedBranchID uuid.UUID,
	requestedTerminalIDs ...uuid.UUID,
) (map[string]any, error) {
	win := resolveOverviewWindow(period, time.Now())
	persona, caps := resolveOverviewPersona(tc)

	var requestedTerminalID uuid.UUID
	if len(requestedTerminalIDs) > 0 {
		requestedTerminalID = requestedTerminalIDs[0]
	}

	effectiveBranchID := uuid.Nil
	scopeLabel := "All Branches"
	if !tc.HasMultiBranchAccess() || !caps["can_switch_branch"] {
		effectiveBranchID = tc.BranchID
		scopeLabel = "Assigned Branch"
	} else if requestedBranchID != uuid.Nil && tc.CanAccessBranch(requestedBranchID) {
		effectiveBranchID = requestedBranchID
		scopeLabel = "Selected Branch"
	} else if !tc.HasAllBranchesAccess() && len(tc.AllowedBranchIDs) > 1 {
		scopeLabel = "Assigned Branches"
	}

	effectiveTerminalID := uuid.Nil
	if requestedTerminalID != uuid.Nil && tc.CanAccessTerminal(requestedTerminalID) {
		effectiveTerminalID = requestedTerminalID
	} else if !tc.HasAllBranchesAccess() && len(tc.AllowedTerminalIDs) == 1 && tc.TerminalID != uuid.Nil {
		effectiveTerminalID = tc.TerminalID
	}

	cashierFilterID := uuid.Nil
	if persona == "CASHIER" && !tc.HasMultiBranchAccess() && len(tc.AllowedTerminalIDs) == 0 {
		cashierFilterID = tc.UserID
	}

	fromPG := pgtype.Timestamptz{Time: win.From, Valid: true}
	toPG := pgtype.Timestamptz{Time: win.To, Valid: true}
	prevFromPG := pgtype.Timestamptz{Time: win.PrevFrom, Valid: true}
	prevToPG := pgtype.Timestamptz{Time: win.PrevTo, Valid: true}

	curr, err := a.queries.GetOverviewPeriodSummary(ctx, db.GetOverviewPeriodSummaryParams{
		BusinessID: tc.BusinessID,
		Column2:    fromPG,
		Column3:    toPG,
		Column4:    effectiveBranchID,
		Column5:    cashierFilterID,
		Column6:    effectiveTerminalID,
	})
	if err != nil {
		return nil, err
	}

	prev, err := a.queries.GetOverviewPeriodSummary(ctx, db.GetOverviewPeriodSummaryParams{
		BusinessID: tc.BusinessID,
		Column2:    prevFromPG,
		Column3:    prevToPG,
		Column4:    effectiveBranchID,
		Column5:    cashierFilterID,
		Column6:    effectiveTerminalID,
	})
	if err != nil {
		return nil, err
	}

	bucketRows, err := a.queries.ListOverviewSalesTimeBuckets(ctx, db.ListOverviewSalesTimeBucketsParams{
		BusinessID: tc.BusinessID,
		Column2:    fromPG,
		Column3:    toPG,
		Column4:    effectiveBranchID,
		Column5:    cashierFilterID,
		Column6:    win.SQLGranularity,
		Column7:    effectiveTerminalID,
	})
	if err != nil {
		return nil, err
	}

	genderRows, err := a.queries.ListOverviewGenderMix(ctx, db.ListOverviewGenderMixParams{
		BusinessID: tc.BusinessID,
		Column2:    fromPG,
		Column3:    toPG,
		Column4:    effectiveBranchID,
		Column5:    cashierFilterID,
	})
	if err != nil {
		return nil, err
	}

	paymentRows, err := a.queries.ListOverviewPaymentMix(ctx, db.ListOverviewPaymentMixParams{
		BusinessID: tc.BusinessID,
		Column2:    fromPG,
		Column3:    toPG,
		Column4:    effectiveBranchID,
		Column5:    cashierFilterID,
		Column6:    effectiveTerminalID,
	})
	if err != nil {
		return nil, err
	}

	recentRows, err := a.queries.ListRecentPOSActivityScoped(ctx, db.ListRecentPOSActivityScopedParams{
		BusinessID: tc.BusinessID,
		Column2:    fromPG,
		Column3:    toPG,
		Column4:    effectiveBranchID,
		Column5:    cashierFilterID,
		Column6:    effectiveTerminalID,
	})
	if err != nil {
		return nil, err
	}

	var countrySeries []map[string]any
	if persona == "EXECUTIVE" || persona == "BRANCH_MANAGER" || persona == "ACCOUNTANT" || persona == "INVENTORY" {
		countrySales, err := a.queries.ListTopSalesByCountryScoped(ctx, db.ListTopSalesByCountryScopedParams{
			BusinessID: tc.BusinessID,
			Column2:    fromPG,
			Column3:    toPG,
			Column4:    effectiveBranchID,
		})
		if err != nil {
			return nil, err
		}
		totalCountryRev := decimal.Zero
		for _, cs := range countrySales {
			totalCountryRev = totalCountryRev.Add(cs.Revenue)
		}
		palette := []string{"#877FC1", "#5BA890", "#DBD3F5", "#222026"}
		pctSum := 0
		countrySeries = make([]map[string]any, 0, len(countrySales))
		for idx, cs := range countrySales {
			pct := 0
			if totalCountryRev.GreaterThan(decimal.Zero) {
				ratio, _ := cs.Revenue.Div(totalCountryRev).Mul(decimal.NewFromInt(100)).Float64()
				pct = int(math.Round(ratio))
			} else if len(countrySales) > 0 {
				pct = int(math.Round(100.0 / float64(len(countrySales))))
			}
			pctSum += pct
			countrySeries = append(countrySeries, map[string]any{
				"country_code": cs.CountryCode,
				"country_name": cs.CountryName,
				"revenue":      cs.Revenue.StringFixed(2),
				"percentage":   pct,
				"color":        palette[idx%len(palette)],
			})
		}
		if len(countrySeries) > 0 && pctSum != 100 {
			countrySeries[0]["percentage"] = countrySeries[0]["percentage"].(int) + (100 - pctSum)
		}
	} else {
		countrySeries = []map[string]any{}
	}

	var productSalesOut []map[string]any
	if caps["can_view_catalog"] || caps["can_view_inventory"] || caps["can_view_pos"] || persona == "EXECUTIVE" || persona == "BRANCH_MANAGER" {
		productPerf, err := a.queries.ListProductSalesPerformanceScoped(ctx, db.ListProductSalesPerformanceScopedParams{
			BusinessID: tc.BusinessID,
			Column2:    fromPG,
			Column3:    toPG,
			Column4:    effectiveBranchID,
		})
		if err != nil {
			return nil, err
		}
		productSalesOut = make([]map[string]any, 0, len(productPerf))
		for _, p := range productPerf {
			unitsF, _ := p.UnitsSold.Float64()
			stockF, _ := p.TotalStock.Float64()
			reorderF, _ := p.ReorderPoint.Float64()
			entry := map[string]any{
				"id":               p.ID,
				"sku":              p.Sku,
				"name":             p.Name,
				"category_name":    p.CategoryName,
				"image_url":        p.ImageUrl,
				"base_price":       p.BasePrice.StringFixed(2),
				"sale_price":       p.SalePrice.StringFixed(2),
				"discount_percent": p.DiscountPercent.StringFixed(2),
				"reorder_point":    reorderF,
				"total_stock":      stockF,
				"units_sold":       unitsF,
				"revenue":          p.Revenue.StringFixed(2),
			}
			if caps["can_view_inventory"] {
				entry["fifo_valuation"] = p.FifoValuation.StringFixed(2)
			}
			productSalesOut = append(productSalesOut, entry)
		}
	} else {
		productSalesOut = []map[string]any{}
	}

	// Build chronological time-series slots from real PostgreSQL bucket rows (zero fake scaling).
	salesAnalytics, revenueBars, orderSparkline := buildRealTimeSeries(win, bucketRows, caps["can_view_profit"])

	// Compute real gender/category mix shares from sales_invoice_items.
	womenUnits := decimal.Zero
	menUnits := decimal.Zero
	unisexUnits := decimal.Zero
	for _, gr := range genderRows {
		switch gr.GenderSegment {
		case "WOMEN":
			womenUnits = womenUnits.Add(gr.UnitsSold)
		case "MEN":
			menUnits = menUnits.Add(gr.UnitsSold)
		default:
			unisexUnits = unisexUnits.Add(gr.UnitsSold)
		}
	}
	totalSegmentUnits := womenUnits.Add(menUnits).Add(unisexUnits)
	menSharePct := 0
	womenSharePct := 0
	if totalSegmentUnits.GreaterThan(decimal.Zero) {
		menF, _ := menUnits.Div(totalSegmentUnits).Mul(decimal.NewFromInt(100)).Float64()
		menSharePct = int(math.Round(menF))
		womenF, _ := womenUnits.Div(totalSegmentUnits).Mul(decimal.NewFromInt(100)).Float64()
		womenSharePct = int(math.Round(womenF))
	}

	aov := computeAverageOrderValue(curr.PaidRevenue, curr.PaidOrderCount)
	prevAOV := computeAverageOrderValue(prev.PaidRevenue, prev.PaidOrderCount)
	grossProfit, marginPct := computeProfitAndMargin(curr.PaidRevenue, curr.TotalCogs)

	// Payment tender mix with percentage shares.
	totalCollected := decimal.Zero
	for _, pr := range paymentRows {
		totalCollected = totalCollected.Add(pr.TotalCollected)
	}
	paymentMixOut := make([]map[string]any, 0, len(paymentRows))
	for _, pr := range paymentRows {
		paymentMixOut = append(paymentMixOut, map[string]any{
			"payment_method":  pr.PaymentMethod,
			"tx_count":        pr.TxCount,
			"total_collected": pr.TotalCollected.StringFixed(2),
			"share_pct":       computeSharePct(pr.TotalCollected, totalCollected).StringFixed(2),
		})
	}

	// Category breakdown
	catRows, err := a.queries.ListCategoryBreakdownOverview(ctx, db.ListCategoryBreakdownOverviewParams{
		BusinessID: tc.BusinessID,
		Column2:    fromPG,
		Column3:    toPG,
		Column4:    effectiveBranchID,
		Column5:    cashierFilterID,
	})
	if err != nil {
		return nil, err
	}
	categoryMixOut := make([]map[string]any, 0, len(catRows))
	for _, cr := range catRows {
		categoryMixOut = append(categoryMixOut, map[string]any{
			"id":             cr.ID,
			"category_name":  cr.CategoryName,
			"gender_segment": cr.GenderSegment,
			"units_sold":     cr.UnitsSold.Round(0).IntPart(),
			"revenue":        cr.Revenue.StringFixed(2),
		})
	}

	// Serialize recent activity cleanly with real product image thumbnails.
	recentActivityOut := make([]map[string]any, 0, len(recentRows))
	for _, r := range recentRows {
		imgs := decodeStringSliceJSON(r.ItemImagesJson)
		previewImg := r.PreviewImageUrl
		if previewImg == "" && len(imgs) > 0 {
			previewImg = imgs[0]
		}
		item := map[string]any{
			"id":                   r.ID,
			"invoice_number":       r.InvoiceNumber,
			"status":               r.Status,
			"invoice_type":         r.InvoiceType,
			"grand_total":          r.GrandTotal.StringFixed(2),
			"order_channel":        r.OrderChannel,
			"created_at":           r.CreatedAt,
			"branch_name":          r.BranchName,
			"terminal_code":        r.TerminalCode,
			"terminal_name":        r.TerminalName,
			"cashier_name":         r.CashierName,
			"customer_name":        r.CustomerName,
			"customer_avatar":      r.CustomerAvatar,
			"payment_method":       r.PaymentMethod,
			"total_items":          r.TotalItems,
			"preview_image_url":    previewImg,
			"preview_product_name": r.PreviewProductName,
			"item_images":          imgs,
		}
		if caps["can_view_tax_detail"] {
			item["tax_total"] = r.TaxTotal.StringFixed(2)
		}
		recentActivityOut = append(recentActivityOut, item)
	}

	// Pending / Held Bills (suspended_bills HELD) for POS / BranchManager / Executive
	heldOrdersOut := make([]map[string]any, 0)
	if caps["can_view_pos"] {
		heldRows, err := a.queries.ListHeldBillsForOverview(ctx, db.ListHeldBillsForOverviewParams{
			BusinessID: tc.BusinessID,
			Column2:    effectiveBranchID,
		})
		if err != nil {
			return nil, err
		}
		for _, h := range heldRows {
			imgs := decodeStringSliceJSON(h.ItemImagesJson)
			heldOrdersOut = append(heldOrdersOut, map[string]any{
				"id":                   h.ID,
				"hold_code":            h.HoldCode,
				"notes":                h.Notes,
				"order_channel":        h.OrderChannel,
				"table_or_bay_label":   h.TableOrBayLabel,
				"vehicle_plate":        h.VehiclePlate,
				"kot_status":           h.KotStatus,
				"grand_total":          h.GrandTotal.StringFixed(2),
				"held_at":              h.HeldAt,
				"terminal_name":        h.TerminalName,
				"branch_name":          h.BranchName,
				"cashier_name":         h.CashierName,
				"customer_name":        h.CustomerName,
				"customer_avatar":      h.CustomerAvatar,
				"item_count":           h.ItemCount,
				"preview_product_name": h.PreviewProductName,
				"item_images":          imgs,
			})
		}
	}

	// Inventory Totals & Low Stock Alerts (strictly restricted to Inventory / BranchManager / Executive)
	var inventorySummary map[string]any
	lowStockOut := make([]map[string]any, 0)
	if caps["can_view_inventory"] {
		invTotals, err := a.queries.GetOverviewInventoryTotals(ctx, db.GetOverviewInventoryTotalsParams{
			BusinessID: tc.BusinessID,
			Column2:    effectiveBranchID,
		})
		if err != nil {
			return nil, err
		}
		lowStockRows, err := a.queries.ListLowStockAlertsOverview(ctx, db.ListLowStockAlertsOverviewParams{
			BusinessID: tc.BusinessID,
			Column2:    effectiveBranchID,
		})
		if err != nil {
			return nil, err
		}
		inventorySummary = map[string]any{
			"active_sku_count":     invTotals.ActiveSkuCount,
			"low_stock_count":      invTotals.LowStockCount,
			"total_stock_units":    invTotals.TotalStockUnits.Round(2).String(),
			"total_fifo_valuation": invTotals.TotalFifoValuation.StringFixed(2),
			"open_po_count":        invTotals.OpenPoCount,
		}
		for _, l := range lowStockRows {
			lowStockOut = append(lowStockOut, map[string]any{
				"id":            l.ID,
				"sku":           l.Sku,
				"name":          l.Name,
				"image_url":     l.ImageUrl,
				"category_name": l.CategoryName,
				"reorder_point": l.ReorderPoint.Round(0).IntPart(),
				"reorder_qty":   l.ReorderQty.Round(0).IntPart(),
				"total_stock":   l.TotalStock.Round(2).String(),
				"open_po_count": l.OpenPoCount,
			})
		}
	}

	// GL & Tax Summaries (strictly restricted to Accountant / Executive)
	var glSummary map[string]any
	recentJournalsOut := make([]map[string]any, 0)
	taxBreakdownOut := make([]map[string]any, 0)
	if caps["can_view_gl"] {
		glRow, err := a.queries.GetOverviewGLAndFiscalSummary(ctx, db.GetOverviewGLAndFiscalSummaryParams{
			BusinessID: tc.BusinessID,
			Column2:    fromPG,
			Column3:    toPG,
		})
		if err != nil {
			return nil, err
		}
		glSummary = map[string]any{
			"period_journal_count":       glRow.PeriodJournalCount,
			"period_total_debits":        glRow.PeriodTotalDebits.StringFixed(2),
			"open_fiscal_period_count":   glRow.OpenFiscalPeriodCount,
			"current_fiscal_period_name": glRow.CurrentFiscalPeriodName,
		}
		jeRows, err := a.queries.ListRecentJournalEntriesOverview(ctx, db.ListRecentJournalEntriesOverviewParams{
			BusinessID: tc.BusinessID,
			Column2:    fromPG,
			Column3:    toPG,
		})
		if err != nil {
			return nil, err
		}
		for _, je := range jeRows {
			recentJournalsOut = append(recentJournalsOut, map[string]any{
				"id":           je.ID,
				"entry_number": je.EntryNumber,
				"source_type":  je.SourceType,
				"description":  je.Description,
				"entry_date":   je.EntryDate,
				"created_at":   je.CreatedAt,
				"total_debit":  je.TotalDebit.StringFixed(2),
				"total_credit": je.TotalCredit.StringFixed(2),
				"is_balanced":  je.TotalDebit.Equal(je.TotalCredit),
			})
		}
		taxRows, err := a.queries.ListTaxBreakdownReport(ctx, db.ListTaxBreakdownReportParams{
			BusinessID: tc.BusinessID,
			Column2:    fromPG,
			Column3:    toPG,
			Column4:    effectiveBranchID,
		})
		if err != nil {
			return nil, err
		}
		for _, tr := range taxRows {
			taxBreakdownOut = append(taxBreakdownOut, map[string]any{
				"tax_name":      tr.TaxName,
				"tax_type":      tr.TaxType,
				"rate_percent":  tr.RatePercent.StringFixed(2),
				"invoice_count": tr.InvoiceCount,
				"taxable_base":  tr.TaxableBase.StringFixed(2),
				"tax_collected": tr.TaxCollected.StringFixed(2),
			})
		}
	}

	kpiPayload := map[string]any{
		"total_customers":           curr.RegisteredCustomerTotal,
		"period_unique_customers":   curr.UniqueCustomers,
		"customers_growth_pct":      computeGrowthPct(decimal.NewFromInt32(curr.UniqueCustomers), decimal.NewFromInt32(prev.UniqueCustomers)),
		"customers_last_period":     prev.UniqueCustomers,
		"men_share_pct":             menSharePct,
		"women_share_pct":           womenSharePct,
		"total_revenue":             curr.PaidRevenue.StringFixed(2),
		"revenue_growth_pct":        computeGrowthPct(curr.PaidRevenue, prev.PaidRevenue),
		"revenue_last_period":       prev.PaidRevenue.StringFixed(2),
		"total_orders_amount":       curr.PaidRevenue.StringFixed(2),
		"orders_growth_pct":         computeGrowthPct(decimal.NewFromInt32(curr.PaidOrderCount), decimal.NewFromInt32(prev.PaidOrderCount)),
		"orders_last_period_amount": prev.PaidRevenue.StringFixed(2),
		"orders_last_period_count":  prev.PaidOrderCount,
		"live_paid_orders":          curr.PaidOrderCount,
		"refund_void_count":         curr.RefundVoidCount,
		"live_paid_revenue":         curr.PaidRevenue.StringFixed(2),
		"average_order_value":       aov.StringFixed(2),
		"prev_average_order_value":  prevAOV.StringFixed(2),
		"units_sold":                curr.UnitsSold.Round(0).IntPart(),
		"units_returned":            curr.UnitsReturned.Round(0).IntPart(),
		"held_bill_count":           curr.HeldBillCount,
		"held_bill_total":           curr.HeldBillTotal.StringFixed(2),
	}
	if caps["can_view_tax_detail"] {
		kpiPayload["total_taxes"] = curr.TotalTaxes.StringFixed(2)
		kpiPayload["total_discounts"] = curr.TotalDiscounts.StringFixed(2)
		kpiPayload["gross_subtotal"] = curr.GrossSubtotal.StringFixed(2)
	}
	if caps["can_view_profit"] {
		kpiPayload["total_cogs"] = curr.TotalCogs.StringFixed(2)
		kpiPayload["gross_profit"] = grossProfit.StringFixed(2)
		kpiPayload["gross_margin_pct"] = marginPct.StringFixed(2)
	}

	// Build Company Overview, Branch-Wise Sales, and Terminal-Wise Sales telemetry
	var companyOverview map[string]any
	if compRow, compErr := a.queries.GetOverviewCompanySummary(ctx, tc.BusinessID); compErr == nil {
		companyOverview = map[string]any{
			"business_id":          compRow.BusinessID,
			"business_name":        compRow.BusinessName,
			"trade_name":           compRow.TradeName,
			"legal_name":           compRow.LegalName,
			"tax_registration_no":  compRow.TaxRegistrationNo,
			"base_currency":        compRow.BaseCurrency,
			"industry_profile":     compRow.IndustryProfile,
			"default_language":     compRow.DefaultLanguage,
			"total_branches":       compRow.TotalBranches,
			"active_branches":      compRow.ActiveBranches,
			"total_warehouses":     compRow.TotalWarehouses,
			"total_terminals":      compRow.TotalTerminals,
			"active_terminals":     compRow.ActiveTerminals,
			"open_shift_terminals": compRow.OpenShiftTerminals,
			"total_staff":          compRow.TotalStaff,
			"active_staff":         compRow.ActiveStaff,
			"total_brands":         compRow.TotalBrands,
			"total_categories":     compRow.TotalCategories,
			"active_skus":          compRow.ActiveSkus,
			"total_customers":      compRow.TotalCustomers,
			"total_suppliers":      compRow.TotalSuppliers,
			"total_stock_units":    compRow.TotalStockUnits.Round(0).String(),
			"total_fifo_valuation": compRow.TotalFifoValuation.StringFixed(2),
			"period_paid_orders":   curr.PaidOrderCount,
			"period_paid_revenue":  curr.PaidRevenue.StringFixed(2),
			"period_tax_collected": curr.TotalTaxes.StringFixed(2),
			"period_gross_profit":  grossProfit.StringFixed(2),
		}
	}

	branchSalesOut := make([]map[string]any, 0)
	if brRows, brErr := a.queries.ListOverviewBranchPerformance(ctx, db.ListOverviewBranchPerformanceParams{
		BusinessID: tc.BusinessID,
		Column2:    fromPG,
		Column3:    toPG,
	}); brErr == nil {
		totalBranchRev := decimal.Zero
		for _, br := range brRows {
			if tc.CanAccessBranch(br.BranchID) {
				totalBranchRev = totalBranchRev.Add(br.PaidRevenue)
			}
		}
		for _, br := range brRows {
			if !tc.CanAccessBranch(br.BranchID) {
				continue
			}
			brProfit, brMargin := computeProfitAndMargin(br.PaidRevenue, br.TotalCogs)
			brAOV := computeAverageOrderValue(br.PaidRevenue, br.PaidOrders)
			entry := map[string]any{
				"branch_id":             br.BranchID,
				"branch_code":           br.BranchCode,
				"branch_name":           br.BranchName,
				"city":                  br.City,
				"country_code":          br.CountryCode,
				"country_name":          br.CountryName,
				"address":               br.Address,
				"is_warehouse":          br.IsWarehouse,
				"is_active":             br.IsActive,
				"terminal_count":        br.TerminalCount,
				"active_terminal_count": br.ActiveTerminalCount,
				"open_shift_count":      br.OpenShiftCount,
				"staff_count":           br.StaffCount,
				"paid_orders":           br.PaidOrders,
				"refund_void_count":     br.RefundVoidCount,
				"units_sold":            br.UnitsSold.Round(0).IntPart(),
				"gross_subtotal":        br.GrossSubtotal.StringFixed(2),
				"discount_total":        br.DiscountTotal.StringFixed(2),
				"tax_total":             br.TaxTotal.StringFixed(2),
				"paid_revenue":          br.PaidRevenue.StringFixed(2),
				"average_order_value":   brAOV.StringFixed(2),
				"revenue_share_pct":     computeSharePct(br.PaidRevenue, totalBranchRev).StringFixed(2),
				"held_bill_count":       br.HeldBillCount,
				"held_bill_total":       br.HeldBillTotal.StringFixed(2),
				"fifo_stock_units":      br.FifoStockUnits.Round(0).String(),
				"fifo_valuation":        br.FifoValuation.StringFixed(2),
			}
			if caps["can_view_profit"] {
				entry["total_cogs"] = br.TotalCogs.StringFixed(2)
				entry["gross_profit"] = brProfit.StringFixed(2)
				entry["margin_pct"] = brMargin.StringFixed(2)
			}
			branchSalesOut = append(branchSalesOut, entry)
		}
	}

	terminalSalesOut := make([]map[string]any, 0)
	if tmRows, tmErr := a.queries.ListOverviewTerminalPerformance(ctx, db.ListOverviewTerminalPerformanceParams{
		BusinessID: tc.BusinessID,
		Column2:    fromPG,
		Column3:    toPG,
		Column4:    effectiveBranchID,
	}); tmErr == nil {
		totalTermRev := decimal.Zero
		for _, tm := range tmRows {
			if tc.CanAccessBranch(tm.BranchID) && tc.CanAccessTerminal(tm.TerminalID) {
				totalTermRev = totalTermRev.Add(tm.PaidRevenue)
			}
		}
		for _, tm := range tmRows {
			if !tc.CanAccessBranch(tm.BranchID) || !tc.CanAccessTerminal(tm.TerminalID) {
				continue
			}
			tmProfit, tmMargin := computeProfitAndMargin(tm.PaidRevenue, tm.TotalCogs)
			tmAOV := computeAverageOrderValue(tm.PaidRevenue, tm.PaidOrders)
			entry := map[string]any{
				"terminal_id":          tm.TerminalID,
				"terminal_code":        tm.TerminalCode,
				"terminal_name":        tm.TerminalName,
				"hardware_serial":      tm.HardwareSerial,
				"is_active":            tm.IsActive,
				"branch_id":            tm.BranchID,
				"branch_code":          tm.BranchCode,
				"branch_name":          tm.BranchName,
				"shift_status":         tm.ShiftStatus,
				"active_cashier_name":  tm.ActiveCashierName,
				"opening_float":        tm.OpeningFloat.StringFixed(2),
				"paid_orders":          tm.PaidOrders,
				"refund_void_count":    tm.RefundVoidCount,
				"units_sold":           tm.UnitsSold.Round(0).IntPart(),
				"gross_subtotal":       tm.GrossSubtotal.StringFixed(2),
				"discount_total":       tm.DiscountTotal.StringFixed(2),
				"tax_total":            tm.TaxTotal.StringFixed(2),
				"paid_revenue":         tm.PaidRevenue.StringFixed(2),
				"average_order_value":  tmAOV.StringFixed(2),
				"revenue_share_pct":    computeSharePct(tm.PaidRevenue, totalTermRev).StringFixed(2),
				"cash_sales":           tm.CashSales.StringFixed(2),
				"card_sales":           tm.CardSales.StringFixed(2),
				"qr_other_sales":       tm.QrOtherSales.StringFixed(2),
				"held_bill_count":      tm.HeldBillCount,
				"held_bill_total":      tm.HeldBillTotal.StringFixed(2),
				"last_invoice_number":  tm.LastInvoiceNumber,
				"last_sale_at":         tm.LastSaleAt,
			}
			if caps["can_view_profit"] {
				entry["total_cogs"] = tm.TotalCogs.StringFixed(2)
				entry["gross_profit"] = tmProfit.StringFixed(2)
				entry["margin_pct"] = tmMargin.StringFixed(2)
			}
			terminalSalesOut = append(terminalSalesOut, entry)
		}
	}

	resp := map[string]any{
		"period":            win.Period,
		"period_label":      win.Label,
		"prev_period_label": win.PrevLabel,
		"from":              win.From,
		"to":                win.To,
		"role_persona":      persona,
		"role_code":         tc.RoleCode,
		"role_name":         tc.RoleName,
		"branch_scope":      scopeLabel,
		"capabilities":      caps,
		"kpi":               kpiPayload,
		"company_overview":  companyOverview,
		"branch_sales":      branchSalesOut,
		"terminal_sales":    terminalSalesOut,
		"sales_analytics":   salesAnalytics,
		"revenue_bars":      revenueBars,
		"order_sparkline":   orderSparkline,
		"payment_mix":       paymentMixOut,
		"category_mix":      categoryMixOut,
		"top_countries":     countrySeries,
		"recent_activity":   recentActivityOut,
		"held_orders":       heldOrdersOut,
		"product_sales":     productSalesOut,
		"low_stock_alerts":  lowStockOut,
		"recent_journals":   recentJournalsOut,
		"tax_breakdown":     taxBreakdownOut,
	}
	if inventorySummary != nil {
		resp["inventory_summary"] = inventorySummary
	}
	if glSummary != nil {
		resp["gl_summary"] = glSummary
	}
	return resp, nil
}

func buildRealTimeSeries(
	win overviewPeriodWindow,
	rows []db.ListOverviewSalesTimeBucketsRow,
	includeProfit bool,
) ([]map[string]any, []map[string]any, []map[string]any) {
	type aggSlot struct {
		label         string
		revenue       decimal.Decimal
		cogs          decimal.Decimal
		taxes         decimal.Decimal
		orders        int32
		unitsSold     decimal.Decimal
		unitsReturned decimal.Decimal
		womenUnits    decimal.Decimal
		menUnits      decimal.Decimal
	}

	slotMap := make(map[string]*aggSlot)
	keys := make([]string, 0)

	addSlot := func(key, label string) {
		if _, exists := slotMap[key]; !exists {
			slotMap[key] = &aggSlot{label: label}
			keys = append(keys, key)
		}
	}

	switch win.Period {
	case "day":
		// 8 three-hour intervals covering the 24-hour window ending at win.To.
		base := time.Date(win.From.Year(), win.From.Month(), win.From.Day(), win.From.Hour(), 0, 0, 0, time.UTC)
		for i := 0; i < 8; i++ {
			t0 := base.Add(time.Duration(i*3) * time.Hour)
			key := t0.Format("2006-01-02T15")
			addSlot(key, t0.Format("15:04"))
		}
		for _, r := range rows {
			if !r.BucketTs.Valid {
				continue
			}
			bt := r.BucketTs.Time.UTC()
			diffH := int(bt.Sub(base).Hours())
			if diffH < 0 {
				diffH = 0
			}
			idx := diffH / 3
			if idx >= len(keys) {
				idx = len(keys) - 1
			}
			slot := slotMap[keys[idx]]
			slot.revenue = slot.revenue.Add(r.PaidRevenue)
			slot.cogs = slot.cogs.Add(r.TotalCogs)
			slot.taxes = slot.taxes.Add(r.TotalTaxes)
			slot.orders += r.OrderCount
			slot.unitsSold = slot.unitsSold.Add(r.UnitsSold)
			slot.unitsReturned = slot.unitsReturned.Add(r.UnitsReturned)
			slot.womenUnits = slot.womenUnits.Add(r.WomenUnits)
			slot.menUnits = slot.menUnits.Add(r.MenUnits)
		}
	case "week":
		for i := 0; i < 7; i++ {
			d := win.From.AddDate(0, 0, i)
			key := d.Format("2006-01-02")
			addSlot(key, d.Format("Mon"))
		}
		for _, r := range rows {
			if !r.BucketTs.Valid {
				continue
			}
			key := r.BucketTs.Time.UTC().Format("2006-01-02")
			if slot, ok := slotMap[key]; ok {
				slot.revenue = slot.revenue.Add(r.PaidRevenue)
				slot.cogs = slot.cogs.Add(r.TotalCogs)
				slot.taxes = slot.taxes.Add(r.TotalTaxes)
				slot.orders += r.OrderCount
				slot.unitsSold = slot.unitsSold.Add(r.UnitsSold)
				slot.unitsReturned = slot.unitsReturned.Add(r.UnitsReturned)
				slot.womenUnits = slot.womenUnits.Add(r.WomenUnits)
				slot.menUnits = slot.menUnits.Add(r.MenUnits)
			}
		}
	case "year":
		for i := 0; i < 12; i++ {
			m := win.From.AddDate(0, i, 0)
			key := m.Format("2006-01")
			addSlot(key, m.Format("Jan"))
		}
		for _, r := range rows {
			if !r.BucketTs.Valid {
				continue
			}
			key := r.BucketTs.Time.UTC().Format("2006-01")
			if slot, ok := slotMap[key]; ok {
				slot.revenue = slot.revenue.Add(r.PaidRevenue)
				slot.cogs = slot.cogs.Add(r.TotalCogs)
				slot.taxes = slot.taxes.Add(r.TotalTaxes)
				slot.orders += r.OrderCount
				slot.unitsSold = slot.unitsSold.Add(r.UnitsSold)
				slot.unitsReturned = slot.unitsReturned.Add(r.UnitsReturned)
				slot.womenUnits = slot.womenUnits.Add(r.WomenUnits)
				slot.menUnits = slot.menUnits.Add(r.MenUnits)
			}
		}
	default: // "month": 10 x 3-day chronological buckets over last 30 days
		for i := 0; i < 10; i++ {
			d := win.From.AddDate(0, 0, i*3)
			key := d.Format("2006-01-02")
			addSlot(key, d.Format("2 Jan"))
		}
		for _, r := range rows {
			if !r.BucketTs.Valid {
				continue
			}
			diffDays := int(r.BucketTs.Time.UTC().Sub(win.From).Hours() / 24)
			if diffDays < 0 {
				diffDays = 0
			}
			idx := diffDays / 3
			if idx >= len(keys) {
				idx = len(keys) - 1
			}
			slot := slotMap[keys[idx]]
			slot.revenue = slot.revenue.Add(r.PaidRevenue)
			slot.cogs = slot.cogs.Add(r.TotalCogs)
			slot.taxes = slot.taxes.Add(r.TotalTaxes)
			slot.orders += r.OrderCount
			slot.unitsSold = slot.unitsSold.Add(r.UnitsSold)
			slot.unitsReturned = slot.unitsReturned.Add(r.UnitsReturned)
			slot.womenUnits = slot.womenUnits.Add(r.WomenUnits)
			slot.menUnits = slot.menUnits.Add(r.MenUnits)
		}
	}

	sort.Strings(keys)
	peakRevenue := decimal.Zero
	peakIdx := len(keys) - 1
	for idx, k := range keys {
		if slotMap[k].revenue.GreaterThan(peakRevenue) {
			peakRevenue = slotMap[k].revenue
			peakIdx = idx
		}
	}

	salesAnalytics := make([]map[string]any, 0, len(keys))
	revenueBars := make([]map[string]any, 0, len(keys))
	orderSparkline := make([]map[string]any, 0, len(keys))

	for idx, k := range keys {
		slot := slotMap[k]
		revF, _ := slot.revenue.Float64()
		taxF, _ := slot.taxes.Float64()
		womenF, _ := slot.womenUnits.Float64()
		menF, _ := slot.menUnits.Float64()
		soldCount := slot.unitsSold.Round(0).IntPart()
		retCount := slot.unitsReturned.Round(0).IntPart()

		saRow := map[string]any{
			"month":    slot.label,
			"label":    slot.label,
			"women":    math.Round(womenF),
			"men":      math.Round(menF),
			"sold":     soldCount,
			"returned": retCount,
			"revenue":  math.Round(revF*100) / 100,
			"orders":   slot.orders,
			"active":   idx == peakIdx && slot.revenue.GreaterThan(decimal.Zero),
		}
		if includeProfit {
			cogsF, _ := slot.cogs.Float64()
			saRow["cogs"] = math.Round(cogsF*100) / 100
			saRow["taxes"] = math.Round(taxF*100) / 100
		}
		salesAnalytics = append(salesAnalytics, saRow)

		revenueBars = append(revenueBars, map[string]any{
			"day":    slot.label,
			"value":  math.Round(revF*100) / 100,
			"orders": slot.orders,
			"active": idx == peakIdx && slot.revenue.GreaterThan(decimal.Zero),
		})
		orderSparkline = append(orderSparkline, map[string]any{
			"label":  slot.label,
			"value":  math.Round(revF*100) / 100,
			"orders": slot.orders,
		})
	}
	return salesAnalytics, revenueBars, orderSparkline
}

// computeProfitAndMargin returns (revenue - cogs, margin %) using exact decimal arithmetic.
func computeProfitAndMargin(revenue, cogs decimal.Decimal) (decimal.Decimal, decimal.Decimal) {
	grossProfit := revenue.Sub(cogs)
	if revenue.LessThanOrEqual(decimal.Zero) {
		return grossProfit, decimal.Zero
	}
	marginPct := grossProfit.Div(revenue).Mul(decimal.NewFromInt(100)).Round(2)
	return grossProfit, marginPct
}

// computeSharePct returns (part / total * 100) rounded to 2 decimal places using exact decimal arithmetic.
func computeSharePct(part, total decimal.Decimal) decimal.Decimal {
	if total.LessThanOrEqual(decimal.Zero) || part.LessThanOrEqual(decimal.Zero) {
		return decimal.Zero
	}
	return part.Div(total).Mul(decimal.NewFromInt(100)).Round(2)
}

// computeAverageOrderValue returns (total / count) rounded to 2 decimal places using exact decimal arithmetic.
func computeAverageOrderValue(total decimal.Decimal, count int32) decimal.Decimal {
	if count <= 0 || total.LessThanOrEqual(decimal.Zero) {
		return decimal.Zero
	}
	return total.Div(decimal.NewFromInt32(count)).Round(2)
}

// GetEnterpriseReports returns comprehensive multi-tenant business analysis reports:
// Executive Sales Summary, Product-Wise, Category-Wise, Customer-Wise, Branch/Cashier/Payment/Tax,
// Procurement & Vendor AP, and FIFO Stock Valuation.
func (a *AnalyticsUsecase) GetEnterpriseReports(ctx context.Context, businessID, branchID uuid.UUID, fromTime, toTime time.Time) (map[string]any, error) {
	fromPG := pgtype.Timestamptz{Time: fromTime, Valid: true}
	toPG := pgtype.Timestamptz{Time: toTime, Valid: true}

	totals, err := a.queries.GetSalesReportTotals(ctx, db.GetSalesReportTotalsParams{
		BusinessID: businessID,
		Column2:    fromPG,
		Column3:    toPG,
		Column4:    branchID,
	})
	if err != nil {
		return nil, err
	}

	salesInvoices, err := a.queries.ListSalesInvoicesReport(ctx, db.ListSalesInvoicesReportParams{
		BusinessID: businessID,
		Column2:    fromPG,
		Column3:    toPG,
		Column4:    branchID,
	})
	if err != nil {
		return nil, err
	}

	pos, err := a.queries.ListPurchaseOrdersWithDetails(ctx, businessID)
	if err != nil {
		return nil, err
	}
	poDetails := make([]map[string]any, 0, len(pos))
	autoPOCount := 0
	for _, po := range pos {
		if branchID != uuid.Nil && po.BranchID != branchID {
			continue
		}
		if po.AutoGenerated {
			autoPOCount++
		}
		items, _ := a.queries.ListPOItemsForPO(ctx, db.ListPOItemsForPOParams{
			BusinessID: businessID,
			PoID:       po.ID,
		})
		poDetails = append(poDetails, map[string]any{
			"id":                  po.ID,
			"po_number":           po.PoNumber,
			"branch_id":           po.BranchID,
			"branch_name":         po.BranchName,
			"supplier_name":       po.SupplierName,
			"status":              po.Status,
			"auto_generated":      po.AutoGenerated,
			"expected_date":       po.ExpectedDate,
			"total_amount":        po.TotalAmount,
			"notes":               po.Notes,
			"created_at":          po.CreatedAt,
			"invoice_id":          po.InvoiceID,
			"invoice_number":      po.InvoiceNumber,
			"invoice_status":      po.InvoiceStatus,
			"invoice_grand_total": po.InvoiceGrandTotal,
			"items":               items,
		})
	}

	allPurchaseInvoices, err := a.queries.ListPurchaseInvoicesForBusiness(ctx, businessID)
	if err != nil {
		return nil, err
	}
	purchaseInvoices := make([]db.ListPurchaseInvoicesForBusinessRow, 0, len(allPurchaseInvoices))
	unpaidAPTotal := decimal.Zero
	for _, pi := range allPurchaseInvoices {
		if branchID != uuid.Nil && pi.BranchID != branchID {
			continue
		}
		purchaseInvoices = append(purchaseInvoices, pi)
		if pi.Status == "DRAFT" || pi.Status == "ISSUED" {
			unpaidAPTotal = unpaidAPTotal.Add(pi.GrandTotal)
		}
	}

	stockValuation, err := a.queries.ListFIFOStockValuationReport(ctx, db.ListFIFOStockValuationReportParams{
		BusinessID: businessID,
		Column2:    branchID,
	})
	if err != nil {
		return nil, err
	}

	productRows, err := a.queries.ListProductWiseSalesReport(ctx, db.ListProductWiseSalesReportParams{
		BusinessID: businessID,
		Column2:    fromPG,
		Column3:    toPG,
		Column4:    branchID,
	})
	if err != nil {
		return nil, err
	}

	categoryRows, err := a.queries.ListCategoryWiseSalesReport(ctx, db.ListCategoryWiseSalesReportParams{
		BusinessID: businessID,
		Column2:    fromPG,
		Column3:    toPG,
		Column4:    branchID,
	})
	if err != nil {
		return nil, err
	}

	customerRows, err := a.queries.ListCustomerWiseSalesReport(ctx, db.ListCustomerWiseSalesReportParams{
		BusinessID: businessID,
		Column2:    fromPG,
		Column3:    toPG,
		Column4:    branchID,
	})
	if err != nil {
		return nil, err
	}

	paymentRows, err := a.queries.ListPaymentMethodSalesReport(ctx, db.ListPaymentMethodSalesReportParams{
		BusinessID: businessID,
		Column2:    fromPG,
		Column3:    toPG,
		Column4:    branchID,
	})
	if err != nil {
		return nil, err
	}

	branchRows, err := a.queries.ListBranchPerformanceReport(ctx, db.ListBranchPerformanceReportParams{
		BusinessID: businessID,
		Column2:    fromPG,
		Column3:    toPG,
		Column4:    branchID,
	})
	if err != nil {
		return nil, err
	}

	cashierRows, err := a.queries.ListCashierPerformanceReport(ctx, db.ListCashierPerformanceReportParams{
		BusinessID: businessID,
		Column2:    fromPG,
		Column3:    toPG,
		Column4:    branchID,
	})
	if err != nil {
		return nil, err
	}

	taxRows, err := a.queries.ListTaxBreakdownReport(ctx, db.ListTaxBreakdownReportParams{
		BusinessID: businessID,
		Column2:    fromPG,
		Column3:    toPG,
		Column4:    branchID,
	})
	if err != nil {
		return nil, err
	}

	dailyRows, err := a.queries.ListDailySalesTrendReport(ctx, db.ListDailySalesTrendReportParams{
		BusinessID: businessID,
		Column2:    fromPG,
		Column3:    toPG,
		Column4:    branchID,
	})
	if err != nil {
		return nil, err
	}

	supplierRows, err := a.queries.ListSupplierProcurementReport(ctx, db.ListSupplierProcurementReportParams{
		BusinessID: businessID,
		Column2:    fromPG,
		Column3:    toPG,
		Column4:    branchID,
	})
	if err != nil {
		return nil, err
	}

	grossProfit, marginPct := computeProfitAndMargin(totals.NetRevenue, totals.TotalCogs)
	avgOrderValue := computeAverageOrderValue(totals.NetRevenue, totals.PaidCount)

	totalInventoryValue := decimal.Zero
	totalUnits := decimal.Zero
	lowStockCount := 0
	for _, sv := range stockValuation {
		totalInventoryValue = totalInventoryValue.Add(sv.FifoValuation)
		totalUnits = totalUnits.Add(sv.TotalRemaining)
		if sv.TotalRemaining.LessThanOrEqual(sv.ReorderPoint) {
			lowStockCount++
		}
	}

	totalProdRev := decimal.Zero
	for _, r := range productRows {
		totalProdRev = totalProdRev.Add(r.NetRevenue)
	}
	productReport := make([]map[string]any, 0, len(productRows))
	for _, r := range productRows {
		prodProfit, prodMargin := computeProfitAndMargin(r.NetRevenue, r.TotalCogs)
		avgSell := decimal.Zero
		if r.UnitsSold.GreaterThan(decimal.Zero) {
			avgSell = r.NetRevenue.Div(r.UnitsSold).Round(2)
		}
		stockStatus := "HEALTHY"
		if r.StockOnHand.LessThanOrEqual(decimal.Zero) {
			stockStatus = "OUT_OF_STOCK"
		} else if r.StockOnHand.LessThanOrEqual(r.ReorderPoint) {
			stockStatus = "LOW_STOCK"
		}
		productReport = append(productReport, map[string]any{
			"id":                r.ID,
			"sku":               r.Sku,
			"name":              r.Name,
			"category_id":       r.CategoryID,
			"category_name":     r.CategoryName,
			"gender_segment":    r.GenderSegment,
			"unit_of_measure":   r.UnitOfMeasure,
			"base_price":        r.BasePrice.StringFixed(2),
			"sale_price":        r.SalePrice.StringFixed(2),
			"reorder_point":     r.ReorderPoint.StringFixed(0),
			"invoice_count":     r.InvoiceCount,
			"units_sold":        r.UnitsSold.StringFixed(0),
			"gross_sales":       r.GrossSales.StringFixed(2),
			"discount_amount":   r.DiscountAmount.StringFixed(2),
			"tax_amount":        r.TaxAmount.StringFixed(2),
			"taxable_sales":     r.TaxableSales.StringFixed(2),
			"net_revenue":       r.NetRevenue.StringFixed(2),
			"total_cogs":        r.TotalCogs.StringFixed(2),
			"gross_profit":      prodProfit.StringFixed(2),
			"margin_pct":        prodMargin.StringFixed(2),
			"avg_selling_price": avgSell.StringFixed(2),
			"revenue_share_pct": computeSharePct(r.NetRevenue, totalProdRev).StringFixed(2),
			"stock_on_hand":     r.StockOnHand.StringFixed(0),
			"fifo_value":        r.FifoValue.StringFixed(2),
			"stock_status":      stockStatus,
		})
	}

	totalCatRev := decimal.Zero
	for _, r := range categoryRows {
		totalCatRev = totalCatRev.Add(r.NetRevenue)
	}
	categoryReport := make([]map[string]any, 0, len(categoryRows))
	for _, r := range categoryRows {
		catProfit, catMargin := computeProfitAndMargin(r.NetRevenue, r.TotalCogs)
		categoryReport = append(categoryReport, map[string]any{
			"id":                r.ID,
			"name":              r.Name,
			"slug":              r.Slug,
			"gender_segment":    r.GenderSegment,
			"sku_count":         r.SkuCount,
			"invoice_count":     r.InvoiceCount,
			"units_sold":        r.UnitsSold.StringFixed(0),
			"gross_sales":       r.GrossSales.StringFixed(2),
			"discount_amount":   r.DiscountAmount.StringFixed(2),
			"tax_amount":        r.TaxAmount.StringFixed(2),
			"taxable_sales":     r.TaxableSales.StringFixed(2),
			"net_revenue":       r.NetRevenue.StringFixed(2),
			"total_cogs":        r.TotalCogs.StringFixed(2),
			"gross_profit":      catProfit.StringFixed(2),
			"margin_pct":        catMargin.StringFixed(2),
			"revenue_share_pct": computeSharePct(r.NetRevenue, totalCatRev).StringFixed(2),
			"stock_on_hand":     r.StockOnHand.StringFixed(0),
			"stock_valuation":   r.StockValuation.StringFixed(2),
		})
	}

	totalCustSpent := decimal.Zero
	for _, r := range customerRows {
		totalCustSpent = totalCustSpent.Add(r.TotalSpent)
	}
	customerReport := make([]map[string]any, 0, len(customerRows))
	for _, r := range customerRows {
		custProfit, custMargin := computeProfitAndMargin(r.TotalSpent, r.TotalCogs)
		segment := "One-Time"
		if r.IsWalkIn {
			segment = "Walk-in"
		} else if r.PaidOrders == 0 {
			segment = "Dormant"
		} else if r.PaidOrders >= 3 || r.TotalSpent.GreaterThanOrEqual(decimal.NewFromInt(300)) {
			segment = "High Value"
		} else if r.PaidOrders >= 2 {
			segment = "Repeat"
		}
		customerReport = append(customerReport, map[string]any{
			"id":                r.ID,
			"name":              r.Name,
			"email":             r.Email,
			"phone":             r.Phone,
			"tier":              r.Tier,
			"loyalty_points":    r.LoyaltyPoints,
			"credit_enabled":    r.CreditEnabled,
			"credit_limit":      r.CreditLimit.StringFixed(2),
			"is_walk_in":        r.IsWalkIn,
			"paid_orders":       r.PaidOrders,
			"refund_void_count": r.RefundVoidCount,
			"items_bought":      r.ItemsBought.StringFixed(0),
			"subtotal_spent":    r.SubtotalSpent.StringFixed(2),
			"discount_total":    r.DiscountTotal.StringFixed(2),
			"tax_total":         r.TaxTotal.StringFixed(2),
			"total_spent":       r.TotalSpent.StringFixed(2),
			"total_cogs":        r.TotalCogs.StringFixed(2),
			"gross_profit":      custProfit.StringFixed(2),
			"margin_pct":        custMargin.StringFixed(2),
			"avg_order_value":   computeAverageOrderValue(r.TotalSpent, r.PaidOrders).StringFixed(2),
			"spend_share_pct":   computeSharePct(r.TotalSpent, totalCustSpent).StringFixed(2),
			"last_purchase_at":  r.LastPurchaseAt,
			"customer_segment":  segment,
		})
	}

	totalPayAmt := decimal.Zero
	for _, r := range paymentRows {
		totalPayAmt = totalPayAmt.Add(r.TotalCollected)
	}
	paymentReport := make([]map[string]any, 0, len(paymentRows))
	for _, r := range paymentRows {
		paymentReport = append(paymentReport, map[string]any{
			"payment_method":  r.PaymentMethod,
			"tx_count":        r.TxCount,
			"total_collected": r.TotalCollected.StringFixed(2),
			"total_tendered":  r.TotalTendered.StringFixed(2),
			"total_change":    r.TotalChange.StringFixed(2),
			"avg_ticket":      computeAverageOrderValue(r.TotalCollected, r.TxCount).StringFixed(2),
			"share_pct":       computeSharePct(r.TotalCollected, totalPayAmt).StringFixed(2),
		})
	}

	totalBranchRev := decimal.Zero
	for _, r := range branchRows {
		totalBranchRev = totalBranchRev.Add(r.NetRevenue)
	}
	branchReport := make([]map[string]any, 0, len(branchRows))
	for _, r := range branchRows {
		bProfit, bMargin := computeProfitAndMargin(r.NetRevenue, r.TotalCogs)
		branchReport = append(branchReport, map[string]any{
			"id":                r.ID,
			"code":              r.Code,
			"name":              r.Name,
			"country_name":      r.CountryName,
			"paid_count":        r.PaidCount,
			"void_refund_count": r.VoidRefundCount,
			"gross_subtotal":    r.GrossSubtotal.StringFixed(2),
			"total_discounts":   r.TotalDiscounts.StringFixed(2),
			"total_taxes":       r.TotalTaxes.StringFixed(2),
			"net_revenue":       r.NetRevenue.StringFixed(2),
			"total_cogs":        r.TotalCogs.StringFixed(2),
			"gross_profit":      bProfit.StringFixed(2),
			"margin_pct":        bMargin.StringFixed(2),
			"avg_order_value":   computeAverageOrderValue(r.NetRevenue, r.PaidCount).StringFixed(2),
			"revenue_share_pct": computeSharePct(r.NetRevenue, totalBranchRev).StringFixed(2),
			"stock_units":       r.StockUnits.StringFixed(0),
			"stock_valuation":   r.StockValuation.StringFixed(2),
		})
	}

	totalCashierRev := decimal.Zero
	for _, r := range cashierRows {
		totalCashierRev = totalCashierRev.Add(r.NetRevenue)
	}
	cashierReport := make([]map[string]any, 0, len(cashierRows))
	for _, r := range cashierRows {
		cProfit, cMargin := computeProfitAndMargin(r.NetRevenue, r.TotalCogs)
		cashierReport = append(cashierReport, map[string]any{
			"user_id":           r.UserID,
			"full_name":         r.FullName,
			"email":             r.Email,
			"paid_count":        r.PaidCount,
			"void_refund_count": r.VoidRefundCount,
			"items_sold":        r.ItemsSold.StringFixed(0),
			"total_discounts":   r.TotalDiscounts.StringFixed(2),
			"net_revenue":       r.NetRevenue.StringFixed(2),
			"total_cogs":        r.TotalCogs.StringFixed(2),
			"gross_profit":      cProfit.StringFixed(2),
			"margin_pct":        cMargin.StringFixed(2),
			"avg_order_value":   computeAverageOrderValue(r.NetRevenue, r.PaidCount).StringFixed(2),
			"revenue_share_pct": computeSharePct(r.NetRevenue, totalCashierRev).StringFixed(2),
		})
	}

	totalTaxCollected := decimal.Zero
	for _, r := range taxRows {
		totalTaxCollected = totalTaxCollected.Add(r.TaxCollected)
	}
	taxReport := make([]map[string]any, 0, len(taxRows))
	for _, r := range taxRows {
		taxReport = append(taxReport, map[string]any{
			"tax_name":      r.TaxName,
			"tax_type":      r.TaxType,
			"rate_percent":  r.RatePercent.StringFixed(2),
			"invoice_count": r.InvoiceCount,
			"taxable_base":  r.TaxableBase.StringFixed(2),
			"tax_collected": r.TaxCollected.StringFixed(2),
			"share_pct":     computeSharePct(r.TaxCollected, totalTaxCollected).StringFixed(2),
		})
	}

	dailyTrend := make([]map[string]any, 0, len(dailyRows))
	for _, r := range dailyRows {
		dProfit, dMargin := computeProfitAndMargin(r.NetRevenue, r.TotalCogs)
		dailyTrend = append(dailyTrend, map[string]any{
			"day_date":        r.DayDate,
			"invoice_count":   r.InvoiceCount,
			"units_sold":      r.UnitsSold.StringFixed(0),
			"gross_subtotal":  r.GrossSubtotal.StringFixed(2),
			"total_discounts": r.TotalDiscounts.StringFixed(2),
			"total_taxes":     r.TotalTaxes.StringFixed(2),
			"net_revenue":     r.NetRevenue.StringFixed(2),
			"total_cogs":      r.TotalCogs.StringFixed(2),
			"gross_profit":    dProfit.StringFixed(2),
			"margin_pct":      dMargin.StringFixed(2),
		})
	}

	supplierReport := make([]map[string]any, 0, len(supplierRows))
	for _, r := range supplierRows {
		supplierReport = append(supplierReport, map[string]any{
			"id":                 r.ID,
			"code":               r.Code,
			"name":               r.Name,
			"email":              r.Email,
			"phone":              r.Phone,
			"payment_terms_days": r.PaymentTermsDays,
			"po_count":           r.PoCount,
			"auto_po_count":      r.AutoPoCount,
			"received_po_count":  r.ReceivedPoCount,
			"total_ordered":      r.TotalOrdered.StringFixed(2),
			"invoice_count":      r.InvoiceCount,
			"invoiced_total":     r.InvoicedTotal.StringFixed(2),
			"paid_total":         r.PaidTotal.StringFixed(2),
			"unpaid_total":       r.UnpaidTotal.StringFixed(2),
		})
	}

	return map[string]any{
		"period": map[string]any{
			"from":      fromTime.Format(time.RFC3339),
			"to":        toTime.Format(time.RFC3339),
			"branch_id": branchID,
		},
		"sales_summary": map[string]any{
			"paid_count":        totals.PaidCount,
			"void_refund_count": totals.VoidRefundCount,
			"gross_subtotal":    totals.GrossSubtotal.StringFixed(2),
			"total_discounts":   totals.TotalDiscounts.StringFixed(2),
			"total_taxes":       totals.TotalTaxes.StringFixed(2),
			"net_revenue":       totals.NetRevenue.StringFixed(2),
			"total_cogs":        totals.TotalCogs.StringFixed(2),
			"gross_profit":      grossProfit.StringFixed(2),
			"margin_pct":        marginPct.StringFixed(2),
			"refunded_amount":   totals.RefundedAmount.StringFixed(2),
			"avg_order_value":   avgOrderValue.StringFixed(2),
		},
		"inventory_summary": map[string]any{
			"total_skus":       len(stockValuation),
			"low_stock_skus":   lowStockCount,
			"total_units":      totalUnits.StringFixed(0),
			"total_valuation":  totalInventoryValue.StringFixed(2),
			"auto_po_count":    autoPOCount,
			"purchase_inv_cnt": len(purchaseInvoices),
			"unpaid_ap_total":  unpaidAPTotal.StringFixed(2),
		},
		"daily_trend":           dailyTrend,
		"product_report":        productReport,
		"category_report":       categoryReport,
		"customer_report":       customerReport,
		"payment_method_report": paymentReport,
		"branch_report":         branchReport,
		"cashier_report":        cashierReport,
		"tax_report":            taxReport,
		"supplier_report":       supplierReport,
		"sales_invoices":        salesInvoices,
		"purchase_orders":       poDetails,
		"purchase_invoices":     purchaseInvoices,
		"stock_valuation":       stockValuation,
	}, nil
}

