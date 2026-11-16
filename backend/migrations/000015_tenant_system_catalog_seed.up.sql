-- Ensure every Master & Isolated Tenant DB has canonical system roles, RBAC permissions, and 6-level setting definitions

-- 1. System Roles (canonical UUIDs preserve user_business_roles references cleanly)
INSERT INTO roles (id, business_id, code, name, description, is_system)
VALUES
    ('aaaa0001-0000-0000-0000-000000000001', NULL, 'SuperAdmin', 'Super Admin', 'Global multi-business platform administrator', TRUE),
    ('aaaa0001-0000-0000-0000-000000000002', NULL, 'BusinessOwner', 'Business Owner', 'Full tenant ownership across branches, GL, and settings', TRUE),
    ('aaaa0001-0000-0000-0000-000000000003', NULL, 'BranchManager', 'Branch Manager', 'Branch operations, supervisor PIN overrides, inventory & shifts', TRUE),
    ('aaaa0001-0000-0000-0000-000000000004', NULL, 'Accountant', 'Accountant', 'Double-entry GL explorer, fiscal period lock, tax audit', TRUE),
    ('aaaa0001-0000-0000-0000-000000000005', NULL, 'InventoryController', 'Inventory Controller', 'Purchase orders, GRN approval, FIFO batch stock control', TRUE),
    ('aaaa0001-0000-0000-0000-000000000006', NULL, 'Cashier', 'Cashier', 'Edge POS sales terminal, held bills, receipt printing', TRUE)
ON CONFLICT DO NOTHING;

-- 2. Granular Permissions Catalog
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
    ('catalog', 'manage', 'catalog:manage', 'Create and update products and categories'),
    ('print', 'view', 'print:view', 'Inspect print templates and paired hardware in Receipt & Invoice Studio'),
    ('print', 'manage', 'print:manage', 'Create, edit, set default print templates and pair USB/Serial printers'),
    ('platform', 'admin', 'platform:admin', 'Access SuperAdmin Platform Portal, Company Setup & All-Company Audit Logs'),
    ('security', 'sessions_view', 'security:sessions_view', 'View active staff sessions and rate-limiting telemetry'),
    ('security', 'sessions_manage', 'security:sessions_manage', 'Revoke active staff sessions and enforce sign-outs')
ON CONFLICT (code) DO NOTHING;

-- 3. System Role-Permission Matrix Grants
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SuperAdmin' AND r.business_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'BusinessOwner'
  AND r.business_id IS NULL
  AND p.code <> 'platform:admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'BranchManager'
  AND r.business_id IS NULL
  AND p.code NOT IN ('platform:admin', 'accounting:lock_period', 'rbac:manage')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'Accountant'
  AND r.business_id IS NULL
  AND (p.module IN ('analytics', 'accounting', 'branches', 'settings') OR p.code = 'print:view')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'InventoryController'
  AND r.business_id IS NULL
  AND p.module IN ('analytics', 'inventory', 'catalog', 'branches')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'Cashier'
  AND r.business_id IS NULL
  AND p.code IN (
      'analytics:view', 'pos:view', 'pos:checkout', 'pos:hold_bill',
      'pos:shift_open', 'pos:shift_close', 'pos:print_receipt', 'pos:kick_drawer',
      'customers:view', 'customers:manage', 'catalog:view', 'branches:view', 'print:view'
  )
ON CONFLICT DO NOTHING;

-- 4. Complete 6-Level Settings Inheritance Definitions
INSERT INTO setting_definitions (key, value_type, default_value, category, label, description)
VALUES
    ('pos.allow_negative_fifo_stock', 'BOOLEAN', 'false'::jsonb, 'Inventory', 'Allow Negative FIFO Stock', 'Permits POS sale when branch FIFO batches reach zero'),
    ('pos.thermal_paper_width', 'STRING', '"80mm"'::jsonb, 'Hardware', 'Thermal Paper Width', 'ESC/POS receipt width (58mm, 76.2mm, 80mm)'),
    ('pos.auto_kick_cash_drawer', 'BOOLEAN', 'true'::jsonb, 'Hardware', 'Auto-Kick Cash Drawer', 'Sends ESC p pulse after cash checkout'),
    ('pos.max_cashier_discount_pct', 'NUMBER', '10'::jsonb, 'POS Rules', 'Max Cashier Discount (%)', 'Maximum discount without Supervisor PIN override'),
    ('tax.rounding_mode', 'STRING', '"HALF_UP"'::jsonb, 'Taxation', 'Tax Rounding Mode', 'Decimal rounding mode for multi-tier tax lines'),
    ('inventory.auto_po_on_low_stock', 'BOOLEAN', 'true'::jsonb, 'Inventory', 'Auto-Draft Low-Stock PO', 'Triggers Asynq worker to draft POs below reorder point'),
    ('accounting.base_currency', 'STRING', '"USD"'::jsonb, 'Accounting', 'Base Currency', 'Functional ledger currency code'),
    ('warehouse.po.require_approval', 'BOOLEAN', 'false'::jsonb, 'Warehouse & Approvals', 'Require PO Approval', 'Route purchase orders through supervisor approval queue before vendor dispatch'),
    ('warehouse.grn.require_approval', 'BOOLEAN', 'false'::jsonb, 'Warehouse & Approvals', 'Require GRN Approval', 'Intercept Goods Received Notes for manager approval before creating FIFO layers'),
    ('pos.loyalty_points_per_unit', 'NUMBER', '1'::jsonb, 'POS Rules', 'Loyalty Points per $1', 'Automatic loyalty points accrued per whole currency unit for registered customers'),
    ('system.default_language', 'STRING', '"en"'::jsonb, 'Localization', 'System Language', 'Default interface language across dashboards, POS terminals, and receipts (en, si, ta)'),
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
    ('pos.features.enable_bundles', 'BOOLEAN', 'false'::jsonb, 'POS Terminal', 'Enable Bundle Prompts', 'Surface quick bundle combo suggestions in stationery and fast checkout mode'),
    ('security.session.ttl_hours', 'NUMBER', '24'::jsonb, 'Security & Sessions', 'Session Lifetime (Hours)', 'Maximum absolute session duration before re-authentication is required'),
    ('security.session.idle_timeout_minutes', 'NUMBER', '480'::jsonb, 'Security & Sessions', 'Idle Session Timeout (Minutes)', 'Minutes of inactivity after which a signed-in session expires automatically'),
    ('security.session.max_concurrent', 'NUMBER', '5'::jsonb, 'Security & Sessions', 'Max Concurrent Sessions', 'Maximum simultaneous active sessions per user (oldest evicted automatically; 0 = unlimited)'),
    ('security.rate_limit.enabled', 'BOOLEAN', 'true'::jsonb, 'Security & Sessions', 'Enable API Rate Limiting', 'Enforces Redis-backed burst and brute-force rate protections across endpoints'),
    ('security.rate_limit.api_rpm', 'NUMBER', '240'::jsonb, 'Security & Sessions', 'Tenant API Requests / Min', 'Maximum authenticated requests per user per minute across tenant endpoints'),
    ('security.rate_limit.login_max_attempts', 'NUMBER', '10'::jsonb, 'Security & Sessions', 'Max Login Attempts / Min', 'Per-IP login requests per minute before temporary 429 cooldown'),
    ('security.rate_limit.pin_max_attempts', 'NUMBER', '5'::jsonb, 'Security & Sessions', 'Max Supervisor PIN Attempts / 5 Min', 'Incorrect 6-digit PIN override attempts per 5 minutes before cooldown')
ON CONFLICT (key) DO NOTHING;

