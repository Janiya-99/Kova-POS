package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/enterprise-pos/backend/internal/domain"
	"github.com/enterprise-pos/backend/internal/repository/sqlc/db"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"
)

// POSReturnItemInput specifies one line item and return disposition during a POS sales return/damage claim.
type POSReturnItemInput struct {
	InvoiceItemID  uuid.UUID       `json:"invoice_item_id"`
	Qty            decimal.Decimal `json:"qty"`
	Disposition    string          `json:"disposition"` // RESTOCK_SELLABLE | QUARANTINE_DAMAGED | WRITE_OFF_SCRAP
	ReasonCategory string          `json:"reason_category,omitempty"`
	SerialIMEI     string          `json:"serial_imei,omitempty"`
}

// ProcessPOSReturnRequest specifies partial or full POS return details.
type ProcessPOSReturnRequest struct {
	Disposition    string               `json:"disposition"`     // fallback if line omits
	ReasonCategory string               `json:"reason_category"` // fallback if line omits
	RefundMethod   string               `json:"refund_method"`   // ORIGINAL | CASH | CARD | MOBILE_WALLET
	Notes          string               `json:"notes"`
	Items          []POSReturnItemInput `json:"items"`
}

// ListRecentInvoicesForReturn returns recent paid/partially-returned branch sales invoices with line items & returnable quantities.
func (p *POSCheckoutUsecase) ListRecentInvoicesForReturn(ctx context.Context, tc domain.TenantContext, search string) (map[string]any, error) {
	rows, err := p.queries.ListRecentPOSInvoicesForReturn(ctx, db.ListRecentPOSInvoicesForReturnParams{
		BusinessID: tc.BusinessID,
		BranchID:   tc.BranchID,
		Column3:    strings.TrimSpace(search),
	})
	if err != nil {
		return nil, err
	}

	out := make([]map[string]any, 0, len(rows))
	for _, inv := range rows {
		items, iErr := p.queries.ListSalesInvoiceItemsForReturn(ctx, db.ListSalesInvoiceItemsForReturnParams{
			BusinessID: tc.BusinessID,
			InvoiceID:  inv.ID,
		})
		if iErr != nil {
			items = []db.ListSalesInvoiceItemsForReturnRow{}
		}

		mappedItems := make([]map[string]any, 0, len(items))
		for _, it := range items {
			var metaMap map[string]any
			if len(it.ItemMetaJson) > 0 {
				_ = json.Unmarshal(it.ItemMetaJson, &metaMap)
			}
			serialImei := ""
			if metaMap != nil {
				if rawSerial, ok := metaMap["serial_imei"].(string); ok {
					serialImei = strings.TrimSpace(rawSerial)
				}
			}
			mappedItems = append(mappedItems, map[string]any{
				"id":                     it.ID,
				"product_id":             it.ProductID,
				"sku":                    it.Sku,
				"product_name":           it.ProductName,
				"image_url":              it.ImageUrl,
				"unit_of_measure":        it.UnitOfMeasure,
				"enable_serial_tracking": it.EnableSerialTracking,
				"allow_fractional_qty":   it.AllowFractionalQty,
				"qty":                    it.Qty,
				"returned_qty":           it.ReturnedQty,
				"returnable_qty":         it.ReturnableQty,
				"unit_price":             it.UnitPrice,
				"discount_amount":        it.DiscountAmount,
				"tax_amount":             it.TaxAmount,
				"line_total":             it.LineTotal,
				"batch_cogs":             it.BatchCogs,
				"serial_imei":            serialImei,
				"item_meta":              metaMap,
			})
		}

		out = append(out, map[string]any{
			"id":                   inv.ID,
			"branch_id":            inv.BranchID,
			"branch_name":          inv.BranchName,
			"terminal_name":        inv.TerminalName,
			"cashier_name":         inv.CashierName,
			"customer_id":          inv.CustomerID,
			"customer_name":        inv.CustomerName,
			"customer_phone":       inv.CustomerPhone,
			"invoice_number":       inv.InvoiceNumber,
			"status":               inv.Status,
			"subtotal":             inv.Subtotal,
			"discount_total":       inv.DiscountTotal,
			"tax_total":            inv.TaxTotal,
			"grand_total":          inv.GrandTotal,
			"refunded_total":       inv.RefundedTotal,
			"payment_method":       inv.PaymentMethod,
			"order_channel":        inv.OrderChannel,
			"returnable_qty_total": inv.ReturnableQtyTotal,
			"created_at":           inv.CreatedAt,
			"items":                mappedItems,
		})
	}

	return map[string]any{
		"invoices": out,
	}, nil
}

func normalizePOSReturnDisposition(raw string) (disposition, resolutionStatus string) {
	switch strings.ToUpper(strings.TrimSpace(raw)) {
	case "QUARANTINE_DAMAGED":
		return "QUARANTINE_DAMAGED", "QUARANTINE"
	case "WRITE_OFF_SCRAP":
		return "WRITE_OFF_SCRAP", "SCRAPPED"
	default:
		return "RESTOCK_SELLABLE", "COMPLETED"
	}
}

// ProcessPOSReturn processes a partial or full POS sales return with industry reason tracking,
// per-line sellable restock vs damaged quarantine vs wastage write-off, credit note issuance, and balanced GL reversal.
func (p *POSCheckoutUsecase) ProcessPOSReturn(
	ctx context.Context,
	tc domain.TenantContext,
	invoiceID uuid.UUID,
	req ProcessPOSReturnRequest,
	supervisorClaim *domain.SupervisorClaim,
) (map[string]any, error) {
	if len(req.Items) == 0 {
		return nil, errors.New("at least one return line item with positive quantity is required")
	}

	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := p.queries.WithTx(tx)
	origInv, err := qtx.GetInvoiceByID(ctx, db.GetInvoiceByIDParams{
		BusinessID: tc.BusinessID,
		ID:         invoiceID,
	})
	if err != nil {
		return nil, errors.New("sales invoice not found")
	}
	if origInv.InvoiceType != "SALE" {
		return nil, errors.New("cannot return against a refund credit note")
	}
	if origInv.Status == "VOID" {
		return nil, fmt.Errorf("invoice %s is VOID and cannot be returned", origInv.InvoiceNumber)
	}

	origItems, err := qtx.ListSalesInvoiceItemsForReturn(ctx, db.ListSalesInvoiceItemsForReturnParams{
		BusinessID: tc.BusinessID,
		InvoiceID:  invoiceID,
	})
	if err != nil {
		return nil, err
	}
	itemByID := make(map[uuid.UUID]db.ListSalesInvoiceItemsForReturnRow, len(origItems))
	for _, it := range origItems {
		itemByID[it.ID] = it
	}

	supID := uuid.NullUUID{UUID: tc.UserID, Valid: tc.UserID != uuid.Nil}
	if supervisorClaim != nil && supervisorClaim.SupervisorID != uuid.Nil {
		supID = uuid.NullUUID{UUID: supervisorClaim.SupervisorID, Valid: true}
	}

	var whNull uuid.NullUUID
	if wh, wErr := qtx.GetDefaultWarehouseForBranch(ctx, db.GetDefaultWarehouseForBranchParams{
		BusinessID: tc.BusinessID,
		BranchID:   origInv.BranchID,
	}); wErr == nil {
		whNull = uuid.NullUUID{UUID: wh.ID, Valid: true}
	}

	creditNoteID := uuid.New()
	creditNoteNumber := nextDocCode("CN")

	totalNetRefund := decimal.Zero
	totalTaxRefund := decimal.Zero
	totalGrandRefund := decimal.Zero
	totalDiscountRefund := decimal.Zero
	totalRestockCOGS := decimal.Zero
	totalDamageWastageCOGS := decimal.Zero

	type processedReturnLine struct {
		origItem         db.ListSalesInvoiceItemsForReturnRow
		qty              decimal.Decimal
		unitCost         decimal.Decimal
		lineCOGS         decimal.Decimal
		lineNet          decimal.Decimal
		lineTax          decimal.Decimal
		lineDisc         decimal.Decimal
		lineGrand        decimal.Decimal
		disposition      string
		resolutionStatus string
		reason           string
		serialIMEI       string
	}
	lines := make([]processedReturnLine, 0, len(req.Items))

	for _, inp := range req.Items {
		if inp.Qty.LessThanOrEqual(decimal.Zero) {
			continue
		}
		origItem, ok := itemByID[inp.InvoiceItemID]
		if !ok {
			return nil, errors.New("invoice item does not belong to selected invoice")
		}
		if inp.Qty.GreaterThan(origItem.ReturnableQty) {
			return nil, fmt.Errorf("cannot return %s of %s (only %s returnable)", inp.Qty.StringFixed(2), origItem.ProductName, origItem.ReturnableQty.StringFixed(2))
		}

		// Atomically guard & increment returned_qty
		if _, uErr := qtx.IncrementSalesInvoiceItemReturnedQty(ctx, db.IncrementSalesInvoiceItemReturnedQtyParams{
			BusinessID:  tc.BusinessID,
			ID:          origItem.ID,
			ReturnedQty: inp.Qty,
		}); uErr != nil {
			return nil, fmt.Errorf("concurrent return conflict on %s", origItem.ProductName)
		}

		var lineGrand, lineTax, lineDisc, lineCOGS decimal.Decimal
		if inp.Qty.Equal(origItem.Qty) && origItem.ReturnedQty.Equal(decimal.Zero) {
			lineGrand = origItem.LineTotal.Round(4)
			lineTax = origItem.TaxAmount.Round(4)
			lineDisc = origItem.DiscountAmount.Round(4)
			lineCOGS = origItem.BatchCogs.Round(4)
		} else {
			ratio := inp.Qty.Div(origItem.Qty)
			lineGrand = origItem.LineTotal.Mul(ratio).Round(4)
			lineTax = origItem.TaxAmount.Mul(ratio).Round(4)
			lineDisc = origItem.DiscountAmount.Mul(ratio).Round(4)
			lineCOGS = origItem.BatchCogs.Mul(ratio).Round(4)
		}
		lineNet := lineGrand.Sub(lineTax).Round(4)
		unitCost := decimal.Zero
		if inp.Qty.GreaterThan(decimal.Zero) {
			unitCost = lineCOGS.Div(inp.Qty).Round(4)
		}

		dispRaw := inp.Disposition
		if strings.TrimSpace(dispRaw) == "" {
			dispRaw = req.Disposition
		}
		disposition, resStatus := normalizePOSReturnDisposition(dispRaw)

		reason := strings.TrimSpace(inp.ReasonCategory)
		if reason == "" {
			reason = strings.TrimSpace(req.ReasonCategory)
		}
		if reason == "" {
			reason = "Customer Return"
		}

		serial := strings.TrimSpace(inp.SerialIMEI)
		if serial == "" && len(origItem.ItemMetaJson) > 0 {
			var mm map[string]any
			if json.Unmarshal(origItem.ItemMetaJson, &mm) == nil {
				if s, ok := mm["serial_imei"].(string); ok {
					serial = strings.TrimSpace(s)
				}
			}
		}

		if disposition == "RESTOCK_SELLABLE" {
			if rErr := RestoreFIFOBatches(ctx, qtx, tc.BusinessID, origInv.BranchID, origItem.ProductID, tc.UserID, invoiceID, "CUSTOMER_RETURN", inp.Qty, lineCOGS); rErr != nil {
				return nil, rErr
			}
			totalRestockCOGS = totalRestockCOGS.Add(lineCOGS)
		} else {
			totalDamageWastageCOGS = totalDamageWastageCOGS.Add(lineCOGS)
		}

		totalNetRefund = totalNetRefund.Add(lineNet)
		totalTaxRefund = totalTaxRefund.Add(lineTax)
		totalDiscountRefund = totalDiscountRefund.Add(lineDisc)
		totalGrandRefund = totalGrandRefund.Add(lineGrand)

		lines = append(lines, processedReturnLine{
			origItem:         origItem,
			qty:              inp.Qty,
			unitCost:         unitCost,
			lineCOGS:         lineCOGS,
			lineNet:          lineNet,
			lineTax:          lineTax,
			lineDisc:         lineDisc,
			lineGrand:        lineGrand,
			disposition:      disposition,
			resolutionStatus: resStatus,
			reason:           reason,
			serialIMEI:       serial,
		})
	}

	if len(lines) == 0 || totalGrandRefund.LessThanOrEqual(decimal.Zero) {
		return nil, errors.New("no valid return quantities selected")
	}

	// Check if 100% of invoice items have now been returned
	remainingAfter, err := qtx.ListSalesInvoiceItemsForReturn(ctx, db.ListSalesInvoiceItemsForReturnParams{
		BusinessID: tc.BusinessID,
		InvoiceID:  invoiceID,
	})
	if err != nil {
		return nil, err
	}
	allReturned := true
	for _, rem := range remainingAfter {
		if rem.ReturnableQty.GreaterThan(decimal.Zero) {
			allReturned = false
			break
		}
	}

	globalReason := strings.TrimSpace(req.ReasonCategory)
	if globalReason == "" {
		globalReason = lines[0].reason
	}

	if _, uErr := qtx.UpdateInvoiceRefundProgress(ctx, db.UpdateInvoiceRefundProgressParams{
		BusinessID:           tc.BusinessID,
		ID:                   invoiceID,
		RefundedTotal:        totalGrandRefund.Round(4),
		Column4:              allReturned,
		OverrideSupervisorID: supID,
		Column6:              globalReason,
	}); uErr != nil {
		return nil, uErr
	}

	// Insert Child Credit Note sales_invoices row
	refundMethod := strings.ToUpper(strings.TrimSpace(req.RefundMethod))
	if refundMethod == "" || refundMethod == "ORIGINAL" {
		refundMethod = "CASH"
	}
	metaBytes, _ := json.Marshal(map[string]any{
		"return_disposition": lines[0].disposition,
		"return_reason":      globalReason,
		"notes":              strings.TrimSpace(req.Notes),
		"credit_note_number": creditNoteNumber,
	})

	cnRow, err := qtx.InsertSalesInvoice(ctx, db.InsertSalesInvoiceParams{
		BusinessID:           tc.BusinessID,
		BranchID:             origInv.BranchID,
		TerminalID:           tc.TerminalID,
		ShiftID:              uuid.NullUUID{},
		CashierUserID:        tc.UserID,
		CustomerID:           origInv.CustomerID,
		InvoiceNumber:        creditNoteNumber,
		IdempotencyKey:       creditNoteID,
		InvoiceType:          "REFUND",
		OriginalInvoiceID:    uuid.NullUUID{UUID: invoiceID, Valid: true},
		Status:               "REFUND",
		Subtotal:             totalNetRefund.Round(4),
		DiscountTotal:        totalDiscountRefund.Round(4),
		TaxTotal:             totalTaxRefund.Round(4),
		GrandTotal:           totalGrandRefund.Round(4),
		TotalCogs:            totalRestockCOGS.Add(totalDamageWastageCOGS).Round(4),
		OverrideSupervisorID: supID,
		OverrideReason:       globalReason,
		OrderChannel:         "COUNTER",
		OrderMetaJson:        metaBytes,
	})
	if err != nil {
		return nil, err
	}

	for _, l := range lines {
		itemMetaBytes, _ := json.Marshal(map[string]any{
			"disposition": l.disposition,
			"reason":      l.reason,
			"serial_imei": l.serialIMEI,
		})
		_, _ = qtx.InsertSalesInvoiceItem(ctx, db.InsertSalesInvoiceItemParams{
			BusinessID:     tc.BusinessID,
			InvoiceID:      cnRow.ID,
			ProductID:      l.origItem.ProductID,
			Qty:            l.qty.Round(4),
			UnitPrice:      l.origItem.UnitPrice,
			DiscountAmount: l.lineDisc.Round(4),
			TaxAmount:      l.lineTax.Round(4),
			LineTotal:      l.lineGrand.Round(4),
			BatchCogs:      l.lineCOGS.Round(4),
			ItemMetaJson:   itemMetaBytes,
		})
	}

	if refundMethod != "CASH" && refundMethod != "CARD" && refundMethod != "SPLIT" && refundMethod != "MOBILE_WALLET" {
		refundMethod = "CASH"
	}
	_ = qtx.InsertInvoicePayment(ctx, db.InsertInvoicePaymentParams{
		BusinessID:     tc.BusinessID,
		InvoiceID:      cnRow.ID,
		PaymentMethod:  refundMethod,
		Amount:         totalGrandRefund.Round(4),
		TenderedAmount: totalGrandRefund.Round(4),
		ChangeGiven:    decimal.Zero,
		ReferenceNo:    creditNoteNumber,
	})

	// Post Balanced Reversing Double-Entry GL
	retAcct, _ := qtx.GetAccountByCode(ctx, db.GetAccountByCodeParams{BusinessID: tc.BusinessID, Code: "4100"})
	taxAcct, _ := qtx.GetAccountByCode(ctx, db.GetAccountByCodeParams{BusinessID: tc.BusinessID, Code: "2100"})
	tenderCode := "1010"
	if refundMethod == "CARD" {
		tenderCode = "1020"
	}
	tenderAcct, _ := lookupAccountWithFallback(ctx, qtx, tc.BusinessID, tenderCode, "1010")
	cogsAcct, _ := qtx.GetAccountByCode(ctx, db.GetAccountByCodeParams{BusinessID: tc.BusinessID, Code: "5000"})
	invAcct, _ := qtx.GetAccountByCode(ctx, db.GetAccountByCodeParams{BusinessID: tc.BusinessID, Code: "1200"})
	shrinkAcct, _ := lookupAccountWithFallback(ctx, qtx, tc.BusinessID, "5100", "5000")

	today := pgtype.Date{Time: time.Now(), Valid: true}
	fpNull, fpErr := resolveOpenFiscalPeriodID(ctx, qtx, tc.BusinessID, today)
	if fpErr != nil {
		return nil, fpErr
	}

	je, err := qtx.InsertJournalEntry(ctx, db.InsertJournalEntryParams{
		BusinessID:     tc.BusinessID,
		BranchID:       uuid.NullUUID{UUID: origInv.BranchID, Valid: true},
		FiscalPeriodID: fpNull,
		EntryNumber:    nextDocCode("JE-RET"),
		SourceType:     "POS_REFUND",
		SourceID:       cnRow.ID,
		Description:    fmt.Sprintf("POS Return %s against %s (%s)", creditNoteNumber, origInv.InvoiceNumber, globalReason),
		EntryDate:      today,
		PostedBy:       supID,
	})
	if err != nil {
		return nil, err
	}

	netVal := totalNetRefund.Round(4)
	taxVal := totalTaxRefund.Round(4)
	grandVal := netVal.Add(taxVal)
	restockVal := totalRestockCOGS.Round(4)
	dmgVal := totalDamageWastageCOGS.Round(4)

	if netVal.GreaterThan(decimal.Zero) {
		if _, err := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID: tc.BusinessID, JournalEntryID: je.ID, AccountID: retAcct.ID, Debit: netVal, Credit: decimal.Zero, Memo: "POS sales return reversal",
		}); err != nil {
			return nil, err
		}
	}
	if taxVal.GreaterThan(decimal.Zero) {
		if _, err := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID: tc.BusinessID, JournalEntryID: je.ID, AccountID: taxAcct.ID, Debit: taxVal, Credit: decimal.Zero, Memo: "Sales tax payable reversal",
		}); err != nil {
			return nil, err
		}
	}
	if grandVal.GreaterThan(decimal.Zero) {
		if _, err := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID: tc.BusinessID, JournalEntryID: je.ID, AccountID: tenderAcct.ID, Debit: decimal.Zero, Credit: grandVal, Memo: "Customer refund payout (" + refundMethod + ")",
		}); err != nil {
			return nil, err
		}
	}
	if restockVal.GreaterThan(decimal.Zero) {
		if _, err := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID: tc.BusinessID, JournalEntryID: je.ID, AccountID: invAcct.ID, Debit: restockVal, Credit: decimal.Zero, Memo: "Returned sellable item restored to FIFO stock",
		}); err != nil {
			return nil, err
		}
		if _, err := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID: tc.BusinessID, JournalEntryID: je.ID, AccountID: cogsAcct.ID, Debit: decimal.Zero, Credit: restockVal, Memo: "COGS reversal on sellable return",
		}); err != nil {
			return nil, err
		}
	}
	if dmgVal.GreaterThan(decimal.Zero) {
		if _, err := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID: tc.BusinessID, JournalEntryID: je.ID, AccountID: shrinkAcct.ID, Debit: dmgVal, Credit: decimal.Zero, Memo: "Damaged / wasted customer return cost reclassification",
		}); err != nil {
			return nil, err
		}
		if _, err := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID: tc.BusinessID, JournalEntryID: je.ID, AccountID: cogsAcct.ID, Debit: decimal.Zero, Credit: dmgVal, Memo: "COGS transfer to damage & wastage loss",
		}); err != nil {
			return nil, err
		}
	}

	// Record 3NF stock_adjustments entry per returned line for Inventory Quarantine/Wastage/Return visibility
	adjustmentNumbers := make([]string, 0, len(lines))
	for _, l := range lines {
		adjNum := nextDocCode("RET")
		adjustmentNumbers = append(adjustmentNumbers, adjNum)
		if _, aErr := qtx.InsertStockAdjustment(ctx, db.InsertStockAdjustmentParams{
			BusinessID:       tc.BusinessID,
			BranchID:         origInv.BranchID,
			WarehouseID:      whNull,
			ProductID:        l.origItem.ProductID,
			BatchID:          uuid.NullUUID{},
			SupplierID:       uuid.NullUUID{},
			InvoiceID:        uuid.NullUUID{UUID: invoiceID, Valid: true},
			ReturnInvoiceID:  uuid.NullUUID{UUID: cnRow.ID, Valid: true},
			JournalEntryID:   uuid.NullUUID{UUID: je.ID, Valid: true},
			AdjustmentNumber: adjNum,
			SourceChannel:    "POS_RETURN",
			AdjustmentType:   "CUSTOMER_RETURN",
			Disposition:      l.disposition,
			ResolutionStatus: l.resolutionStatus,
			ReasonCategory:   l.reason,
			SerialImei:       l.serialIMEI,
			RmaReference:     "",
			Qty:              l.qty.Round(4),
			UnitCost:         l.unitCost,
			TotalCost:        l.lineCOGS,
			RefundAmount:     l.lineGrand,
			Notes:            strings.TrimSpace(req.Notes),
			ActorUserID:      supID,
			ActorName:        tc.FullName,
		}); aErr != nil {
			return nil, aErr
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	if p.hub != nil {
		p.hub.BroadcastTenant(tc.BusinessID, "POS_RETURN_PROCESSED", map[string]any{
			"invoice_id":         invoiceID,
			"credit_note_number": creditNoteNumber,
			"refund_total":       totalGrandRefund.Round(2).StringFixed(2),
			"adjustment_numbers": adjustmentNumbers,
		})
	}

	return map[string]any{
		"credit_note_id":     cnRow.ID,
		"credit_note_number": creditNoteNumber,
		"original_invoice":   origInv.InvoiceNumber,
		"all_returned":       allReturned,
		"subtotal_refund":    netVal,
		"tax_refund":         taxVal,
		"refund_total":       grandVal,
		"journal_entry":      je.EntryNumber,
		"adjustment_numbers": adjustmentNumbers,
		"created_at":         cnRow.CreatedAt,
	}, nil
}

