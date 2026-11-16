-- Enterprise Multi-Business POS & ERP — Demo Seed Data (Idempotent)
-- Password for all demo accounts: Zona@2026!
-- Supervisor PIN for BusinessOwner / BranchManager / SuperAdmin: 123456

DO $$
DECLARE
    v_biz_zona   UUID := '11111111-1111-1111-1111-111111111111';
    v_biz_nordic UUID := '22222222-2222-2222-2222-222222222222';

    v_br_us      UUID := '11111111-aaaa-1111-1111-111111111101';
    v_br_au      UUID := '11111111-aaaa-1111-1111-111111111102';
    v_br_kr      UUID := '11111111-aaaa-1111-1111-111111111103';
    v_br_nordic  UUID := '22222222-aaaa-2222-2222-222222222201';

    v_term_01    UUID := '11111111-bbbb-1111-1111-111111111101';
    v_term_02    UUID := '11111111-bbbb-1111-1111-111111111102';

    v_u_owner    UUID := '11111111-cccc-1111-1111-111111111101';
    v_u_mgr      UUID := '11111111-cccc-1111-1111-111111111102';
    v_u_cashier  UUID := '11111111-cccc-1111-1111-111111111103';
    v_u_acct     UUID := '11111111-cccc-1111-1111-111111111104';
    v_u_inv      UUID := '11111111-cccc-1111-1111-111111111105';
    v_u_admin    UUID := '11111111-cccc-1111-1111-111111111106';

    v_role_sa    UUID := 'aaaa0001-0000-0000-0000-000000000001';
    v_role_bo    UUID := 'aaaa0001-0000-0000-0000-000000000002';
    v_role_bm    UUID := 'aaaa0001-0000-0000-0000-000000000003';
    v_role_ac    UUID := 'aaaa0001-0000-0000-0000-000000000004';
    v_role_ic    UUID := 'aaaa0001-0000-0000-0000-000000000005';
    v_role_ca    UUID := 'aaaa0001-0000-0000-0000-000000000006';

    v_tg_std     UUID := '11111111-dddd-1111-1111-111111111101';
    v_tg_zero    UUID := '11111111-dddd-1111-1111-111111111102';

    v_cat_knit   UUID := '11111111-eeee-1111-1111-111111111101';
    v_cat_linen  UUID := '11111111-eeee-1111-1111-111111111102';
    v_cat_outer  UUID := '11111111-eeee-1111-1111-111111111103';
    v_cat_acc    UUID := '11111111-eeee-1111-1111-111111111104';

    v_p1         UUID := '11111111-ffff-1111-1111-111111111101';
    v_p2         UUID := '11111111-ffff-1111-1111-111111111102';
    v_p3         UUID := '11111111-ffff-1111-1111-111111111103';
    v_p4         UUID := '11111111-ffff-1111-1111-111111111104';
    v_p5         UUID := '11111111-ffff-1111-1111-111111111105';
    v_p6         UUID := '11111111-ffff-1111-1111-111111111106';
    v_p7         UUID := '11111111-ffff-1111-1111-111111111107';
    v_p8         UUID := '11111111-ffff-1111-1111-111111111108';
    v_p9         UUID := '11111111-ffff-1111-1111-111111111109';
    v_p10        UUID := '11111111-ffff-1111-1111-111111111110';
    v_p11        UUID := '11111111-ffff-1111-1111-111111111111';
    v_p12        UUID := '11111111-ffff-1111-1111-111111111112';

    v_c1         UUID := '11111111-9999-1111-1111-111111111101';
    v_c2         UUID := '11111111-9999-1111-1111-111111111102';
    v_c3         UUID := '11111111-9999-1111-1111-111111111103';
    v_c4         UUID := '11111111-9999-1111-1111-111111111104';

    v_sup1       UUID := '11111111-8888-1111-1111-111111111101';
    v_sup2       UUID := '11111111-8888-1111-1111-111111111102';

    v_coa_cash   UUID := '11111111-7777-1111-1111-111111111010';
    v_coa_card   UUID := '11111111-7777-1111-1111-111111111020';
    v_coa_inv    UUID := '11111111-7777-1111-1111-111111111200';
    v_coa_ap     UUID := '11111111-7777-1111-1111-111111112000';
    v_coa_tax    UUID := '11111111-7777-1111-1111-111111112100';
    v_coa_eq     UUID := '11111111-7777-1111-1111-111111113000';
    v_coa_rev    UUID := '11111111-7777-1111-1111-111111114000';
    v_coa_ret    UUID := '11111111-7777-1111-1111-111111114100';
    v_coa_cogs   UUID := '11111111-7777-1111-1111-111111115000';

    v_fp_q2      UUID := '11111111-6666-1111-1111-111111110002';
    v_fp_q3      UUID := '11111111-6666-1111-1111-111111110003';
    v_fp_q4      UUID := '11111111-6666-1111-1111-111111110004';

    v_je_open    UUID := '11111111-5555-1111-1111-111111110001';
    v_je_inv1    UUID := '11111111-5555-1111-1111-111111110002';
    v_je_inv2    UUID := '11111111-5555-1111-1111-111111110003';
    v_je_inv3    UUID := '11111111-5555-1111-1111-111111110004';
    v_je_inv4    UUID := '11111111-5555-1111-1111-111111110005';

    v_inv1       UUID := '11111111-4444-1111-1111-111111110001';
    v_inv2       UUID := '11111111-4444-1111-1111-111111110002';
    v_inv3       UUID := '11111111-4444-1111-1111-111111110003';
    v_inv4       UUID := '11111111-4444-1111-1111-111111110004';

    v_pass_hash  TEXT := crypt('Zona@2026!', gen_salt('bf', 10));
    v_pin_hash   TEXT := crypt('123456', gen_salt('bf', 10));
BEGIN
    -- 1. Businesses
    INSERT INTO businesses (id, name, legal_name, tax_registration_no, base_currency)
    VALUES
        (v_biz_zona, 'Zona Retail Ltd', 'Zona Retail Global Holdings LLC', 'US-ZR-882940', 'USD'),
        (v_biz_nordic, 'Nordic Minimal Co', 'Nordic Minimal Apparel AB', 'SE-NM-440219', 'USD')
    ON CONFLICT (id) DO NOTHING;

    -- 2. Branches
    INSERT INTO branches (id, business_id, code, name, country_code, country_name, city, address, is_warehouse)
    VALUES
        (v_br_us, v_biz_zona, 'US-SOHO', 'Soho Flagship Store', 'US', 'USA', 'New York', '412 Mercer St, NY 10013', TRUE),
        (v_br_au, v_biz_zona, 'AU-SYD', 'Sydney Bondi Boutique', 'AU', 'Australia', 'Sydney', '88 Gould St, Bondi NSW', FALSE),
        (v_br_kr, v_biz_zona, 'KR-SEL', 'Seoul Seongsu Atelier', 'KR', 'Korea', 'Seoul', '24 Yeonmujang-gil, Seongdong-gu', FALSE),
        (v_br_nordic, v_biz_nordic, 'SE-STO', 'Stockholm Flagship', 'SE', 'Sweden', 'Stockholm', 'Biblioteksgatan 11', TRUE)
    ON CONFLICT (id) DO NOTHING;

    -- 3. Terminals
    INSERT INTO terminals (id, business_id, branch_id, code, name, hardware_serial)
    VALUES
        (v_term_01, v_biz_zona, v_br_us, 'POS-01', 'Terminal #01', 'ZPRO-TERM-2026-001'),
        (v_term_02, v_biz_zona, v_br_us, 'POS-02', 'Terminal #02', 'ZPRO-TERM-2026-002')
    ON CONFLICT (id) DO NOTHING;

    -- 4. Users
    INSERT INTO users (id, email, full_name, password_hash, avatar_url)
    VALUES
        (v_u_owner, 'owner@zonaretail.com', 'Elena Vance', v_pass_hash, '/avatars/elena.svg'),
        (v_u_mgr, 'manager@zonaretail.com', 'Marcus Sterling', v_pass_hash, '/avatars/marcus.svg'),
        (v_u_cashier, 'cashier@zonaretail.com', 'Maya Lin', v_pass_hash, '/avatars/maya.svg'),
        (v_u_acct, 'accountant@zonaretail.com', 'Julian Mercer', v_pass_hash, '/avatars/julian.svg'),
        (v_u_inv, 'inventory@zonaretail.com', 'Liam Hayes', v_pass_hash, '/avatars/liam.svg'),
        (v_u_admin, 'admin@zonaretail.com', 'System SuperAdmin', v_pass_hash, '/avatars/admin.svg')
    ON CONFLICT (id) DO NOTHING;

    -- 5. Roles (6 System Roles)
    INSERT INTO roles (id, code, name, description, is_system)
    VALUES
        (v_role_sa, 'SuperAdmin', 'Super Admin', 'Global multi-business platform administrator', TRUE),
        (v_role_bo, 'BusinessOwner', 'Business Owner', 'Full tenant ownership across branches, GL, and settings', TRUE),
        (v_role_bm, 'BranchManager', 'Branch Manager', 'Branch operations, supervisor PIN overrides, inventory & shifts', TRUE),
        (v_role_ac, 'Accountant', 'Accountant', 'Double-entry GL explorer, fiscal period lock, tax audit', TRUE),
        (v_role_ic, 'InventoryController', 'Inventory Controller', 'Purchase orders, GRN approval, FIFO batch stock control', TRUE),
        (v_role_ca, 'Cashier', 'Cashier', 'Edge POS sales terminal, held bills, receipt printing', TRUE)
    ON CONFLICT (id) DO NOTHING;

    -- 6. Permissions (32 Granular Permissions)
    INSERT INTO permissions (module, action, code, description)
    VALUES
        ('analytics', 'view', 'analytics:view', 'View Executive Overview Bento Dashboard'),
        ('analytics', 'export', 'analytics:export', 'Export business analytics reports'),
        ('pos', 'view', 'pos:view', 'Access POS Terminal catalog and cart'),
        ('pos', 'checkout', 'pos:checkout', 'Complete POS sales checkout'),
        ('pos', 'hold_bill', 'pos:hold_bill', 'Suspend and recall held POS bills'),
        ('pos', 'void_bill', 'pos:void_bill', 'Void active or held POS invoices'),
        ('pos', 'refund', 'pos:refund', 'Process sales refunds and returns'),
        ('pos', 'discount_override', 'pos:discount_override', 'Apply discounts beyond cashier cap'),
        ('pos', 'shift_open', 'pos:shift_open', 'Open cashier POS register shift'),
        ('pos', 'shift_close', 'pos:shift_close', 'Close and reconcile cashier POS shift'),
        ('pos', 'print_receipt', 'pos:print_receipt', 'Send ESC/POS thermal receipt jobs'),
        ('pos', 'kick_drawer', 'pos:kick_drawer', 'Trigger hardware cash drawer kick'),
        ('inventory', 'view', 'inventory:view', 'Inspect FIFO stock batches and movements'),
        ('inventory', 'po_create', 'inventory:po_create', 'Create and submit purchase orders'),
        ('inventory', 'grn_create', 'inventory:grn_create', 'Draft Goods Received Notes'),
        ('inventory', 'grn_approve', 'inventory:grn_approve', 'Approve GRN and create FIFO batch + GL entry'),
        ('inventory', 'adjust', 'inventory:adjust', 'Record manual FIFO stock adjustments'),
        ('accounting', 'view', 'accounting:view', 'View Chart of Accounts and GL Journals'),
        ('accounting', 'journal_post', 'accounting:journal_post', 'Post manual balanced GL journal entries'),
        ('accounting', 'lock_period', 'accounting:lock_period', 'Lock accounting fiscal periods'),
        ('accounting', 'tax_manage', 'accounting:tax_manage', 'Configure multi-tier tax groups and rules'),
        ('settings', 'view', 'settings:view', 'Inspect 6-level settings inheritance tree'),
        ('settings', 'manage', 'settings:manage', 'Override settings across Business/Branch/Terminal/Category/Product'),
        ('rbac', 'view', 'rbac:view', 'Inspect role permissions matrix'),
        ('rbac', 'manage', 'rbac:manage', 'Assign user roles and manage permissions'),
        ('branches', 'view', 'branches:view', 'View branch locations and terminals'),
        ('branches', 'switch', 'branches:switch', 'Switch active branch context'),
        ('branches', 'manage', 'branches:manage', 'Create or update branches and terminals'),
        ('customers', 'view', 'customers:view', 'Search and select POS customers'),
        ('customers', 'manage', 'customers:manage', 'Create and update customer loyalty profiles'),
        ('catalog', 'view', 'catalog:view', 'View product SKUs and barcodes'),
        ('catalog', 'manage', 'catalog:manage', 'Create and update products and categories')
    ON CONFLICT (code) DO NOTHING;

    -- Assign Permissions to Roles
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_role_sa, id FROM permissions
    ON CONFLICT DO NOTHING;

    INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_role_bo, id FROM permissions
    ON CONFLICT DO NOTHING;

    INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_role_bm, id FROM permissions
    WHERE code NOT IN ('accounting:lock_period', 'rbac:manage')
    ON CONFLICT DO NOTHING;

    INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_role_ac, id FROM permissions
    WHERE module IN ('analytics', 'accounting', 'branches', 'settings')
    ON CONFLICT DO NOTHING;

    INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_role_ic, id FROM permissions
    WHERE module IN ('analytics', 'inventory', 'catalog', 'branches')
    ON CONFLICT DO NOTHING;

    INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_role_ca, id FROM permissions
    WHERE code IN (
        'analytics:view', 'pos:view', 'pos:checkout', 'pos:hold_bill',
        'pos:shift_open', 'pos:shift_close', 'pos:print_receipt', 'pos:kick_drawer',
        'customers:view', 'customers:manage', 'catalog:view', 'branches:view'
    )
    ON CONFLICT DO NOTHING;

    -- User Business Roles
    INSERT INTO user_business_roles (user_id, business_id, branch_id, role_id, supervisor_pin_hash)
    VALUES
        (v_u_owner, v_biz_zona, v_br_us, v_role_bo, v_pin_hash),
        (v_u_mgr, v_biz_zona, v_br_us, v_role_bm, v_pin_hash),
        (v_u_cashier, v_biz_zona, v_br_us, v_role_ca, ''),
        (v_u_acct, v_biz_zona, v_br_us, v_role_ac, ''),
        (v_u_inv, v_biz_zona, v_br_us, v_role_ic, ''),
        (v_u_admin, v_biz_zona, v_br_us, v_role_sa, v_pin_hash),
        (v_u_owner, v_biz_nordic, v_br_nordic, v_role_bo, v_pin_hash)
    ON CONFLICT (user_id, business_id, role_id) DO NOTHING;

    -- 7. 6-Level Settings Definitions & Scoped Overrides
    INSERT INTO setting_definitions (key, value_type, default_value, category, label, description)
    VALUES
        ('pos.allow_negative_fifo_stock', 'BOOLEAN', 'false'::jsonb, 'Inventory', 'Allow Negative FIFO Stock', 'Permits POS sale when branch FIFO batches reach zero'),
        ('pos.thermal_paper_width', 'STRING', '"80mm"'::jsonb, 'Hardware', 'Thermal Paper Width', 'ESC/POS receipt width (58mm, 76.2mm, 80mm)'),
        ('pos.auto_kick_cash_drawer', 'BOOLEAN', 'true'::jsonb, 'Hardware', 'Auto-Kick Cash Drawer', 'Sends ESC p pulse after cash checkout'),
        ('pos.max_cashier_discount_pct', 'NUMBER', '10'::jsonb, 'POS Rules', 'Max Cashier Discount (%)', 'Maximum discount without Supervisor PIN override'),
        ('tax.rounding_mode', 'STRING', '"HALF_UP"'::jsonb, 'Taxation', 'Tax Rounding Mode', 'Decimal rounding mode for multi-tier tax lines'),
        ('inventory.auto_po_on_low_stock', 'BOOLEAN', 'true'::jsonb, 'Inventory', 'Auto-Draft Low-Stock PO', 'Triggers Asynq worker to draft POs below reorder point'),
        ('accounting.base_currency', 'STRING', '"USD"'::jsonb, 'Accounting', 'Base Currency', 'Functional ledger currency code')
    ON CONFLICT (key) DO NOTHING;

    INSERT INTO scoped_settings (business_id, setting_key, scope_level, scope_target_id, value_json, updated_by)
    VALUES
        (v_biz_zona, 'accounting.base_currency', 'BUSINESS', v_biz_zona, '"USD"'::jsonb, v_u_owner),
        (v_biz_zona, 'pos.allow_negative_fifo_stock', 'BRANCH', v_br_us, 'false'::jsonb, v_u_mgr),
        (v_biz_zona, 'pos.thermal_paper_width', 'TERMINAL', v_term_01, '"80mm"'::jsonb, v_u_mgr),
        (v_biz_zona, 'pos.thermal_paper_width', 'TERMINAL', v_term_02, '"58mm"'::jsonb, v_u_mgr),
        (v_biz_zona, 'pos.max_cashier_discount_pct', 'CATEGORY', v_cat_knit, '15'::jsonb, v_u_owner),
        (v_biz_zona, 'pos.max_cashier_discount_pct', 'PRODUCT', v_p1, '5'::jsonb, v_u_owner)
    ON CONFLICT DO NOTHING;

    -- 8. Tax Groups & Multi-Tier Tax Rules
    INSERT INTO tax_groups (id, business_id, code, name, is_default)
    VALUES
        (v_tg_std, v_biz_zona, 'STD_APPAREL', 'Standard Apparel Tax (6% + 2% Compound)', TRUE),
        (v_tg_zero, v_biz_zona, 'ZERO_TAX', 'Zero Rated Tax', FALSE)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO tax_rules (business_id, tax_group_id, code, name, tax_type, rate_percent, priority)
    VALUES
        (v_biz_zona, v_tg_std, 'NY_STATE', 'State Retail Tax', 'EXCLUSIVE', 6.0000, 1),
        (v_biz_zona, v_tg_std, 'CITY_LEVY', 'Municipal Surtax', 'COMPOUND', 2.0000, 2),
        (v_biz_zona, v_tg_zero, 'EXEMPT', 'Tax Exempt', 'EXCLUSIVE', 0.0000, 1)
    ON CONFLICT DO NOTHING;

    -- 9. Categories
    INSERT INTO categories (id, business_id, tax_group_id, name, slug, gender_segment)
    VALUES
        (v_cat_knit, v_biz_zona, v_tg_std, 'Knitwear', 'knitwear', 'Women'),
        (v_cat_linen, v_biz_zona, v_tg_std, 'Linen', 'linen', 'Men'),
        (v_cat_outer, v_biz_zona, v_tg_std, 'Outerwear', 'outerwear', 'Women'),
        (v_cat_acc, v_biz_zona, v_tg_std, 'Accessories', 'accessories', 'Unisex')
    ON CONFLICT (id) DO NOTHING;

    -- 10. Products (12 SKUs for balanced 4x3 POS Bento Grid + Reference UI Match)
    INSERT INTO products (id, business_id, category_id, tax_group_id, sku, name, description, image_url, base_price, sale_price, discount_percent, reorder_point, reorder_qty, track_expiry)
    VALUES
        (v_p1, v_biz_zona, v_cat_knit, v_tg_std, 'ZP-CRD-001', 'Sleeved cardigan', 'Fine merino wool knit cardigan in oatmeal', '/products/cardigan.svg', 55.0000, 52.2500, 5.0000, 20.0000, 60.0000, FALSE),
        (v_p2, v_biz_zona, v_cat_linen, v_tg_std, 'ZP-LNS-002', 'Relaxed fit linen shorts', 'Breathable European flax linen tailored shorts', '/products/linen-shorts.svg', 62.5000, 57.5000, 8.0000, 25.0000, 80.0000, FALSE),
        (v_p3, v_biz_zona, v_cat_knit, v_tg_std, 'ZP-SWT-003', 'Womens'' sweatshirt', 'Heavyweight organic cotton loopback fleece', '/products/sweatshirt.svg', 78.0000, 66.3000, 15.0000, 15.0000, 50.0000, FALSE),
        (v_p4, v_biz_zona, v_cat_outer, v_tg_std, 'ZP-TRC-004', 'Tailored wool trench', 'Double-breasted obsidian structured coat', '/products/trench.svg', 240.0000, 216.0000, 10.0000, 8.0000, 25.0000, FALSE),
        (v_p5, v_biz_zona, v_cat_linen, v_tg_std, 'ZP-SHT-005', 'Pleated resort shirt', 'Relaxed collar crisp resort linen shirt', '/products/shirt.svg', 68.0000, 68.0000, 0.0000, 15.0000, 45.0000, FALSE),
        (v_p6, v_biz_zona, v_cat_outer, v_tg_std, 'ZP-BLZ-006', 'Structured crepe blazer', 'Minimalist lavender-lined evening blazer', '/products/blazer.svg', 165.0000, 148.5000, 10.0000, 10.0000, 30.0000, FALSE),
        (v_p7, v_biz_zona, v_cat_knit, v_tg_std, 'ZP-TRN-007', 'Ribbed turtleneck top', 'Soft cashmere-blend ribbed mock neck', '/products/turtleneck.svg', 85.0000, 76.5000, 10.0000, 12.0000, 40.0000, FALSE),
        (v_p8, v_biz_zona, v_cat_linen, v_tg_std, 'ZP-TRS-008', 'Wide-leg linen trousers', 'High-waisted draped summer trousers', '/products/trousers.svg', 95.0000, 85.5000, 10.0000, 12.0000, 40.0000, FALSE),
        (v_p9, v_biz_zona, v_cat_acc, v_tg_std, 'ZP-TOT-009', 'Pebbled leather tote', 'Structured obsidian carryall tote bag', '/products/tote.svg', 140.0000, 126.0000, 10.0000, 10.0000, 25.0000, FALSE),
        (v_p10, v_biz_zona, v_cat_acc, v_tg_std, 'ZP-SCF-010', 'Silk twill neckerchief', 'Printed lavender geometric silk scarf', '/products/scarf.svg', 45.0000, 45.0000, 0.0000, 20.0000, 50.0000, FALSE),
        (v_p11, v_biz_zona, v_cat_outer, v_tg_std, 'ZP-JKT-011', 'Cropped utility jacket', 'Washed canvas cropped workwear jacket', '/products/jacket.svg', 130.0000, 117.0000, 10.0000, 10.0000, 30.0000, FALSE),
        (v_p12, v_biz_zona, v_cat_acc, v_tg_std, 'ZP-CAP-012', 'Brushed wool cap', 'Minimalist 6-panel charcoal cap', '/products/cap.svg', 38.0000, 34.2000, 10.0000, 20.0000, 60.0000, FALSE)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO product_barcodes (business_id, product_id, barcode, is_primary)
    VALUES
        (v_biz_zona, v_p1, '8901001000011', TRUE),
        (v_biz_zona, v_p2, '8901001000028', TRUE),
        (v_biz_zona, v_p3, '8901001000035', TRUE),
        (v_biz_zona, v_p4, '8901001000042', TRUE),
        (v_biz_zona, v_p5, '8901001000059', TRUE),
        (v_biz_zona, v_p6, '8901001000066', TRUE),
        (v_biz_zona, v_p7, '8901001000073', TRUE),
        (v_biz_zona, v_p8, '8901001000080', TRUE),
        (v_biz_zona, v_p9, '8901001000097', TRUE),
        (v_biz_zona, v_p10, '8901001000103', TRUE),
        (v_biz_zona, v_p11, '8901001000110', TRUE),
        (v_biz_zona, v_p12, '8901001000127', TRUE)
    ON CONFLICT DO NOTHING;

    -- 11. Customers
    INSERT INTO customers (id, business_id, name, email, phone, tier, loyalty_points, avatar_url)
    VALUES
        (v_c1, v_biz_zona, 'Alia Bonner', 'alia.bonner@example.com', '+1 (212) 555-0148', 'Loyalty VIP', 1420, '/avatars/alia.svg'),
        (v_c2, v_biz_zona, 'Kobi Potts', 'kobi.potts@example.com', '+1 (212) 555-0172', 'Standard', 320, '/avatars/kobi.svg'),
        (v_c3, v_biz_zona, 'Austin Camacho', 'austin.c@example.com', '+1 (212) 555-0194', 'Loyalty VIP', 980, '/avatars/austin.svg'),
        (v_c4, v_biz_zona, 'Millie Tran', 'millie.tran@example.com', '+1 (212) 555-0122', 'Gold Member', 760, '/avatars/millie.svg')
    ON CONFLICT (id) DO NOTHING;

    -- 12. Suppliers
    INSERT INTO suppliers (id, business_id, code, name, email, phone, tax_id, payment_terms_days)
    VALUES
        (v_sup1, v_biz_zona, 'SUP-LOOM', 'Loom & Thread Apparel Ltd', 'orders@loomthread.com', '+1 (212) 555-0199', 'TAX-LT-9921', 30),
        (v_sup2, v_biz_zona, 'SUP-FLAX', 'European Flax & Linen Mills', 'supply@flaxmills.eu', '+32 2 555 0144', 'VAT-BE-4410', 45)
    ON CONFLICT (id) DO NOTHING;

    -- 13. Inventory FIFO Batches (Oldest received_at depleted first!)
    INSERT INTO inventory_batches (id, business_id, branch_id, product_id, batch_number, received_at, expiry_date, unit_cost, initial_qty, remaining_qty)
    VALUES
        ('11111111-3333-1111-1111-111111110001', v_biz_zona, v_br_us, v_p1, 'BATCH-2026-001A', NOW() - INTERVAL '45 days', NULL, 24.0000, 50.0000, 38.0000),
        ('11111111-3333-1111-1111-111111110002', v_biz_zona, v_br_us, v_p1, 'BATCH-2026-001B', NOW() - INTERVAL '15 days', NULL, 26.5000, 80.0000, 80.0000),
        ('11111111-3333-1111-1111-111111110003', v_biz_zona, v_br_us, v_p2, 'BATCH-2026-002A', NOW() - INTERVAL '30 days', NULL, 27.0000, 328.0000, 328.0000),
        ('11111111-3333-1111-1111-111111110004', v_biz_zona, v_br_us, v_p3, 'BATCH-2026-003A', NOW() - INTERVAL '25 days', NULL, 31.0000, 145.0000, 145.0000),
        ('11111111-3333-1111-1111-111111110005', v_biz_zona, v_br_us, v_p4, 'BATCH-2026-004A', NOW() - INTERVAL '20 days', NULL, 98.0000, 28.0000, 28.0000),
        ('11111111-3333-1111-1111-111111110006', v_biz_zona, v_br_us, v_p5, 'BATCH-2026-005A', NOW() - INTERVAL '18 days', NULL, 29.5000, 64.0000, 64.0000),
        ('11111111-3333-1111-1111-111111110007', v_biz_zona, v_br_us, v_p6, 'BATCH-2026-006A', NOW() - INTERVAL '16 days', NULL, 71.0000, 34.0000, 34.0000),
        ('11111111-3333-1111-1111-111111110008', v_biz_zona, v_br_us, v_p7, 'BATCH-2026-007A', NOW() - INTERVAL '14 days', NULL, 34.0000, 52.0000, 52.0000),
        ('11111111-3333-1111-1111-111111110009', v_biz_zona, v_br_us, v_p8, 'BATCH-2026-008A', NOW() - INTERVAL '12 days', NULL, 38.0000, 41.0000, 41.0000),
        ('11111111-3333-1111-1111-111111110010', v_biz_zona, v_br_us, v_p9, 'BATCH-2026-009A', NOW() - INTERVAL '10 days', NULL, 59.0000, 6.0000, 6.0000),
        ('11111111-3333-1111-1111-111111110011', v_biz_zona, v_br_us, v_p10, 'BATCH-2026-010A', NOW() - INTERVAL '8 days', NULL, 18.0000, 90.0000, 90.0000),
        ('11111111-3333-1111-1111-111111110012', v_biz_zona, v_br_us, v_p11, 'BATCH-2026-011A', NOW() - INTERVAL '6 days', NULL, 54.0000, 19.0000, 19.0000),
        ('11111111-3333-1111-1111-111111110013', v_biz_zona, v_br_us, v_p12, 'BATCH-2026-012A', NOW() - INTERVAL '4 days', NULL, 14.5000, 75.0000, 75.0000)
    ON CONFLICT (id) DO NOTHING;

    -- 14. Chart of Accounts
    INSERT INTO chart_of_accounts (id, business_id, code, name, account_type)
    VALUES
        (v_coa_cash, v_biz_zona, '1010', 'Cash on Hand', 'ASSET'),
        (v_coa_card, v_biz_zona, '1020', 'Card Clearing Receivable', 'ASSET'),
        (v_coa_inv, v_biz_zona, '1200', 'Inventory Asset (FIFO)', 'ASSET'),
        (v_coa_ap, v_biz_zona, '2000', 'Accounts Payable', 'LIABILITY'),
        (v_coa_tax, v_biz_zona, '2100', 'Sales Tax Payable', 'LIABILITY'),
        (v_coa_eq, v_biz_zona, '3000', 'Owner Equity', 'EQUITY'),
        (v_coa_rev, v_biz_zona, '4000', 'Sales Revenue', 'REVENUE'),
        (v_coa_ret, v_biz_zona, '4100', 'Sales Returns & Allowances', 'REVENUE'),
        (v_coa_cogs, v_biz_zona, '5000', 'Cost of Goods Sold', 'COGS')
    ON CONFLICT (id) DO NOTHING;

    -- 15. Fiscal Periods
    INSERT INTO fiscal_periods (id, business_id, period_name, start_date, end_date, is_locked)
    VALUES
        (v_fp_q2, v_biz_zona, 'FY2026-Q2', '2026-04-01', '2026-06-30', TRUE),
        (v_fp_q3, v_biz_zona, 'FY2026-Q3', '2026-07-01', '2026-09-30', FALSE),
        (v_fp_q4, v_biz_zona, 'FY2026-Q4', '2026-10-01', '2026-12-31', FALSE)
    ON CONFLICT (id) DO NOTHING;

    -- 16. Opening Inventory & Equity Journal (Balanced)
    IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE id = v_je_open) THEN
        INSERT INTO journal_entries (id, business_id, branch_id, fiscal_period_id, entry_number, source_type, source_id, description, entry_date, posted_by)
        VALUES (v_je_open, v_biz_zona, v_br_us, v_fp_q3, 'JE-2026-0001', 'OPENING_BALANCE', v_biz_zona, 'Opening FIFO Inventory & Cash Capitalization', '2026-07-01', v_u_acct);

        INSERT INTO journal_lines (business_id, journal_entry_id, account_id, debit, credit, memo)
        VALUES
            (v_biz_zona, v_je_open, v_coa_cash, 25000.0000, 0, 'Opening register & vault cash'),
            (v_biz_zona, v_je_open, v_coa_inv, 31942.0000, 0, 'Initial FIFO stock valuation'),
            (v_biz_zona, v_je_open, v_coa_eq, 0, 56942.0000, 'Paid-in owner capital');
    END IF;

    -- 17. Sample Sales Invoices & Balanced GL Journals (Matching Reference UI Activity)
    IF NOT EXISTS (SELECT 1 FROM sales_invoices WHERE id = v_inv1) THEN
        INSERT INTO sales_invoices (id, business_id, branch_id, terminal_id, cashier_user_id, customer_id, invoice_number, idempotency_key, invoice_type, status, subtotal, discount_total, tax_total, grand_total, total_cogs, created_at)
        VALUES
            (v_inv1, v_biz_zona, v_br_us, v_term_01, v_u_cashier, v_c1, '#513 003', '90000000-0000-7000-8000-000000000001', 'SALE', 'PAID', 287.6400, 15.0000, 23.3600, 311.0000, 134.0000, NOW() - INTERVAL '25 minutes'),
            (v_inv2, v_biz_zona, v_br_au, v_term_01, v_u_cashier, v_c2, '#513 002', '90000000-0000-7000-8000-000000000002', 'REFUND', 'REFUND', 115.0000, 0.0000, 9.3400, 124.3400, 54.0000, NOW() - INTERVAL '2 hours'),
            (v_inv3, v_biz_zona, v_br_kr, v_term_01, v_u_cashier, v_c3, '#513 001', '90000000-0000-7000-8000-000000000003', 'SALE', 'PAID', 216.0000, 0.0000, 17.5400, 233.5400, 98.0000, NOW() - INTERVAL '5 hours'),
            (v_inv4, v_biz_zona, v_br_us, v_term_02, v_u_cashier, v_c4, '#513 000', '90000000-0000-7000-8000-000000000004', 'SALE', 'PAID', 175.8000, 0.0000, 14.2800, 190.0800, 75.5000, NOW() - INTERVAL '1 day');

        INSERT INTO sales_invoice_items (business_id, invoice_id, product_id, qty, unit_price, discount_amount, tax_amount, line_total, batch_cogs)
        VALUES
            (v_biz_zona, v_inv1, v_p1, 2, 52.2500, 5.0000, 8.4800, 112.9800, 48.0000),
            (v_biz_zona, v_inv1, v_p2, 2, 57.5000, 5.0000, 9.3400, 124.3400, 54.0000),
            (v_biz_zona, v_inv1, v_p3, 1, 68.1400, 5.0000, 5.5400, 73.6800, 32.0000),
            (v_biz_zona, v_inv2, v_p2, 2, 57.5000, 0, 9.3400, 124.3400, 54.0000),
            (v_biz_zona, v_inv3, v_p4, 1, 216.0000, 0, 17.5400, 233.5400, 98.0000),
            (v_biz_zona, v_inv4, v_p3, 2, 66.3000, 0, 10.7600, 143.3600, 62.0000),
            (v_biz_zona, v_inv4, v_p12, 1, 43.2000, 0, 3.5200, 46.7200, 13.5000);

        INSERT INTO invoice_payments (business_id, invoice_id, payment_method, amount, tendered_amount, change_given)
        VALUES
            (v_biz_zona, v_inv1, 'CARD', 311.0000, 311.0000, 0),
            (v_biz_zona, v_inv2, 'CASH', 124.3400, 124.3400, 0),
            (v_biz_zona, v_inv3, 'CARD', 233.5400, 233.5400, 0),
            (v_biz_zona, v_inv4, 'CASH', 190.0800, 200.0000, 9.9200);

        -- Balanced GL for Invoice 1 (#513 003)
        INSERT INTO journal_entries (id, business_id, branch_id, fiscal_period_id, entry_number, source_type, source_id, description, posted_by)
        VALUES (v_je_inv1, v_biz_zona, v_br_us, v_fp_q4, 'JE-2026-0002', 'POS_SALE', v_inv1, 'POS Sale #513 003 - Alia Bonner', v_u_cashier);
        INSERT INTO journal_lines (business_id, journal_entry_id, account_id, debit, credit, memo)
        VALUES
            (v_biz_zona, v_je_inv1, v_coa_card, 311.0000, 0, 'Card settlement'),
            (v_biz_zona, v_je_inv1, v_coa_rev, 0, 287.6400, 'Retail apparel revenue'),
            (v_biz_zona, v_je_inv1, v_coa_tax, 0, 23.3600, 'Multi-tier sales tax'),
            (v_biz_zona, v_je_inv1, v_coa_cogs, 134.0000, 0, 'FIFO batch COGS'),
            (v_biz_zona, v_je_inv1, v_coa_inv, 0, 134.0000, 'FIFO batch depletion');

        -- Balanced GL for Invoice 2 (Refund)
        INSERT INTO journal_entries (id, business_id, branch_id, fiscal_period_id, entry_number, source_type, source_id, description, posted_by)
        VALUES (v_je_inv2, v_biz_zona, v_br_au, v_fp_q4, 'JE-2026-0003', 'POS_REFUND', v_inv2, 'POS Refund #513 002 - Kobi Potts', v_u_mgr);
        INSERT INTO journal_lines (business_id, journal_entry_id, account_id, debit, credit, memo)
        VALUES
            (v_biz_zona, v_je_inv2, v_coa_ret, 115.0000, 0, 'Sales return reversal'),
            (v_biz_zona, v_je_inv2, v_coa_tax, 9.3400, 0, 'Tax payable reversal'),
            (v_biz_zona, v_je_inv2, v_coa_cash, 0, 124.3400, 'Cash refund payout'),
            (v_biz_zona, v_je_inv2, v_coa_inv, 54.0000, 0, 'Returned item FIFO restock'),
            (v_biz_zona, v_je_inv2, v_coa_cogs, 0, 54.0000, 'COGS reversal');

        -- Balanced GL for Invoice 3
        INSERT INTO journal_entries (id, business_id, branch_id, fiscal_period_id, entry_number, source_type, source_id, description, posted_by)
        VALUES (v_je_inv3, v_biz_zona, v_br_kr, v_fp_q4, 'JE-2026-0004', 'POS_SALE', v_inv3, 'POS Sale #513 001 - Austin Camacho', v_u_cashier);
        INSERT INTO journal_lines (business_id, journal_entry_id, account_id, debit, credit, memo)
        VALUES
            (v_biz_zona, v_je_inv3, v_coa_card, 233.5400, 0, 'Card settlement'),
            (v_biz_zona, v_je_inv3, v_coa_rev, 0, 216.0000, 'Retail apparel revenue'),
            (v_biz_zona, v_je_inv3, v_coa_tax, 0, 17.5400, 'Multi-tier sales tax'),
            (v_biz_zona, v_je_inv3, v_coa_cogs, 98.0000, 0, 'FIFO batch COGS'),
            (v_biz_zona, v_je_inv3, v_coa_inv, 0, 98.0000, 'FIFO batch depletion');

        -- Balanced GL for Invoice 4
        INSERT INTO journal_entries (id, business_id, branch_id, fiscal_period_id, entry_number, source_type, source_id, description, posted_by)
        VALUES (v_je_inv4, v_biz_zona, v_br_us, v_fp_q4, 'JE-2026-0005', 'POS_SALE', v_inv4, 'POS Sale #513 000 - Millie Tran', v_u_cashier);
        INSERT INTO journal_lines (business_id, journal_entry_id, account_id, debit, credit, memo)
        VALUES
            (v_biz_zona, v_je_inv4, v_coa_cash, 190.0800, 0, 'Cash drawer deposit'),
            (v_biz_zona, v_je_inv4, v_coa_rev, 0, 175.8000, 'Retail apparel revenue'),
            (v_biz_zona, v_je_inv4, v_coa_tax, 0, 14.2800, 'Multi-tier sales tax'),
            (v_biz_zona, v_je_inv4, v_coa_cogs, 75.5000, 0, 'FIFO batch COGS'),
            (v_biz_zona, v_je_inv4, v_coa_inv, 0, 75.5000, 'FIFO batch depletion');
    END IF;

    -- 18. Suspended / Held Bills (3 Active Tickets for Screen 3)
    IF NOT EXISTS (SELECT 1 FROM suspended_bills WHERE business_id = v_biz_zona) THEN
        INSERT INTO suspended_bills (id, business_id, branch_id, terminal_id, cashier_user_id, customer_id, hold_code, notes, subtotal, tax_total, grand_total, status, held_at)
        VALUES
            ('11111111-2222-1111-1111-111111110001', v_biz_zona, v_br_us, v_term_02, v_u_cashier, v_c1, 'HOLD-01', 'Customer trying on coat size M', 287.6400, 23.3600, 311.0000, 'HELD', NOW() - INTERVAL '4 minutes'),
            ('11111111-2222-1111-1111-111111110002', v_biz_zona, v_br_us, v_term_01, v_u_cashier, v_c3, 'HOLD-02', 'Waiting for gift wrap selection', 148.5000, 12.0600, 160.5600, 'HELD', NOW() - INTERVAL '14 minutes'),
            ('11111111-2222-1111-1111-111111110003', v_biz_zona, v_br_us, v_term_01, v_u_cashier, v_c4, 'HOLD-03', 'Split payment pending card auth', 115.0000, 9.3400, 124.3400, 'HELD', NOW() - INTERVAL '27 minutes');

        INSERT INTO suspended_bill_items (business_id, suspended_bill_id, product_id, qty, unit_price, discount_percent)
        VALUES
            (v_biz_zona, '11111111-2222-1111-1111-111111110001', v_p1, 2, 52.2500, 5),
            (v_biz_zona, '11111111-2222-1111-1111-111111110001', v_p3, 3, 66.3000, 0),
            (v_biz_zona, '11111111-2222-1111-1111-111111110002', v_p6, 1, 148.5000, 0),
            (v_biz_zona, '11111111-2222-1111-1111-111111110003', v_p2, 2, 57.5000, 0);
    END IF;
END $$;

