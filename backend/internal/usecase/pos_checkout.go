package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync/atomic"
	"time"

	"github.com/enterprise-pos/backend/internal/domain"
	"github.com/enterprise-pos/backend/internal/infrastructure/ws"
	"github.com/enterprise-pos/backend/internal/repository/sqlc/db"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/shopspring/decimal"
)

var docSeqCounter atomic.Uint64

// nextDocCode produces a collision-free, human-readable document number safe across concurrent goroutines and restarts.
func nextDocCode(prefix string) string {
	seq := docSeqCounter.Add(1)
	uid := strings.ToUpper(strings.ReplaceAll(uuid.NewString(), "-", ""))
	return fmt.Sprintf("%s-%s%03d", prefix, uid[:6], seq%1000)
}

// LowStockEnqueuer schedules background low-stock checks after checkout.
type LowStockEnqueuer interface {
	EnqueueLowStockCheck(businessID, branchID, productID uuid.UUID)
}

// CheckoutItemInput represents one cart SKU line during checkout or hold.
type CheckoutItemInput struct {
	ProductID       uuid.UUID        `json:"product_id"`
	Qty             decimal.Decimal  `json:"qty"`
	DiscountPercent *decimal.Decimal `json:"discount_percent,omitempty"`
	ItemMeta        map[string]any   `json:"item_meta,omitempty"`
}

// ResolveProductDiscountPercent determines a catalog SKU's active promo percentage
// without double-counting already-discounted sale prices.
func ResolveProductDiscountPercent(basePrice, salePrice, discountPercent decimal.Decimal) decimal.Decimal {
	if discountPercent.GreaterThan(decimal.Zero) {
		if discountPercent.GreaterThan(decimal.NewFromInt(100)) {
			return decimal.NewFromInt(100)
		}
		return discountPercent.Round(2)
	}
	if basePrice.GreaterThan(salePrice) && basePrice.GreaterThan(decimal.Zero) {
		return basePrice.Sub(salePrice).Mul(decimal.NewFromInt(100)).Div(basePrice).Round(2)
	}
	return decimal.Zero
}

// ResolveCatalogGrossUnitPrice returns the pre-discount base/list price when a catalog
// discount applies, ensuring cart/checkout discount percentages never double-discount sale_price.
func ResolveCatalogGrossUnitPrice(basePrice, salePrice, discountPercent decimal.Decimal) decimal.Decimal {
	if ResolveProductDiscountPercent(basePrice, salePrice, discountPercent).GreaterThan(decimal.Zero) && basePrice.GreaterThan(salePrice) {
		return basePrice
	}
	return salePrice
}

// ResolveEffectiveLineDiscountPercent returns the cashier-supplied discount if present,
// or automatically inherits the catalog product's active promo percentage.
func ResolveEffectiveLineDiscountPercent(overridePct *decimal.Decimal, basePrice, salePrice, prodDiscPct decimal.Decimal) decimal.Decimal {
	if overridePct == nil {
		return ResolveProductDiscountPercent(basePrice, salePrice, prodDiscPct)
	}
	pct := *overridePct
	if pct.IsNegative() {
		return decimal.Zero
	}
	maxPct := decimal.NewFromInt(100)
	if pct.GreaterThan(maxPct) {
		return maxPct
	}
	return pct
}

// ComputePOSCheckoutLine calculates exact decimal unit gross price, discount amount, and multi-tier taxes
// for a single POS checkout line without double-discounting catalog promotional prices.
func ComputePOSCheckoutLine(
	basePrice, salePrice, prodDiscPct, qty, uomFactor decimal.Decimal,
	overrideDiscPct *decimal.Decimal,
	rules []domain.TaxRuleSpec,
	roundingMode string,
) (effectiveUnitGross, discAmt decimal.Decimal, taxRes domain.TaxCalculationResult) {
	grossUnitBase := ResolveCatalogGrossUnitPrice(basePrice, salePrice, prodDiscPct)
	effectiveUnitGross = grossUnitBase.Mul(uomFactor).Round(4)
	effectiveDiscPct := ResolveEffectiveLineDiscountPercent(overrideDiscPct, basePrice, salePrice, prodDiscPct)

	lineGrossBase := effectiveUnitGross.Mul(qty)
	discAmt = decimal.Zero
	if effectiveDiscPct.GreaterThan(decimal.Zero) {
		discAmt = lineGrossBase.Mul(effectiveDiscPct).Div(hundred).Round(2)
	}
	taxableInput := lineGrossBase.Sub(discAmt)
	taxRes = CalculateMultiTierTaxes(taxableInput, rules, roundingMode)
	return effectiveUnitGross, discAmt, taxRes
}

// CheckoutRequest defines the atomic POS sale payload.
type CheckoutRequest struct {
	CustomerID     *uuid.UUID          `json:"customer_id,omitempty"`
	PaymentMethod  string              `json:"payment_method"` // CASH | CARD | SPLIT | MOBILE_WALLET
	TenderedAmount decimal.Decimal     `json:"tendered_amount"`
	Items          []CheckoutItemInput `json:"items"`
	HeldBillID     *uuid.UUID          `json:"held_bill_id,omitempty"`
	OrderChannel   string              `json:"order_channel,omitempty"` // COUNTER | DINE_IN | TAKEAWAY | DELIVERY | QUOTATION | JOB_CARD
	OrderMeta      map[string]any      `json:"order_meta,omitempty"`
}

// HoldBillRequest defines the suspend-bill / KOT / Quote / Job Card payload.
type HoldBillRequest struct {
	CustomerID      *uuid.UUID          `json:"customer_id,omitempty"`
	Notes           string              `json:"notes"`
	OrderChannel    string              `json:"order_channel,omitempty"`
	TableOrBayLabel string              `json:"table_or_bay_label,omitempty"`
	VehiclePlate    string              `json:"vehicle_plate,omitempty"`
	KotStatus       string              `json:"kot_status,omitempty"`
	Items           []CheckoutItemInput `json:"items"`
}

// CheckoutResponse returns the persisted invoice, tax lines, and FIFO COGS audit summary.
type CheckoutResponse struct {
	InvoiceID     uuid.UUID              `json:"invoice_id"`
	InvoiceNumber string                 `json:"invoice_number"`
	Status        string                 `json:"status"`
	Subtotal      decimal.Decimal        `json:"subtotal"`
	DiscountTotal decimal.Decimal        `json:"discount_total"`
	TaxTotal      decimal.Decimal        `json:"tax_total"`
	GrandTotal    decimal.Decimal        `json:"grand_total"`
	TotalCOGS     decimal.Decimal        `json:"total_cogs"`
	ChangeGiven   decimal.Decimal        `json:"change_given"`
	TaxLines      []domain.TaxLineResult `json:"tax_lines"`
	PointsEarned  int32                  `json:"points_earned"`
	OrderChannel  string                 `json:"order_channel"`
	OrderMeta     map[string]any         `json:"order_meta,omitempty"`
	WarrantyTerms []string               `json:"warranty_terms,omitempty"`
	IdempotentHit bool                   `json:"idempotent_hit"`
	CreatedAt     time.Time              `json:"created_at"`
}

// POSCheckoutUsecase implements idempotent atomic POS checkouts, voids, refunds, and held bills.
type POSCheckoutUsecase struct {
	pool     *pgxpool.Pool
	queries  *db.Queries
	redis    *redis.Client
	settings *SettingsResolver
	hub      *ws.Hub
	enqueuer LowStockEnqueuer
}

// NewPOSCheckoutUsecase constructs a POSCheckoutUsecase.
func NewPOSCheckoutUsecase(
	pool *pgxpool.Pool,
	queries *db.Queries,
	rdb *redis.Client,
	settings *SettingsResolver,
	hub *ws.Hub,
	enqueuer LowStockEnqueuer,
) *POSCheckoutUsecase {
	return &POSCheckoutUsecase{
		pool:     pool,
		queries:  queries,
		redis:    rdb,
		settings: settings,
		hub:      hub,
		enqueuer: enqueuer,
	}
}

// BootstrapPOS loads catalog, FIFO stock, tax rules, customers, and resolved settings for Dexie offline cache.
func (p *POSCheckoutUsecase) BootstrapPOS(ctx context.Context, tc domain.TenantContext) (map[string]any, error) {
	products, err := p.queries.ListProductsWithBranchStock(ctx, db.ListProductsWithBranchStockParams{
		BusinessID: tc.BusinessID,
		BranchID:   tc.BranchID,
	})
	if err != nil {
		return nil, err
	}
	categories, err := p.queries.ListCategoriesForBusiness(ctx, tc.BusinessID)
	if err != nil {
		return nil, err
	}
	brands, err := p.queries.ListBrandsForBusiness(ctx, tc.BusinessID)
	if err != nil {
		brands = []db.ListBrandsForBusinessRow{}
	}
	customers, err := p.queries.ListCustomersForBusiness(ctx, tc.BusinessID)
	if err != nil {
		return nil, err
	}
	taxRules, err := p.queries.ListTaxRulesForBusiness(ctx, tc.BusinessID)
	if err != nil {
		return nil, err
	}
	resolvedSettings, err := p.settings.ResolveAll(ctx, SettingsContext{
		BusinessID: tc.BusinessID,
		BranchID:   &tc.BranchID,
		TerminalID: &tc.TerminalID,
	})
	if err != nil {
		return nil, err
	}
	heldBills, err := p.ListHeldBills(ctx, tc.BusinessID, tc.BranchID)
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"products":          products,
		"categories":        categories,
		"brands":            brands,
		"customers":         customers,
		"tax_rules":         taxRules,
		"resolved_settings": resolvedSettings,
		"held_bills":        heldBills,
	}, nil
}

// Checkout executes an atomic idempotent POS sale: FIFO batch depletion + multi-tier tax + balanced GL.
func (p *POSCheckoutUsecase) Checkout(
	ctx context.Context,
	tc domain.TenantContext,
	idempotencyKey uuid.UUID,
	req CheckoutRequest,
) (*CheckoutResponse, error) {
	if idempotencyKey == uuid.Nil {
		return nil, errors.New("X-Idempotency-Key (UUIDv7) is required")
	}
	if len(req.Items) == 0 {
		return nil, errors.New("checkout requires at least one cart item")
	}

	redisIdemKey := fmt.Sprintf("idem:biz:%s:key:%s", tc.BusinessID.String(), idempotencyKey.String())
	if p.redis != nil {
		if cached, err := p.redis.Get(ctx, redisIdemKey).Result(); err == nil && cached != "" {
			var resp CheckoutResponse
			if jsonErr := json.Unmarshal([]byte(cached), &resp); jsonErr == nil {
				resp.IdempotentHit = true
				return &resp, nil
			}
		}
	}

	if existing, err := p.queries.GetInvoiceByIdempotencyKey(ctx, db.GetInvoiceByIdempotencyKeyParams{
		BusinessID:     tc.BusinessID,
		IdempotencyKey: idempotencyKey,
	}); err == nil {
		return &CheckoutResponse{
			InvoiceID:     existing.ID,
			InvoiceNumber: existing.InvoiceNumber,
			Status:        existing.Status,
			Subtotal:      existing.Subtotal,
			DiscountTotal: existing.DiscountTotal,
			TaxTotal:      existing.TaxTotal,
			GrandTotal:    existing.GrandTotal,
			TotalCOGS:     existing.TotalCogs,
			IdempotentHit: true,
			CreatedAt:     existing.CreatedAt.Time,
		}, nil
	}

	baseSC := SettingsContext{
		BusinessID: tc.BusinessID,
		BranchID:   &tc.BranchID,
		TerminalID: &tc.TerminalID,
	}

	roundingMode := p.settings.GetString(ctx, baseSC, "tax.rounding_mode", "HALF_UP")
	allowNegative := p.settings.GetBool(ctx, baseSC, "pos.allow_negative_fifo_stock", false)
	allowFractionalGlobal := p.settings.GetBool(ctx, baseSC, "pos.features.allow_fractional_qty", false)
	requireSerialGlobal := p.settings.GetBool(ctx, baseSC, "pos.features.require_serial_imei", false)
	requireVehiclePlate := p.settings.GetBool(ctx, baseSC, "pos.features.require_vehicle_plate", false)

	vehiclePlate := strings.TrimSpace(metaString(req.OrderMeta, "vehicle_plate"))
	if requireVehiclePlate && vehiclePlate == "" {
		return nil, errors.New("vehicle license plate is required for this mode")
	}

	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := p.queries.WithTx(tx)
	settingsTx := p.settings.WithQueries(qtx)

	invoiceID := uuid.New()
	invoiceNum := nextDocCode("INV-" + time.Now().UTC().Format("2006"))

	type computedLine struct {
		productID    uuid.UUID
		qty          decimal.Decimal
		unitPrice    decimal.Decimal
		discountAmt  decimal.Decimal
		taxAmt       decimal.Decimal
		lineTotal    decimal.Decimal
		batchCOGS    decimal.Decimal
		itemMetaJSON []byte
		taxLines     []domain.TaxLineResult
	}

	computed := make([]computedLine, 0, len(req.Items))
	var aggSubtotal, aggDiscount, aggTax, aggGrand, aggCOGS decimal.Decimal
	taxAggMap := make(map[uuid.UUID]domain.TaxLineResult)
	warrantySeen := make(map[string]struct{})
	warrantyList := make([]string, 0)

	for _, item := range req.Items {
		if item.Qty.LessThanOrEqual(decimal.Zero) {
			return nil, errors.New("item quantity must be positive")
		}
		prod, err := qtx.GetProductByID(ctx, db.GetProductByIDParams{
			BusinessID: tc.BusinessID,
			ID:         item.ProductID,
		})
		if err != nil {
			return nil, fmt.Errorf("product %s not found", item.ProductID)
		}

		if !prod.AllowFractionalQty && !allowFractionalGlobal && !item.Qty.Equal(item.Qty.Truncate(0)) {
			return nil, fmt.Errorf("fractional quantity (%s) is disabled for %s", item.Qty.String(), prod.Name)
		}
		if requireSerialGlobal && prod.EnableSerialTracking {
			if strings.TrimSpace(metaString(item.ItemMeta, "serial_imei")) == "" {
				return nil, fmt.Errorf("IMEI / serial number is required for %s", prod.Name)
			}
		}

		uomFactor := resolveApprovedUOMFactor(prod.UomOptionsJson, item.ItemMeta)
		depleteQty := item.Qty.Mul(uomFactor).Round(4)

		if w := strings.TrimSpace(prod.WarrantyTerms); w != "" {
			if _, ok := warrantySeen[w]; !ok {
				warrantySeen[w] = struct{}{}
				warrantyList = append(warrantyList, w)
			}
		}

		itemMetaBytes := []byte("{}")
		if len(item.ItemMeta) > 0 {
			if b, mErr := json.Marshal(item.ItemMeta); mErr == nil {
				itemMetaBytes = b
			}
		}

		// Load tax rules from product's tax group or category fallback.
		var rules []domain.TaxRuleSpec
		tgID := prod.TaxGroupID
		if !tgID.Valid {
			tgID = prod.CategoryTaxGroupID
		}
		if tgID.Valid {
			dbRules, err := qtx.ListTaxRulesForGroup(ctx, db.ListTaxRulesForGroupParams{
				BusinessID: tc.BusinessID,
				TaxGroupID: tgID.UUID,
			})
			if err == nil {
				for _, r := range dbRules {
					rules = append(rules, domain.TaxRuleSpec{
						RuleID:      r.ID,
						Code:        r.Code,
						Name:        r.Name,
						TaxType:     r.TaxType,
						RatePercent: r.RatePercent,
						Priority:    int(r.Priority),
					})
				}
			}
		}

		effectiveUnitPrice, discAmt, taxRes := ComputePOSCheckoutLine(
			prod.BasePrice,
			prod.SalePrice,
			prod.DiscountPercent,
			item.Qty,
			uomFactor,
			item.DiscountPercent,
			rules,
			roundingMode,
		)

		prodAllowNegative := settingsTx.GetBool(ctx, SettingsContext{
			BusinessID: tc.BusinessID,
			BranchID:   &tc.BranchID,
			TerminalID: &tc.TerminalID,
			CategoryID: &prod.CategoryID,
			ProductID:  &item.ProductID,
		}, "pos.allow_negative_fifo_stock", allowNegative)

		lineCOGS, err := DepleteFIFOBatches(ctx, qtx, tc.BusinessID, tc.BranchID, item.ProductID, tc.UserID, invoiceID, depleteQty, prodAllowNegative)
		if err != nil {
			return nil, err
		}

		computed = append(computed, computedLine{
			productID:    item.ProductID,
			qty:          item.Qty,
			unitPrice:    effectiveUnitPrice,
			discountAmt:  discAmt,
			taxAmt:       taxRes.TotalTax,
			lineTotal:    taxRes.GrossAmount,
			batchCOGS:    lineCOGS,
			itemMetaJSON: itemMetaBytes,
			taxLines:     taxRes.Lines,
		})

		aggSubtotal = aggSubtotal.Add(taxRes.NetAmount)
		aggDiscount = aggDiscount.Add(discAmt)
		aggTax = aggTax.Add(taxRes.TotalTax)
		aggGrand = aggGrand.Add(taxRes.GrossAmount)
		aggCOGS = aggCOGS.Add(lineCOGS)

		for _, tl := range taxRes.Lines {
			existing, ok := taxAggMap[tl.RuleID]
			if !ok {
				taxAggMap[tl.RuleID] = tl
			} else {
				existing.TaxableBase = existing.TaxableBase.Add(tl.TaxableBase)
				existing.TaxAmount = existing.TaxAmount.Add(tl.TaxAmount)
				taxAggMap[tl.RuleID] = existing
			}
		}
	}

	var custNull uuid.NullUUID
	if req.CustomerID != nil && *req.CustomerID != uuid.Nil {
		custNull = uuid.NullUUID{UUID: *req.CustomerID, Valid: true}
	}

	orderChannel := normalizeOrderChannel(req.OrderChannel)
	orderMetaMap := make(map[string]any, len(req.OrderMeta)+1)
	for k, v := range req.OrderMeta {
		orderMetaMap[k] = v
	}
	if len(warrantyList) > 0 {
		orderMetaMap["warranty_terms"] = warrantyList
	}
	orderMetaBytes := []byte("{}")
	if len(orderMetaMap) > 0 {
		if b, mErr := json.Marshal(orderMetaMap); mErr == nil {
			orderMetaBytes = b
		}
	}

	invRow, err := qtx.InsertSalesInvoice(ctx, db.InsertSalesInvoiceParams{
		BusinessID:     tc.BusinessID,
		BranchID:       tc.BranchID,
		TerminalID:     tc.TerminalID,
		ShiftID:        uuid.NullUUID{},
		CashierUserID:  tc.UserID,
		CustomerID:     custNull,
		InvoiceNumber:  invoiceNum,
		IdempotencyKey: idempotencyKey,
		InvoiceType:    "SALE",
		Status:         "PAID",
		Subtotal:       aggSubtotal.Round(4),
		DiscountTotal:  aggDiscount.Round(4),
		TaxTotal:       aggTax.Round(4),
		GrandTotal:     aggGrand.Round(4),
		TotalCogs:      aggCOGS.Round(4),
		OrderChannel:   orderChannel,
		OrderMetaJson:  orderMetaBytes,
	})
	if err != nil {
		return nil, err
	}

	for _, cl := range computed {
		if _, err := qtx.InsertSalesInvoiceItem(ctx, db.InsertSalesInvoiceItemParams{
			BusinessID:     tc.BusinessID,
			InvoiceID:      invRow.ID,
			ProductID:      cl.productID,
			Qty:            cl.qty,
			UnitPrice:      cl.unitPrice,
			DiscountAmount: cl.discountAmt,
			TaxAmount:      cl.taxAmt,
			LineTotal:      cl.lineTotal,
			BatchCogs:      cl.batchCOGS,
			ItemMetaJson:   cl.itemMetaJSON,
		}); err != nil {
			return nil, err
		}
	}

	allTaxLines := make([]domain.TaxLineResult, 0, len(taxAggMap))
	for _, tl := range taxAggMap {
		allTaxLines = append(allTaxLines, tl)
		if err := qtx.InsertSalesInvoiceTax(ctx, db.InsertSalesInvoiceTaxParams{
			BusinessID:  tc.BusinessID,
			InvoiceID:   invRow.ID,
			TaxRuleID:   uuid.NullUUID{UUID: tl.RuleID, Valid: tl.RuleID != uuid.Nil},
			TaxName:     tl.Name,
			TaxType:     tl.TaxType,
			RatePercent: tl.RatePercent,
			TaxableBase: tl.TaxableBase,
			TaxAmount:   tl.TaxAmount,
		}); err != nil {
			return nil, err
		}
	}

	payMethod := strings.ToUpper(strings.TrimSpace(req.PaymentMethod))
	if payMethod == "" {
		payMethod = "CARD"
	}
	tendered := req.TenderedAmount
	if tendered.LessThan(aggGrand) {
		tendered = aggGrand
	}
	changeGiven := tendered.Sub(aggGrand).Round(2)
	if payMethod != "CASH" {
		changeGiven = decimal.Zero
		tendered = aggGrand
	}
	if err := qtx.InsertInvoicePayment(ctx, db.InsertInvoicePaymentParams{
		BusinessID:     tc.BusinessID,
		InvoiceID:      invRow.ID,
		PaymentMethod:  payMethod,
		Amount:         aggGrand.Round(4),
		TenderedAmount: tendered.Round(4),
		ChangeGiven:    changeGiven.Round(4),
		ReferenceNo:    nextDocCode("TX"),
	}); err != nil {
		return nil, err
	}

	if req.HeldBillID != nil && *req.HeldBillID != uuid.Nil {
		_ = qtx.UpdateHeldBillStatus(ctx, db.UpdateHeldBillStatusParams{
			BusinessID: tc.BusinessID,
			ID:         *req.HeldBillID,
			Status:     "RECALLED",
		})
	}

	// Double-Entry GL Posting (Cash/Card DR, Sales Revenue CR, Tax Payable CR, COGS DR, Inventory Asset CR)
	if err := p.postSaleJournalTx(ctx, qtx, tc, invRow.ID, invRow.InvoiceNumber, payMethod, aggSubtotal, aggTax, aggGrand, aggCOGS); err != nil {
		return nil, err
	}

	var pointsEarned int32
	if custNull.Valid {
		if cust, cErr := qtx.GetCustomerByID(ctx, db.GetCustomerByIDParams{
			BusinessID: tc.BusinessID,
			ID:         custNull.UUID,
		}); cErr == nil && !cust.IsWalkIn {
			ptsRateStr := settingsTx.GetString(ctx, SettingsContext{
				BusinessID: tc.BusinessID,
				BranchID:   &tc.BranchID,
			}, "pos.loyalty_points_per_unit", "1")
			ptsRate, rErr := decimal.NewFromString(strings.TrimSpace(ptsRateStr))
			if rErr != nil || ptsRate.LessThanOrEqual(decimal.Zero) {
				ptsRate = decimal.NewFromInt(1)
			}
			pts := int32(aggGrand.Mul(ptsRate).Floor().IntPart())
			if pts > 0 {
				if err := qtx.AddCustomerLoyaltyPoints(ctx, db.AddCustomerLoyaltyPointsParams{
					BusinessID:    tc.BusinessID,
					ID:            custNull.UUID,
					LoyaltyPoints: pts,
				}); err == nil {
					pointsEarned = pts
				}
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	resp := &CheckoutResponse{
		InvoiceID:     invRow.ID,
		InvoiceNumber: invRow.InvoiceNumber,
		Status:        invRow.Status,
		Subtotal:      aggSubtotal.Round(2),
		DiscountTotal: aggDiscount.Round(2),
		TaxTotal:      aggTax.Round(2),
		GrandTotal:    aggGrand.Round(2),
		TotalCOGS:     aggCOGS.Round(2),
		ChangeGiven:   changeGiven,
		TaxLines:      allTaxLines,
		PointsEarned:  pointsEarned,
		OrderChannel:  orderChannel,
		OrderMeta:     orderMetaMap,
		WarrantyTerms: warrantyList,
		CreatedAt:     invRow.CreatedAt.Time,
	}

	if p.redis != nil {
		if raw, err := json.Marshal(resp); err == nil {
			_ = p.redis.Set(ctx, redisIdemKey, raw, 24*time.Hour).Err()
		}
	}

	if p.enqueuer != nil {
		for _, cl := range computed {
			p.enqueuer.EnqueueLowStockCheck(tc.BusinessID, tc.BranchID, cl.productID)
		}
	}

	if p.hub != nil && req.HeldBillID != nil {
		p.hub.BroadcastTenant(tc.BusinessID, "HELD_BILL_SYNC", map[string]any{"action": "RECALLED", "id": req.HeldBillID})
	}

	return resp, nil
}

func (p *POSCheckoutUsecase) postSaleJournalTx(
	ctx context.Context,
	qtx *db.Queries,
	tc domain.TenantContext,
	invoiceID uuid.UUID,
	invoiceNumber, payMethod string,
	netSales, totalTax, grandTotal, totalCOGS decimal.Decimal,
) error {
	assetCode := "1020"
	if payMethod == "CASH" {
		assetCode = "1010"
	}
	assetAcct, err := qtx.GetAccountByCode(ctx, db.GetAccountByCodeParams{BusinessID: tc.BusinessID, Code: assetCode})
	if err != nil {
		return err
	}
	revAcct, err := qtx.GetAccountByCode(ctx, db.GetAccountByCodeParams{BusinessID: tc.BusinessID, Code: "4000"})
	if err != nil {
		return err
	}
	taxAcct, err := qtx.GetAccountByCode(ctx, db.GetAccountByCodeParams{BusinessID: tc.BusinessID, Code: "2100"})
	if err != nil {
		return err
	}
	cogsAcct, err := qtx.GetAccountByCode(ctx, db.GetAccountByCodeParams{BusinessID: tc.BusinessID, Code: "5000"})
	if err != nil {
		return err
	}
	invAcct, err := qtx.GetAccountByCode(ctx, db.GetAccountByCodeParams{BusinessID: tc.BusinessID, Code: "1200"})
	if err != nil {
		return err
	}

	today := pgtype.Date{Time: time.Now(), Valid: true}
	var fpNull uuid.NullUUID
	if fp, fpErr := qtx.FindOpenFiscalPeriodForDate(ctx, db.FindOpenFiscalPeriodForDateParams{
		BusinessID: tc.BusinessID,
		Column2:    today,
	}); fpErr == nil {
		if fp.IsLocked {
			return errors.New("fiscal period is locked")
		}
		fpNull = uuid.NullUUID{UUID: fp.ID, Valid: true}
	}

	je, err := qtx.InsertJournalEntry(ctx, db.InsertJournalEntryParams{
		BusinessID:     tc.BusinessID,
		BranchID:       uuid.NullUUID{UUID: tc.BranchID, Valid: true},
		FiscalPeriodID: fpNull,
		EntryNumber:    nextDocCode("JE-POS"),
		SourceType:     "POS_SALE",
		SourceID:       invoiceID,
		Description:    fmt.Sprintf("POS Sale %s (%s)", invoiceNumber, strings.ReplaceAll(payMethod, "_", " ")),
		EntryDate:      today,
		PostedBy:       uuid.NullUUID{UUID: tc.UserID, Valid: true},
	})
	if err != nil {
		return err
	}

	// Ensure exact sum balancing at 4 decimal places.
	netVal := netSales.Round(4)
	taxVal := totalTax.Round(4)
	grandVal := netVal.Add(taxVal)
	cogsVal := totalCOGS.Round(4)

	if grandVal.GreaterThan(decimal.Zero) {
		if _, err := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID:     tc.BusinessID,
			JournalEntryID: je.ID,
			AccountID:      assetAcct.ID,
			Debit:          grandVal,
			Credit:         decimal.Zero,
			Memo:           fmt.Sprintf("POS %s Settlement", payMethod),
		}); err != nil {
			return err
		}
	}
	if netVal.GreaterThan(decimal.Zero) {
		if _, err := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID:     tc.BusinessID,
			JournalEntryID: je.ID,
			AccountID:      revAcct.ID,
			Debit:          decimal.Zero,
			Credit:         netVal,
			Memo:           "Retail Sales Revenue",
		}); err != nil {
			return err
		}
	}
	if taxVal.GreaterThan(decimal.Zero) {
		if _, err := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID:     tc.BusinessID,
			JournalEntryID: je.ID,
			AccountID:      taxAcct.ID,
			Debit:          decimal.Zero,
			Credit:         taxVal,
			Memo:           "Multi-Tier Sales Tax Payable",
		}); err != nil {
			return err
		}
	}
	if cogsVal.GreaterThan(decimal.Zero) {
		if _, err := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID:     tc.BusinessID,
			JournalEntryID: je.ID,
			AccountID:      cogsAcct.ID,
			Debit:          cogsVal,
			Credit:         decimal.Zero,
			Memo:           "FIFO Batch COGS",
		}); err != nil {
			return err
		}
		if _, err := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID:     tc.BusinessID,
			JournalEntryID: je.ID,
			AccountID:      invAcct.ID,
			Debit:          decimal.Zero,
			Credit:         cogsVal,
			Memo:           "FIFO Inventory Depletion",
		}); err != nil {
			return err
		}
	}
	return nil
}

// VoidOrRefundInvoice marks an invoice VOID or REFUND, restores inventory batches, and posts balanced reversing GL lines.
func (p *POSCheckoutUsecase) VoidOrRefundInvoice(
	ctx context.Context,
	tc domain.TenantContext,
	invoiceID uuid.UUID,
	newStatus, reason string,
	supervisorClaim *domain.SupervisorClaim,
) error {
	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := p.queries.WithTx(tx)
	inv, err := qtx.GetInvoiceByID(ctx, db.GetInvoiceByIDParams{
		BusinessID: tc.BusinessID,
		ID:         invoiceID,
	})
	if err != nil {
		return err
	}
	if inv.Status != "PAID" {
		return fmt.Errorf("invoice %s is already %s", inv.InvoiceNumber, inv.Status)
	}

	items, err := qtx.ListSalesInvoiceItems(ctx, db.ListSalesInvoiceItemsParams{
		BusinessID: tc.BusinessID,
		InvoiceID:  invoiceID,
	})
	if err != nil {
		return err
	}

	movType := "IN_VOID"
	sourceType := "POS_VOID"
	if newStatus == "REFUND" {
		movType = "IN_RETURN"
		sourceType = "POS_REFUND"
	}

	for _, it := range items {
		if err := RestoreFIFOBatches(ctx, qtx, tc.BusinessID, inv.BranchID, it.ProductID, tc.UserID, invoiceID, movType, it.Qty, it.BatchCogs); err != nil {
			return err
		}
	}

	supID := uuid.NullUUID{UUID: tc.UserID, Valid: true}
	if supervisorClaim != nil {
		supID = uuid.NullUUID{UUID: supervisorClaim.SupervisorID, Valid: true}
	}

	if err := qtx.UpdateInvoiceStatus(ctx, db.UpdateInvoiceStatusParams{
		BusinessID:           tc.BusinessID,
		ID:                   invoiceID,
		Status:               newStatus,
		OverrideSupervisorID: supID,
		OverrideReason:       reason,
	}); err != nil {
		return err
	}

	// Post Balanced Reversing GL Entry
	retAcct, _ := qtx.GetAccountByCode(ctx, db.GetAccountByCodeParams{BusinessID: tc.BusinessID, Code: "4100"})
	taxAcct, _ := qtx.GetAccountByCode(ctx, db.GetAccountByCodeParams{BusinessID: tc.BusinessID, Code: "2100"})
	cashAcct, _ := qtx.GetAccountByCode(ctx, db.GetAccountByCodeParams{BusinessID: tc.BusinessID, Code: "1010"})
	cogsAcct, _ := qtx.GetAccountByCode(ctx, db.GetAccountByCodeParams{BusinessID: tc.BusinessID, Code: "5000"})
	invAcct, _ := qtx.GetAccountByCode(ctx, db.GetAccountByCodeParams{BusinessID: tc.BusinessID, Code: "1200"})

	actionLabel := "POS Void"
	if newStatus == "REFUND" {
		actionLabel = "POS Refund"
	}

	today := pgtype.Date{Time: time.Now(), Valid: true}
	je, err := qtx.InsertJournalEntry(ctx, db.InsertJournalEntryParams{
		BusinessID:  tc.BusinessID,
		BranchID:    uuid.NullUUID{UUID: inv.BranchID, Valid: true},
		EntryNumber: nextDocCode("JE-REV"),
		SourceType:  sourceType,
		SourceID:    invoiceID,
		Description: fmt.Sprintf("%s %s (%s)", actionLabel, inv.InvoiceNumber, reason),
		EntryDate:   today,
		PostedBy:    supID,
	})
	if err != nil {
		return err
	}

	netVal := inv.Subtotal.Round(4)
	taxVal := inv.TaxTotal.Round(4)
	grandVal := netVal.Add(taxVal)
	cogsVal := inv.TotalCogs.Round(4)

	if netVal.GreaterThan(decimal.Zero) {
		if _, err := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID: tc.BusinessID, JournalEntryID: je.ID, AccountID: retAcct.ID, Debit: netVal, Credit: decimal.Zero, Memo: "Sales return / void reversal",
		}); err != nil {
			return err
		}
	}
	if taxVal.GreaterThan(decimal.Zero) {
		if _, err := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID: tc.BusinessID, JournalEntryID: je.ID, AccountID: taxAcct.ID, Debit: taxVal, Credit: decimal.Zero, Memo: "Sales tax payable reversal",
		}); err != nil {
			return err
		}
	}
	if grandVal.GreaterThan(decimal.Zero) {
		if _, err := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID: tc.BusinessID, JournalEntryID: je.ID, AccountID: cashAcct.ID, Debit: decimal.Zero, Credit: grandVal, Memo: "Cash / tender reversal",
		}); err != nil {
			return err
		}
	}
	if cogsVal.GreaterThan(decimal.Zero) {
		if _, err := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID: tc.BusinessID, JournalEntryID: je.ID, AccountID: invAcct.ID, Debit: cogsVal, Credit: decimal.Zero, Memo: "Returned FIFO restock",
		}); err != nil {
			return err
		}
		if _, err := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID: tc.BusinessID, JournalEntryID: je.ID, AccountID: cogsAcct.ID, Debit: decimal.Zero, Credit: cogsVal, Memo: "COGS reversal",
		}); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

// ListHeldBills returns active held bills along with their line items for the branch.
func (p *POSCheckoutUsecase) ListHeldBills(ctx context.Context, businessID, branchID uuid.UUID) ([]map[string]any, error) {
	bills, err := p.queries.ListHeldBillsForBranch(ctx, db.ListHeldBillsForBranchParams{
		BusinessID: businessID,
		BranchID:   branchID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(bills))
	for _, b := range bills {
		items, _ := p.queries.ListHeldBillItems(ctx, db.ListHeldBillItemsParams{
			BusinessID:      businessID,
			SuspendedBillID: b.ID,
		})
		out = append(out, map[string]any{
			"bill":  b,
			"items": items,
		})
	}
	return out, nil
}

// CreateHeldBill suspends the active POS cart and broadcasts HELD_BILL_SYNC over WebSockets.
func (p *POSCheckoutUsecase) CreateHeldBill(ctx context.Context, tc domain.TenantContext, req HoldBillRequest) (map[string]any, error) {
	if len(req.Items) == 0 {
		return nil, errors.New("cannot hold an empty cart")
	}
	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := p.queries.WithTx(tx)

	subtotal := decimal.Zero
	type resolvedItem struct {
		productID    uuid.UUID
		qty          decimal.Decimal
		unitPrice    decimal.Decimal
		discPct      decimal.Decimal
		itemMetaJSON []byte
	}
	items := make([]resolvedItem, 0, len(req.Items))
	for _, it := range req.Items {
		prod, err := qtx.GetProductByID(ctx, db.GetProductByIDParams{BusinessID: tc.BusinessID, ID: it.ProductID})
		if err != nil {
			return nil, err
		}
		uomFactor := resolveApprovedUOMFactor(prod.UomOptionsJson, it.ItemMeta)
		grossUnit := ResolveCatalogGrossUnitPrice(prod.BasePrice, prod.SalePrice, prod.DiscountPercent)
		effectivePrice := grossUnit.Mul(uomFactor).Round(4)
		effDiscPct := ResolveEffectiveLineDiscountPercent(it.DiscountPercent, prod.BasePrice, prod.SalePrice, prod.DiscountPercent)
		line := effectivePrice.Mul(it.Qty)
		if effDiscPct.GreaterThan(decimal.Zero) {
			line = line.Sub(line.Mul(effDiscPct).Div(hundred).Round(2))
		}
		subtotal = subtotal.Add(line)
		metaBytes := []byte("{}")
		if len(it.ItemMeta) > 0 {
			if b, mErr := json.Marshal(it.ItemMeta); mErr == nil {
				metaBytes = b
			}
		}
		items = append(items, resolvedItem{
			productID:    it.ProductID,
			qty:          it.Qty,
			unitPrice:    effectivePrice,
			discPct:      effDiscPct,
			itemMetaJSON: metaBytes,
		})
	}
	taxEst := subtotal.Mul(decimal.RequireFromString("0.0812")).Round(2)
	grand := subtotal.Add(taxEst).Round(2)

	var custNull uuid.NullUUID
	if req.CustomerID != nil && *req.CustomerID != uuid.Nil {
		custNull = uuid.NullUUID{UUID: *req.CustomerID, Valid: true}
	}
	orderChannel := normalizeOrderChannel(req.OrderChannel)
	kotStatus := normalizeKotStatus(req.KotStatus)
	if kotStatus == "NONE" && (orderChannel == "DINE_IN" || orderChannel == "TAKEAWAY" || orderChannel == "DELIVERY") {
		kotStatus = "QUEUED"
	}
	holdPrefix := "HOLD"
	switch orderChannel {
	case "DINE_IN", "TAKEAWAY", "DELIVERY":
		holdPrefix = "KOT"
	case "QUOTATION":
		holdPrefix = "QUO"
	case "JOB_CARD":
		holdPrefix = "BAY"
	}
	holdCode := nextDocCode(holdPrefix)
	bill, err := qtx.InsertHeldBill(ctx, db.InsertHeldBillParams{
		BusinessID:      tc.BusinessID,
		BranchID:        tc.BranchID,
		TerminalID:      tc.TerminalID,
		CashierUserID:   tc.UserID,
		CustomerID:      custNull,
		HoldCode:        holdCode,
		Notes:           req.Notes,
		Subtotal:        subtotal.Round(4),
		TaxTotal:        taxEst,
		GrandTotal:      grand,
		OrderChannel:    orderChannel,
		TableOrBayLabel: strings.TrimSpace(req.TableOrBayLabel),
		VehiclePlate:    strings.TrimSpace(req.VehiclePlate),
		KotStatus:       kotStatus,
	})
	if err != nil {
		return nil, err
	}
	for _, it := range items {
		if err := qtx.InsertHeldBillItem(ctx, db.InsertHeldBillItemParams{
			BusinessID:      tc.BusinessID,
			SuspendedBillID: bill.ID,
			ProductID:       it.productID,
			Qty:             it.qty,
			UnitPrice:       it.unitPrice,
			DiscountPercent: it.discPct,
			ItemMetaJson:    it.itemMetaJSON,
		}); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	if p.hub != nil {
		p.hub.BroadcastTenant(tc.BusinessID, "HELD_BILL_SYNC", map[string]any{
			"action":      "CREATED",
			"id":          bill.ID,
			"hold_code":   bill.HoldCode,
			"kot_status":  bill.KotStatus,
			"table_label": bill.TableOrBayLabel,
		})
	}
	return map[string]any{
		"id":                 bill.ID,
		"hold_code":          bill.HoldCode,
		"order_channel":      bill.OrderChannel,
		"table_or_bay_label": bill.TableOrBayLabel,
		"vehicle_plate":      bill.VehiclePlate,
		"kot_status":         bill.KotStatus,
		"grand_total":        grand,
		"held_at":            bill.HeldAt.Time,
	}, nil
}

// UpdateHeldBillWorkflow updates KOT progress or Table/Bay assignment for an active suspended ticket.
func (p *POSCheckoutUsecase) UpdateHeldBillWorkflow(ctx context.Context, businessID, billID uuid.UUID, rawKotStatus, tableOrBayLabel string) (map[string]any, error) {
	kot := ""
	if strings.TrimSpace(rawKotStatus) != "" {
		kot = normalizeKotStatus(rawKotStatus)
	}
	updated, err := p.queries.UpdateHeldBillWorkflowStatus(ctx, db.UpdateHeldBillWorkflowStatusParams{
		BusinessID: businessID,
		ID:         billID,
		Column3:    kot,
		Column4:    strings.TrimSpace(tableOrBayLabel),
	})
	if err != nil {
		return nil, err
	}
	if p.hub != nil {
		p.hub.BroadcastTenant(businessID, "HELD_BILL_SYNC", map[string]any{
			"action":      "WORKFLOW_UPDATED",
			"id":          billID,
			"kot_status":  updated.KotStatus,
			"table_label": updated.TableOrBayLabel,
		})
	}
	return map[string]any{
		"bill": updated,
	}, nil
}

// VoidHeldBill cancels a suspended bill and notifies terminals.
func (p *POSCheckoutUsecase) VoidHeldBill(ctx context.Context, businessID, billID uuid.UUID) error {
	if err := p.queries.UpdateHeldBillStatus(ctx, db.UpdateHeldBillStatusParams{
		BusinessID: businessID,
		ID:         billID,
		Status:     "VOIDED",
	}); err != nil {
		return err
	}
	if p.hub != nil {
		p.hub.BroadcastTenant(businessID, "HELD_BILL_SYNC", map[string]any{"action": "VOIDED", "id": billID})
	}
	return nil
}

func metaString(m map[string]any, key string) string {
	if len(m) == 0 {
		return ""
	}
	v, ok := m[key]
	if !ok || v == nil {
		return ""
	}
	return fmt.Sprint(v)
}

func resolveApprovedUOMFactor(rawJSON []byte, itemMeta map[string]any) decimal.Decimal {
	label := strings.TrimSpace(metaString(itemMeta, "uom_label"))
	if label == "" || len(rawJSON) == 0 {
		return decimal.NewFromInt(1)
	}
	var opts []struct {
		Label  string          `json:"label"`
		Factor decimal.Decimal `json:"factor"`
	}
	if err := json.Unmarshal(rawJSON, &opts); err != nil {
		return decimal.NewFromInt(1)
	}
	for _, opt := range opts {
		if strings.EqualFold(strings.TrimSpace(opt.Label), label) && opt.Factor.GreaterThan(decimal.Zero) {
			return opt.Factor
		}
	}
	return decimal.NewFromInt(1)
}

func normalizeOrderChannel(raw string) string {
	switch strings.ToUpper(strings.TrimSpace(raw)) {
	case "DINE_IN", "TAKEAWAY", "DELIVERY", "QUOTATION", "JOB_CARD", "HELD":
		return strings.ToUpper(strings.TrimSpace(raw))
	default:
		return "COUNTER"
	}
}

func normalizeKotStatus(raw string) string {
	switch strings.ToUpper(strings.TrimSpace(raw)) {
	case "QUEUED", "PREPARING", "READY":
		return strings.ToUpper(strings.TrimSpace(raw))
	default:
		return "NONE"
	}
}

