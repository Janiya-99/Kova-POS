-- Notifications, Auto-PO Metadata, and Linked Purchase Invoices (3NF Idempotent Migration)

ALTER TABLE purchase_orders
    ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE purchase_order_items
    ADD COLUMN IF NOT EXISTS min_stock_threshold NUMERIC(19, 4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stock_at_order      NUMERIC(19, 4) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS purchase_invoices (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id      UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    po_id          UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
    supplier_id    UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    invoice_number TEXT NOT NULL,
    status         TEXT NOT NULL CHECK (status IN ('DRAFT', 'ISSUED', 'PAID', 'CANCELLED')),
    subtotal       NUMERIC(19, 4) NOT NULL DEFAULT 0,
    tax_total      NUMERIC(19, 4) NOT NULL DEFAULT 0,
    grand_total    NUMERIC(19, 4) NOT NULL DEFAULT 0,
    due_date       DATE,
    auto_generated BOOLEAN NOT NULL DEFAULT TRUE,
    notes          TEXT NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS ix_purchase_invoices_biz_created
    ON purchase_invoices (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS system_notifications (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id      UUID REFERENCES branches(id) ON DELETE CASCADE,
    category       TEXT NOT NULL CHECK (category IN ('LOW_STOCK', 'AUTO_PO', 'INVOICE', 'SETTINGS', 'SYSTEM')),
    severity       TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    title          TEXT NOT NULL,
    body           TEXT NOT NULL,
    reference_type TEXT NOT NULL DEFAULT '',
    reference_id   UUID,
    is_read        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_system_notifications_biz_unread
    ON system_notifications (business_id, is_read, created_at DESC);

-- Seed one initial system readiness notification per active business if table is empty for that tenant
INSERT INTO system_notifications (business_id, branch_id, category, severity, title, body, reference_type, is_read)
SELECT b.id,
       (SELECT br.id FROM branches br WHERE br.business_id = b.id ORDER BY br.created_at ASC LIMIT 1),
       'SYSTEM',
       'info',
       'Auto-PO & Low-Stock Monitor Active',
       'Asynq background worker monitors branch FIFO quantities against product minimum thresholds and drafts Purchase Orders + Vendor Invoices automatically.',
       'SYSTEM',
       FALSE
FROM businesses b
WHERE NOT EXISTS (
    SELECT 1 FROM system_notifications sn WHERE sn.business_id = b.id
);

