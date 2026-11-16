DELETE FROM suspended_bills WHERE id IN (
    '11111111-2222-1111-1111-111111110011',
    '11111111-2222-1111-1111-111111110012'
);

DELETE FROM scoped_settings WHERE setting_key IN (
    'pos.ui.layout_mode',
    'pos.layout.fullscreen_on_load',
    'pos.layout.show_categories_pane',
    'pos.layout.show_outgoing_orders_pane',
    'pos.layout.footer_quick_edit_sidebar',
    'pos.features.enable_tables',
    'pos.features.enable_kot',
    'pos.features.allow_fractional_qty',
    'pos.features.multi_uom_toggle',
    'pos.features.require_vehicle_plate',
    'pos.features.split_labor_parts',
    'pos.features.matrix_variants',
    'pos.features.require_serial_imei',
    'pos.features.enable_bundles'
);

DELETE FROM setting_definitions WHERE key IN (
    'pos.ui.layout_mode',
    'pos.layout.fullscreen_on_load',
    'pos.layout.show_categories_pane',
    'pos.layout.show_outgoing_orders_pane',
    'pos.layout.footer_quick_edit_sidebar',
    'pos.features.enable_tables',
    'pos.features.enable_kot',
    'pos.features.allow_fractional_qty',
    'pos.features.multi_uom_toggle',
    'pos.features.require_vehicle_plate',
    'pos.features.split_labor_parts',
    'pos.features.matrix_variants',
    'pos.features.require_serial_imei',
    'pos.features.enable_bundles'
);

ALTER TABLE sales_invoice_items DROP COLUMN IF EXISTS item_meta_json;
ALTER TABLE sales_invoices
    DROP COLUMN IF EXISTS order_channel,
    DROP COLUMN IF EXISTS order_meta_json;
ALTER TABLE suspended_bill_items DROP COLUMN IF EXISTS item_meta_json;
ALTER TABLE suspended_bills
    DROP COLUMN IF EXISTS order_channel,
    DROP COLUMN IF EXISTS table_or_bay_label,
    DROP COLUMN IF EXISTS vehicle_plate,
    DROP COLUMN IF EXISTS kot_status;
ALTER TABLE products
    DROP COLUMN IF EXISTS enable_serial_tracking,
    DROP COLUMN IF EXISTS is_service_labor,
    DROP COLUMN IF EXISTS allow_fractional_qty,
    DROP COLUMN IF EXISTS variants_json,
    DROP COLUMN IF EXISTS modifiers_json,
    DROP COLUMN IF EXISTS uom_options_json,
    DROP COLUMN IF EXISTS warranty_terms;
ALTER TABLE businesses DROP COLUMN IF EXISTS industry_profile;

