package usecase

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/enterprise-pos/backend/internal/domain"
	"github.com/enterprise-pos/backend/internal/repository/sqlc/db"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BranchTerminalUsecase manages branch and POS terminal provisioning strictly inside a tenant DB.
type BranchTerminalUsecase struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

// NewBranchTerminalUsecase constructs a BranchTerminalUsecase bound to one company database.
func NewBranchTerminalUsecase(pool *pgxpool.Pool, queries *db.Queries) *BranchTerminalUsecase {
	return &BranchTerminalUsecase{pool: pool, queries: queries}
}

// SaveBranchRequest validates branch creation and editing payloads for Company Owners / SuperAdmins.
type SaveBranchRequest struct {
	Code                  string `json:"code"`
	Name                  string `json:"name"`
	CountryCode           string `json:"country_code"`
	CountryName           string `json:"country_name"`
	City                  string `json:"city"`
	Address               string `json:"address"`
	IsWarehouse           bool   `json:"is_warehouse"`
	IsActive              bool   `json:"is_active"`
	CreateDefaultTerminal *bool  `json:"create_default_terminal,omitempty"`
	InitialTerminalCode   string `json:"initial_terminal_code,omitempty"`
	InitialTerminalName   string `json:"initial_terminal_name,omitempty"`
}

// SaveTerminalRequest validates creating or editing a POS register/terminal attached to a branch.
type SaveTerminalRequest struct {
	BranchID       uuid.UUID `json:"branch_id"`
	Code           string    `json:"code"`
	Name           string    `json:"name"`
	HardwareSerial string    `json:"hardware_serial"`
	IsActive       bool      `json:"is_active"`
}

// ValidateUserBranchAssignment enforces that ONLY SuperAdmin and BusinessOwner can hold multi-branch (NULL) access.
// All branch-level staff (Cashier, BranchManager, Accountant, InventoryController, custom roles) must be pinned to 1 branch.
func ValidateUserBranchAssignment(roleCode string, branchID *uuid.UUID) error {
	if IsMultiBranchRole(roleCode) {
		return nil
	}
	if branchID == nil || *branchID == uuid.Nil {
		return errors.New("branch assignment is required: only BusinessOwner and SuperAdmin can access multiple branches")
	}
	return nil
}

// ResolveScopedBranchID clamps requested branch scope to tc.BranchID unless the role allows multi-branch access.
func ResolveScopedBranchID(tc domain.TenantContext, requestedBranchID uuid.UUID) (uuid.UUID, error) {
	if IsMultiBranchRole(tc.RoleCode) {
		return requestedBranchID, nil
	}
	if requestedBranchID != uuid.Nil && requestedBranchID != tc.BranchID {
		return tc.BranchID, errors.New("only Company Owner or SuperAdmin can access multiple branches")
	}
	return tc.BranchID, nil
}

// NormalizeBranchInput sanitizes and validates branch creation/update inputs.
func NormalizeBranchInput(req SaveBranchRequest) (SaveBranchRequest, error) {
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return req, errors.New("branch name is required")
	}
	code := strings.ToUpper(strings.TrimSpace(req.Code))
	code = strings.ReplaceAll(code, " ", "-")
	if code == "" {
		// Derive a short unique-friendly code slug from name when omitted.
		var b strings.Builder
		for _, r := range strings.ToUpper(req.Name) {
			if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
				b.WriteRune(r)
				if b.Len() >= 6 {
					break
				}
			}
		}
		if b.Len() == 0 {
			code = "BR-01"
		} else {
			code = b.String()
		}
	}
	req.Code = code

	cc := strings.ToUpper(strings.TrimSpace(req.CountryCode))
	if cc == "" {
		cc = "LK"
	}
	if len(cc) > 3 {
		cc = cc[:3]
	}
	req.CountryCode = cc

	cn := strings.TrimSpace(req.CountryName)
	if cn == "" {
		switch cc {
		case "LK":
			cn = "Sri Lanka"
		case "US":
			cn = "USA"
		case "UK", "GB":
			cn = "United Kingdom"
		case "AU":
			cn = "Australia"
		case "KR":
			cn = "Korea"
		case "SE":
			cn = "Sweden"
		default:
			cn = cc
		}
	}
	req.CountryName = cn
	req.City = strings.TrimSpace(req.City)
	req.Address = strings.TrimSpace(req.Address)
	req.InitialTerminalCode = strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(req.InitialTerminalCode), " ", "-"))
	req.InitialTerminalName = strings.TrimSpace(req.InitialTerminalName)
	return req, nil
}

// NormalizeTerminalInput sanitizes and validates terminal register inputs.
func NormalizeTerminalInput(req SaveTerminalRequest) (SaveTerminalRequest, error) {
	if req.BranchID == uuid.Nil {
		return req, errors.New("assigned branch is required for a terminal")
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return req, errors.New("terminal name is required")
	}
	req.Code = strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(req.Code), " ", "-"))
	if req.Code == "" {
		return req, errors.New("terminal code is required (e.g., KND-POS-01)")
	}
	req.HardwareSerial = strings.TrimSpace(req.HardwareSerial)
	return req, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// ListBranchesManagement returns branches for the active business with terminal, warehouse, and staff stats.
// Multi-branch roles receive all business branches; single-branch roles only see their assigned branch.
func (u *BranchTerminalUsecase) ListBranchesManagement(ctx context.Context, tc domain.TenantContext) ([]db.ListBranchesWithStatsForBusinessRow, error) {
	filterBranch := uuid.Nil
	if !IsMultiBranchRole(tc.RoleCode) {
		filterBranch = tc.BranchID
	}
	return u.queries.ListBranchesWithStatsForBusiness(ctx, db.ListBranchesWithStatsForBusinessParams{
		BusinessID: tc.BusinessID,
		Column2:    filterBranch,
	})
}

// CreateBranch atomically provisions a new branch, its stock warehouse, and an optional starter POS terminal.
func (u *BranchTerminalUsecase) CreateBranch(ctx context.Context, tc domain.TenantContext, req SaveBranchRequest) (map[string]any, error) {
	if !IsMultiBranchRole(tc.RoleCode) {
		return nil, errors.New("only Company Owner or SuperAdmin can create branches")
	}
	clean, err := NormalizeBranchInput(req)
	if err != nil {
		return nil, err
	}
	createDefaultTerminal := true
	if req.CreateDefaultTerminal != nil {
		createDefaultTerminal = *req.CreateDefaultTerminal
	}

	tx, err := u.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := u.queries.WithTx(tx)

	branch, err := qtx.CreateBranchRecord(ctx, db.CreateBranchRecordParams{
		BusinessID:  tc.BusinessID,
		Code:        clean.Code,
		Name:        clean.Name,
		CountryCode: clean.CountryCode,
		CountryName: clean.CountryName,
		City:        clean.City,
		Address:     clean.Address,
		IsWarehouse: clean.IsWarehouse,
		IsActive:    true,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return nil, fmt.Errorf("branch code %q already exists in this company", clean.Code)
		}
		return nil, err
	}

	whCode := clean.Code + "-WH"
	wh, err := qtx.InsertWarehouseForBranch(ctx, db.InsertWarehouseForBranchParams{
		BusinessID: tc.BusinessID,
		BranchID:   branch.ID,
		Code:       whCode,
		Name:       clean.Name + " Warehouse",
		IsActive:   true,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return nil, fmt.Errorf("warehouse code %q already exists in this company", whCode)
		}
		return nil, err
	}

	var terminalPtr *db.Terminal
	if createDefaultTerminal {
		termCode := clean.InitialTerminalCode
		if termCode == "" {
			termCode = clean.Code + "-POS01"
		}
		termName := clean.InitialTerminalName
		if termName == "" {
			termName = clean.Name + " POS #01"
		}
		hwSerial := fmt.Sprintf("ZPRO-%s-%s", clean.Code, strings.ToUpper(branch.ID.String()[:4]))
		tm, tErr := qtx.CreateTerminalRecord(ctx, db.CreateTerminalRecordParams{
			BusinessID:     tc.BusinessID,
			BranchID:       branch.ID,
			Code:           termCode,
			Name:           termName,
			HardwareSerial: hwSerial,
			IsActive:       true,
		})
		if tErr != nil {
			if isUniqueViolation(tErr) {
				return nil, fmt.Errorf("terminal code %q already exists in this company", termCode)
			}
			return nil, tErr
		}
		terminalPtr = &tm
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return map[string]any{
		"branch":    branch,
		"warehouse": wh,
		"terminal":  terminalPtr,
	}, nil
}

// UpdateBranch updates an existing branch and ensures a linked warehouse row exists.
func (u *BranchTerminalUsecase) UpdateBranch(ctx context.Context, tc domain.TenantContext, branchID uuid.UUID, req SaveBranchRequest) (db.Branch, error) {
	if !IsMultiBranchRole(tc.RoleCode) {
		return db.Branch{}, errors.New("only Company Owner or SuperAdmin can update branches")
	}
	clean, err := NormalizeBranchInput(req)
	if err != nil {
		return db.Branch{}, err
	}

	existing, err := u.queries.GetBranchForBusiness(ctx, db.GetBranchForBusinessParams{
		BusinessID: tc.BusinessID,
		ID:         branchID,
	})
	if err != nil {
		return db.Branch{}, errors.New("branch not found in active company")
	}

	if existing.IsActive && !req.IsActive {
		activeCnt, cErr := u.queries.CountActiveBranchesForBusiness(ctx, tc.BusinessID)
		if cErr == nil && activeCnt <= 1 {
			return db.Branch{}, errors.New("cannot deactivate the last active branch of the company")
		}
	}

	tx, err := u.pool.Begin(ctx)
	if err != nil {
		return db.Branch{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := u.queries.WithTx(tx)

	updated, err := qtx.UpdateBranchRecord(ctx, db.UpdateBranchRecordParams{
		BusinessID:  tc.BusinessID,
		ID:          branchID,
		Code:        clean.Code,
		Name:        clean.Name,
		CountryCode: clean.CountryCode,
		CountryName: clean.CountryName,
		City:        clean.City,
		Address:     clean.Address,
		IsWarehouse: clean.IsWarehouse,
		IsActive:    req.IsActive,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return db.Branch{}, fmt.Errorf("branch code %q already exists in this company", clean.Code)
		}
		return db.Branch{}, err
	}

	if _, whErr := qtx.GetWarehouseByBranch(ctx, db.GetWarehouseByBranchParams{
		BusinessID: tc.BusinessID,
		BranchID:   branchID,
	}); errors.Is(whErr, pgx.ErrNoRows) {
		_, _ = qtx.InsertWarehouseForBranch(ctx, db.InsertWarehouseForBranchParams{
			BusinessID: tc.BusinessID,
			BranchID:   branchID,
			Code:       clean.Code + "-WH",
			Name:       clean.Name + " Warehouse",
			IsActive:   true,
		})
	}

	if err := tx.Commit(ctx); err != nil {
		return db.Branch{}, err
	}
	return updated, nil
}

// ListTerminalsManagement lists POS terminals with branch details, strictly clamped for single-branch roles.
func (u *BranchTerminalUsecase) ListTerminalsManagement(ctx context.Context, tc domain.TenantContext, requestedBranchID uuid.UUID) ([]db.ListTerminalsWithBranchForBusinessRow, error) {
	filterBranch := requestedBranchID
	if !IsMultiBranchRole(tc.RoleCode) {
		filterBranch = tc.BranchID
	}
	return u.queries.ListTerminalsWithBranchForBusiness(ctx, db.ListTerminalsWithBranchForBusinessParams{
		BusinessID: tc.BusinessID,
		Column2:    filterBranch,
	})
}

// CreateTerminal creates a POS register terminal attached to a tenant branch.
func (u *BranchTerminalUsecase) CreateTerminal(ctx context.Context, tc domain.TenantContext, req SaveTerminalRequest) (db.Terminal, error) {
	if !IsMultiBranchRole(tc.RoleCode) {
		return db.Terminal{}, errors.New("only Company Owner or SuperAdmin can create POS terminals")
	}
	clean, err := NormalizeTerminalInput(req)
	if err != nil {
		return db.Terminal{}, err
	}
	br, err := u.queries.GetBranchForBusiness(ctx, db.GetBranchForBusinessParams{
		BusinessID: tc.BusinessID,
		ID:         clean.BranchID,
	})
	if err != nil {
		return db.Terminal{}, errors.New("selected branch does not belong to this company")
	}
	hw := clean.HardwareSerial
	if hw == "" {
		hw = fmt.Sprintf("ZPRO-%s-%s", br.Code, clean.Code)
	}
	tm, err := u.queries.CreateTerminalRecord(ctx, db.CreateTerminalRecordParams{
		BusinessID:     tc.BusinessID,
		BranchID:       clean.BranchID,
		Code:           clean.Code,
		Name:           clean.Name,
		HardwareSerial: hw,
		IsActive:       true,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return db.Terminal{}, fmt.Errorf("terminal code %q already exists in this company", clean.Code)
		}
		return db.Terminal{}, err
	}
	return tm, nil
}

// UpdateTerminal updates a POS register terminal's branch, code, name, hardware serial, or active status.
func (u *BranchTerminalUsecase) UpdateTerminal(ctx context.Context, tc domain.TenantContext, terminalID uuid.UUID, req SaveTerminalRequest) (db.Terminal, error) {
	if !IsMultiBranchRole(tc.RoleCode) {
		return db.Terminal{}, errors.New("only Company Owner or SuperAdmin can update POS terminals")
	}
	existing, err := u.queries.GetTerminalForBusiness(ctx, db.GetTerminalForBusinessParams{
		BusinessID: tc.BusinessID,
		ID:         terminalID,
	})
	if err != nil {
		return db.Terminal{}, errors.New("terminal not found in active company")
	}
	if req.BranchID == uuid.Nil {
		req.BranchID = existing.BranchID
	}
	clean, err := NormalizeTerminalInput(req)
	if err != nil {
		return db.Terminal{}, err
	}
	if _, err := u.queries.GetBranchForBusiness(ctx, db.GetBranchForBusinessParams{
		BusinessID: tc.BusinessID,
		ID:         clean.BranchID,
	}); err != nil {
		return db.Terminal{}, errors.New("selected branch does not belong to this company")
	}
	tm, err := u.queries.UpdateTerminalRecord(ctx, db.UpdateTerminalRecordParams{
		BusinessID:     tc.BusinessID,
		ID:             terminalID,
		BranchID:       clean.BranchID,
		Code:           clean.Code,
		Name:           clean.Name,
		HardwareSerial: clean.HardwareSerial,
		IsActive:       req.IsActive,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return db.Terminal{}, fmt.Errorf("terminal code %q already exists in this company", clean.Code)
		}
		return db.Terminal{}, err
	}
	return tm, nil
}

