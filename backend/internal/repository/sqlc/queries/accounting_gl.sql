-- name: ListChartOfAccounts :many
SELECT id, business_id, code, name, account_type, parent_id, is_system, is_active
FROM chart_of_accounts
WHERE business_id = $1 AND is_active = TRUE
ORDER BY code ASC;

-- name: GetAccountByCode :one
SELECT id, business_id, code, name, account_type
FROM chart_of_accounts
WHERE business_id = $1 AND code = $2
LIMIT 1;

-- name: ListFiscalPeriods :many
SELECT id, business_id, period_name, start_date, end_date, is_locked, locked_by, locked_at
FROM fiscal_periods
WHERE business_id = $1
ORDER BY start_date DESC;

-- name: FindOpenFiscalPeriodForDate :one
SELECT id, period_name, is_locked
FROM fiscal_periods
WHERE business_id = $1 AND $2::DATE BETWEEN start_date AND end_date
LIMIT 1;

-- name: LockFiscalPeriod :one
UPDATE fiscal_periods
SET is_locked = TRUE, locked_by = $3, locked_at = NOW()
WHERE business_id = $1 AND id = $2
RETURNING id, period_name, is_locked, locked_at;

-- name: InsertJournalEntry :one
INSERT INTO journal_entries (
    business_id, branch_id, fiscal_period_id, entry_number,
    source_type, source_id, description, entry_date, posted_by
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id, entry_number, entry_date, created_at;

-- name: InsertJournalLine :one
INSERT INTO journal_lines (
    business_id, journal_entry_id, account_id, debit, credit, memo
)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id;

-- name: ListJournalEntriesWithSummary :many
SELECT
    je.id, je.entry_number, je.source_type, je.source_id, je.description, je.entry_date, je.created_at,
    COALESCE(SUM(jl.debit), 0)::NUMERIC(19,4) AS total_debit,
    COALESCE(SUM(jl.credit), 0)::NUMERIC(19,4) AS total_credit
FROM journal_entries je
LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
WHERE je.business_id = $1
GROUP BY je.id
ORDER BY je.created_at DESC
LIMIT 100;

-- name: ListJournalLinesByEntry :many
SELECT
    jl.id, jl.journal_entry_id, jl.account_id,
    coa.code AS account_code, coa.name AS account_name, coa.account_type,
    jl.debit, jl.credit, jl.memo
FROM journal_lines jl
JOIN chart_of_accounts coa ON coa.id = jl.account_id
WHERE jl.business_id = $1 AND jl.journal_entry_id = $2
ORDER BY jl.debit DESC, coa.code ASC;

-- name: ListJournalLinesBySourceID :many
SELECT
    je.entry_number, je.source_type, je.description, je.entry_date,
    coa.code AS account_code, coa.name AS account_name, coa.account_type,
    jl.debit, jl.credit, jl.memo
FROM journal_entries je
JOIN journal_lines jl ON jl.journal_entry_id = je.id
JOIN chart_of_accounts coa ON coa.id = jl.account_id
WHERE je.business_id = $1 AND je.source_id = $2
ORDER BY je.created_at ASC, jl.debit DESC, coa.code ASC;

