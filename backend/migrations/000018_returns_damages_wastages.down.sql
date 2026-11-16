-- Rollback Phase 16 Returns, Damages & Wastages Schema

DROP TABLE IF EXISTS stock_adjustments CASCADE;

ALTER TABLE sales_invoice_items
    DROP COLUMN IF EXISTS returned_qty;

ALTER TABLE sales_invoices
    DROP COLUMN IF EXISTS refunded_total;

