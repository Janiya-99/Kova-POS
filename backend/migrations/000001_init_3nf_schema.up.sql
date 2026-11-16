-- Enterprise Multi-Business POS & ERP — Strictly 3NF PostgreSQL 16 DDL + Multi-Tenant RBAC
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. TENANT & ORGANIZATIONAL TOPOLOGY
-- ============================================================================
CREATE TABLE IF NOT EXISTS businesses (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    legal_name          TEXT NOT NULL,
    tax_registration_no TEXT NOT NULL DEFAULT '',
    base_currency       VARCHAR(3) NOT NULL DEFAULT 'USD',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branches (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    code         TEXT NOT NULL,
    name         TEXT NOT NULL,
    country_code VARCHAR(3) NOT NULL DEFAULT 'US',
    country_name TEXT NOT NULL DEFAULT 'USA',
    city         TEXT NOT NULL DEFAULT '',
    address      TEXT NOT NULL DEFAULT '',
    is_warehouse BOOLEAN NOT NULL DEFAULT FALSE,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, code)
);

CREATE TABLE IF NOT EXISTS terminals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    code            TEXT NOT NULL,
    name            TEXT NOT NULL,
    hardware_serial TEXT NOT NULL DEFAULT '',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, code)
);

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    full_name     TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_url    TEXT NOT NULL DEFAULT '',
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. MULTI-TENANT RBAC (4 TABLES)
-- ============================================================================
CREATE TABLE IF NOT EXISTS roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_system   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module      TEXT NOT NULL,
    action      TEXT NOT NULL,
    code        TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_business_roles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id           UUID REFERENCES branches(id) ON DELETE SET NULL,
    role_id             UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    supervisor_pin_hash TEXT NOT NULL DEFAULT '',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, business_id, role_id)
);

-- ============================================================================
-- 3. 6-LEVEL SETTINGS INHERITANCE ENGINE
-- ============================================================================
CREATE TABLE IF NOT EXISTS setting_definitions (
    key           TEXT PRIMARY KEY,
    value_type    TEXT NOT NULL CHECK (value_type IN ('STRING', 'NUMBER', 'BOOLEAN', 'JSON')),
    default_value JSONB NOT NULL,
    category      TEXT NOT NULL,
    label         TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS scoped_settings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    setting_key     TEXT NOT NULL REFERENCES setting_definitions(key) ON DELETE CASCADE,
    scope_level     TEXT NOT NULL CHECK (scope_level IN ('SYSTEM', 'BUSINESS', 'BRANCH', 'TERMINAL', 'CATEGORY', 'PRODUCT')),
    scope_target_id UUID,
    value_json      JSONB NOT NULL,
    updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_scoped_settings_target
    ON scoped_settings (business_id, setting_key, scope_level, COALESCE(scope_target_id, '00000000-0000-0000-0000-000000000000'::UUID));

-- ============================================================================
-- 4. CATALOG, CRM & MULTI-TIER TAX
-- ============================================================================
CREATE TABLE IF NOT EXISTS tax_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    code        TEXT NOT NULL,
    name        TEXT NOT NULL,
    is_default  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, code)
);

CREATE TABLE IF NOT EXISTS tax_rules (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    tax_group_id UUID NOT NULL REFERENCES tax_groups(id) ON DELETE CASCADE,
    code         TEXT NOT NULL,
    name         TEXT NOT NULL,
    tax_type     TEXT NOT NULL CHECK (tax_type IN ('EXCLUSIVE', 'INCLUSIVE', 'COMPOUND')),
    rate_percent NUMERIC(8, 4) NOT NULL CHECK (rate_percent >= 0),
    priority     INT NOT NULL DEFAULT 1,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, tax_group_id, code)
);

CREATE TABLE IF NOT EXISTS categories (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    parent_id      UUID REFERENCES categories(id) ON DELETE SET NULL,
    tax_group_id   UUID REFERENCES tax_groups(id) ON DELETE SET NULL,
    name           TEXT NOT NULL,
    slug           TEXT NOT NULL,
    gender_segment TEXT NOT NULL DEFAULT 'Unisex' CHECK (gender_segment IN ('Men', 'Women', 'Unisex')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, slug)
);

CREATE TABLE IF NOT EXISTS products (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id      UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    category_id      UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    tax_group_id     UUID REFERENCES tax_groups(id) ON DELETE SET NULL,
    sku              TEXT NOT NULL,
    name             TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    image_url        TEXT NOT NULL DEFAULT '',
    unit_of_measure  TEXT NOT NULL DEFAULT 'PCS',
    base_price       NUMERIC(19, 4) NOT NULL CHECK (base_price >= 0),
    sale_price       NUMERIC(19, 4) NOT NULL CHECK (sale_price >= 0),
    discount_percent NUMERIC(8, 4) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
    reorder_point    NUMERIC(19, 4) NOT NULL DEFAULT 15,
    reorder_qty      NUMERIC(19, 4) NOT NULL DEFAULT 50,
    track_expiry     BOOLEAN NOT NULL DEFAULT FALSE,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, sku)
);

CREATE TABLE IF NOT EXISTS product_barcodes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    barcode     TEXT NOT NULL,
    is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (business_id, barcode)
);

CREATE TABLE IF NOT EXISTS customers (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    email          TEXT NOT NULL DEFAULT '',
    phone          TEXT NOT NULL DEFAULT '',
    tier           TEXT NOT NULL DEFAULT 'Standard',
    loyalty_points INT NOT NULL DEFAULT 0,
    avatar_url     TEXT NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. PROCUREMENT & FIFO INVENTORY ENGINE
-- ============================================================================
CREATE TABLE IF NOT EXISTS suppliers (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id        UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    code               TEXT NOT NULL,
    name               TEXT NOT NULL,
    email              TEXT NOT NULL DEFAULT '',
    phone              TEXT NOT NULL DEFAULT '',
    tax_id             TEXT NOT NULL DEFAULT '',
    payment_terms_days INT NOT NULL DEFAULT 30,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, code)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id     UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    supplier_id   UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    po_number     TEXT NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED', 'PARTIAL', 'RECEIVED', 'CANCELLED')),
    expected_date DATE,
    total_amount  NUMERIC(19, 4) NOT NULL DEFAULT 0,
    notes         TEXT NOT NULL DEFAULT '',
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, po_number)
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    po_id        UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id   UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    ordered_qty  NUMERIC(19, 4) NOT NULL CHECK (ordered_qty > 0),
    received_qty NUMERIC(19, 4) NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
    unit_cost    NUMERIC(19, 4) NOT NULL CHECK (unit_cost >= 0)
);

CREATE TABLE IF NOT EXISTS goods_received_notes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id           UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    po_id               UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
    supplier_id         UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    grn_number          TEXT NOT NULL,
    supplier_invoice_no TEXT NOT NULL DEFAULT '',
    attachment_name     TEXT NOT NULL DEFAULT '',
    status              TEXT NOT NULL CHECK (status IN ('DRAFT', 'APPROVED', 'REJECTED')),
    total_cost          NUMERIC(19, 4) NOT NULL DEFAULT 0,
    received_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, grn_number)
);

CREATE TABLE IF NOT EXISTS grn_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    grn_id       UUID NOT NULL REFERENCES goods_received_notes(id) ON DELETE CASCADE,
    product_id   UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_number TEXT NOT NULL,
    expiry_date  DATE,
    qty_received NUMERIC(19, 4) NOT NULL CHECK (qty_received > 0),
    unit_cost    NUMERIC(19, 4) NOT NULL CHECK (unit_cost >= 0),
    line_total   NUMERIC(19, 4) NOT NULL CHECK (line_total >= 0)
);

CREATE TABLE IF NOT EXISTS inventory_batches (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id     UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    product_id    UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    grn_item_id   UUID REFERENCES grn_items(id) ON DELETE SET NULL,
    batch_number  TEXT NOT NULL,
    received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiry_date   DATE,
    unit_cost     NUMERIC(19, 4) NOT NULL CHECK (unit_cost >= 0),
    initial_qty   NUMERIC(19, 4) NOT NULL CHECK (initial_qty >= 0),
    remaining_qty NUMERIC(19, 4) NOT NULL CHECK (remaining_qty >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_inventory_batches_fifo
    ON inventory_batches (business_id, branch_id, product_id, received_at ASC, expiry_date ASC)
    WHERE remaining_qty > 0;

CREATE TABLE IF NOT EXISTS stock_movements (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id      UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
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

-- ============================================================================
-- 6. POS EDGE OPERATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_shifts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    terminal_id     UUID NOT NULL REFERENCES terminals(id) ON DELETE RESTRICT,
    cashier_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at       TIMESTAMPTZ,
    opening_float   NUMERIC(19, 4) NOT NULL DEFAULT 0,
    closing_cash    NUMERIC(19, 4),
    status          TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED'))
);

CREATE TABLE IF NOT EXISTS suspended_bills (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    terminal_id     UUID NOT NULL REFERENCES terminals(id) ON DELETE RESTRICT,
    cashier_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
    hold_code       TEXT NOT NULL,
    notes           TEXT NOT NULL DEFAULT '',
    subtotal        NUMERIC(19, 4) NOT NULL DEFAULT 0,
    tax_total       NUMERIC(19, 4) NOT NULL DEFAULT 0,
    grand_total     NUMERIC(19, 4) NOT NULL DEFAULT 0,
    status          TEXT NOT NULL CHECK (status IN ('HELD', 'RECALLED', 'VOIDED')),
    held_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suspended_bill_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    suspended_bill_id UUID NOT NULL REFERENCES suspended_bills(id) ON DELETE CASCADE,
    product_id        UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    qty               NUMERIC(19, 4) NOT NULL CHECK (qty > 0),
    unit_price        NUMERIC(19, 4) NOT NULL CHECK (unit_price >= 0),
    discount_percent  NUMERIC(8, 4) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sales_invoices (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id            UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id              UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    terminal_id            UUID NOT NULL REFERENCES terminals(id) ON DELETE RESTRICT,
    shift_id               UUID REFERENCES pos_shifts(id) ON DELETE SET NULL,
    cashier_user_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    customer_id            UUID REFERENCES customers(id) ON DELETE SET NULL,
    invoice_number         TEXT NOT NULL,
    idempotency_key        UUID NOT NULL,
    invoice_type           TEXT NOT NULL DEFAULT 'SALE' CHECK (invoice_type IN ('SALE', 'REFUND')),
    original_invoice_id    UUID REFERENCES sales_invoices(id) ON DELETE SET NULL,
    status                 TEXT NOT NULL CHECK (status IN ('PAID', 'REFUND', 'VOID')),
    subtotal               NUMERIC(19, 4) NOT NULL,
    discount_total         NUMERIC(19, 4) NOT NULL DEFAULT 0,
    tax_total              NUMERIC(19, 4) NOT NULL DEFAULT 0,
    grand_total            NUMERIC(19, 4) NOT NULL,
    total_cogs             NUMERIC(19, 4) NOT NULL DEFAULT 0,
    override_supervisor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    override_reason        TEXT NOT NULL DEFAULT '',
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, invoice_number),
    UNIQUE (business_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS sales_invoice_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    invoice_id      UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    qty             NUMERIC(19, 4) NOT NULL CHECK (qty > 0),
    unit_price      NUMERIC(19, 4) NOT NULL,
    discount_amount NUMERIC(19, 4) NOT NULL DEFAULT 0,
    tax_amount      NUMERIC(19, 4) NOT NULL DEFAULT 0,
    line_total      NUMERIC(19, 4) NOT NULL,
    batch_cogs      NUMERIC(19, 4) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sales_invoice_taxes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    invoice_id   UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    tax_rule_id  UUID REFERENCES tax_rules(id) ON DELETE SET NULL,
    tax_name     TEXT NOT NULL,
    tax_type     TEXT NOT NULL,
    rate_percent NUMERIC(8, 4) NOT NULL,
    taxable_base NUMERIC(19, 4) NOT NULL,
    tax_amount   NUMERIC(19, 4) NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    invoice_id      UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    payment_method  TEXT NOT NULL CHECK (payment_method IN ('CASH', 'CARD', 'SPLIT', 'MOBILE_WALLET')),
    amount          NUMERIC(19, 4) NOT NULL,
    tendered_amount NUMERIC(19, 4) NOT NULL DEFAULT 0,
    change_given    NUMERIC(19, 4) NOT NULL DEFAULT 0,
    reference_no    TEXT NOT NULL DEFAULT '',
    paid_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 7. IMMUTABLE DOUBLE-ENTRY GENERAL LEDGER ACCOUNTING
-- ============================================================================
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    code         TEXT NOT NULL,
    name         TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE', 'COGS')),
    parent_id    UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    is_system    BOOLEAN NOT NULL DEFAULT TRUE,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (business_id, code)
);

CREATE TABLE IF NOT EXISTS fiscal_periods (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    period_name TEXT NOT NULL,
    start_date  DATE NOT NULL,
    end_date    DATE NOT NULL,
    is_locked   BOOLEAN NOT NULL DEFAULT FALSE,
    locked_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    locked_at   TIMESTAMPTZ,
    UNIQUE (business_id, period_name)
);

CREATE TABLE IF NOT EXISTS journal_entries (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id      UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id        UUID REFERENCES branches(id) ON DELETE SET NULL,
    fiscal_period_id UUID REFERENCES fiscal_periods(id) ON DELETE RESTRICT,
    entry_number     TEXT NOT NULL,
    source_type      TEXT NOT NULL,
    source_id        UUID NOT NULL,
    description      TEXT NOT NULL,
    entry_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    posted_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, entry_number)
);

CREATE TABLE IF NOT EXISTS journal_lines (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id      UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id       UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    debit            NUMERIC(19, 4) NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit           NUMERIC(19, 4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    memo             TEXT NOT NULL DEFAULT '',
    CHECK (debit > 0 OR credit > 0)
);

CREATE INDEX IF NOT EXISTS ix_journal_lines_entry ON journal_lines (business_id, journal_entry_id);

-- Deferred Trigger Enforcing SUM(debit) = SUM(credit) on Every Commit
CREATE OR REPLACE FUNCTION verify_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_entry_id UUID;
    v_total_debit NUMERIC(19, 4);
    v_total_credit NUMERIC(19, 4);
    v_line_count INT;
BEGIN
    v_entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);

    SELECT COUNT(*), COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO v_line_count, v_total_debit, v_total_credit
    FROM journal_lines
    WHERE journal_entry_id = v_entry_id;

    IF v_line_count > 0 AND v_total_debit <> v_total_credit THEN
        RAISE EXCEPTION 'Unbalanced double-entry journal %: SUM(debit)=% <> SUM(credit)=%',
            v_entry_id, v_total_debit, v_total_credit;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_verify_journal_balance ON journal_lines;
CREATE CONSTRAINT TRIGGER trg_verify_journal_balance
AFTER INSERT OR UPDATE OR DELETE ON journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION verify_journal_entry_balance();

-- Prevent Posting to Locked Fiscal Periods
CREATE OR REPLACE FUNCTION prevent_locked_fiscal_period_posting()
RETURNS TRIGGER AS $$
DECLARE
    v_locked BOOLEAN;
BEGIN
    IF NEW.fiscal_period_id IS NOT NULL THEN
        SELECT is_locked INTO v_locked
        FROM fiscal_periods
        WHERE id = NEW.fiscal_period_id AND business_id = NEW.business_id;

        IF COALESCE(v_locked, FALSE) = TRUE THEN
            RAISE EXCEPTION 'Cannot post journal entry % to locked fiscal period %',
                NEW.entry_number, NEW.fiscal_period_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_locked_period_posting ON journal_entries;
CREATE TRIGGER trg_prevent_locked_period_posting
BEFORE INSERT ON journal_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_locked_fiscal_period_posting();

