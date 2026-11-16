-- Phase 16: Industry-Aware Returns, Damages, Wastages & RMA Quarantine Engine

-- 1. Widen movement_type constraints on stock_movements and stock_ledger_entries
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'stock_movements'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%movement_type%'
    LOOP
        EXECUTE format('ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS %I', rec.conname);
    END LOOP;

    FOR rec IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'stock_ledger_entries'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%movement_type%'
    LOOP
        EXECUTE format('ALTER TABLE stock_ledger_entries DROP CONSTRAINT IF EXISTS %I', rec.conname);
    END LOOP;
END $$;

ALTER TABLE stock_movements
    ADD CONSTRAINT chk_stock_movements_type CHECK (
        movement_type IN (
            'IN_GRN', 'OUT_SALE', 'IN_RETURN', 'IN_VOID', 'ADJUSTMENT',
            'DAMAGE', 'WASTAGE', 'EXPIRY_WRITEOFF', 'SUPPLIER_RETURN',
            'CUSTOMER_RETURN', 'QUARANTINE_IN', 'QUARANTINE_OUT', 'QUARANTINE_RESTOCK'
        )
    );

ALTER TABLE stock_ledger_entries
    ADD CONSTRAINT chk_stock_ledger_entries_type CHECK (
        movement_type IN (
            'IN_GRN', 'OUT_SALE', 'IN_RETURN', 'IN_VOID', 'ADJUSTMENT',
            'DAMAGE', 'WASTAGE', 'EXPIRY_WRITEOFF', 'SUPPLIER_RETURN',
            'CUSTOMER_RETURN', 'QUARANTINE_IN', 'QUARANTINE_OUT', 'QUARANTINE_RESTOCK'
        )
    );

-- 2. Partial Return & Refund Tracking Columns on Sales Invoices / Items
ALTER TABLE sales_invoices
    ADD COLUMN IF NOT EXISTS refunded_total NUMERIC(19, 4) NOT NULL DEFAULT 0;

ALTER TABLE sales_invoice_items
    ADD COLUMN IF NOT EXISTS returned_qty NUMERIC(19, 4) NOT NULL DEFAULT 0;

-- 3. Dedicated Shrinkage, Damage & Wastage Expense Account (5100) for all tenants
INSERT INTO chart_of_accounts (business_id, code, name, account_type, is_system, is_active)
SELECT b.id, '5100', 'Inventory Shrinkage, Damage & Wastage', 'EXPENSE', TRUE, TRUE
FROM businesses b
ON CONFLICT (business_id, code) DO NOTHING;

-- 4. 3NF Stock Adjustments, Damages, Wastages & Customer/Supplier Returns Table
CREATE TABLE IF NOT EXISTS stock_adjustments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id         UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    warehouse_id      UUID REFERENCES warehouses(id) ON DELETE SET NULL,
    product_id        UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id          UUID REFERENCES inventory_batches(id) ON DELETE SET NULL,
    supplier_id       UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    invoice_id        UUID REFERENCES sales_invoices(id) ON DELETE SET NULL,
    return_invoice_id UUID REFERENCES sales_invoices(id) ON DELETE SET NULL,
    journal_entry_id  UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    adjustment_number TEXT NOT NULL,
    source_channel    TEXT NOT NULL CHECK (source_channel IN ('INVENTORY', 'POS_RETURN')),
    adjustment_type   TEXT NOT NULL CHECK (adjustment_type IN (
        'CUSTOMER_RETURN', 'DAMAGE', 'WASTAGE', 'EXPIRY_WRITEOFF', 'SUPPLIER_RETURN', 'FOUND_SURPLUS'
    )),
    disposition       TEXT NOT NULL CHECK (disposition IN (
        'RESTOCK_SELLABLE', 'QUARANTINE_DAMAGED', 'WRITE_OFF_SCRAP', 'RETURN_TO_SUPPLIER'
    )),
    resolution_status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (resolution_status IN (
        'COMPLETED', 'QUARANTINE', 'RMA_SENT', 'SCRAPPED', 'REPAIRED_RESTOCKED'
    )),
    reason_category   TEXT NOT NULL,
    serial_imei       TEXT NOT NULL DEFAULT '',
    rma_reference     TEXT NOT NULL DEFAULT '',
    qty               NUMERIC(19, 4) NOT NULL CHECK (qty > 0),
    unit_cost         NUMERIC(19, 4) NOT NULL DEFAULT 0,
    total_cost        NUMERIC(19, 4) NOT NULL DEFAULT 0,
    refund_amount     NUMERIC(19, 4) NOT NULL DEFAULT 0,
    notes             TEXT NOT NULL DEFAULT '',
    actor_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_name        TEXT NOT NULL DEFAULT '',
    resolved_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, adjustment_number)
);

CREATE INDEX IF NOT EXISTS ix_stock_adjustments_biz_branch_created
    ON stock_adjustments (business_id, branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_stock_adjustments_type_status
    ON stock_adjustments (business_id, adjustment_type, resolution_status);

-- 5. Seed Realistic Initial Returns, Damages & Wastages for Existing Populated Tenants (Idempotent)
DO $$
DECLARE
    v_biz RECORD;
    v_br_id UUID;
    v_wh_id UUID;
    v_sup_id UUID;
    v_inv_id UUID;
    v_actor_id UUID;
    v_actor_name TEXT;
    v_p1 RECORD;
    v_p2 RECORD;
    v_p3 RECORD;
    v_coa_inv UUID;
    v_coa_shrink UUID;
    v_coa_ap UUID;
    v_je_id UUID;
    v_cost1 NUMERIC(19,4);
    v_cost2 NUMERIC(19,4);
    v_cost3 NUMERIC(19,4);
BEGIN
    FOR v_biz IN
        SELECT b.id, COALESCE(b.industry_profile, 'retail') AS industry_profile
        FROM businesses b
        WHERE EXISTS (SELECT 1 FROM products p WHERE p.business_id = b.id AND p.is_active = TRUE)
          AND NOT EXISTS (SELECT 1 FROM stock_adjustments sa WHERE sa.business_id = b.id)
    LOOP
        SELECT id INTO v_br_id FROM branches WHERE business_id = v_biz.id AND is_active = TRUE ORDER BY created_at ASC LIMIT 1;
        SELECT id INTO v_wh_id FROM warehouses WHERE business_id = v_biz.id AND branch_id = v_br_id ORDER BY created_at ASC LIMIT 1;
        SELECT id INTO v_sup_id FROM suppliers WHERE business_id = v_biz.id ORDER BY created_at ASC LIMIT 1;
        SELECT id INTO v_inv_id FROM sales_invoices WHERE business_id = v_biz.id AND status = 'PAID' ORDER BY created_at DESC LIMIT 1;
        SELECT u.id, u.full_name INTO v_actor_id, v_actor_name
        FROM users u
        JOIN user_business_roles ubr ON ubr.user_id = u.id
        WHERE ubr.business_id = v_biz.id AND ubr.is_active = TRUE
        ORDER BY u.created_at ASC LIMIT 1;

        SELECT id INTO v_coa_inv FROM chart_of_accounts WHERE business_id = v_biz.id AND code = '1200' LIMIT 1;
        SELECT id INTO v_coa_shrink FROM chart_of_accounts WHERE business_id = v_biz.id AND code = '5100' LIMIT 1;
        SELECT id INTO v_coa_ap FROM chart_of_accounts WHERE business_id = v_biz.id AND code = '2000' LIMIT 1;

        IF v_br_id IS NULL OR v_coa_inv IS NULL OR v_coa_shrink IS NULL THEN
            CONTINUE;
        END IF;

        -- Pick 3 active FIFO products cleanly
        SELECT p.id AS product_id, p.sale_price, ib.id AS batch_id, ib.unit_cost
        INTO v_p1
        FROM products p
        JOIN inventory_batches ib ON ib.product_id = p.id AND ib.branch_id = v_br_id AND ib.remaining_qty >= 2
        WHERE p.business_id = v_biz.id AND p.is_active = TRUE
        ORDER BY p.sale_price DESC LIMIT 1;

        SELECT p.id AS product_id, p.sale_price, ib.id AS batch_id, ib.unit_cost
        INTO v_p2
        FROM products p
        JOIN inventory_batches ib ON ib.product_id = p.id AND ib.branch_id = v_br_id AND ib.remaining_qty >= 2
        WHERE p.business_id = v_biz.id AND p.is_active = TRUE AND (v_p1.product_id IS NULL OR p.id <> v_p1.product_id)
        ORDER BY p.sale_price ASC LIMIT 1;

        SELECT p.id AS product_id, p.sale_price, ib.id AS batch_id, ib.unit_cost
        INTO v_p3
        FROM products p
        JOIN inventory_batches ib ON ib.product_id = p.id AND ib.branch_id = v_br_id AND ib.remaining_qty >= 2
        WHERE p.business_id = v_biz.id AND p.is_active = TRUE
          AND (v_p1.product_id IS NULL OR p.id <> v_p1.product_id)
          AND (v_p2.product_id IS NULL OR p.id <> v_p2.product_id)
        ORDER BY p.created_at DESC LIMIT 1;

        -- Entry 1: Customer Return -> Damaged Quarantine (Awaiting RMA/Inspection)
        IF v_p1.product_id IS NOT NULL THEN
            v_cost1 := COALESCE(v_p1.unit_cost, 100);
            INSERT INTO stock_adjustments (
                business_id, branch_id, warehouse_id, product_id, batch_id, supplier_id, invoice_id,
                adjustment_number, source_channel, adjustment_type, disposition, resolution_status,
                reason_category, serial_imei, qty, unit_cost, total_cost, refund_amount, notes, actor_user_id, actor_name, created_at
            ) VALUES (
                v_biz.id, v_br_id, v_wh_id, v_p1.product_id, v_p1.batch_id, v_sup_id, v_inv_id,
                'RET-2026-0001', 'POS_RETURN', 'CUSTOMER_RETURN', 'QUARANTINE_DAMAGED', 'QUARANTINE',
                CASE WHEN v_biz.industry_profile = 'mobile' THEN 'DOA / Factory Hardware Defect'
                     WHEN v_biz.industry_profile = 'restaurant' THEN 'Order Remake / Kitchen Error'
                     WHEN v_biz.industry_profile = 'hardware' THEN 'Faulty Power Tool Warranty Claim'
                     WHEN v_biz.industry_profile = 'garage' THEN 'Warranty Part Failure / Claim'
                     WHEN v_biz.industry_profile = 'stationery' THEN 'Defective Calculator / Instrument'
                     ELSE 'Apparel Stitching / Zipper Defect' END,
                CASE WHEN v_biz.industry_profile = 'mobile' THEN '358492104829104' ELSE '' END,
                1, v_cost1, v_cost1, COALESCE(v_p1.sale_price, v_cost1),
                'Seeded POS damaged claim held in QA bay for vendor RMA inspection',
                v_actor_id, COALESCE(v_actor_name, 'Store Manager'), NOW() - INTERVAL '4 days'
            );
        END IF;

        -- Entry 2: Inventory Damage Write-Off (Balanced GL: DR 5100 / CR 1200)
        IF v_p2.product_id IS NOT NULL THEN
            v_cost2 := COALESCE(v_p2.unit_cost, 50);
            UPDATE inventory_batches SET remaining_qty = GREATEST(0, remaining_qty - 1) WHERE id = v_p2.batch_id;

            INSERT INTO journal_entries (business_id, branch_id, entry_number, source_type, source_id, description, entry_date, posted_by)
            VALUES (v_biz.id, v_br_id, 'JE-ADJ-0001', 'STOCK_ADJUSTMENT', v_p2.batch_id, 'Damaged stock write-off (Store handling damage)', CURRENT_DATE - 3, v_actor_id)
            RETURNING id INTO v_je_id;

            INSERT INTO journal_lines (business_id, journal_entry_id, account_id, debit, credit, memo) VALUES
                (v_biz.id, v_je_id, v_coa_shrink, v_cost2, 0, 'Damaged stock write-off expense'),
                (v_biz.id, v_je_id, v_coa_inv, 0, v_cost2, 'FIFO Inventory batch reduction for damage');

            INSERT INTO stock_movements (business_id, branch_id, product_id, batch_id, movement_type, qty_delta, unit_cost, reference_type, reference_id, created_by)
            VALUES (v_biz.id, v_br_id, v_p2.product_id, v_p2.batch_id, 'DAMAGE', -1, v_cost2, 'STOCK_ADJUSTMENT', v_je_id, v_actor_id);

            INSERT INTO stock_adjustments (
                business_id, branch_id, warehouse_id, product_id, batch_id, journal_entry_id,
                adjustment_number, source_channel, adjustment_type, disposition, resolution_status,
                reason_category, serial_imei, qty, unit_cost, total_cost, notes, actor_user_id, actor_name, created_at
            ) VALUES (
                v_biz.id, v_br_id, v_wh_id, v_p2.product_id, v_p2.batch_id, v_je_id,
                'DMG-2026-0002', 'INVENTORY', 'DAMAGE', 'WRITE_OFF_SCRAP', 'SCRAPPED',
                CASE WHEN v_biz.industry_profile = 'mobile' THEN 'DOA / Transit Screen Crack'
                     WHEN v_biz.industry_profile = 'restaurant' THEN 'Plating Spillage / Glass Breakage'
                     WHEN v_biz.industry_profile = 'hardware' THEN 'Damaged Tile / Sanitary Breakage'
                     WHEN v_biz.industry_profile = 'garage' THEN 'Damaged Gasket / Filter in Transit'
                     WHEN v_biz.industry_profile = 'stationery' THEN 'Torn Blister / Crushed Box Write-Off'
                     ELSE 'Display Sun-Fade / Hanger Damage' END,
                CASE WHEN v_biz.industry_profile = 'mobile' THEN '359102847561029' ELSE '' END,
                1, v_cost2, v_cost2,
                'Inspected & written off from branch FIFO layer',
                v_actor_id, COALESCE(v_actor_name, 'Inventory Controller'), NOW() - INTERVAL '3 days'
            );
        END IF;

        -- Entry 3: Wastage / Expiry / E-Waste Write-Off (Balanced GL: DR 5100 / CR 1200)
        IF v_p3.product_id IS NOT NULL THEN
            v_cost3 := COALESCE(v_p3.unit_cost, 40);
            UPDATE inventory_batches SET remaining_qty = GREATEST(0, remaining_qty - 1) WHERE id = v_p3.batch_id;

            INSERT INTO journal_entries (business_id, branch_id, entry_number, source_type, source_id, description, entry_date, posted_by)
            VALUES (v_biz.id, v_br_id, 'JE-WST-0002', 'STOCK_ADJUSTMENT', v_p3.batch_id, 'Wastage / spoilage / e-waste write-off', CURRENT_DATE - 1, v_actor_id)
            RETURNING id INTO v_je_id;

            INSERT INTO journal_lines (business_id, journal_entry_id, account_id, debit, credit, memo) VALUES
                (v_biz.id, v_je_id, v_coa_shrink, v_cost3, 0, 'Wastage & spoilage write-off expense'),
                (v_biz.id, v_je_id, v_coa_inv, 0, v_cost3, 'FIFO inventory depleted due to wastage');

            INSERT INTO stock_movements (business_id, branch_id, product_id, batch_id, movement_type, qty_delta, unit_cost, reference_type, reference_id, created_by)
            VALUES (v_biz.id, v_br_id, v_p3.product_id, v_p3.batch_id, 'WASTAGE', -1, v_cost3, 'STOCK_ADJUSTMENT', v_je_id, v_actor_id);

            INSERT INTO stock_adjustments (
                business_id, branch_id, warehouse_id, product_id, batch_id, journal_entry_id,
                adjustment_number, source_channel, adjustment_type, disposition, resolution_status,
                reason_category, qty, unit_cost, total_cost, notes, actor_user_id, actor_name, created_at
            ) VALUES (
                v_biz.id, v_br_id, v_wh_id, v_p3.product_id, v_p3.batch_id, v_je_id,
                'WST-2026-0003', 'INVENTORY', 'WASTAGE', 'WRITE_OFF_SCRAP', 'SCRAPPED',
                CASE WHEN v_biz.industry_profile = 'mobile' THEN 'Battery Swell / E-Waste Write-Off'
                     WHEN v_biz.industry_profile = 'restaurant' THEN 'Expired Perishable / Spoilage'
                     WHEN v_biz.industry_profile = 'hardware' THEN 'Broken Bag / Cement Moisture Spoilage'
                     WHEN v_biz.industry_profile = 'garage' THEN 'Engine Oil / Coolant Spill & Evaporation'
                     WHEN v_biz.industry_profile = 'stationery' THEN 'Dried Ink / Expired Printer Toner'
                     ELSE 'Seasonal Shrinkage Write-Off' END,
                1, v_cost3, v_cost3,
                'Audited & disposed safely per vertical wastage policy',
                v_actor_id, COALESCE(v_actor_name, 'Inventory Controller'), NOW() - INTERVAL '1 day'
            );
        END IF;
    END LOOP;
END $$;

