-- name: CreateCustomer :one
INSERT INTO customers (
    business_id, name, email, phone, tier, loyalty_points,
    avatar_url, credit_enabled, credit_limit, is_walk_in
)
VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, FALSE)
RETURNING id, business_id, name, email, phone, tier, loyalty_points, avatar_url, credit_enabled, credit_limit, is_walk_in;

-- name: GetCustomerByID :one
SELECT id, business_id, name, tier, loyalty_points, is_walk_in
FROM customers
WHERE business_id = $1 AND id = $2
LIMIT 1;

-- name: AddCustomerLoyaltyPoints :exec
UPDATE customers
SET loyalty_points = loyalty_points + $3
WHERE business_id = $1 AND id = $2 AND is_walk_in = FALSE;

-- name: CreateProduct :one
INSERT INTO products (
    business_id, category_id, business_category_id, tax_group_id,
    sku, name, description, image_url, image_urls, unit_of_measure,
    base_price, sale_price, discount_percent, reorder_point, reorder_qty, allow_negative_stock,
    enable_serial_tracking, is_service_labor, allow_fractional_qty,
    variants_json, modifiers_json, uom_options_json, warranty_terms
)
VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
RETURNING id, business_id, category_id, sku, name, unit_of_measure, base_price, sale_price, discount_percent, reorder_point, reorder_qty, image_url, image_urls, allow_negative_stock, enable_serial_tracking, is_service_labor, allow_fractional_qty, variants_json, modifiers_json, uom_options_json, warranty_terms, is_archived;

-- name: UpdateProduct :one
UPDATE products
SET
    category_id = $3,
    business_category_id = $3,
    sku = $4,
    name = $5,
    description = $6,
    image_url = $7,
    image_urls = $8,
    unit_of_measure = $9,
    base_price = $10,
    sale_price = $11,
    discount_percent = $12,
    reorder_point = $13,
    reorder_qty = $14,
    allow_negative_stock = $15,
    enable_serial_tracking = $16,
    is_service_labor = $17,
    allow_fractional_qty = $18,
    variants_json = $19,
    modifiers_json = $20,
    uom_options_json = $21,
    warranty_terms = $22
WHERE business_id = $1 AND id = $2
RETURNING id, business_id, category_id, sku, name, unit_of_measure, base_price, sale_price, discount_percent, reorder_point, reorder_qty, image_url, image_urls, allow_negative_stock, enable_serial_tracking, is_service_labor, allow_fractional_qty, variants_json, modifiers_json, uom_options_json, warranty_terms, is_archived;

-- name: BulkUpdateProductDiscount :many
UPDATE products
SET
    base_price = CASE
        WHEN sqlc.arg(discount_percent)::NUMERIC(8,4) > 0
             AND discount_percent = 0
             AND sale_price > base_price
            THEN sale_price
        ELSE base_price
    END,
    discount_percent = sqlc.arg(discount_percent)::NUMERIC(8,4),
    sale_price = ROUND(
        CASE
            WHEN sqlc.arg(discount_percent)::NUMERIC(8,4) > 0 THEN
                (CASE
                    WHEN discount_percent = 0 AND sale_price > base_price THEN sale_price
                    ELSE base_price
                END) * (100::NUMERIC - sqlc.arg(discount_percent)::NUMERIC(8,4)) / 100::NUMERIC
            ELSE
                CASE
                    WHEN discount_percent > 0 OR sale_price < base_price THEN base_price
                    ELSE sale_price
                END
        END,
        2
    )
WHERE business_id = sqlc.arg(business_id)::UUID
  AND id = ANY(sqlc.arg(product_ids)::UUID[])
  AND is_archived = FALSE
RETURNING id, sku, name, base_price, sale_price, discount_percent;

-- name: UpsertPrimaryBarcode :exec
INSERT INTO product_barcodes (business_id, product_id, barcode, is_primary)
VALUES ($1, $2, $3, TRUE)
ON CONFLICT (business_id, barcode)
DO UPDATE SET is_primary = TRUE, product_id = EXCLUDED.product_id;

-- name: CheckProductUsage :one
SELECT (
    EXISTS (SELECT 1 FROM inventory_batches ib WHERE ib.business_id = $1 AND ib.product_id = $2)
    OR EXISTS (SELECT 1 FROM sales_invoice_items sii WHERE sii.business_id = $1 AND sii.product_id = $2)
)::BOOLEAN AS has_history;

-- name: ArchiveProduct :exec
UPDATE products
SET is_archived = TRUE, is_active = FALSE
WHERE business_id = $1 AND id = $2;

-- name: DeleteProductHard :exec
DELETE FROM products
WHERE business_id = $1 AND id = $2;

-- name: InsertWarehouseApprovalLog :one
INSERT INTO warehouse_approval_logs (
    business_id, document_type, document_id, action, actor_user_id, notes
)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, business_id, document_type, document_id, action, actor_user_id, notes, created_at;

-- name: ListWarehouseApprovalLogs :many
SELECT
    wal.id, wal.business_id, wal.document_type, wal.document_id,
    wal.action, COALESCE(u.full_name, 'System')::TEXT AS actor_name,
    wal.notes, wal.created_at
FROM warehouse_approval_logs wal
LEFT JOIN users u ON u.id = wal.actor_user_id
WHERE wal.business_id = $1
ORDER BY wal.created_at DESC
LIMIT 30;

-- name: GetBusinessProfile :one
SELECT
    id,
    name,
    COALESCE(NULLIF(trade_name, ''), name)::TEXT AS trade_name,
    legal_name,
    tax_registration_no,
    base_currency,
    logo_light_url,
    logo_dark_url,
    logo_receipt_url,
    COALESCE(NULLIF(primary_color_hex, ''), '#877FC1')::TEXT AS primary_color_hex,
    COALESCE(NULLIF(default_language, ''), 'en')::TEXT AS default_language,
    COALESCE(NULLIF(industry_profile, ''), 'retail')::TEXT AS industry_profile,
    is_active
FROM businesses
WHERE id = $1
LIMIT 1;

-- name: UpdateBusinessProfile :one
UPDATE businesses
SET
    name = COALESCE(NULLIF($2, ''), name),
    trade_name = COALESCE(NULLIF($3, ''), COALESCE(NULLIF($2, ''), trade_name)),
    legal_name = COALESCE(NULLIF($4, ''), legal_name),
    tax_registration_no = $5,
    base_currency = COALESCE(NULLIF($6, ''), base_currency),
    logo_light_url = $7,
    logo_dark_url = $8,
    logo_receipt_url = $9,
    primary_color_hex = COALESCE(NULLIF($10, ''), primary_color_hex),
    default_language = COALESCE(NULLIF($11, ''), default_language),
    industry_profile = COALESCE(NULLIF($12, ''), industry_profile)
WHERE id = $1
RETURNING
    id,
    name,
    COALESCE(NULLIF(trade_name, ''), name)::TEXT AS trade_name,
    legal_name,
    tax_registration_no,
    base_currency,
    logo_light_url,
    logo_dark_url,
    logo_receipt_url,
    COALESCE(NULLIF(primary_color_hex, ''), '#877FC1')::TEXT AS primary_color_hex,
    COALESCE(NULLIF(default_language, ''), 'en')::TEXT AS default_language,
    COALESCE(NULLIF(industry_profile, ''), 'retail')::TEXT AS industry_profile;

-- name: GetPublicBrandingDefault :one
SELECT
    id,
    name,
    COALESCE(NULLIF(trade_name, ''), name)::TEXT AS trade_name,
    base_currency,
    logo_light_url,
    logo_dark_url,
    COALESCE(NULLIF(primary_color_hex, ''), '#877FC1')::TEXT AS primary_color_hex,
    COALESCE(NULLIF(default_language, ''), 'en')::TEXT AS default_language
FROM businesses
WHERE is_active = TRUE
ORDER BY CASE WHEN id = '11111111-1111-1111-1111-111111111111' THEN 0 ELSE 1 END, created_at ASC
LIMIT 1;

-- name: GetPublicBrandingByID :one
SELECT
    id,
    name,
    COALESCE(NULLIF(trade_name, ''), name)::TEXT AS trade_name,
    base_currency,
    logo_light_url,
    logo_dark_url,
    COALESCE(NULLIF(primary_color_hex, ''), '#877FC1')::TEXT AS primary_color_hex,
    COALESCE(NULLIF(default_language, ''), 'en')::TEXT AS default_language
FROM businesses
WHERE id = $1 AND is_active = TRUE
LIMIT 1;

-- name: UpdateCustomer :one
UPDATE customers
SET
    name = $3,
    email = $4,
    phone = $5,
    tier = $6,
    avatar_url = $7,
    credit_enabled = $8,
    credit_limit = $9
WHERE business_id = $1 AND id = $2
RETURNING id, business_id, name, email, phone, tier, loyalty_points, avatar_url, credit_enabled, credit_limit, is_walk_in;

-- name: ListCategoriesWithCounts :many
SELECT
    c.id,
    c.business_id,
    c.parent_id,
    c.tax_group_id,
    COALESCE(tg.name, 'Default Tax')::TEXT AS tax_group_name,
    c.name,
    c.slug,
    c.gender_segment,
    c.created_at,
    COUNT(p.id) FILTER (WHERE p.is_archived = FALSE)::INT AS product_count
FROM categories c
LEFT JOIN tax_groups tg ON tg.id = c.tax_group_id
LEFT JOIN products p ON p.category_id = c.id AND p.business_id = c.business_id
WHERE c.business_id = $1
GROUP BY c.id, tg.name
ORDER BY c.name ASC;

-- name: CreateCategory :one
INSERT INTO categories (business_id, parent_id, tax_group_id, name, slug, gender_segment)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, business_id, parent_id, tax_group_id, name, slug, gender_segment, created_at;

-- name: UpdateCategory :one
UPDATE categories
SET
    tax_group_id = $3,
    name = $4,
    slug = $5,
    gender_segment = $6
WHERE business_id = $1 AND id = $2
RETURNING id, business_id, parent_id, tax_group_id, name, slug, gender_segment, created_at;

-- name: CheckCategoryUsage :one
SELECT EXISTS (
    SELECT 1 FROM products p
    WHERE p.business_id = $1 AND p.category_id = $2 AND p.is_archived = FALSE
)::BOOLEAN AS has_products;

-- name: DeleteCategory :exec
DELETE FROM categories
WHERE business_id = $1 AND id = $2;

-- name: ListBusinessAccessUsers :many
SELECT
    ubr.id AS user_business_role_id,
    u.id AS user_id,
    u.full_name,
    u.email,
    u.avatar_url,
    u.created_at,
    ubr.business_id,
    ubr.branch_id,
    COALESCE(br.name, 'All Branches')::TEXT AS branch_name,
    r.id AS role_id,
    r.code AS role_code,
    r.name AS role_name,
    COALESCE(d.id, '00000000-0000-0000-0000-000000000000'::UUID)::UUID AS designation_id,
    COALESCE(d.name, r.name)::TEXT AS designation_name,
    COALESCE(d.max_pos_discount_pct, 100.00)::NUMERIC(5,2) AS max_pos_discount_pct,
    ubr.is_active,
    (ubr.supervisor_pin_hash <> '')::BOOLEAN AS has_pin
FROM user_business_roles ubr
JOIN users u ON u.id = ubr.user_id
JOIN roles r ON r.id = ubr.role_id
LEFT JOIN branches br ON br.id = ubr.branch_id
LEFT JOIN designations d ON d.id = ubr.designation_id
WHERE ubr.business_id = $1
ORDER BY CASE WHEN r.code IN ('SuperAdmin', 'BusinessOwner') THEN 0 ELSE 1 END, u.full_name ASC;

-- name: GetUserByEmailAny :one
SELECT id, email, full_name, avatar_url, is_active
FROM users
WHERE LOWER(email) = LOWER($1)
LIMIT 1;

-- name: GetUserBusinessRoleByID :one
SELECT id, user_id, business_id, branch_id, role_id, designation_id, is_active
FROM user_business_roles
WHERE id = $1 AND business_id = $2
LIMIT 1;

-- name: CheckUserBusinessRoleExists :one
SELECT EXISTS (
    SELECT 1 FROM user_business_roles
    WHERE user_id = $1 AND business_id = $2 AND role_id = $3
)::BOOLEAN AS already_exists;

-- name: CreateAccessUser :one
INSERT INTO users (email, full_name, password_hash, avatar_url, is_active)
VALUES ($1, $2, $3, $4, TRUE)
RETURNING id, email, full_name, avatar_url, is_active, created_at;

-- name: InsertUserBusinessRole :one
INSERT INTO user_business_roles (user_id, business_id, branch_id, role_id, designation_id, supervisor_pin_hash, is_active)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, user_id, business_id, role_id, designation_id, is_active;

-- name: UpdateAccessUserDetails :exec
UPDATE users
SET full_name = COALESCE(NULLIF($2, ''), full_name)
WHERE id = $1;

-- name: UpdateUserBusinessRoleAssignment :one
UPDATE user_business_roles
SET
    role_id = $3,
    designation_id = $4,
    branch_id = $5,
    is_active = $6
WHERE business_id = $1 AND id = $2
RETURNING id, user_id, business_id, role_id, designation_id, branch_id, is_active;

-- name: UpdateUserBusinessRolePIN :exec
UPDATE user_business_roles
SET supervisor_pin_hash = $3
WHERE business_id = $1 AND id = $2;

-- name: ListDesignationsForBusiness :many
SELECT
    d.id,
    d.business_id,
    d.department_id,
    COALESCE(dep.name, 'General')::TEXT AS department_name,
    d.code,
    d.name,
    d.max_pos_discount_pct,
    d.created_at
FROM designations d
LEFT JOIN departments dep ON dep.id = d.department_id
WHERE d.business_id = $1
ORDER BY d.max_pos_discount_pct DESC, d.name ASC;

-- name: ListDepartmentsForBusiness :many
SELECT id, business_id, code, name, created_at
FROM departments
WHERE business_id = $1
ORDER BY name ASC;

-- name: CreateDepartment :one
INSERT INTO departments (business_id, code, name)
VALUES ($1, $2, $3)
RETURNING id, business_id, code, name, created_at;

-- name: CreateDesignation :one
INSERT INTO designations (business_id, department_id, code, name, max_pos_discount_pct)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, business_id, department_id, code, name, max_pos_discount_pct, created_at;

-- name: UpdateDesignation :one
UPDATE designations
SET
    department_id = $3,
    code = $4,
    name = $5,
    max_pos_discount_pct = $6
WHERE business_id = $1 AND id = $2
RETURNING id, business_id, department_id, code, name, max_pos_discount_pct, created_at;

-- name: ListRolesCatalog :many
SELECT id, business_id, code, name, description, is_system
FROM roles
ORDER BY CASE WHEN code IN ('SuperAdmin', 'BusinessOwner') THEN 0 ELSE 1 END, name ASC;

-- name: ListRolesCatalogForBusiness :many
SELECT id, business_id, code, name, description, is_system
FROM roles
WHERE business_id IS NULL OR business_id = $1
ORDER BY CASE WHEN code IN ('SuperAdmin', 'BusinessOwner') THEN 0 ELSE 1 END, is_system DESC, name ASC;

-- name: ListAllPermissions :many
SELECT id, module, action, code, description
FROM permissions
ORDER BY module ASC, code ASC;

-- name: CreateCustomRole :one
INSERT INTO roles (business_id, code, name, description, is_system)
VALUES ($1, $2, $3, $4, FALSE)
RETURNING id, business_id, code, name, description, is_system;

-- name: GetRoleForBusiness :one
SELECT id, business_id, code, name, description, is_system
FROM roles
WHERE id = $1 AND (business_id IS NULL OR business_id = $2)
LIMIT 1;

-- name: UpdateCustomRole :one
UPDATE roles
SET
    name = COALESCE(NULLIF($3::TEXT, ''), name),
    description = $4
WHERE id = $1 AND business_id = $2 AND is_system = FALSE
RETURNING id, business_id, code, name, description, is_system;

-- name: DeleteRolePermissions :exec
DELETE FROM role_permissions
WHERE role_id = $1;

-- name: InsertRolePermissionByCode :exec
INSERT INTO role_permissions (role_id, permission_id)
SELECT $1, p.id
FROM permissions p
WHERE p.code = $2
ON CONFLICT DO NOTHING;

-- name: ListUserIDsByRoleAndBusiness :many
SELECT DISTINCT user_id
FROM user_business_roles
WHERE business_id = $1 AND role_id = $2;

-- name: ListSystemNotifications :many
SELECT id, business_id, branch_id, category, severity, title, body, reference_type, reference_id, is_read, created_at
FROM system_notifications
WHERE business_id = $1
ORDER BY created_at DESC
LIMIT 50;

-- name: CountUnreadNotifications :one
SELECT COUNT(*)::INT AS unread_count
FROM system_notifications
WHERE business_id = $1 AND is_read = FALSE;

-- name: InsertSystemNotification :one
INSERT INTO system_notifications (
    business_id, branch_id, category, severity, title, body, reference_type, reference_id, is_read
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
RETURNING id, business_id, branch_id, category, severity, title, body, reference_type, reference_id, is_read, created_at;

-- name: MarkNotificationRead :exec
UPDATE system_notifications
SET is_read = TRUE
WHERE business_id = $1 AND id = $2;

-- name: MarkAllNotificationsRead :exec
UPDATE system_notifications
SET is_read = TRUE
WHERE business_id = $1 AND is_read = FALSE;

-- name: ListSuppliersDetailed :many
SELECT
    s.id,
    s.business_id,
    s.code,
    s.name,
    s.email,
    s.phone,
    s.tax_id,
    s.payment_terms_days,
    s.created_at,
    (SELECT COUNT(*)::BIGINT FROM purchase_orders po WHERE po.business_id = s.business_id AND po.supplier_id = s.id) AS po_count,
    (SELECT COUNT(*)::BIGINT FROM goods_received_notes grn WHERE grn.business_id = s.business_id AND grn.supplier_id = s.id) AS grn_count,
    (SELECT COUNT(*)::BIGINT FROM purchase_invoices pi WHERE pi.business_id = s.business_id AND pi.supplier_id = s.id) AS invoice_count,
    COALESCE((
        SELECT SUM(pi.grand_total)
        FROM purchase_invoices pi
        WHERE pi.business_id = s.business_id
          AND pi.supplier_id = s.id
          AND pi.status NOT IN ('PAID', 'CANCELLED', 'VOID')
    ), 0)::NUMERIC(19,4) AS open_ap_balance
FROM suppliers s
WHERE s.business_id = $1
ORDER BY s.created_at DESC, s.name ASC;

-- name: GetSupplierByID :one
SELECT id, business_id, code, name, email, phone, tax_id, payment_terms_days, created_at
FROM suppliers
WHERE business_id = $1 AND id = $2;

-- name: CreateSupplier :one
INSERT INTO suppliers (business_id, code, name, email, phone, tax_id, payment_terms_days)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, business_id, code, name, email, phone, tax_id, payment_terms_days, created_at;

-- name: UpdateSupplier :one
UPDATE suppliers
SET code = $3,
    name = $4,
    email = $5,
    phone = $6,
    tax_id = $7,
    payment_terms_days = $8
WHERE business_id = $1 AND id = $2
RETURNING id, business_id, code, name, email, phone, tax_id, payment_terms_days, created_at;

-- name: CheckSupplierUsage :one
SELECT (
    (SELECT COUNT(*) FROM purchase_orders po WHERE po.business_id = $1 AND po.supplier_id = $2) +
    (SELECT COUNT(*) FROM goods_received_notes grn WHERE grn.business_id = $1 AND grn.supplier_id = $2) +
    (SELECT COUNT(*) FROM purchase_invoices pi WHERE pi.business_id = $1 AND pi.supplier_id = $2)
)::BIGINT AS usage_count;

-- name: DeleteSupplier :exec
DELETE FROM suppliers
WHERE business_id = $1 AND id = $2;

-- name: UpdateBusinessBaseCurrency :exec
UPDATE businesses
SET base_currency = $2
WHERE id = $1;

-- name: UpdateBusinessDefaultLanguage :exec
UPDATE businesses
SET default_language = $2
WHERE id = $1;

-- name: UpdateBusinessIndustryProfile :exec
UPDATE businesses
SET industry_profile = $2
WHERE id = $1;

-- name: ListTaxGroupsForBusiness :many
SELECT
    tg.id,
    tg.business_id,
    tg.code,
    tg.name,
    tg.is_default,
    tg.created_at,
    (SELECT COUNT(*)::BIGINT FROM categories c WHERE c.business_id = tg.business_id AND c.tax_group_id = tg.id) AS category_count,
    (SELECT COUNT(*)::BIGINT FROM products p WHERE p.business_id = tg.business_id AND p.tax_group_id = tg.id AND p.is_archived = FALSE) AS product_count
FROM tax_groups tg
WHERE tg.business_id = $1
ORDER BY tg.is_default DESC, tg.name ASC;

-- name: ListAllTaxRulesDetailedForBusiness :many
SELECT
    tr.id,
    tr.business_id,
    tr.tax_group_id,
    tg.code AS tax_group_code,
    tg.name AS tax_group_name,
    tr.code,
    tr.name,
    tr.tax_type,
    tr.rate_percent,
    tr.priority,
    tr.is_active,
    tr.created_at
FROM tax_rules tr
JOIN tax_groups tg ON tg.id = tr.tax_group_id
WHERE tr.business_id = $1
ORDER BY tg.is_default DESC, tr.tax_group_id, tr.priority ASC, tr.code ASC;

-- name: ClearDefaultTaxGroupsForBusiness :exec
UPDATE tax_groups
SET is_default = FALSE
WHERE business_id = $1;

-- name: GetTaxGroupByID :one
SELECT id, business_id, code, name, is_default, created_at
FROM tax_groups
WHERE business_id = $1 AND id = $2
LIMIT 1;

-- name: GetTaxGroupByCode :one
SELECT id, business_id, code, name, is_default, created_at
FROM tax_groups
WHERE business_id = $1 AND code = $2
LIMIT 1;

-- name: CreateTaxGroup :one
INSERT INTO tax_groups (business_id, code, name, is_default)
VALUES ($1, $2, $3, $4)
RETURNING id, business_id, code, name, is_default, created_at;

-- name: UpdateTaxGroup :one
UPDATE tax_groups
SET code = $3,
    name = $4,
    is_default = $5
WHERE business_id = $1 AND id = $2
RETURNING id, business_id, code, name, is_default, created_at;

-- name: CreateTaxRule :one
INSERT INTO tax_rules (business_id, tax_group_id, code, name, tax_type, rate_percent, priority, is_active)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id, business_id, tax_group_id, code, name, tax_type, rate_percent, priority, is_active, created_at;

-- name: UpdateTaxRule :one
UPDATE tax_rules
SET code = $3,
    name = $4,
    tax_type = $5,
    rate_percent = $6,
    priority = $7,
    is_active = $8
WHERE business_id = $1 AND id = $2
RETURNING id, business_id, tax_group_id, code, name, tax_type, rate_percent, priority, is_active, created_at;

-- name: UpsertTaxRuleByCode :one
INSERT INTO tax_rules (business_id, tax_group_id, code, name, tax_type, rate_percent, priority, is_active)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (business_id, tax_group_id, code) DO UPDATE
SET name = EXCLUDED.name,
    tax_type = EXCLUDED.tax_type,
    rate_percent = EXCLUDED.rate_percent,
    priority = EXCLUDED.priority,
    is_active = EXCLUDED.is_active
RETURNING id, business_id, tax_group_id, code, name, tax_type, rate_percent, priority, is_active, created_at;

-- name: DeleteTaxRule :exec
DELETE FROM tax_rules
WHERE business_id = $1 AND id = $2;

-- name: DeactivateOtherTaxRulesInGroup :exec
UPDATE tax_rules
SET is_active = FALSE
WHERE business_id = $1 AND tax_group_id = $2 AND code <> $3 AND code <> $4;

-- name: AssignCategoriesDefaultTaxGroup :exec
UPDATE categories
SET tax_group_id = $2
WHERE business_id = $1 AND (tax_group_id IS NULL OR tax_group_id <> $2);





