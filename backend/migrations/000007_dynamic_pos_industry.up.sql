-- Phase 9: Fullscreen 4-Pane Dynamic POS Terminal & 6-Industry Mode Configuration

ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS industry_profile TEXT NOT NULL DEFAULT 'retail'
        CHECK (industry_profile IN ('retail', 'restaurant', 'hardware', 'garage', 'mobile', 'stationery'));

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS enable_serial_tracking BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_service_labor       BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS allow_fractional_qty   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS variants_json          JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS modifiers_json         JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS uom_options_json       JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS warranty_terms         TEXT NOT NULL DEFAULT '';

ALTER TABLE suspended_bills
    ADD COLUMN IF NOT EXISTS order_channel      TEXT NOT NULL DEFAULT 'COUNTER',
    ADD COLUMN IF NOT EXISTS table_or_bay_label TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS vehicle_plate      TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS kot_status         TEXT NOT NULL DEFAULT 'NONE';

ALTER TABLE suspended_bill_items
    ADD COLUMN IF NOT EXISTS item_meta_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE sales_invoices
    ADD COLUMN IF NOT EXISTS order_channel   TEXT NOT NULL DEFAULT 'COUNTER',
    ADD COLUMN IF NOT EXISTS order_meta_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE sales_invoice_items
    ADD COLUMN IF NOT EXISTS item_meta_json JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 6-Level Settings Definitions for POS Terminal 4-Pane Layout & Industry Capabilities
INSERT INTO setting_definitions (key, value_type, default_value, category, label, description)
VALUES
    ('pos.ui.layout_mode', 'STRING', '"retail"'::jsonb, 'POS Terminal', 'Industry Terminal Mode', 'Active 4-pane industry profile: restaurant, hardware, garage, retail, mobile, or stationery'),
    ('pos.layout.fullscreen_on_load', 'BOOLEAN', 'true'::jsonb, 'POS Terminal', 'Fullscreen POS on Launch', 'Request browser fullscreen when entering the 4-pane Edge POS terminal'),
    ('pos.layout.show_categories_pane', 'BOOLEAN', 'true'::jsonb, 'POS Terminal', 'Show Categories Pane', 'Display Pane 1 vertical category filter rail in 4-pane terminal'),
    ('pos.layout.show_outgoing_orders_pane', 'BOOLEAN', 'true'::jsonb, 'POS Terminal', 'Show Outgoing Orders Pane', 'Display Pane 3 pending/KOT/bay tickets; disabling expands product grid to 7 columns'),
    ('pos.layout.footer_quick_edit_sidebar', 'BOOLEAN', 'true'::jsonb, 'POS Terminal', 'Footer Quick-Edit Drawer', 'Expose left-side Quick Product Update drawer in the fixed Obsidian terminal footer'),
    ('pos.features.enable_tables', 'BOOLEAN', 'false'::jsonb, 'POS Terminal', 'Enable Restaurant Tables', 'Enable Table # assignment and Dine-in/Takeaway/Delivery flow (Restaurant & F&B)'),
    ('pos.features.enable_kot', 'BOOLEAN', 'false'::jsonb, 'POS Terminal', 'Enable Kitchen KOT Queue', 'Route restaurant orders to Kitchen Order Ticket status workflow in Pane 3'),
    ('pos.features.allow_fractional_qty', 'BOOLEAN', 'false'::jsonb, 'POS Terminal', 'Allow Fractional Quantities', 'Allow decimal item quantities such as 0.50 Kg or 2.25 meters in POS cart'),
    ('pos.features.multi_uom_toggle', 'BOOLEAN', 'false'::jsonb, 'POS Terminal', 'Enable Multi-UOM Switching', 'Allow unit of measure switching (e.g., Piece, Box, Roll) per cart line'),
    ('pos.features.require_vehicle_plate', 'BOOLEAN', 'false'::jsonb, 'POS Terminal', 'Require Vehicle Plate', 'Enforce vehicle license plate entry on POS checkout/job cards (Garage & Auto)'),
    ('pos.features.split_labor_parts', 'BOOLEAN', 'false'::jsonb, 'POS Terminal', 'Split Parts vs Labor', 'Group cart items into Parts and Labor/Service sections (Garage & Auto)'),
    ('pos.features.matrix_variants', 'BOOLEAN', 'false'::jsonb, 'POS Terminal', 'Enable Matrix Variants', 'Show size/color matrix variant picker on configurable apparel/retail items'),
    ('pos.features.require_serial_imei', 'BOOLEAN', 'false'::jsonb, 'POS Terminal', 'Require Serial / IMEI', 'Require IMEI or serial capture when adding serialized items (Mobile & Electronics)'),
    ('pos.features.enable_bundles', 'BOOLEAN', 'false'::jsonb, 'POS Terminal', 'Enable Bundle Prompts', 'Surface quick bundle combo suggestions in stationery and fast checkout mode')
ON CONFLICT (key) DO NOTHING;

-- Seed default level-2 setting overrides per business based on industry_profile
INSERT INTO scoped_settings (business_id, setting_key, scope_level, scope_target_id, value_json, updated_by)
SELECT
    b.id,
    'pos.ui.layout_mode',
    'BUSINESS',
    b.id,
    to_jsonb(COALESCE(NULLIF(b.industry_profile, ''), 'retail')),
    NULL
FROM businesses b
WHERE NOT EXISTS (
    SELECT 1 FROM scoped_settings ss
    WHERE ss.business_id = b.id
      AND ss.setting_key = 'pos.ui.layout_mode'
      AND ss.scope_level = 'BUSINESS'
      AND COALESCE(ss.scope_target_id, '00000000-0000-0000-0000-000000000000'::UUID) = b.id
);

-- Enable matrix variants on default Zona Retail Ltd tenant and seed realistic product capability examples
INSERT INTO scoped_settings (business_id, setting_key, scope_level, scope_target_id, value_json, updated_by)
SELECT
    '11111111-1111-1111-1111-111111111111'::UUID,
    'pos.features.matrix_variants',
    'BUSINESS',
    '11111111-1111-1111-1111-111111111111'::UUID,
    'true'::jsonb,
    NULL
WHERE EXISTS (SELECT 1 FROM businesses WHERE id = '11111111-1111-1111-1111-111111111111')
  AND NOT EXISTS (
    SELECT 1 FROM scoped_settings
    WHERE business_id = '11111111-1111-1111-1111-111111111111'
      AND setting_key = 'pos.features.matrix_variants'
      AND scope_level = 'BUSINESS'
  );

UPDATE products
SET
    variants_json = '[
        {"sku_suffix":"OBS-S","color":"Obsidian","size":"S"},
        {"sku_suffix":"OBS-M","color":"Obsidian","size":"M"},
        {"sku_suffix":"OBS-L","color":"Obsidian","size":"L"},
        {"sku_suffix":"OAT-M","color":"Oatmeal","size":"M"},
        {"sku_suffix":"LAV-M","color":"Lavender","size":"M"}
    ]'::jsonb,
    uom_options_json = '[{"label":"Piece","factor":1},{"label":"Pack (3)","factor":3}]'::jsonb
WHERE business_id = '11111111-1111-1111-1111-111111111111'
  AND sku IN ('ZP-CRD-001', 'ZP-SHT-005', 'ZP-SWT-003');

UPDATE products
SET
    modifiers_json = '["Gift Wrap","Express Hemming","Priority Prep","Extra Bag"]'::jsonb,
    warranty_terms = '30-Day In-Store Tailoring & Quality Guarantee'
WHERE business_id = '11111111-1111-1111-1111-111111111111'
  AND sku IN ('ZP-TRC-004', 'ZP-BLZ-006', 'ZP-JKT-011');

UPDATE products
SET
    enable_serial_tracking = TRUE,
    warranty_terms = '12-Month Hardware & Stitch Serial Warranty'
WHERE business_id = '11111111-1111-1111-1111-111111111111'
  AND sku = 'ZP-TOT-009';

UPDATE products
SET
    allow_fractional_qty = TRUE,
    uom_options_json = '[{"label":"Yard","factor":1},{"label":"Bolt (5 Yd)","factor":5}]'::jsonb
WHERE business_id = '11111111-1111-1111-1111-111111111111'
  AND sku IN ('ZP-LNS-002', 'ZP-TRS-008');

UPDATE products
SET is_service_labor = TRUE
WHERE business_id = '11111111-1111-1111-1111-111111111111'
  AND sku = 'ZP-SCF-010';

-- Ensure at least 2 live HELD tickets exist for Zona Retail Ltd Soho Flagship so Pane 3 renders PerforatedTicket feed immediately
INSERT INTO suspended_bills (
    id, business_id, branch_id, terminal_id, cashier_user_id, customer_id,
    hold_code, notes, order_channel, table_or_bay_label, vehicle_plate, kot_status,
    subtotal, tax_total, grand_total, status, held_at
)
SELECT
    '11111111-2222-1111-1111-111111110011'::UUID,
    '11111111-1111-1111-1111-111111111111'::UUID,
    '11111111-aaaa-1111-1111-111111111101'::UUID,
    '11111111-bbbb-1111-1111-111111111101'::UUID,
    '11111111-cccc-1111-1111-111111111101'::UUID,
    NULL,
    'HOLD-21',
    'Fitting Room 2 • Express prep',
    'DINE_IN',
    'Table 4',
    '',
    'PREPARING',
    120.2500,
    9.7600,
    130.0100,
    'HELD',
    NOW() - INTERVAL '12 minutes'
WHERE EXISTS (SELECT 1 FROM businesses WHERE id = '11111111-1111-1111-1111-111111111111')
  AND NOT EXISTS (SELECT 1 FROM suspended_bills WHERE id = '11111111-2222-1111-1111-111111110011');

INSERT INTO suspended_bill_items (
    id, business_id, suspended_bill_id, product_id, qty, unit_price, discount_percent, item_meta_json
)
SELECT
    '11111111-3333-1111-1111-111111110011'::UUID,
    '11111111-1111-1111-1111-111111111111'::UUID,
    '11111111-2222-1111-1111-111111110011'::UUID,
    '11111111-ffff-1111-1111-111111111105'::UUID,
    1.0000,
    68.0000,
    0,
    '{"variant":"Obsidian / M"}'::jsonb
WHERE EXISTS (SELECT 1 FROM suspended_bills WHERE id = '11111111-2222-1111-1111-111111110011')
  AND EXISTS (SELECT 1 FROM products WHERE id = '11111111-ffff-1111-1111-111111111105')
  AND NOT EXISTS (SELECT 1 FROM suspended_bill_items WHERE id = '11111111-3333-1111-1111-111111110011');

INSERT INTO suspended_bill_items (
    id, business_id, suspended_bill_id, product_id, qty, unit_price, discount_percent, item_meta_json
)
SELECT
    '11111111-3333-1111-1111-111111110012'::UUID,
    '11111111-1111-1111-1111-111111111111'::UUID,
    '11111111-2222-1111-1111-111111110011'::UUID,
    '11111111-ffff-1111-1111-111111111101'::UUID,
    1.0000,
    52.2500,
    0,
    '{"variant":"Oatmeal / M"}'::jsonb
WHERE EXISTS (SELECT 1 FROM suspended_bills WHERE id = '11111111-2222-1111-1111-111111110011')
  AND EXISTS (SELECT 1 FROM products WHERE id = '11111111-ffff-1111-1111-111111111101')
  AND NOT EXISTS (SELECT 1 FROM suspended_bill_items WHERE id = '11111111-3333-1111-1111-111111110012');

INSERT INTO suspended_bills (
    id, business_id, branch_id, terminal_id, cashier_user_id, customer_id,
    hold_code, notes, order_channel, table_or_bay_label, vehicle_plate, kot_status,
    subtotal, tax_total, grand_total, status, held_at
)
SELECT
    '11111111-2222-1111-1111-111111110012'::UUID,
    '11111111-1111-1111-1111-111111111111'::UUID,
    '11111111-aaaa-1111-1111-111111111101'::UUID,
    '11111111-bbbb-1111-1111-111111111101'::UUID,
    '11111111-cccc-1111-1111-111111111101'::UUID,
    NULL,
    'HOLD-22',
    'Priority pickup • Ready for dispatch',
    'TAKEAWAY',
    'Bay B-02',
    'WP CAB-4821',
    'READY',
    216.0000,
    17.5400,
    233.5400,
    'HELD',
    NOW() - INTERVAL '4 minutes'
WHERE EXISTS (SELECT 1 FROM businesses WHERE id = '11111111-1111-1111-1111-111111111111')
  AND NOT EXISTS (SELECT 1 FROM suspended_bills WHERE id = '11111111-2222-1111-1111-111111110012');

INSERT INTO suspended_bill_items (
    id, business_id, suspended_bill_id, product_id, qty, unit_price, discount_percent, item_meta_json
)
SELECT
    '11111111-3333-1111-1111-111111110013'::UUID,
    '11111111-1111-1111-1111-111111111111'::UUID,
    '11111111-2222-1111-1111-111111110012'::UUID,
    '11111111-ffff-1111-1111-111111111104'::UUID,
    1.0000,
    216.0000,
    0,
    '{}'::jsonb
WHERE EXISTS (SELECT 1 FROM suspended_bills WHERE id = '11111111-2222-1111-1111-111111110012')
  AND EXISTS (SELECT 1 FROM products WHERE id = '11111111-ffff-1111-1111-111111111104')
  AND NOT EXISTS (SELECT 1 FROM suspended_bill_items WHERE id = '11111111-3333-1111-1111-111111110013');

