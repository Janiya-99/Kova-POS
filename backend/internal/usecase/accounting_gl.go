package usecase

import (
	"context"

	"github.com/enterprise-pos/backend/internal/repository/sqlc/db"
	"github.com/google/uuid"
)

// AccountingGLUsecase exposes Chart of Accounts, immutable journal drill-down, and Fiscal Period Locking.
type AccountingGLUsecase struct {
	queries *db.Queries
}

// NewAccountingGLUsecase constructs an AccountingGLUsecase.
func NewAccountingGLUsecase(queries *db.Queries) *AccountingGLUsecase {
	return &AccountingGLUsecase{queries: queries}
}

// GetLedgerWorkspace returns Chart of Accounts, Fiscal Periods, and recent Journal Entries.
func (a *AccountingGLUsecase) GetLedgerWorkspace(ctx context.Context, businessID uuid.UUID) (map[string]any, error) {
	accounts, err := a.queries.ListChartOfAccounts(ctx, businessID)
	if err != nil {
		return nil, err
	}
	periods, err := a.queries.ListFiscalPeriods(ctx, businessID)
	if err != nil {
		return nil, err
	}
	journals, err := a.queries.ListJournalEntriesWithSummary(ctx, businessID)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"accounts":       accounts,
		"fiscal_periods": periods,
		"journals":       journals,
	}, nil
}

// GetJournalLines returns the balanced debit/credit lines for one journal entry.
func (a *AccountingGLUsecase) GetJournalLines(ctx context.Context, businessID, entryID uuid.UUID) ([]db.ListJournalLinesByEntryRow, error) {
	return a.queries.ListJournalLinesByEntry(ctx, db.ListJournalLinesByEntryParams{
		BusinessID:     businessID,
		JournalEntryID: entryID,
	})
}

// GetSourceJournals returns immutable GL journal lines linked to an invoice or GRN ID.
func (a *AccountingGLUsecase) GetSourceJournals(ctx context.Context, businessID, sourceID uuid.UUID) ([]db.ListJournalLinesBySourceIDRow, error) {
	return a.queries.ListJournalLinesBySourceID(ctx, db.ListJournalLinesBySourceIDParams{
		BusinessID: businessID,
		SourceID:   sourceID,
	})
}

// LockFiscalPeriod marks a fiscal period permanently locked against future journal entries.
func (a *AccountingGLUsecase) LockFiscalPeriod(ctx context.Context, businessID, periodID, userID uuid.UUID) (db.LockFiscalPeriodRow, error) {
	return a.queries.LockFiscalPeriod(ctx, db.LockFiscalPeriodParams{
		BusinessID: businessID,
		ID:         periodID,
		LockedBy:   uuid.NullUUID{UUID: userID, Valid: userID != uuid.Nil},
	})
}

