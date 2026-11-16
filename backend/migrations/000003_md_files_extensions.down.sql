-- Rollback Phase 1-7 md-files extensions
DROP TRIGGER IF EXISTS trg_sync_stock_movement_to_ledger ON stock_movements;
DROP FUNCTION IF EXISTS fn_sync_stock_movement_to_ledger();
DROP TRIGGER IF EXISTS trg_immutable_stock_ledger_entries ON stock_ledger_entries;
DROP FUNCTION IF EXISTS fn_prevent_stock_ledger_mutation();
DROP TABLE IF EXISTS stock_ledger_entries;
DROP TABLE IF EXISTS warehouse_approval_logs;
ALTER TABLE user_business_roles DROP COLUMN IF EXISTS designation_id;
DROP TABLE IF EXISTS designations;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS warehouses;

