package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/enterprise-pos/backend/internal/infrastructure/ws"
	"github.com/enterprise-pos/backend/internal/repository/sqlc/db"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
)

// PrintTemplateDTO exposes a clean JSON payload for Receipt & Invoice Studio templates.
type PrintTemplateDTO struct {
	ID             uuid.UUID       `json:"id"`
	BusinessID     uuid.UUID       `json:"business_id"`
	BranchID       *uuid.UUID      `json:"branch_id,omitempty"`
	Name           string          `json:"name"`
	DocumentType   string          `json:"document_type"`
	PaperWidthMm   decimal.Decimal `json:"paper_width_mm"`
	PaperHeightMm  decimal.Decimal `json:"paper_height_mm"`
	SnapGridMm     decimal.Decimal `json:"snap_grid_mm"`
	IsDefault      bool            `json:"is_default"`
	CanvasSchema   json.RawMessage `json:"canvas_schema"`
	PrinterProfile json.RawMessage `json:"printer_profile"`
	CreatedBy      *uuid.UUID      `json:"created_by,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

// SavePrintTemplateRequest validates create/update payloads from the Canva-style Studio.
type SavePrintTemplateRequest struct {
	BranchID       *uuid.UUID      `json:"branch_id,omitempty"`
	Name           string          `json:"name"`
	DocumentType   string          `json:"document_type"`
	PaperWidthMm   decimal.Decimal `json:"paper_width_mm"`
	PaperHeightMm  decimal.Decimal `json:"paper_height_mm"`
	SnapGridMm     decimal.Decimal `json:"snap_grid_mm"`
	IsDefault      bool            `json:"is_default"`
	CanvasSchema   json.RawMessage `json:"canvas_schema"`
	PrinterProfile json.RawMessage `json:"printer_profile"`
}

// PrintStudioUsecase manages tenant-isolated print templates, default flags, and hardware profiles.
type PrintStudioUsecase struct {
	pool    *pgxpool.Pool
	queries *db.Queries
	hub     *ws.Hub
}

// NewPrintStudioUsecase constructs a PrintStudioUsecase instance.
func NewPrintStudioUsecase(pool *pgxpool.Pool, queries *db.Queries, hub *ws.Hub) *PrintStudioUsecase {
	return &PrintStudioUsecase{
		pool:    pool,
		queries: queries,
		hub:     hub,
	}
}

func mapPrintTemplateRow(row db.PrintTemplate) PrintTemplateDTO {
	var branchID *uuid.UUID
	if row.BranchID.Valid {
		v := row.BranchID.UUID
		branchID = &v
	}
	var createdBy *uuid.UUID
	if row.CreatedBy.Valid {
		v := row.CreatedBy.UUID
		createdBy = &v
	}
	canvas := json.RawMessage(`{"version":1,"snap_to_grid":true,"show_guides":true,"blocks":[]}`)
	if len(row.CanvasSchema) > 0 && json.Valid(row.CanvasSchema) {
		canvas = json.RawMessage(row.CanvasSchema)
	}
	profile := json.RawMessage(`{}`)
	if len(row.PrinterProfile) > 0 && json.Valid(row.PrinterProfile) {
		profile = json.RawMessage(row.PrinterProfile)
	}
	return PrintTemplateDTO{
		ID:             row.ID,
		BusinessID:     row.BusinessID,
		BranchID:       branchID,
		Name:           row.Name,
		DocumentType:   row.DocumentType,
		PaperWidthMm:   row.PaperWidthMm,
		PaperHeightMm:  row.PaperHeightMm,
		SnapGridMm:     row.SnapGridMm,
		IsDefault:      row.IsDefault,
		CanvasSchema:   canvas,
		PrinterProfile: profile,
		CreatedBy:      createdBy,
		CreatedAt:      row.CreatedAt.Time,
		UpdatedAt:      row.UpdatedAt.Time,
	}
}

func normalizePrintTemplateInput(req SavePrintTemplateRequest) (
	name string,
	docType string,
	widthMm decimal.Decimal,
	heightMm decimal.Decimal,
	snapMm decimal.Decimal,
	canvasBytes []byte,
	profileBytes []byte,
	err error,
) {
	name = strings.TrimSpace(req.Name)
	if name == "" {
		return "", "", decimal.Zero, decimal.Zero, decimal.Zero, nil, nil, errors.New("template name is required")
	}

	docType = strings.ToUpper(strings.TrimSpace(req.DocumentType))
	switch docType {
	case "A4_INVOICE", "THERMAL_80MM", "THERMAL_58MM":
	default:
		return "", "", decimal.Zero, decimal.Zero, decimal.Zero, nil, nil, errors.New("document_type must be A4_INVOICE, THERMAL_80MM, or THERMAL_58MM")
	}

	widthMm = req.PaperWidthMm
	heightMm = req.PaperHeightMm
	if !widthMm.IsPositive() {
		switch docType {
		case "A4_INVOICE":
			widthMm = decimal.NewFromInt(210)
		case "THERMAL_80MM":
			widthMm = decimal.NewFromInt(80)
		case "THERMAL_58MM":
			widthMm = decimal.NewFromInt(58)
		}
	}
	if !heightMm.IsPositive() {
		switch docType {
		case "A4_INVOICE":
			heightMm = decimal.NewFromInt(297)
		case "THERMAL_80MM":
			heightMm = decimal.NewFromInt(210)
		case "THERMAL_58MM":
			heightMm = decimal.NewFromInt(190)
		}
	}

	snapMm = req.SnapGridMm
	if snapMm.LessThan(decimal.NewFromInt(1)) || snapMm.GreaterThan(decimal.NewFromInt(20)) {
		if docType == "A4_INVOICE" {
			snapMm = decimal.NewFromInt(5)
		} else {
			snapMm = decimal.NewFromInt(2)
		}
	}

	if len(req.CanvasSchema) == 0 || !json.Valid(req.CanvasSchema) {
		return "", "", decimal.Zero, decimal.Zero, decimal.Zero, nil, nil, errors.New("canvas_schema must be valid JSON")
	}
	var schemaCheck map[string]any
	if uErr := json.Unmarshal(req.CanvasSchema, &schemaCheck); uErr != nil {
		return "", "", decimal.Zero, decimal.Zero, decimal.Zero, nil, nil, errors.New("canvas_schema must be a JSON object")
	}
	canvasBytes, _ = json.Marshal(schemaCheck)

	profileBytes = []byte(`{}`)
	if len(req.PrinterProfile) > 0 && json.Valid(req.PrinterProfile) {
		var profileCheck map[string]any
		if uErr := json.Unmarshal(req.PrinterProfile, &profileCheck); uErr == nil {
			profileBytes, _ = json.Marshal(profileCheck)
		}
	}
	return name, docType, widthMm, heightMm, snapMm, canvasBytes, profileBytes, nil
}

// ListTemplates returns all saved print templates scoped strictly by business_id.
func (u *PrintStudioUsecase) ListTemplates(ctx context.Context, businessID uuid.UUID) ([]PrintTemplateDTO, error) {
	rows, err := u.queries.ListPrintTemplates(ctx, businessID)
	if err != nil {
		return nil, err
	}
	out := make([]PrintTemplateDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, mapPrintTemplateRow(r))
	}
	return out, nil
}

// CreateTemplate persists a new Canva-style print template and optionally marks it default.
func (u *PrintStudioUsecase) CreateTemplate(
	ctx context.Context,
	businessID, userID uuid.UUID,
	req SavePrintTemplateRequest,
) (*PrintTemplateDTO, error) {
	name, docType, widthMm, heightMm, snapMm, canvasBytes, profileBytes, err := normalizePrintTemplateInput(req)
	if err != nil {
		return nil, err
	}

	tx, err := u.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := db.New(tx)

	if req.IsDefault {
		if err := qtx.ClearDefaultPrintTemplateForType(ctx, db.ClearDefaultPrintTemplateForTypeParams{
			BusinessID:   businessID,
			DocumentType: docType,
		}); err != nil {
			return nil, err
		}
	}

	var branchNull uuid.NullUUID
	if req.BranchID != nil && *req.BranchID != uuid.Nil {
		branchNull = uuid.NullUUID{UUID: *req.BranchID, Valid: true}
	}
	var userNull uuid.NullUUID
	if userID != uuid.Nil {
		userNull = uuid.NullUUID{UUID: userID, Valid: true}
	}

	created, err := qtx.CreatePrintTemplate(ctx, db.CreatePrintTemplateParams{
		BusinessID:     businessID,
		BranchID:       branchNull,
		Name:           name,
		DocumentType:   docType,
		PaperWidthMm:   widthMm,
		PaperHeightMm:  heightMm,
		SnapGridMm:     snapMm,
		IsDefault:      req.IsDefault,
		CanvasSchema:   canvasBytes,
		PrinterProfile: profileBytes,
		CreatedBy:      userNull,
	})
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	dto := mapPrintTemplateRow(created)
	u.broadcastUpdate(businessID, "CREATED", &dto)
	return &dto, nil
}

// UpdateTemplate saves updated coordinates, styling, variables, and printer hardware profile.
func (u *PrintStudioUsecase) UpdateTemplate(
	ctx context.Context,
	businessID, templateID uuid.UUID,
	req SavePrintTemplateRequest,
) (*PrintTemplateDTO, error) {
	name, docType, widthMm, heightMm, snapMm, canvasBytes, profileBytes, err := normalizePrintTemplateInput(req)
	if err != nil {
		return nil, err
	}

	tx, err := u.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := db.New(tx)

	existing, err := qtx.GetPrintTemplateByID(ctx, db.GetPrintTemplateByIDParams{
		BusinessID: businessID,
		ID:         templateID,
	})
	if err != nil {
		return nil, errors.New("print template not found")
	}

	if req.IsDefault {
		if err := qtx.ClearDefaultPrintTemplateForType(ctx, db.ClearDefaultPrintTemplateForTypeParams{
			BusinessID:   businessID,
			DocumentType: docType,
		}); err != nil {
			return nil, err
		}
	}

	var branchNull uuid.NullUUID
	if req.BranchID != nil && *req.BranchID != uuid.Nil {
		branchNull = uuid.NullUUID{UUID: *req.BranchID, Valid: true}
	} else {
		branchNull = existing.BranchID
	}

	updated, err := qtx.UpdatePrintTemplate(ctx, db.UpdatePrintTemplateParams{
		BusinessID:     businessID,
		ID:             templateID,
		BranchID:       branchNull,
		Name:           name,
		DocumentType:   docType,
		PaperWidthMm:   widthMm,
		PaperHeightMm:  heightMm,
		SnapGridMm:     snapMm,
		IsDefault:      req.IsDefault,
		CanvasSchema:   canvasBytes,
		PrinterProfile: profileBytes,
	})
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	dto := mapPrintTemplateRow(updated)
	u.broadcastUpdate(businessID, "UPDATED", &dto)
	return &dto, nil
}

// SetDefaultTemplate atomically promotes a template as the active default for its document_type.
func (u *PrintStudioUsecase) SetDefaultTemplate(
	ctx context.Context,
	businessID, templateID uuid.UUID,
) (*PrintTemplateDTO, error) {
	tx, err := u.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	qtx := db.New(tx)

	existing, err := qtx.GetPrintTemplateByID(ctx, db.GetPrintTemplateByIDParams{
		BusinessID: businessID,
		ID:         templateID,
	})
	if err != nil {
		return nil, errors.New("print template not found")
	}

	if err := qtx.ClearDefaultPrintTemplateForType(ctx, db.ClearDefaultPrintTemplateForTypeParams{
		BusinessID:   businessID,
		DocumentType: existing.DocumentType,
	}); err != nil {
		return nil, err
	}

	updated, err := qtx.MarkPrintTemplateDefault(ctx, db.MarkPrintTemplateDefaultParams{
		BusinessID: businessID,
		ID:         templateID,
	})
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	dto := mapPrintTemplateRow(updated)
	u.broadcastUpdate(businessID, "DEFAULT_CHANGED", &dto)
	return &dto, nil
}

// DeleteTemplate removes a print template owned by business_id.
func (u *PrintStudioUsecase) DeleteTemplate(ctx context.Context, businessID, templateID uuid.UUID) error {
	rowsAffected, err := u.queries.DeletePrintTemplate(ctx, db.DeletePrintTemplateParams{
		BusinessID: businessID,
		ID:         templateID,
	})
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return errors.New("print template not found")
	}
	u.broadcastUpdate(businessID, "DELETED", map[string]any{"id": templateID})
	return nil
}

func (u *PrintStudioUsecase) broadcastUpdate(businessID uuid.UUID, action string, template any) {
	if u.hub == nil {
		return
	}
	u.hub.BroadcastTenant(businessID, "PRINT_TEMPLATE_UPDATED", map[string]any{
		"action":   action,
		"template": template,
	})
}
