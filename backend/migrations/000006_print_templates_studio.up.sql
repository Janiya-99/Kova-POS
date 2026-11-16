-- Receipt & Invoice Studio: Print Templates, Dynamic Scene-Graph Schema & Hardware Profiles

CREATE TABLE IF NOT EXISTS print_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    document_type   VARCHAR(32) NOT NULL CHECK (document_type IN ('A4_INVOICE', 'THERMAL_80MM', 'THERMAL_58MM')),
    paper_width_mm  NUMERIC(8, 2) NOT NULL CHECK (paper_width_mm > 0),
    paper_height_mm NUMERIC(8, 2) NOT NULL CHECK (paper_height_mm > 0),
    snap_grid_mm    NUMERIC(6, 2) NOT NULL DEFAULT 5.00 CHECK (snap_grid_mm >= 1 AND snap_grid_mm <= 20),
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    canvas_schema   JSONB NOT NULL DEFAULT '{}'::jsonb,
    printer_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, name, document_type)
);

CREATE INDEX IF NOT EXISTS ix_print_templates_biz_type
    ON print_templates (business_id, document_type, is_default DESC, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_print_templates_default_per_type
    ON print_templates (business_id, document_type)
    WHERE is_default = TRUE;

-- RBAC Permissions for Print Studio
INSERT INTO permissions (module, action, code, description)
VALUES
    ('print', 'view', 'print:view', 'Inspect print templates and paired hardware in Receipt & Invoice Studio'),
    ('print', 'manage', 'print:manage', 'Create, edit, set default print templates and pair USB/Serial printers')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('print:view', 'print:manage')
WHERE r.code IN ('SuperAdmin', 'BusinessOwner', 'BranchManager')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'print:view'
WHERE r.code IN ('Accountant', 'Cashier')
ON CONFLICT DO NOTHING;

-- Seed default A4 Tax Invoice Template per Business
INSERT INTO print_templates (
    business_id, branch_id, name, document_type, paper_width_mm, paper_height_mm,
    snap_grid_mm, is_default, canvas_schema, printer_profile
)
SELECT
    b.id,
    NULL,
    'Executive A4 Tax Invoice',
    'A4_INVOICE',
    210.00,
    297.00,
    5.00,
    TRUE,
    '{
      "version": 1,
      "snap_to_grid": true,
      "show_guides": true,
      "blocks": [
        {
          "id": "a4-logo",
          "type": "image",
          "label": "Company Logo",
          "x_mm": 15,
          "y_mm": 12,
          "width_mm": 36,
          "height_mm": 18,
          "content": "{Business_Logo}",
          "style": { "fontSizePt": 10, "bold": false, "align": "left", "borderWidth": 0, "borderColor": "#E2E8F0", "backgroundColor": "transparent", "color": "#111315", "paddingMm": 0 }
        },
        {
          "id": "a4-biz-name",
          "type": "variable",
          "label": "Trade Name",
          "x_mm": 15,
          "y_mm": 32,
          "width_mm": 95,
          "height_mm": 9,
          "content": "{Business_Name}",
          "style": { "fontSizePt": 16, "bold": true, "align": "left", "borderWidth": 0, "borderColor": "#E2E8F0", "backgroundColor": "transparent", "color": "#111315", "paddingMm": 0 }
        },
        {
          "id": "a4-branch-tax",
          "type": "variable",
          "label": "Branch & VAT Info",
          "x_mm": 15,
          "y_mm": 42,
          "width_mm": 95,
          "height_mm": 12,
          "content": "{Branch_Name} · VAT: {Tax_Reg_No}",
          "style": { "fontSizePt": 9, "bold": false, "align": "left", "borderWidth": 0, "borderColor": "#E2E8F0", "backgroundColor": "transparent", "color": "#475569", "paddingMm": 0 }
        },
        {
          "id": "a4-title",
          "type": "text",
          "label": "Document Header",
          "x_mm": 125,
          "y_mm": 14,
          "width_mm": 70,
          "height_mm": 11,
          "content": "TAX INVOICE",
          "style": { "fontSizePt": 18, "bold": true, "align": "right", "borderWidth": 0, "borderColor": "#877FC1", "backgroundColor": "transparent", "color": "#877FC1", "paddingMm": 0 }
        },
        {
          "id": "a4-inv-meta",
          "type": "variable",
          "label": "Invoice Metadata",
          "x_mm": 125,
          "y_mm": 27,
          "width_mm": 70,
          "height_mm": 18,
          "content": "Invoice #: {Invoice_Number}\nDate: {Date_Time}\nCustomer: {Customer_Name}",
          "style": { "fontSizePt": 9.5, "bold": false, "align": "right", "borderWidth": 1, "borderColor": "#E2E8F0", "backgroundColor": "#F8FAFC", "color": "#111315", "paddingMm": 2 }
        },
        {
          "id": "a4-items-table",
          "type": "item_table",
          "label": "Line Items Grid",
          "x_mm": 15,
          "y_mm": 62,
          "width_mm": 180,
          "height_mm": 64,
          "content": "Dynamic Line Items",
          "columns": ["item", "qty", "price", "total"],
          "showHeader": true,
          "rowHeightMm": 7.5,
          "style": { "fontSizePt": 9.5, "bold": false, "align": "left", "borderWidth": 1, "borderColor": "#CBD5E1", "backgroundColor": "#FFFFFF", "color": "#111315", "paddingMm": 1.5 }
        },
        {
          "id": "a4-subtotal",
          "type": "variable",
          "label": "Subtotal Summary",
          "x_mm": 125,
          "y_mm": 136,
          "width_mm": 70,
          "height_mm": 8,
          "content": "Subtotal: {Subtotal}",
          "style": { "fontSizePt": 10, "bold": false, "align": "right", "borderWidth": 0, "borderColor": "#E2E8F0", "backgroundColor": "transparent", "color": "#334155", "paddingMm": 1 }
        },
        {
          "id": "a4-tax",
          "type": "variable",
          "label": "Tax Total",
          "x_mm": 125,
          "y_mm": 144,
          "width_mm": 70,
          "height_mm": 8,
          "content": "Tax: {Tax_Amount}",
          "style": { "fontSizePt": 10, "bold": false, "align": "right", "borderWidth": 0, "borderColor": "#E2E8F0", "backgroundColor": "transparent", "color": "#334155", "paddingMm": 1 }
        },
        {
          "id": "a4-total",
          "type": "variable",
          "label": "Grand Total Box",
          "x_mm": 120,
          "y_mm": 154,
          "width_mm": 75,
          "height_mm": 12,
          "content": "TOTAL: {Total_Amount}",
          "style": { "fontSizePt": 13, "bold": true, "align": "right", "borderWidth": 1, "borderColor": "#877FC1", "backgroundColor": "#F4F2FF", "color": "#111315", "paddingMm": 2 }
        },
        {
          "id": "a4-qr",
          "type": "qr_code",
          "label": "Verification QR",
          "x_mm": 15,
          "y_mm": 136,
          "width_mm": 26,
          "height_mm": 26,
          "content": "{Invoice_Number}",
          "barcodeFormat": "QR",
          "style": { "fontSizePt": 8, "bold": false, "align": "center", "borderWidth": 0, "borderColor": "#E2E8F0", "backgroundColor": "#FFFFFF", "color": "#111315", "paddingMm": 1 }
        },
        {
          "id": "a4-footer",
          "type": "variable",
          "label": "Footer Thanks",
          "x_mm": 15,
          "y_mm": 174,
          "width_mm": 180,
          "height_mm": 10,
          "content": "Paid via {Payment_Method} · Served by {Cashier_Name} · Thank you for shopping with {Business_Name}!",
          "style": { "fontSizePt": 8.5, "bold": false, "align": "center", "borderWidth": 0, "borderColor": "#E2E8F0", "backgroundColor": "transparent", "color": "#64748B", "paddingMm": 1 }
        }
      ]
    }'::jsonb,
    '{"transport": "pdf", "deviceName": "System A4 Vector Laser Printer", "paperWidth": "A4", "autoKickDrawer": false, "cutPaper": false}'::jsonb
FROM businesses b
WHERE NOT EXISTS (
    SELECT 1 FROM print_templates pt WHERE pt.business_id = b.id AND pt.document_type = 'A4_INVOICE'
);

-- Seed default 80mm Thermal POS Receipt Template per Business
INSERT INTO print_templates (
    business_id, branch_id, name, document_type, paper_width_mm, paper_height_mm,
    snap_grid_mm, is_default, canvas_schema, printer_profile
)
SELECT
    b.id,
    NULL,
    'Standard 80mm Thermal Receipt',
    'THERMAL_80MM',
    80.00,
    210.00,
    2.00,
    TRUE,
    '{
      "version": 1,
      "snap_to_grid": true,
      "show_guides": true,
      "blocks": [
        {
          "id": "t80-logo",
          "type": "image",
          "label": "Receipt Logo",
          "x_mm": 24,
          "y_mm": 4,
          "width_mm": 32,
          "height_mm": 14,
          "content": "{Business_Logo}",
          "style": { "fontSizePt": 9, "bold": false, "align": "center", "borderWidth": 0, "borderColor": "#CBD5E1", "backgroundColor": "transparent", "color": "#111315", "paddingMm": 0 }
        },
        {
          "id": "t80-biz",
          "type": "variable",
          "label": "Business Title",
          "x_mm": 4,
          "y_mm": 20,
          "width_mm": 72,
          "height_mm": 8,
          "content": "{Business_Name}",
          "style": { "fontSizePt": 13, "bold": true, "align": "center", "borderWidth": 0, "borderColor": "#CBD5E1", "backgroundColor": "transparent", "color": "#111315", "paddingMm": 0 }
        },
        {
          "id": "t80-branch",
          "type": "variable",
          "label": "Branch & Meta",
          "x_mm": 4,
          "y_mm": 28,
          "width_mm": 72,
          "height_mm": 12,
          "content": "{Branch_Name} · {Invoice_Number}\n{Date_Time} · Customer: {Customer_Name}",
          "style": { "fontSizePt": 8, "bold": false, "align": "center", "borderWidth": 0, "borderColor": "#CBD5E1", "backgroundColor": "transparent", "color": "#334155", "paddingMm": 0 }
        },
        {
          "id": "t80-items",
          "type": "item_table",
          "label": "Receipt Items",
          "x_mm": 4,
          "y_mm": 44,
          "width_mm": 72,
          "height_mm": 52,
          "content": "Dynamic Line Items",
          "columns": ["item", "qty", "total"],
          "showHeader": true,
          "rowHeightMm": 6.5,
          "style": { "fontSizePt": 8.5, "bold": false, "align": "left", "borderWidth": 1, "borderColor": "#CBD5E1", "backgroundColor": "#FFFFFF", "color": "#111315", "paddingMm": 1 }
        },
        {
          "id": "t80-tax",
          "type": "variable",
          "label": "Subtotal & Tax",
          "x_mm": 4,
          "y_mm": 100,
          "width_mm": 72,
          "height_mm": 10,
          "content": "Subtotal: {Subtotal}   Tax: {Tax_Amount}",
          "style": { "fontSizePt": 8.5, "bold": false, "align": "right", "borderWidth": 0, "borderColor": "#CBD5E1", "backgroundColor": "transparent", "color": "#334155", "paddingMm": 0 }
        },
        {
          "id": "t80-total",
          "type": "variable",
          "label": "Receipt Total",
          "x_mm": 4,
          "y_mm": 112,
          "width_mm": 72,
          "height_mm": 10,
          "content": "TOTAL: {Total_Amount}",
          "style": { "fontSizePt": 12, "bold": true, "align": "right", "borderWidth": 1, "borderColor": "#111315", "backgroundColor": "#F8FAFC", "color": "#111315", "paddingMm": 1.5 }
        },
        {
          "id": "t80-qr",
          "type": "qr_code",
          "label": "Receipt Verification QR",
          "x_mm": 28,
          "y_mm": 126,
          "width_mm": 24,
          "height_mm": 24,
          "content": "{Invoice_Number}",
          "barcodeFormat": "QR",
          "style": { "fontSizePt": 8, "bold": false, "align": "center", "borderWidth": 0, "borderColor": "#CBD5E1", "backgroundColor": "#FFFFFF", "color": "#111315", "paddingMm": 0.5 }
        },
        {
          "id": "t80-thanks",
          "type": "text",
          "label": "Footer Message",
          "x_mm": 4,
          "y_mm": 154,
          "width_mm": 72,
          "height_mm": 8,
          "content": "Thank you! Keep receipt for returns.",
          "style": { "fontSizePt": 8, "bold": false, "align": "center", "borderWidth": 0, "borderColor": "#CBD5E1", "backgroundColor": "transparent", "color": "#475569", "paddingMm": 0 }
        }
      ]
    }'::jsonb,
    '{"transport": "webusb", "deviceName": "POS-80 Thermal Roll", "paperWidth": "80mm", "autoKickDrawer": true, "cutPaper": true}'::jsonb
FROM businesses b
WHERE NOT EXISTS (
    SELECT 1 FROM print_templates pt WHERE pt.business_id = b.id AND pt.document_type = 'THERMAL_80MM'
);

-- Seed default 58mm Compact Thermal Receipt Template per Business
INSERT INTO print_templates (
    business_id, branch_id, name, document_type, paper_width_mm, paper_height_mm,
    snap_grid_mm, is_default, canvas_schema, printer_profile
)
SELECT
    b.id,
    NULL,
    'Compact 58mm Thermal Receipt',
    'THERMAL_58MM',
    58.00,
    190.00,
    2.00,
    TRUE,
    '{
      "version": 1,
      "snap_to_grid": true,
      "show_guides": true,
      "blocks": [
        {
          "id": "t58-biz",
          "type": "variable",
          "label": "Business Title",
          "x_mm": 3,
          "y_mm": 6,
          "width_mm": 52,
          "height_mm": 8,
          "content": "{Business_Name}",
          "style": { "fontSizePt": 11, "bold": true, "align": "center", "borderWidth": 0, "borderColor": "#CBD5E1", "backgroundColor": "transparent", "color": "#111315", "paddingMm": 0 }
        },
        {
          "id": "t58-meta",
          "type": "variable",
          "label": "Invoice & Customer",
          "x_mm": 3,
          "y_mm": 16,
          "width_mm": 52,
          "height_mm": 10,
          "content": "{Invoice_Number}\n{Customer_Name}",
          "style": { "fontSizePt": 7.5, "bold": false, "align": "center", "borderWidth": 0, "borderColor": "#CBD5E1", "backgroundColor": "transparent", "color": "#334155", "paddingMm": 0 }
        },
        {
          "id": "t58-items",
          "type": "item_table",
          "label": "Compact Items",
          "x_mm": 3,
          "y_mm": 30,
          "width_mm": 52,
          "height_mm": 48,
          "content": "Dynamic Line Items",
          "columns": ["item", "qty", "total"],
          "showHeader": true,
          "rowHeightMm": 6,
          "style": { "fontSizePt": 7.5, "bold": false, "align": "left", "borderWidth": 1, "borderColor": "#CBD5E1", "backgroundColor": "#FFFFFF", "color": "#111315", "paddingMm": 0.8 }
        },
        {
          "id": "t58-total",
          "type": "variable",
          "label": "Grand Total",
          "x_mm": 3,
          "y_mm": 84,
          "width_mm": 52,
          "height_mm": 10,
          "content": "TOTAL: {Total_Amount}",
          "style": { "fontSizePt": 10.5, "bold": true, "align": "right", "borderWidth": 1, "borderColor": "#111315", "backgroundColor": "#F8FAFC", "color": "#111315", "paddingMm": 1 }
        },
        {
          "id": "t58-qr",
          "type": "qr_code",
          "label": "Receipt QR",
          "x_mm": 19,
          "y_mm": 98,
          "width_mm": 20,
          "height_mm": 20,
          "content": "{Invoice_Number}",
          "barcodeFormat": "QR",
          "style": { "fontSizePt": 7, "bold": false, "align": "center", "borderWidth": 0, "borderColor": "#CBD5E1", "backgroundColor": "#FFFFFF", "color": "#111315", "paddingMm": 0.5 }
        }
      ]
    }'::jsonb,
    '{"transport": "webusb", "deviceName": "Portable 58mm Pocket Printer", "paperWidth": "58mm", "autoKickDrawer": false, "cutPaper": true}'::jsonb
FROM businesses b
WHERE NOT EXISTS (
    SELECT 1 FROM print_templates pt WHERE pt.business_id = b.id AND pt.document_type = 'THERMAL_58MM'
);
