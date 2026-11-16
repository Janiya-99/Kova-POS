-- name: ListCategoriesForBusiness :many
SELECT id, business_id, parent_id, tax_group_id, name, slug, gender_segment
FROM categories
WHERE business_id = $1
ORDER BY name ASC;

-- name: ListBrandsForBusiness :many
SELECT id, business_id, name, slug, country, website, logo_url, description, is_active
FROM brands
WHERE business_id = $1 AND is_active = TRUE
ORDER BY name ASC;

-- name: ListProductsWithBranchStock :many
SELECT
    p.id,
    p.business_id,
    p.category_id,
    p.business_category_id,
    p.brand_id,
    c.name AS category_name,
    c.gender_segment,
    COALESCE(b.name, '')::TEXT AS brand_name,
    COALESCE(b.slug, '')::TEXT AS brand_slug,
    COALESCE(p.tax_group_id, c.tax_group_id) AS effective_tax_group_id,
    p.sku,
    p.name,
    p.description,
    p.image_url,
    p.image_urls,
    p.unit_of_measure,
    p.base_price,
    p.sale_price,
    p.discount_percent,
    p.reorder_point,
    p.reorder_qty,
    p.track_expiry,
    p.allow_negative_stock,
    p.enable_serial_tracking,
    p.is_service_labor,
    p.allow_fractional_qty,
    p.variants_json,
    p.modifiers_json,
    p.uom_options_json,
    p.warranty_terms,
    COALESCE((
        SELECT pb.barcode FROM product_barcodes pb
        WHERE pb.business_id = p.business_id AND pb.product_id = p.id AND pb.is_primary = TRUE
        LIMIT 1
    ), '')::TEXT AS primary_barcode,
    COALESCE((
        SELECT SUM(ib.remaining_qty) FROM inventory_batches ib
        WHERE ib.business_id = p.business_id AND ib.branch_id = $2 AND ib.product_id = p.id AND ib.remaining_qty > 0
    ), 0)::NUMERIC(19,4) AS branch_stock
FROM products p
JOIN categories c ON c.id = p.category_id
LEFT JOIN brands b ON b.id = p.brand_id AND b.business_id = p.business_id
WHERE p.business_id = $1 AND p.is_active = TRUE AND p.is_archived = FALSE
ORDER BY p.name ASC;

-- name: GetProductByID :one
SELECT
    p.id, p.business_id, p.category_id, p.brand_id, p.tax_group_id,
    c.tax_group_id AS category_tax_group_id,
    p.sku, p.name, p.base_price, p.sale_price, p.discount_percent,
    p.reorder_point, p.reorder_qty,
    p.enable_serial_tracking, p.is_service_labor, p.allow_fractional_qty,
    p.variants_json, p.modifiers_json, p.uom_options_json, p.warranty_terms
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE p.business_id = $1 AND p.id = $2
LIMIT 1;

-- name: ListTaxRulesForGroup :many
SELECT id, business_id, tax_group_id, code, name, tax_type, rate_percent, priority
FROM tax_rules
WHERE business_id = $1 AND tax_group_id = $2 AND is_active = TRUE
ORDER BY priority ASC, code ASC;

-- name: ListTaxRulesForBusiness :many
SELECT tr.id, tr.business_id, tr.tax_group_id, tg.name AS tax_group_name, tr.code, tr.name, tr.tax_type, tr.rate_percent, tr.priority
FROM tax_rules tr
JOIN tax_groups tg ON tg.id = tr.tax_group_id
WHERE tr.business_id = $1 AND tr.is_active = TRUE
ORDER BY tr.tax_group_id, tr.priority ASC;

-- name: ListCustomersForBusiness :many
SELECT id, business_id, name, email, phone, tier, loyalty_points, avatar_url, credit_enabled, credit_limit, is_walk_in
FROM customers
WHERE business_id = $1
ORDER BY name ASC;

