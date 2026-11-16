package usecase

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/enterprise-pos/backend/internal/infrastructure/ws"
	"github.com/enterprise-pos/backend/internal/repository/sqlc/db"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
)

// FIFOBatchSlice represents a locked batch candidate during FIFO depletion calculation.
type FIFOBatchSlice struct {
	BatchID      uuid.UUID
	BatchNumber  string
	UnitCost     decimal.Decimal
	RemainingQty decimal.Decimal
}

// FIFOConsumption records exact quantity and COGS drawn from one batch layer.
type FIFOConsumption struct {
	BatchID     uuid.UUID       `json:"batch_id"`
	BatchNumber string          `json:"batch_number"`
	ConsumedQty decimal.Decimal `json:"consumed_qty"`
	NewRemQty   decimal.Decimal `json:"new_remaining_qty"`
	UnitCost    decimal.Decimal `json:"unit_cost"`
	LayerCOGS   decimal.Decimal `json:"layer_cogs"`
}

// CreateGRNItemInput specifies one product batch line inside a GRN intake request.
type CreateGRNItemInput struct {
	ProductID   uuid.UUID       `json:"product_id"`
	BatchNumber string          `json:"batch_number"`
	ExpiryDate  string          `json:"expiry_date,omitempty"` // YYYY-MM-DD
	OrderedQty  decimal.Decimal `json:"ordered_qty"`
	QtyReceived decimal.Decimal `json:"qty_received"`
	UnitCost    decimal.Decimal `json:"unit_cost"`
}

// CreateGRNRequest defines the payload for creating (and optionally immediately approving) a GRN.
type CreateGRNRequest struct {
	SupplierID        uuid.UUID            `json:"supplier_id"`
	BranchID          uuid.UUID            `json:"branch_id"`
	SupplierInvoiceNo string               `json:"supplier_invoice_no"`
	AttachmentName    string               `json:"attachment_name"`
	AutoApprove       bool                 `json:"auto_approve"`
	Items             []CreateGRNItemInput `json:"items"`
}

// InventoryFIFOUsecase manages GRN stock intake, FIFO batch locking/depletion, and auto-PO drafting.
type InventoryFIFOUsecase struct {
	pool     *pgxpool.Pool
	queries  *db.Queries
	settings *SettingsResolver
	hub      *ws.Hub
}

// NewInventoryFIFOUsecase constructs an InventoryFIFOUsecase.
func NewInventoryFIFOUsecase(pool *pgxpool.Pool, queries *db.Queries) *InventoryFIFOUsecase {
	return &InventoryFIFOUsecase{pool: pool, queries: queries}
}

// SetSettingsResolver attaches the 6-level settings resolver for warehouse approval gating.
func (u *InventoryFIFOUsecase) SetSettingsResolver(s *SettingsResolver) {
	u.settings = s
}

// SetHub attaches the WebSocket hub for real-time low-stock, PO, and invoice notifications.
func (u *InventoryFIFOUsecase) SetHub(h *ws.Hub) {
	u.hub = h
}

func filterSliceByBranch[T any](items []T, branchID uuid.UUID, getBranch func(T) uuid.UUID) []T {
	out := make([]T, 0, len(items))
	for _, it := range items {
		if getBranch(it) == branchID {
			out = append(out, it)
		}
	}
	return out
}

// ListBatchesAndGRNs returns active FIFO batches, suppliers, GRNs, Auto-POs, and Vendor Invoices scoped cleanly.
// Non-owner roles (multiBranch == false) only receive documents and warehouses for their pinned branchID.
func (u *InventoryFIFOUsecase) ListBatchesAndGRNs(ctx context.Context, businessID, branchID uuid.UUID, multiBranch bool) (map[string]any, error) {
	batches, err := u.queries.ListInventoryBatchesForBranch(ctx, db.ListInventoryBatchesForBranchParams{
		BusinessID: businessID,
		BranchID:   branchID,
	})
	if err != nil {
		return nil, err
	}
	grns, err := u.queries.ListGRNsForBusiness(ctx, businessID)
	if err != nil {
		return nil, err
	}
	suppliers, err := u.queries.ListSuppliersForBusiness(ctx, businessID)
	if err != nil {
		return nil, err
	}
	approvalLogs, _ := u.queries.ListWarehouseApprovalLogs(ctx, businessID)
	warehouses, _ := u.queries.ListWarehousesForBusiness(ctx, businessID)
	pos, _ := u.queries.ListPurchaseOrdersWithDetails(ctx, businessID)
	invoices, _ := u.queries.ListPurchaseInvoicesForBusiness(ctx, businessID)
	if !multiBranch {
		grns = filterSliceByBranch(grns, branchID, func(g db.ListGRNsForBusinessRow) uuid.UUID { return g.BranchID })
		warehouses = filterSliceByBranch(warehouses, branchID, func(w db.ListWarehousesForBusinessRow) uuid.UUID { return w.BranchID })
		pos = filterSliceByBranch(pos, branchID, func(p db.ListPurchaseOrdersWithDetailsRow) uuid.UUID { return p.BranchID })
		invoices = filterSliceByBranch(invoices, branchID, func(i db.ListPurchaseInvoicesForBusinessRow) uuid.UUID { return i.BranchID })
	}
	lowStock, _ := u.queries.ListLowStockBranchProducts(ctx, db.ListLowStockBranchProductsParams{
		BusinessID: businessID,
		BranchID:   branchID,
	})
	return map[string]any{
		"batches":           batches,
		"grns":              grns,
		"suppliers":         suppliers,
		"approval_logs":     approvalLogs,
		"warehouses":        warehouses,
		"purchase_orders":   pos,
		"purchase_invoices": invoices,
		"low_stock_items":   lowStock,
	}, nil
}

// UpdateGRNRequest defines the payload for editing a DRAFT GRN and optionally approving it.
type UpdateGRNRequest struct {
	SupplierID        uuid.UUID            `json:"supplier_id"`
	BranchID          uuid.UUID            `json:"branch_id"`
	SupplierInvoiceNo string               `json:"supplier_invoice_no"`
	AttachmentName    string               `json:"attachment_name"`
	ApproveNow        bool                 `json:"approve_now"`
	Items             []CreateGRNItemInput `json:"items"`
}

func computeGRNTotal(items []CreateGRNItemInput) (decimal.Decimal, error) {
	if len(items) == 0 {
		return decimal.Zero, errors.New("GRN requires at least one product line")
	}
	totalCost := decimal.Zero
	for _, it := range items {
		if it.ProductID == uuid.Nil || it.QtyReceived.LessThanOrEqual(decimal.Zero) || it.UnitCost.IsNegative() {
			return decimal.Zero, errors.New("invalid GRN product, quantity, or unit cost")
		}
		totalCost = totalCost.Add(it.QtyReceived.Mul(it.UnitCost))
	}
	return totalCost.Round(4), nil
}

func insertGRNLinesTx(ctx context.Context, qtx *db.Queries, businessID, grnID uuid.UUID, items []CreateGRNItemInput) error {
	for i, it := range items {
		var exp pgtype.Date
		if it.ExpiryDate != "" {
			if t, pErr := time.Parse("2006-01-02", it.ExpiryDate); pErr == nil {
				exp = pgtype.Date{Time: t, Valid: true}
			}
		}
		batchNo := strings.TrimSpace(it.BatchNumber)
		if batchNo == "" {
			batchNo = fmt.Sprintf("BATCH-%d-%d", time.Now().UnixNano()%1000000, i+1)
		}
		orderedQty := it.OrderedQty
		if orderedQty.LessThanOrEqual(decimal.Zero) {
			orderedQty = it.QtyReceived
		}
		lineTotal := it.QtyReceived.Mul(it.UnitCost).Round(4)
		if _, err := qtx.InsertGRNItem(ctx, db.InsertGRNItemParams{
			BusinessID:  businessID,
			GrnID:       grnID,
			ProductID:   it.ProductID,
			BatchNumber: batchNo,
			ExpiryDate:  exp,
			OrderedQty:  orderedQty,
			QtyReceived: it.QtyReceived,
			UnitCost:    it.UnitCost,
			LineTotal:   lineTotal,
		}); err != nil {
			return err
		}
	}
	return nil
}

// GetGRNDetails returns the full GRN header (with supplier & branch metadata) and its line items.
func (u *InventoryFIFOUsecase) GetGRNDetails(ctx context.Context, businessID, grnID uuid.UUID) (map[string]any, error) {
	grn, err := u.queries.GetGRNDetail(ctx, db.GetGRNDetailParams{
		BusinessID: businessID,
		ID:         grnID,
	})
	if err != nil {
		return nil, err
	}
	items, err := u.queries.ListGRNItems(ctx, db.ListGRNItemsParams{
		BusinessID: businessID,
		GrnID:      grnID,
	})
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"grn":   grn,
		"items": items,
	}, nil
}

// CreateGRN creates a Goods Received Note and optionally approves it inside an ACID transaction.
func (u *InventoryFIFOUsecase) CreateGRN(ctx context.Context, businessID, branchID, userID uuid.UUID, multiBranch bool, req CreateGRNRequest) (map[string]any, error) {
	totalCost, err := computeGRNTotal(req.Items)
	if err != nil {
		return nil, err
	}
	if req.BranchID != uuid.Nil {
		if !multiBranch && req.BranchID != branchID {
			return nil, errors.New("only Company Owner or SuperAdmin can receive inventory into another branch")
		}
		if _, err := u.queries.GetBranchForBusiness(ctx, db.GetBranchForBusinessParams{
			BusinessID: businessID,
			ID:         req.BranchID,
		}); err != nil {
			return nil, errors.New("selected branch does not belong to this business")
		}
		branchID = req.BranchID
	}

	requireApproval := false
	if u.settings != nil {
		requireApproval = u.settings.GetBool(ctx, SettingsContext{
			BusinessID: businessID,
			BranchID:   &branchID,
		}, "warehouse.grn.require_approval", false)
	}
	effectiveAutoApprove := req.AutoApprove && !requireApproval

	tx, err := u.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := u.queries.WithTx(tx)

	grnNumber := fmt.Sprintf("GRN-%s-%04d", time.Now().Format("20060102"), time.Now().Unix()%10000)
	grn, err := qtx.InsertGRN(ctx, db.InsertGRNParams{
		BusinessID:        businessID,
		BranchID:          branchID,
		PoID:              uuid.NullUUID{},
		SupplierID:        req.SupplierID,
		GrnNumber:         grnNumber,
		SupplierInvoiceNo: req.SupplierInvoiceNo,
		AttachmentName:    req.AttachmentName,
		TotalCost:         totalCost,
		ReceivedBy:        uuid.NullUUID{UUID: userID, Valid: userID != uuid.Nil},
	})
	if err != nil {
		return nil, err
	}

	if err := insertGRNLinesTx(ctx, qtx, businessID, grn.ID, req.Items); err != nil {
		return nil, err
	}

	var approvedJournalID uuid.UUID
	if effectiveAutoApprove {
		approvedJournalID, err = u.approveGRNTx(ctx, qtx, businessID, grn.ID, userID)
		if err != nil {
			return nil, err
		}
	} else {
		_, _ = qtx.InsertWarehouseApprovalLog(ctx, db.InsertWarehouseApprovalLogParams{
			BusinessID:   businessID,
			DocumentType: "GRN",
			DocumentID:   grn.ID,
			Action:       "SUBMITTED_FOR_APPROVAL",
			ActorUserID:  uuid.NullUUID{UUID: userID, Valid: userID != uuid.Nil},
			Notes:        fmt.Sprintf("Submitted %s (require_approval=%t)", grn.GrnNumber, requireApproval),
		})
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	status := grn.Status
	if effectiveAutoApprove {
		status = "APPROVED"
	}
	return map[string]any{
		"grn_id":           grn.ID,
		"grn_number":       grn.GrnNumber,
		"status":           status,
		"require_approval": requireApproval,
		"total_cost":       grn.TotalCost,
		"journal_id":       approvedJournalID,
	}, nil
}

// UpdateDraftGRN updates a DRAFT GRN header and line items, and optionally approves & posts GL inside an ACID transaction.
func (u *InventoryFIFOUsecase) UpdateDraftGRN(ctx context.Context, businessID, grnID, userID uuid.UUID, req UpdateGRNRequest) (map[string]any, error) {
	totalCost, err := computeGRNTotal(req.Items)
	if err != nil {
		return nil, err
	}

	tx, err := u.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := u.queries.WithTx(tx)

	existing, err := qtx.GetGRNForUpdate(ctx, db.GetGRNForUpdateParams{
		BusinessID: businessID,
		ID:         grnID,
	})
	if err != nil {
		return nil, err
	}
	if existing.Status != "DRAFT" {
		return nil, errors.New("only DRAFT GRNs can be edited")
	}

	branchID := existing.BranchID
	if req.BranchID != uuid.Nil {
		branchID = req.BranchID
	}
	supplierID := existing.SupplierID
	if req.SupplierID != uuid.Nil {
		supplierID = req.SupplierID
	}

	updated, err := qtx.UpdateGRNHeader(ctx, db.UpdateGRNHeaderParams{
		BusinessID:        businessID,
		ID:                grnID,
		BranchID:          branchID,
		SupplierID:        supplierID,
		SupplierInvoiceNo: req.SupplierInvoiceNo,
		AttachmentName:    req.AttachmentName,
		TotalCost:         totalCost,
	})
	if err != nil {
		return nil, err
	}

	if err := qtx.DeleteGRNItems(ctx, db.DeleteGRNItemsParams{
		BusinessID: businessID,
		GrnID:      grnID,
	}); err != nil {
		return nil, err
	}

	if err := insertGRNLinesTx(ctx, qtx, businessID, grnID, req.Items); err != nil {
		return nil, err
	}

	_, _ = qtx.InsertWarehouseApprovalLog(ctx, db.InsertWarehouseApprovalLogParams{
		BusinessID:   businessID,
		DocumentType: "GRN",
		DocumentID:   grnID,
		Action:       "DRAFT_UPDATED",
		ActorUserID:  uuid.NullUUID{UUID: userID, Valid: userID != uuid.Nil},
		Notes:        fmt.Sprintf("Updated draft %s (%d lines, total %s)", updated.GrnNumber, len(req.Items), totalCost.StringFixed(2)),
	})

	var approvedJournalID uuid.UUID
	status := updated.Status
	if req.ApproveNow {
		approvedJournalID, err = u.approveGRNTx(ctx, qtx, businessID, grnID, userID)
		if err != nil {
			return nil, err
		}
		status = "APPROVED"
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return map[string]any{
		"grn_id":     updated.ID,
		"grn_number": updated.GrnNumber,
		"status":     status,
		"total_cost": updated.TotalCost,
		"journal_id": approvedJournalID,
	}, nil
}

// ApproveGRN approves a DRAFT GRN, inserts inventory_batches, and posts DR Inventory / CR Accounts Payable.
func (u *InventoryFIFOUsecase) ApproveGRN(ctx context.Context, businessID, grnID, approverID uuid.UUID) (uuid.UUID, error) {
	tx, err := u.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return uuid.Nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := u.queries.WithTx(tx)
	journalID, err := u.approveGRNTx(ctx, qtx, businessID, grnID, approverID)
	if err != nil {
		return uuid.Nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}
	return journalID, nil
}

func (u *InventoryFIFOUsecase) approveGRNTx(ctx context.Context, qtx *db.Queries, businessID, grnID, approverID uuid.UUID) (uuid.UUID, error) {
	grn, err := qtx.GetGRNForUpdate(ctx, db.GetGRNForUpdateParams{
		BusinessID: businessID,
		ID:         grnID,
	})
	if err != nil {
		return uuid.Nil, err
	}
	if grn.Status == "APPROVED" {
		return uuid.Nil, errors.New("GRN is already approved")
	}

	items, err := qtx.ListGRNItems(ctx, db.ListGRNItemsParams{
		BusinessID: businessID,
		GrnID:      grnID,
	})
	if err != nil || len(items) == 0 {
		return uuid.Nil, errors.New("GRN has no line items")
	}

	totalInventoryValue := decimal.Zero
	for _, it := range items {
		batch, err := qtx.InsertInventoryBatch(ctx, db.InsertInventoryBatchParams{
			BusinessID:  businessID,
			BranchID:    grn.BranchID,
			ProductID:   it.ProductID,
			GrnItemID:   uuid.NullUUID{UUID: it.ID, Valid: true},
			BatchNumber: it.BatchNumber,
			ExpiryDate:  it.ExpiryDate,
			UnitCost:    it.UnitCost,
			InitialQty:  it.QtyReceived,
		})
		if err != nil {
			return uuid.Nil, err
		}

		if _, err := qtx.InsertStockMovement(ctx, db.InsertStockMovementParams{
			BusinessID:    businessID,
			BranchID:      grn.BranchID,
			ProductID:     it.ProductID,
			BatchID:       uuid.NullUUID{UUID: batch.ID, Valid: true},
			MovementType:  "IN_GRN",
			QtyDelta:      it.QtyReceived,
			UnitCost:      it.UnitCost,
			ReferenceType: "GRN",
			ReferenceID:   grnID,
			CreatedBy:     uuid.NullUUID{UUID: approverID, Valid: approverID != uuid.Nil},
		}); err != nil {
			return uuid.Nil, err
		}

		totalInventoryValue = totalInventoryValue.Add(it.LineTotal)
	}

	if err := qtx.MarkGRNApproved(ctx, db.MarkGRNApprovedParams{
		BusinessID: businessID,
		ID:         grnID,
		ApprovedBy: uuid.NullUUID{UUID: approverID, Valid: approverID != uuid.Nil},
	}); err != nil {
		return uuid.Nil, err
	}

	// Post Balanced Double-Entry GL: DR 1200 Inventory Asset / CR 2000 Accounts Payable
	invAcct, err := qtx.GetAccountByCode(ctx, db.GetAccountByCodeParams{BusinessID: businessID, Code: "1200"})
	if err != nil {
		return uuid.Nil, err
	}
	apAcct, err := qtx.GetAccountByCode(ctx, db.GetAccountByCodeParams{BusinessID: businessID, Code: "2000"})
	if err != nil {
		return uuid.Nil, err
	}

	today := pgtype.Date{Time: time.Now(), Valid: true}
	var fpNull uuid.NullUUID
	if fp, fpErr := qtx.FindOpenFiscalPeriodForDate(ctx, db.FindOpenFiscalPeriodForDateParams{
		BusinessID: businessID,
		Column2:    today,
	}); fpErr == nil {
		if fp.IsLocked {
			return uuid.Nil, errors.New("current fiscal period is locked")
		}
		fpNull = uuid.NullUUID{UUID: fp.ID, Valid: true}
	}

	je, err := qtx.InsertJournalEntry(ctx, db.InsertJournalEntryParams{
		BusinessID:     businessID,
		BranchID:       uuid.NullUUID{UUID: grn.BranchID, Valid: true},
		FiscalPeriodID: fpNull,
		EntryNumber:    fmt.Sprintf("JE-GRN-%s-%d", grn.GrnNumber, time.Now().UnixNano()%1000),
		SourceType:     "GRN_APPROVAL",
		SourceID:       grnID,
		Description:    fmt.Sprintf("GRN Intake %s (Inv: %s)", grn.GrnNumber, grn.SupplierInvoiceNo),
		EntryDate:      today,
		PostedBy:       uuid.NullUUID{UUID: approverID, Valid: approverID != uuid.Nil},
	})
	if err != nil {
		return uuid.Nil, err
	}

	val := totalInventoryValue.Round(4)
	if _, err := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
		BusinessID:     businessID,
		JournalEntryID: je.ID,
		AccountID:      invAcct.ID,
		Debit:          val,
		Credit:         decimal.Zero,
		Memo:           fmt.Sprintf("FIFO Stock Intake %s", grn.GrnNumber),
	}); err != nil {
		return uuid.Nil, err
	}
	if _, err := qtx.InsertJournalLine(ctx, db.InsertJournalLineParams{
		BusinessID:     businessID,
		JournalEntryID: je.ID,
		AccountID:      apAcct.ID,
		Debit:          decimal.Zero,
		Credit:         val,
		Memo:           fmt.Sprintf("Supplier Payable %s", grn.GrnNumber),
	}); err != nil {
		return uuid.Nil, err
	}

	_, _ = qtx.InsertWarehouseApprovalLog(ctx, db.InsertWarehouseApprovalLogParams{
		BusinessID:   businessID,
		DocumentType: "GRN",
		DocumentID:   grnID,
		Action:       "APPROVED_AND_POSTED",
		ActorUserID:  uuid.NullUUID{UUID: approverID, Valid: approverID != uuid.Nil},
		Notes:        fmt.Sprintf("Approved %s & posted GL journal %s", grn.GrnNumber, je.EntryNumber),
	})

	return je.ID, nil
}

// DepleteFIFOBatches locks active inventory batches FOR UPDATE in FIFO order, depletes requested qty,
// writes stock_movements, and returns exact batch-weighted COGS.
func DepleteFIFOBatches(
	ctx context.Context,
	qtx *db.Queries,
	businessID, branchID, productID, userID, invoiceID uuid.UUID,
	qty decimal.Decimal,
	allowNegative bool,
) (decimal.Decimal, error) {
	batches, err := qtx.LockActiveFIFOBatchesForProduct(ctx, db.LockActiveFIFOBatchesForProductParams{
		BusinessID: businessID,
		BranchID:   branchID,
		ProductID:  productID,
	})
	if err != nil {
		return decimal.Zero, err
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

	consumptions, totalCOGS, err := ComputeFIFODepletion(slices, qty, allowNegative)
	if err != nil {
		return decimal.Zero, err
	}

	for _, c := range consumptions {
		if err := qtx.UpdateBatchRemainingQty(ctx, db.UpdateBatchRemainingQtyParams{
			BusinessID:   businessID,
			RemainingQty: c.NewRemQty,
			ID:           c.BatchID,
		}); err != nil {
			return decimal.Zero, err
		}

		if _, err := qtx.InsertStockMovement(ctx, db.InsertStockMovementParams{
			BusinessID:    businessID,
			BranchID:      branchID,
			ProductID:     productID,
			BatchID:       uuid.NullUUID{UUID: c.BatchID, Valid: true},
			MovementType:  "OUT_SALE",
			QtyDelta:      c.ConsumedQty.Neg(),
			UnitCost:      c.UnitCost,
			ReferenceType: "SALES_INVOICE",
			ReferenceID:   invoiceID,
			CreatedBy:     uuid.NullUUID{UUID: userID, Valid: userID != uuid.Nil},
		}); err != nil {
			return decimal.Zero, err
		}
	}

	return totalCOGS.Round(4), nil
}

// ComputeFIFODepletion is a deterministic pure calculation walking ordered FIFO batches.
func ComputeFIFODepletion(batches []FIFOBatchSlice, requestedQty decimal.Decimal, allowNegative bool) ([]FIFOConsumption, decimal.Decimal, error) {
	if requestedQty.LessThanOrEqual(decimal.Zero) {
		return nil, decimal.Zero, errors.New("requested quantity must be positive")
	}

	needed := requestedQty
	totalCOGS := decimal.Zero
	consumptions := make([]FIFOConsumption, 0, len(batches))

	for _, b := range batches {
		if needed.LessThanOrEqual(decimal.Zero) {
			break
		}
		if b.RemainingQty.LessThanOrEqual(decimal.Zero) {
			continue
		}

		take := needed
		if b.RemainingQty.LessThan(needed) {
			take = b.RemainingQty
		}
		layerCOGS := take.Mul(b.UnitCost)
		totalCOGS = totalCOGS.Add(layerCOGS)
		needed = needed.Sub(take)

		consumptions = append(consumptions, FIFOConsumption{
			BatchID:     b.BatchID,
			BatchNumber: b.BatchNumber,
			ConsumedQty: take,
			NewRemQty:   b.RemainingQty.Sub(take),
			UnitCost:    b.UnitCost,
			LayerCOGS:   layerCOGS,
		})
	}

	if needed.GreaterThan(decimal.Zero) && !allowNegative {
		return nil, decimal.Zero, fmt.Errorf("insufficient FIFO stock: short by %s units", needed.StringFixed(2))
	}

	return consumptions, totalCOGS.Round(4), nil
}

// RestoreFIFOBatches creates a restock batch layer on void or refund.
func RestoreFIFOBatches(
	ctx context.Context,
	qtx *db.Queries,
	businessID, branchID, productID, userID, refID uuid.UUID,
	movementType string,
	qty, totalCOGS decimal.Decimal,
) error {
	unitCost := decimal.Zero
	if qty.GreaterThan(decimal.Zero) {
		unitCost = totalCOGS.Div(qty).Round(4)
	}
	batch, err := qtx.InsertInventoryBatch(ctx, db.InsertInventoryBatchParams{
		BusinessID:  businessID,
		BranchID:    branchID,
		ProductID:   productID,
		GrnItemID:   uuid.NullUUID{},
		BatchNumber: fmt.Sprintf("RET-%d", time.Now().UnixNano()%1000000),
		ExpiryDate:  pgtype.Date{},
		UnitCost:    unitCost,
		InitialQty:  qty,
	})
	if err != nil {
		return err
	}
	_, err = qtx.InsertStockMovement(ctx, db.InsertStockMovementParams{
		BusinessID:    businessID,
		BranchID:      branchID,
		ProductID:     productID,
		BatchID:       uuid.NullUUID{UUID: batch.ID, Valid: true},
		MovementType:  movementType,
		QtyDelta:      qty,
		UnitCost:      unitCost,
		ReferenceType: "SALES_INVOICE",
		ReferenceID:   refID,
		CreatedBy:     uuid.NullUUID{UUID: userID, Valid: userID != uuid.Nil},
	})
	return err
}

// AutoPOResult summarizes an automated Purchase Order and linked Vendor Invoice triggered by minimum stock threshold.
type AutoPOResult struct {
	ProductID      uuid.UUID `json:"product_id"`
	SKU            string    `json:"sku"`
	ProductName    string    `json:"product_name"`
	POID           uuid.UUID `json:"po_id"`
	PONumber       string    `json:"po_number"`
	InvoiceID      uuid.UUID `json:"invoice_id"`
	InvoiceNumber  string    `json:"invoice_number"`
	RemainingQty   string    `json:"remaining_qty"`
	MinThreshold   string    `json:"min_threshold"`
	OrderedQty     string    `json:"ordered_qty"`
	UnitCost       string    `json:"unit_cost"`
	GrandTotal     string    `json:"grand_total"`
	NotificationID uuid.UUID `json:"notification_id"`
}

// CheckAndDraftLowStockPO evaluates remaining stock vs reorder_point (minimum threshold) and creates both
// an Auto-Drafted PO and a linked Supplier Purchase Invoice + persistent System Notification when at or below minimum.
func (u *InventoryFIFOUsecase) CheckAndDraftLowStockPO(ctx context.Context, businessID, branchID, productID uuid.UUID) (string, decimal.Decimal, error) {
	res, rem, err := u.checkAndDraftLowStockDetailed(ctx, businessID, branchID, productID)
	if err != nil || res == nil {
		return "", rem, err
	}
	return res.PONumber, rem, nil
}

func (u *InventoryFIFOUsecase) checkAndDraftLowStockDetailed(ctx context.Context, businessID, branchID, productID uuid.UUID) (*AutoPOResult, decimal.Decimal, error) {
	summary, err := u.queries.GetBranchStockSummary(ctx, db.GetBranchStockSummaryParams{
		BusinessID: businessID,
		BranchID:   branchID,
		ID:         productID,
	})
	if err != nil {
		return nil, decimal.Zero, err
	}
	if summary.TotalRemaining.GreaterThan(summary.ReorderPoint) {
		return nil, summary.TotalRemaining, nil
	}

	autoPOEnabled := true
	if u.settings != nil {
		sc := SettingsContext{BusinessID: businessID, BranchID: &branchID, ProductID: &productID}
		autoPOEnabled = u.settings.GetBool(ctx, sc, "inventory.auto_po_on_low_stock", true)
	}
	if !autoPOEnabled {
		return nil, summary.TotalRemaining, nil
	}

	hasOpen, err := u.queries.HasOpenPOForProductBranch(ctx, db.HasOpenPOForProductBranchParams{
		BusinessID: businessID,
		BranchID:   branchID,
		ProductID:  productID,
	})
	if err == nil && hasOpen {
		return nil, summary.TotalRemaining, nil
	}

	supplierID, err := u.queries.GetPreferredSupplierForProduct(ctx, db.GetPreferredSupplierForProductParams{
		BusinessID: businessID,
		ProductID:  productID,
	})
	if err != nil || supplierID == uuid.Nil {
		defSup, defErr := u.queries.GetDefaultSupplierForBusiness(ctx, businessID)
		if defErr != nil {
			return nil, summary.TotalRemaining, defErr
		}
		supplierID = defSup.ID
	}

	paymentTermsDays := int32(30)
	if defSup, dErr := u.queries.GetDefaultSupplierForBusiness(ctx, businessID); dErr == nil && defSup.ID == supplierID && defSup.PaymentTermsDays > 0 {
		paymentTermsDays = defSup.PaymentTermsDays
	}

	// Calculate order quantity strictly from product reorder details and minimum threshold
	orderQty := summary.ReorderQty
	if orderQty.LessThanOrEqual(decimal.Zero) {
		orderQty = decimal.NewFromInt(25)
	}
	minSafeTarget := summary.ReorderPoint.Add(orderQty)
	deficitCoverage := minSafeTarget.Sub(summary.TotalRemaining)
	if deficitCoverage.GreaterThan(orderQty) {
		orderQty = deficitCoverage.Ceil()
	}

	unitCost := summary.PreferredUnitCost
	if unitCost.LessThanOrEqual(decimal.Zero) {
		unitCost = summary.BasePrice.Mul(decimal.NewFromFloat(0.65)).Round(4)
	}
	if unitCost.LessThanOrEqual(decimal.Zero) {
		unitCost = decimal.NewFromInt(25)
	}

	subtotal := orderQty.Mul(unitCost).Round(4)
	taxTotal := subtotal.Mul(decimal.NewFromFloat(0.08)).Round(4)
	grandTotal := subtotal.Add(taxTotal).Round(4)

	cleanSKU := strings.ReplaceAll(strings.ToUpper(summary.Sku), " ", "")
	if len(cleanSKU) > 8 {
		cleanSKU = cleanSKU[:8]
	}
	suffix := time.Now().UnixNano() % 100000
	poNum := fmt.Sprintf("PO-AUTO-%s-%05d", cleanSKU, suffix)
	invNum := fmt.Sprintf("PINV-AUTO-%s-%05d", cleanSKU, suffix)

	poNotes := fmt.Sprintf(
		"Auto-PO triggered: %s stock %s <= minimum %s; replenishing %s @ $%s/unit (Supplier Invoice %s)",
		summary.ProductName,
		summary.TotalRemaining.StringFixed(0),
		summary.ReorderPoint.StringFixed(0),
		orderQty.StringFixed(0),
		unitCost.StringFixed(2),
		invNum,
	)

	po, err := u.queries.InsertDraftPO(ctx, db.InsertDraftPOParams{
		BusinessID:    businessID,
		BranchID:      branchID,
		SupplierID:    supplierID,
		PoNumber:      poNum,
		TotalAmount:   grandTotal,
		AutoGenerated: true,
		Notes:         poNotes,
	})
	if err != nil {
		return nil, summary.TotalRemaining, err
	}

	_ = u.queries.InsertPOItem(ctx, db.InsertPOItemParams{
		BusinessID:        businessID,
		PoID:              po.ID,
		ProductID:         productID,
		OrderedQty:        orderQty,
		UnitCost:          unitCost,
		MinStockThreshold: summary.ReorderPoint,
		StockAtOrder:      summary.TotalRemaining,
	})

	invNotes := fmt.Sprintf(
		"Auto-generated supplier invoice for %s (%s). Min threshold: %s, On-hand: %s, Order Qty: %s @ $%s",
		summary.ProductName,
		po.PoNumber,
		summary.ReorderPoint.StringFixed(0),
		summary.TotalRemaining.StringFixed(0),
		orderQty.StringFixed(0),
		unitCost.StringFixed(2),
	)
	inv, err := u.queries.InsertPurchaseInvoice(ctx, db.InsertPurchaseInvoiceParams{
		BusinessID:    businessID,
		BranchID:      branchID,
		PoID:          uuid.NullUUID{UUID: po.ID, Valid: true},
		SupplierID:    supplierID,
		InvoiceNumber: invNum,
		Subtotal:      subtotal,
		TaxTotal:      taxTotal,
		GrandTotal:    grandTotal,
		Column9:       paymentTermsDays,
		AutoGenerated: true,
		Notes:         invNotes,
	})
	if err != nil {
		return nil, summary.TotalRemaining, err
	}

	notifSeverity := "warning"
	if summary.TotalRemaining.LessThanOrEqual(decimal.Zero) {
		notifSeverity = "critical"
	}
	notifTitle := fmt.Sprintf("Auto-PO %s & Invoice %s Created", po.PoNumber, inv.InvoiceNumber)
	notifBody := fmt.Sprintf(
		"%s (%s) reached %s units (min %s). Auto-drafted PO %s & Vendor Invoice %s for %s units ($%s).",
		summary.ProductName,
		summary.Sku,
		summary.TotalRemaining.StringFixed(0),
		summary.ReorderPoint.StringFixed(0),
		po.PoNumber,
		inv.InvoiceNumber,
		orderQty.StringFixed(0),
		grandTotal.StringFixed(2),
	)

	notif, _ := u.queries.InsertSystemNotification(ctx, db.InsertSystemNotificationParams{
		BusinessID:    businessID,
		BranchID:      uuid.NullUUID{UUID: branchID, Valid: true},
		Category:      "AUTO_PO",
		Severity:      notifSeverity,
		Title:         notifTitle,
		Body:          notifBody,
		ReferenceType: "PURCHASE_INVOICE",
		ReferenceID:   uuid.NullUUID{UUID: inv.ID, Valid: true},
	})

	res := &AutoPOResult{
		ProductID:      productID,
		SKU:            summary.Sku,
		ProductName:    summary.ProductName,
		POID:           po.ID,
		PONumber:       po.PoNumber,
		InvoiceID:      inv.ID,
		InvoiceNumber:  inv.InvoiceNumber,
		RemainingQty:   summary.TotalRemaining.StringFixed(0),
		MinThreshold:   summary.ReorderPoint.StringFixed(0),
		OrderedQty:     orderQty.StringFixed(0),
		UnitCost:       unitCost.StringFixed(2),
		GrandTotal:     grandTotal.StringFixed(2),
		NotificationID: notif.ID,
	}

	if u.hub != nil {
		u.hub.BroadcastTenant(businessID, "LOW_STOCK_ALERT", map[string]any{
			"po_number":      po.PoNumber,
			"invoice_number": inv.InvoiceNumber,
			"product_id":     productID,
			"product_name":   summary.ProductName,
			"sku":            summary.Sku,
			"remaining_qty":  summary.TotalRemaining.StringFixed(0),
			"min_threshold":  summary.ReorderPoint.StringFixed(0),
			"ordered_qty":    orderQty.StringFixed(0),
			"grand_total":    grandTotal.StringFixed(2),
		})
		u.hub.BroadcastTenant(businessID, "NOTIFICATION_CREATED", map[string]any{
			"notification_id": notif.ID,
			"title":           notifTitle,
			"body":            notifBody,
			"category":        "AUTO_PO",
			"severity":        notifSeverity,
		})
	}

	return res, summary.TotalRemaining, nil
}

// ScanAndAutoDraftLowStockPOs scans all active SKUs for a branch against minimum thresholds and creates
// missing Auto-POs, linked Purchase Invoices, and system notifications in one pass.
func (u *InventoryFIFOUsecase) ScanAndAutoDraftLowStockPOs(ctx context.Context, businessID, branchID uuid.UUID) (map[string]any, error) {
	lowItems, err := u.queries.ListLowStockBranchProducts(ctx, db.ListLowStockBranchProductsParams{
		BusinessID: businessID,
		BranchID:   branchID,
	})
	if err != nil {
		return nil, err
	}
	created := make([]*AutoPOResult, 0)
	for _, item := range lowItems {
		res, _, cErr := u.checkAndDraftLowStockDetailed(ctx, businessID, branchID, item.ProductID)
		if cErr == nil && res != nil {
			created = append(created, res)
		}
	}
	return map[string]any{
		"scanned_low_count": len(lowItems),
		"created_count":     len(created),
		"created_orders":    created,
	}, nil
}

// UpdatePurchaseInvoiceStatus marks an auto-generated or vendor purchase invoice as ISSUED, PAID, or CANCELLED.
func (u *InventoryFIFOUsecase) UpdatePurchaseInvoiceStatus(ctx context.Context, businessID, invoiceID uuid.UUID, status string) (db.UpdatePurchaseInvoiceStatusRow, error) {
	st := strings.ToUpper(strings.TrimSpace(status))
	switch st {
	case "DRAFT", "ISSUED", "PAID", "CANCELLED":
	default:
		return db.UpdatePurchaseInvoiceStatusRow{}, errors.New("invalid purchase invoice status")
	}
	return u.queries.UpdatePurchaseInvoiceStatus(ctx, db.UpdatePurchaseInvoiceStatusParams{
		BusinessID: businessID,
		ID:         invoiceID,
		Status:     st,
	})
}

