-- Phase 1-7 Extensions from md-files specifications (Idempotent 3NF Migration)

-- 1. Dedicated Warehouses Table (Multi-Tenant)
CREATE TABLE IF NOT EXISTS warehouses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    code        TEXT NOT NULL,
    name        TEXT NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, code)
);

-- 2. Organizational Departments & Designations (with max_pos_discount_pct limits)
CREATE TABLE IF NOT EXISTS departments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    code        TEXT NOT NULL,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, code)
);

CREATE TABLE IF NOT EXISTS designations (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id          UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    department_id        UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    code                 TEXT NOT NULL,
    name                 TEXT NOT NULL,
    max_pos_discount_pct NUMERIC(5, 2) NOT NULL DEFAULT 10.00 CHECK (max_pos_discount_pct >= 0 AND max_pos_discount_pct <= 100),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, code)
);

-- 3. Warehouse Approval Logs & Immutable Stock Ledger Entries
CREATE TABLE IF NOT EXISTS warehouse_approval_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN ('PO', 'GRN', 'TRANSFER')),
    document_id   UUID NOT NULL,
    action        TEXT NOT NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    notes         TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_warehouse_approval_logs_doc
    ON warehouse_approval_logs (business_id, document_type, document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS stock_ledger_entries (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id      UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    warehouse_id   UUID REFERENCES warehouses(id) ON DELETE SET NULL,
    product_id     UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id       UUID REFERENCES inventory_batches(id) ON DELETE SET NULL,
    movement_type  TEXT NOT NULL CHECK (movement_type IN ('IN_GRN', 'OUT_SALE', 'IN_RETURN', 'IN_VOID', 'ADJUSTMENT')),
    qty_delta      NUMERIC(19, 4) NOT NULL,
    unit_cost      NUMERIC(19, 4) NOT NULL DEFAULT 0,
    reference_type TEXT NOT NULL,
    reference_id   UUID NOT NULL,
    created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION fn_prevent_stock_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'stock_ledger_entries is immutable and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_stock_ledger_entries ON stock_ledger_entries;
CREATE TRIGGER trg_immutable_stock_ledger_entries
    BEFORE UPDATE OR DELETE ON stock_ledger_entries
    FOR EACH ROW EXECUTE FUNCTION fn_prevent_stock_ledger_mutation();

-- Sync future stock_movements automatically into immutable stock_ledger_entries
CREATE OR REPLACE FUNCTION fn_sync_stock_movement_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_wh_id UUID;
BEGIN
    SELECT w.id INTO v_wh_id
    FROM warehouses w
    WHERE w.business_id = NEW.business_id AND w.branch_id = NEW.branch_id
    ORDER BY w.created_at ASC
    LIMIT 1;

    INSERT INTO stock_ledger_entries (
        id, business_id, branch_id, warehouse_id, product_id, batch_id,
        movement_type, qty_delta, unit_cost, reference_type, reference_id, created_by, created_at
    ) VALUES (
        NEW.id, NEW.business_id, NEW.branch_id, v_wh_id, NEW.product_id, NEW.batch_id,
        NEW.movement_type, NEW.qty_delta, NEW.unit_cost, NEW.reference_type, NEW.reference_id, NEW.created_by, NEW.created_at
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_stock_movement_to_ledger ON stock_movements;
CREATE TRIGGER trg_sync_stock_movement_to_ledger
    AFTER INSERT ON stock_movements
    FOR EACH ROW EXECUTE FUNCTION fn_sync_stock_movement_to_ledger();

-- 4. 3NF Column Additions Across Existing Tables
ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS logo_light_url   TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS logo_dark_url    TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS logo_receipt_url TEXT NOT NULL DEFAULT '';

ALTER TABLE user_business_roles
    ADD COLUMN IF NOT EXISTS designation_id UUID REFERENCES designations(id) ON DELETE SET NULL;

ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS business_category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS business_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS image_urls           JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS allow_negative_stock BOOLEAN,
    ADD COLUMN IF NOT EXISTS is_archived          BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS credit_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS credit_limit   NUMERIC(19, 4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_walk_in     BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE grn_items
    ADD COLUMN IF NOT EXISTS ordered_qty NUMERIC(19, 4) NOT NULL DEFAULT 0;

-- 5. Backfill & Seed Organizational / Warehouse / Settings Data
UPDATE categories SET business_category_id = COALESCE(parent_id, id) WHERE business_category_id IS NULL;
UPDATE products SET business_category_id = category_id WHERE business_category_id IS NULL;
UPDATE products SET image_urls = jsonb_build_array(image_url) WHERE image_url <> '' AND jsonb_array_length(image_urls) = 0;
UPDATE grn_items SET ordered_qty = qty_received WHERE ordered_qty = 0;

INSERT INTO warehouses (business_id, branch_id, code, name, is_active)
SELECT b.business_id, b.id, b.code || '-WH', b.name || ' Warehouse', TRUE
FROM branches b
ON CONFLICT (business_id, code) DO NOTHING;

INSERT INTO departments (id, business_id, code, name)
SELECT v.id::UUID, v.business_id::UUID, v.code, v.name
FROM (
    VALUES
        ('11111111-1100-1111-1111-111111111001', '11111111-1111-1111-1111-111111111111', 'OPS', 'Retail Operations'),
        ('11111111-1100-1111-1111-111111111002', '11111111-1111-1111-1111-111111111111', 'FIN', 'Finance & Audit'),
        ('22222222-1100-2222-2222-222222221001', '22222222-2222-2222-2222-222222222222', 'OPS', 'Nordic Operations')
) AS v(id, business_id, code, name)
JOIN businesses b ON b.id = v.business_id::UUID
ON CONFLICT (business_id, code) DO NOTHING;

INSERT INTO designations (id, business_id, department_id, code, name, max_pos_discount_pct)
SELECT v.id::UUID, v.business_id::UUID, v.department_id::UUID, v.code, v.name, v.max_disc
FROM (
    VALUES
        ('11111111-1200-1111-1111-111111111001', '11111111-1111-1111-1111-111111111111', '11111111-1100-1111-1111-111111111001', 'CASHIER', 'Store Cashier', 10.00::NUMERIC),
        ('11111111-1200-1111-1111-111111111002', '11111111-1111-1111-1111-111111111111', '11111111-1100-1111-1111-111111111001', 'MANAGER', 'Branch Manager', 25.00::NUMERIC),
        ('11111111-1200-1111-1111-111111111003', '11111111-1111-1111-1111-111111111111', '11111111-1100-1111-1111-111111111002', 'OWNER', 'Business Owner', 100.00::NUMERIC),
        ('22222222-1200-2222-2222-222222221001', '22222222-2222-2222-2222-222222222222', '22222222-1100-2222-2222-222222221001', 'OWNER', 'Nordic Owner', 100.00::NUMERIC)
) AS v(id, business_id, department_id, code, name, max_disc)
JOIN businesses b ON b.id = v.business_id::UUID
JOIN departments d ON d.id = v.department_id::UUID
ON CONFLICT (business_id, code) DO NOTHING;

UPDATE user_business_roles ubr
SET designation_id = CASE
    WHEN r.code IN ('BusinessOwner', 'SuperAdmin') AND ubr.business_id = '11111111-1111-1111-1111-111111111111' THEN '11111111-1200-1111-1111-111111111003'::UUID
    WHEN r.code = 'BranchManager' AND ubr.business_id = '11111111-1111-1111-1111-111111111111' THEN '11111111-1200-1111-1111-111111111002'::UUID
    WHEN r.code = 'Cashier' AND ubr.business_id = '11111111-1111-1111-1111-111111111111' THEN '11111111-1200-1111-1111-111111111001'::UUID
    WHEN ubr.business_id = '22222222-2222-2222-2222-222222222222' THEN '22222222-1200-2222-2222-222222221001'::UUID
    ELSE ubr.designation_id
END
FROM roles r
WHERE ubr.role_id = r.id AND ubr.designation_id IS NULL;

INSERT INTO stock_ledger_entries (
    id, business_id, branch_id, product_id, batch_id,
    movement_type, qty_delta, unit_cost, reference_type, reference_id, created_by, created_at
)
SELECT id, business_id, branch_id, product_id, batch_id,
       movement_type, qty_delta, unit_cost, reference_type, reference_id, created_by, created_at
FROM stock_movements
ON CONFLICT (id) DO NOTHING;

INSERT INTO setting_definitions (key, value_type, default_value, category, label, description)
VALUES
    ('warehouse.po.require_approval', 'BOOLEAN', 'false'::jsonb, 'Warehouse & Approvals', 'Require PO Approval', 'Route purchase orders through supervisor approval queue before vendor dispatch'),
    ('warehouse.grn.require_approval', 'BOOLEAN', 'false'::jsonb, 'Warehouse & Approvals', 'Require GRN Approval', 'Intercept Goods Received Notes for manager approval before creating FIFO layers'),
    ('pos.loyalty_points_per_unit', 'NUMBER', '1'::jsonb, 'POS Rules', 'Loyalty Points per $1', 'Automatic loyalty points accrued per whole currency unit for registered customers')
ON CONFLICT (key) DO NOTHING;

UPDATE customers SET tier = 'Gold' WHERE name = 'Alia Bonner' AND tier = 'VIP';
UPDATE customers SET tier = 'Silver' WHERE tier = 'Standard';

