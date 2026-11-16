package usecase

import (
	"context"
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

// CreateStockAdjustmentRequest defines the payload for recording inventory damages, wastages,
// expiry write-offs, or supplier RMA/RTV returns against FIFO layers.
type CreateStockAdjustmentRequest struct {
	BranchID       uuid.UUID       `json:"branch_id"`
	ProductID      uuid.UUID       `json:"product_id"`
	BatchID        *uuid.UUID      `json:"batch_id,omitempty"`
	SupplierID     *uuid.UUID      `json:"supplier_id,omitempty"`
	AdjustmentType string          `json:"adjustment_type"` // DAMAGE | WASTAGE | EXPIRY_WRITEOFF | SUPPLIER_RETURN
	Disposition    string          `json:"disposition"`     // WRITE_OFF_SCRAP | QUARANTINE_DAMAGED | RETURN_TO_SUPPLIER
	ReasonCategory string          `json:"reason_category"`
	SerialIMEI     string          `json:"serial_imei,omitempty"`
	RMAReference   string          `json:"rma_reference,omitempty"`
	Qty            decimal.Decimal `json:"qty"`
	Notes          string          `json:"notes,omitempty"`
}

// ResolveStockAdjustmentRequest transitions a quarantined return/damaged item to RMA_SENT, SCRAPPED, or REPAIRED_RESTOCKED.
type ResolveStockAdjustmentRequest struct {
	Action       string     `json:"action"` // RMA_SENT | SCRAPPED | REPAIRED_RESTOCKED
	SupplierID   *uuid.UUID `json:"supplier_id,omitempty"`
	RMAReference string     `json:"rma_reference,omitempty"`
	Notes        string     `json:"notes,omitempty"`
}

func lookupAccountWithFallback(ctx context.Context, qtx *db.Queries, businessID uuid.UUID, primaryCode, fallbackCode string) (db.GetAccountByCodeRow, error) {
	acct, err := qtx.GetAccountByCode(ctx, db.GetAccountByCodeParams{
		BusinessID: businessID,
		Code:       primaryCode,
	})
	if err == nil {
		return acct, nil
	}
	if fallbackCode != "" && fallbackCode != primaryCode {
		return qtx.GetAccountByCode(ctx, db.GetAccountByCodeParams{
			BusinessID: businessID,
			Code:       fallbackCode,
		})
	}
	return acct, err
}

func resolveOpenFiscalPeriodID(ctx context.Context, qtx *db.Queries, businessID uuid.UUID, entryDate pgtype.Date) (uuid.NullUUID, error) {
	var fpNull uuid.NullUUID
	fp, fpErr := qtx.FindOpenFiscalPeriodForDate(ctx, db.FindOpenFiscalPeriodForDateParams{
		BusinessID: businessID,
		Column2:    entryDate,
	})
	if fpErr == nil {
		if fp.IsLocked {
			return uuid.NullUUID{}, errors.New("current fiscal period is locked; cannot post inventory adjustment journal")
		}
		fpNull = uuid.NullUUID{UUID: fp.ID, Valid: true}
	}
	return fpNull, nil
}

func normalizeAdjustmentType(raw string) (string, string, error) {
	switch strings.ToUpper(strings.TrimSpace(raw)) {
	case "DAMAGE":
		return "DAMAGE", "DMG", nil
	case "WASTAGE":
		return "WASTAGE", "WST", nil
	case "EXPIRY_WRITEOFF", "EXPIRY":
		return "EXPIRY_WRITEOFF", "EXP", nil
	case "SUPPLIER_RETURN", "RMA", "RTV":
		return "SUPPLIER_RETURN", "RMA", nil
	default:
		return "", "", errors.New("adjustment_type must be DAMAGE, WASTAGE, EXPIRY_WRITEOFF, or SUPPLIER_RETURN")
	}
}

func normalizeAdjustmentDisposition(adjType, raw string) (string, string) {
	switch strings.ToUpper(strings.TrimSpace(raw)) {
	case "QUARANTINE_DAMAGED":
		return "QUARANTINE_DAMAGED", "QUARANTINE"
	case "RETURN_TO_SUPPLIER":
		return "RETURN_TO_SUPPLIER", "RMA_SENT"
	case "WRITE_OFF_SCRAP":
		return "WRITE_OFF_SCRAP", "SCRAPPED"
	default:
		if adjType == "SUPPLIER_RETURN" {
			return "RETURN_TO_SUPPLIER", "RMA_SENT"
		}
		return "WRITE_OFF_SCRAP", "SCRAPPED"
	}
}

// ListStockAdjustments returns stock adjustment rows and KPI summary scoped cleanly by branch permissions.
func (u *InventoryFIFOUsecase) ListStockAdjustments(ctx context.Context, businessID, branchID uuid.UUID, multiBranch bool) (map[string]any, error) {
	filterBranch := branchID
	if multiBranch && branchID == uuid.Nil {
		filterBranch = uuid.Nil
	}
	rows, err := u.queries.ListStockAdjustmentsForBusiness(ctx, db.ListStockAdjustmentsForBusinessParams{
		BusinessID: businessID,
		Column2:    filterBranch,
	})
	if err != nil {
		return nil, err
	}
	summary, err := u.queries.GetStockAdjustmentsSummary(ctx, db.GetStockAdjustmentsSummaryParams{
		BusinessID: businessID,
		Column2:    filterBranch,
	})
	if err != nil {
		summary = db.GetStockAdjustmentsSummaryRow{}
	}
	return map[string]any{
		"adjustments": rows,
		"summary":     summary,
	}, nil
}

// CreateStockAdjustment atomically removes damaged, wasted, expired, or RMA-returned stock from FIFO batches
// and posts balanced Double-Entry GL entries (DR 5100 Shrinkage/Wastage or DR 2000 AP / CR 1200 Inventory Asset).
func (u *InventoryFIFOUsecase) CreateStockAdjustment(ctx context.Context, tc domain.TenantContext, req CreateStockAdjustmentRequest) (map[string]any, error) {
	if req.ProductID == uuid.Nil {
		return nil, errors.New("product is required")
	}
	if req.Qty.LessThanOrEqual(decimal.Zero) {
		return nil, errors.New("adjustment quantity must be greater than 0")
	}
	reason := strings.TrimSpace(req.ReasonCategory)
	if reason == "" {
		return nil, errors.New("reason category is required")
	}

	adjType, docPrefix, err := normalizeAdjustmentType(req.AdjustmentType)
	if err != nil {
		return nil, err
	}
	disposition, resStatus := normalizeAdjustmentDisposition(adjType, req.Disposition)

	branchID, err := ResolveScopedBranchID(tc, req.BranchID)
	if err != nil {
		return nil, err
	}
	if branchID == uuid.Nil {
		branchID = tc.BranchID
	}

	tx, err := u.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := u.queries.WithTx(tx)

	// Determine FIFO depletion either from explicit batch_id or strict FIFO order
	type depletedLayer struct {
		batchID   uuid.UUID
		qty       decimal.Decimal
		unitCost  decimal.Decimal
		layerCost decimal.Decimal
	}
	var layers []depletedLayer
	totalCost := decimal.Zero

	if req.BatchID != nil && *req.BatchID != uuid.Nil {
		batch, bErr := qtx.GetInventoryBatchForUpdate(ctx, db.GetInventoryBatchForUpdateParams{
			BusinessID: tc.BusinessID,
			ID:         *req.BatchID,
		})
		if bErr != nil {
			return nil, errors.New("selected FIFO batch not found")
		}
		if batch.BranchID != branchID || batch.ProductID != req.ProductID {
			return nil, errors.New("selected batch does not match branch and product")
		}
		if batch.RemainingQty.LessThan(req.Qty) {
			return nil, fmt.Errorf("batch %s only has %s units remaining", batch.BatchNumber, batch.RemainingQty.StringFixed(2))
		}
		newRem := batch.RemainingQty.Sub(req.Qty)
		if uErr := qtx.UpdateBatchRemainingQty(ctx, db.UpdateBatchRemainingQtyParams{
			BusinessID:   tc.BusinessID,
			RemainingQty: newRem,
			ID:           batch.ID,
		}); uErr != nil {
			return nil, uErr
		}
		layerCost := req.Qty.Mul(batch.UnitCost).Round(4)
		totalCost = layerCost
		layers = append(layers, depletedLayer{
			batchID:   batch.ID,
			qty:       req.Qty,
			unitCost:  batch.UnitCost,
			layerCost: layerCost,
		})
	} else {
		batches, bErr := qtx.LockActiveFIFOBatchesForProduct(ctx, db.LockActiveFIFOBatchesForProductParams{
			BusinessID: tc.BusinessID,
			BranchID:   branchID,
			ProductID:  req.ProductID,
		})
		if bErr != nil {
			return nil, bErr
		}
		slices := make([]FIFOBatchSlice, 0, len(batches))
		for _, b := range batches {
			slices = append(slices, FIFOBatchSlice{
				BatchID:      b.ID,
				BatchNumber:  b.BatchNumber,
				UnitCost:     b.UnitCost,
				RemainingQty: b.RemainingQty,
			})
		}
		consumptions, fifoCost, cErr := ComputeFIFODepletion(slices, req.Qty, false)
		if cErr != nil {
			return nil, cErr
		}
		totalCost = fifoCost
		for _, c := range consumptions {
			if uErr := qtx.UpdateBatchRemainingQty(ctx, db.UpdateBatchRemainingQtyParams{
				BusinessID:   tc.BusinessID,
				RemainingQty: c.NewRemQty,
				ID:           c.BatchID,
			}); uErr != nil {
				return nil, uErr
			}
			layers = append(layers, depletedLayer{
				batchID:   c.BatchID,
				qty:       c.ConsumedQty,
				unitCost:  c.UnitCost,
				layerCost: c.LayerCOGS,
			})
		}
	}

	avgUnitCost := totalCost.Div(req.Qty).Round(4)
	adjID := uuid.New()
	adjNumber := nextDocCode(docPrefix)

	var whNull uuid.NullUUID
	if wh, wErr := qtx.GetDefaultWarehouseForBranch(ctx, db.GetDefaultWarehouseForBranchParams{
		BusinessID: tc.BusinessID,
		BranchID:   branchID,
	}); wErr == nil {
		whNull = uuid.NullUUID{UUID: wh.ID, Valid: true}
	}

	var supNull uuid.NullUUID
	if req.SupplierID != nil && *req.SupplierID != uuid.Nil {
		supNull = uuid.NullUUID{UUID: *req.SupplierID, Valid: true}
	}

	var primaryBatchNull uuid.NullUUID
	if len(layers) > 0 {
		primaryBatchNull = uuid.NullUUID{UUID: layers[0].batchID, Valid: true}
	}

	// Write immutable stock_movements per depleted layer
	movType := adjType
	if resStatus == "QUARANTINE" {
		movType = "QUARANTINE_IN"
	}
	for _, l := range layers {
		if _, mErr := qtx.InsertStockMovement(ctx, db.InsertStockMovementParams{
			BusinessID:    tc.BusinessID,
			BranchID:      branchID,
			ProductID:     req.ProductID,
			BatchID:       uuid.NullUUID{UUID: l.batchID, Valid: true},
			MovementType:  movType,
			QtyDelta:      l.qty.Neg(),
			UnitCost:      l.unitCost,
			ReferenceType: "STOCK_ADJUSTMENT",
			ReferenceID:   adjID,
			CreatedBy:     uuid.NullUUID{UUID: tc.UserID, Valid: tc.UserID != uuid.Nil},
		}); mErr != nil {
			return nil, mErr
		}
	}

	// Post Balanced Double-Entry GL Journal if cost > 0
	var jeNull uuid.NullUUID
	entryNumber := ""
	if totalCost.GreaterThan(decimal.Zero) {
		invAcct, iErr := qtx.GetAccountByCode(ctx, db.GetAccountByCodeParams{BusinessID: tc.BusinessID, Code: "1200"})
		if iErr != nil {
			return nil, iErr
		}
		var debitAcct db.GetAccountByCodeRow
		var debitMemo string
		if disposition == "RETURN_TO_SUPPLIER" || adjType == "SUPPLIER_RETURN" {
			debitAcct, err = lookupAccountWithFallback(ctx, qtx, tc.BusinessID, "2000", "5100")
			debitMemo = fmt.Sprintf("Supplier RMA return payable reduction (%s)", reason)
		} else {
			debitAcct, err = lookupAccountWithFallback(ctx, qtx, tc.BusinessID, "5100", "5000")
			debitMemo = fmt.Sprintf("Inventory %s expense (%s)", strings.ToLower(adjType), reason)
		}
		if err != nil {
			return nil, err
		}

		today := pgtype.Date{Time: time.Now(), Valid: true}
		fpNull, fpErr := resolveOpenFiscalPeriodID(ctx, qtx, tc.BusinessID, today)
		if fpErr != nil {
			return nil, fpErr
		}

		je, jeErr := qtx.InsertJournalEntry(ctx, db.InsertJournalEntryParams{
			BusinessID:     tc.BusinessID,
			BranchID:       uuid.NullUUID{UUID: branchID, Valid: true},
			FiscalPeriodID: fpNull,
			EntryNumber:    nextDocCode("JE-ADJ"),
			SourceType:     "STOCK_ADJUSTMENT",
			SourceID:       adjID,
			Description:    fmt.Sprintf("%s %s — %s", adjNumber, adjType, reason),
			EntryDate:      today,
			PostedBy:       uuid.NullUUID{UUID: tc.UserID, Valid: tc.UserID != uuid.Nil},
		})
		if jeErr != nil {
			return nil, jeErr
		}
		jeNull = uuid.NullUUID{UUID: je.ID, Valid: true}
		entryNumber = je.EntryNumber

		if _, lErr := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID:     tc.BusinessID,
			JournalEntryID: je.ID,
			AccountID:      debitAcct.ID,
			Debit:          totalCost.Round(4),
			Credit:         decimal.Zero,
			Memo:           debitMemo,
		}); lErr != nil {
			return nil, lErr
		}
		if _, lErr := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID:     tc.BusinessID,
			JournalEntryID: je.ID,
			AccountID:      invAcct.ID,
			Debit:          decimal.Zero,
			Credit:         totalCost.Round(4),
			Memo:           fmt.Sprintf("FIFO Inventory write-off (%s)", adjNumber),
		}); lErr != nil {
			return nil, lErr
		}
	}

	adjRow, err := qtx.InsertStockAdjustment(ctx, db.InsertStockAdjustmentParams{
		BusinessID:       tc.BusinessID,
		BranchID:         branchID,
		WarehouseID:      whNull,
		ProductID:        req.ProductID,
		BatchID:          primaryBatchNull,
		SupplierID:       supNull,
		InvoiceID:        uuid.NullUUID{},
		ReturnInvoiceID:  uuid.NullUUID{},
		JournalEntryID:   jeNull,
		AdjustmentNumber: adjNumber,
		SourceChannel:    "INVENTORY",
		AdjustmentType:   adjType,
		Disposition:      disposition,
		ResolutionStatus: resStatus,
		ReasonCategory:   reason,
		SerialImei:       strings.TrimSpace(req.SerialIMEI),
		RmaReference:     strings.TrimSpace(req.RMAReference),
		Qty:              req.Qty.Round(4),
		UnitCost:         avgUnitCost,
		TotalCost:        totalCost.Round(4),
		RefundAmount:     decimal.Zero,
		Notes:            strings.TrimSpace(req.Notes),
		ActorUserID:      uuid.NullUUID{UUID: tc.UserID, Valid: tc.UserID != uuid.Nil},
		ActorName:        tc.FullName,
	})
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	// Best-effort low-stock Auto-PO check after write-off
	go func(bID, brID, pID uuid.UUID) {
		_, _, _ = u.CheckAndDraftLowStockPO(context.Background(), bID, brID, pID)
	}(tc.BusinessID, branchID, req.ProductID)

	return map[string]any{
		"adjustment_id":     adjRow.ID,
		"adjustment_number": adjRow.AdjustmentNumber,
		"resolution_status": adjRow.ResolutionStatus,
		"journal_entry":     entryNumber,
		"total_cost":        totalCost.Round(4),
		"created_at":        adjRow.CreatedAt,
	}, nil
}

// ResolveQuarantinedAdjustment transitions a QUARANTINE stock adjustment into RMA_SENT, SCRAPPED, or REPAIRED_RESTOCKED.
func (u *InventoryFIFOUsecase) ResolveQuarantinedAdjustment(
	ctx context.Context,
	tc domain.TenantContext,
	adjustmentID uuid.UUID,
	req ResolveStockAdjustmentRequest,
) (map[string]any, error) {
	action := strings.ToUpper(strings.TrimSpace(req.Action))
	var nextDisposition string
	switch action {
	case "RMA_SENT":
		nextDisposition = "RETURN_TO_SUPPLIER"
	case "SCRAPPED":
		nextDisposition = "WRITE_OFF_SCRAP"
	case "REPAIRED_RESTOCKED":
		nextDisposition = "RESTOCK_SELLABLE"
	default:
		return nil, errors.New("action must be RMA_SENT, SCRAPPED, or REPAIRED_RESTOCKED")
	}

	tx, err := u.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := u.queries.WithTx(tx)
	adj, err := qtx.GetStockAdjustmentForUpdate(ctx, db.GetStockAdjustmentForUpdateParams{
		BusinessID: tc.BusinessID,
		ID:         adjustmentID,
	})
	if err != nil {
		return nil, errors.New("stock adjustment record not found")
	}
	if adj.ResolutionStatus != "QUARANTINE" {
		return nil, fmt.Errorf("adjustment %s is already resolved (%s)", adj.AdjustmentNumber, adj.ResolutionStatus)
	}

	var supNull uuid.NullUUID
	if req.SupplierID != nil && *req.SupplierID != uuid.Nil {
		supNull = uuid.NullUUID{UUID: *req.SupplierID, Valid: true}
	}

	// Post balanced GL & inventory restoration if RMA_SENT or REPAIRED_RESTOCKED
	costVal := adj.TotalCost.Round(4)
	if action == "REPAIRED_RESTOCKED" {
		batch, bErr := qtx.InsertInventoryBatch(ctx, db.InsertInventoryBatchParams{
			BusinessID:  tc.BusinessID,
			BranchID:    adj.BranchID,
			ProductID:   adj.ProductID,
			GrnItemID:   uuid.NullUUID{},
			BatchNumber: nextDocCode("RPR"),
			ExpiryDate:  pgtype.Date{},
			UnitCost:    adj.UnitCost,
			InitialQty:  adj.Qty,
		})
		if bErr != nil {
			return nil, bErr
		}
		if _, mErr := qtx.InsertStockMovement(ctx, db.InsertStockMovementParams{
			BusinessID:    tc.BusinessID,
			BranchID:      adj.BranchID,
			ProductID:     adj.ProductID,
			BatchID:       uuid.NullUUID{UUID: batch.ID, Valid: true},
			MovementType:  "QUARANTINE_RESTOCK",
			QtyDelta:      adj.Qty,
			UnitCost:      adj.UnitCost,
			ReferenceType: "STOCK_ADJUSTMENT",
			ReferenceID:   adj.ID,
			CreatedBy:     uuid.NullUUID{UUID: tc.UserID, Valid: tc.UserID != uuid.Nil},
		}); mErr != nil {
			return nil, mErr
		}
		if costVal.GreaterThan(decimal.Zero) {
			invAcct, _ := qtx.GetAccountByCode(ctx, db.GetAccountByCodeParams{BusinessID: tc.BusinessID, Code: "1200"})
			shrinkAcct, _ := lookupAccountWithFallback(ctx, qtx, tc.BusinessID, "5100", "5000")
			today := pgtype.Date{Time: time.Now(), Valid: true}
			fpNull, fpErr := resolveOpenFiscalPeriodID(ctx, qtx, tc.BusinessID, today)
			if fpErr != nil {
				return nil, fpErr
			}
			je, jErr := qtx.InsertJournalEntry(ctx, db.InsertJournalEntryParams{
				BusinessID:     tc.BusinessID,
				BranchID:       uuid.NullUUID{UUID: adj.BranchID, Valid: true},
				FiscalPeriodID: fpNull,
				EntryNumber:    nextDocCode("JE-RPR"),
				SourceType:     "STOCK_ADJUSTMENT",
				SourceID:       adj.ID,
				Description:    fmt.Sprintf("Repaired & restocked %s (%s)", adj.AdjustmentNumber, adj.ProductName),
				EntryDate:      today,
				PostedBy:       uuid.NullUUID{UUID: tc.UserID, Valid: tc.UserID != uuid.Nil},
			})
			if jErr != nil {
				return nil, jErr
			}
			_, _ = qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
				BusinessID: tc.BusinessID, JournalEntryID: je.ID, AccountID: invAcct.ID, Debit: costVal, Credit: decimal.Zero, Memo: "Restored repaired unit into FIFO stock",
			})
			_, _ = qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
				BusinessID: tc.BusinessID, JournalEntryID: je.ID, AccountID: shrinkAcct.ID, Debit: decimal.Zero, Credit: costVal, Memo: "Reversal of damage write-down upon repair",
			})
		}
	} else if action == "RMA_SENT" && costVal.GreaterThan(decimal.Zero) {
		apAcct, _ := lookupAccountWithFallback(ctx, qtx, tc.BusinessID, "2000", "2000")
		shrinkAcct, _ := lookupAccountWithFallback(ctx, qtx, tc.BusinessID, "5100", "5000")
		today := pgtype.Date{Time: time.Now(), Valid: true}
		fpNull, fpErr := resolveOpenFiscalPeriodID(ctx, qtx, tc.BusinessID, today)
		if fpErr != nil {
			return nil, fpErr
		}
		je, jErr := qtx.InsertJournalEntry(ctx, db.InsertJournalEntryParams{
			BusinessID:     tc.BusinessID,
			BranchID:       uuid.NullUUID{UUID: adj.BranchID, Valid: true},
			FiscalPeriodID: fpNull,
			EntryNumber:    nextDocCode("JE-RMA"),
			SourceType:     "STOCK_ADJUSTMENT",
			SourceID:       adj.ID,
			Description:    fmt.Sprintf("Vendor RMA claim %s (%s)", adj.AdjustmentNumber, adj.ProductName),
			EntryDate:      today,
			PostedBy:       uuid.NullUUID{UUID: tc.UserID, Valid: tc.UserID != uuid.Nil},
		})
		if jErr != nil {
			return nil, jErr
		}
		_, _ = qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID: tc.BusinessID, JournalEntryID: je.ID, AccountID: apAcct.ID, Debit: costVal, Credit: decimal.Zero, Memo: "Supplier RMA / credit recovery claim",
		})
		_, _ = qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
			BusinessID: tc.BusinessID, JournalEntryID: je.ID, AccountID: shrinkAcct.ID, Debit: decimal.Zero, Credit: costVal, Memo: "Recovery offset against shrinkage & damage",
		})
	}

	resolved, err := qtx.ResolveStockAdjustment(ctx, db.ResolveStockAdjustmentParams{
		BusinessID:       tc.BusinessID,
		ID:               adj.ID,
		Disposition:      nextDisposition,
		ResolutionStatus: action,
		SupplierID:       supNull,
		Column6:          strings.TrimSpace(req.RMAReference),
		Column7:          strings.TrimSpace(req.Notes),
		ResolvedBy:       uuid.NullUUID{UUID: tc.UserID, Valid: tc.UserID != uuid.Nil},
	})
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return map[string]any{
		"id":                resolved.ID,
		"adjustment_number": resolved.AdjustmentNumber,
		"disposition":       resolved.Disposition,
		"resolution_status": resolved.ResolutionStatus,
		"resolved_at":       resolved.ResolvedAt,
	}, nil
}

