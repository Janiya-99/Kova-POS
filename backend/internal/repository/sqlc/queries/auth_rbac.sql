-- name: GetUserByEmail :one
SELECT id, email, full_name, password_hash, avatar_url, is_active, created_at
FROM users
WHERE LOWER(email) = LOWER($1) AND is_active = TRUE
LIMIT 1;

-- name: GetUserBusinessContexts :many
SELECT
    ubr.id AS user_business_role_id,
    ubr.business_id,
    b.name AS business_name,
    COALESCE(NULLIF(b.trade_name, ''), b.name)::TEXT AS trade_name,
    b.base_currency,
    b.tax_registration_no,
    b.logo_light_url,
    b.logo_dark_url,
    b.logo_receipt_url,
    COALESCE(NULLIF(b.primary_color_hex, ''), '#877FC1')::TEXT AS primary_color_hex,
    COALESCE(NULLIF(b.default_language, ''), 'en')::TEXT AS default_language,
    COALESCE(NULLIF(b.industry_profile, ''), 'retail')::TEXT AS industry_profile,
    ubr.branch_id,
    COALESCE(br.name, 'All Branches')::TEXT AS branch_name,
    COALESCE(br.country_name, 'USA')::TEXT AS country_name,
    r.id AS role_id,
    r.code AS role_code,
    r.name AS role_name,
    COALESCE(d.max_pos_discount_pct, 100.00)::NUMERIC(5,2) AS max_pos_discount_pct,
    COALESCE(d.name, r.name)::TEXT AS designation_name,
    ubr.supervisor_pin_hash,
    ubr.all_branches_access,
    ubr.allowed_branch_ids,
    ubr.allowed_terminal_ids,
    ubr.default_terminal_id
FROM user_business_roles ubr
JOIN businesses b ON b.id = ubr.business_id AND b.is_active = TRUE
JOIN roles r ON r.id = ubr.role_id
LEFT JOIN branches br ON br.id = ubr.branch_id
LEFT JOIN designations d ON d.id = ubr.designation_id
WHERE ubr.user_id = $1 AND ubr.is_active = TRUE
ORDER BY CASE WHEN b.id = '11111111-1111-1111-1111-111111111111' THEN 0 ELSE 1 END, b.name ASC;

-- name: GetUserRoleForBusiness :one
SELECT
    ubr.id AS user_business_role_id,
    ubr.user_id,
    u.full_name,
    u.email,
    u.avatar_url,
    ubr.business_id,
    b.name AS business_name,
    COALESCE(NULLIF(b.trade_name, ''), b.name)::TEXT AS trade_name,
    b.base_currency,
    b.tax_registration_no,
    b.logo_light_url,
    b.logo_dark_url,
    b.logo_receipt_url,
    COALESCE(NULLIF(b.primary_color_hex, ''), '#877FC1')::TEXT AS primary_color_hex,
    COALESCE(NULLIF(b.default_language, ''), 'en')::TEXT AS default_language,
    COALESCE(NULLIF(b.industry_profile, ''), 'retail')::TEXT AS industry_profile,
    ubr.branch_id,
    r.id AS role_id,
    r.code AS role_code,
    r.name AS role_name,
    COALESCE(d.max_pos_discount_pct, 100.00)::NUMERIC(5,2) AS max_pos_discount_pct,
    COALESCE(d.name, r.name)::TEXT AS designation_name,
    ubr.supervisor_pin_hash,
    ubr.all_branches_access,
    ubr.allowed_branch_ids,
    ubr.allowed_terminal_ids,
    ubr.default_terminal_id
FROM user_business_roles ubr
JOIN users u ON u.id = ubr.user_id AND u.is_active = TRUE
JOIN businesses b ON b.id = ubr.business_id AND b.is_active = TRUE
JOIN roles r ON r.id = ubr.role_id
LEFT JOIN designations d ON d.id = ubr.designation_id
WHERE ubr.user_id = $1 AND ubr.business_id = $2 AND ubr.is_active = TRUE
LIMIT 1;

-- name: GetAllBusinessContextsForSuperAdmin :many
WITH sa_membership AS (
    SELECT
        ubr.id,
        ubr.user_id,
        ubr.role_id,
        ubr.supervisor_pin_hash,
        r.code AS role_code,
        r.name AS role_name
    FROM user_business_roles ubr
    JOIN roles r ON r.id = ubr.role_id
    WHERE ubr.user_id = $1
      AND ubr.is_active = TRUE
      AND r.code = 'SuperAdmin'
    LIMIT 1
)
SELECT
    sa.id AS user_business_role_id,
    b.id AS business_id,
    b.name AS business_name,
    COALESCE(NULLIF(b.trade_name, ''), b.name)::TEXT AS trade_name,
    b.base_currency,
    b.tax_registration_no,
    b.logo_light_url,
    b.logo_dark_url,
    b.logo_receipt_url,
    COALESCE(NULLIF(b.primary_color_hex, ''), '#877FC1')::TEXT AS primary_color_hex,
    COALESCE(NULLIF(b.default_language, ''), 'en')::TEXT AS default_language,
    COALESCE(NULLIF(b.industry_profile, ''), 'retail')::TEXT AS industry_profile,
    NULL::UUID AS branch_id,
    'All Branches'::TEXT AS branch_name,
    'Global'::TEXT AS country_name,
    sa.role_id,
    sa.role_code,
    sa.role_name,
    100.00::NUMERIC(5,2) AS max_pos_discount_pct,
    'System SuperAdmin'::TEXT AS designation_name,
    sa.supervisor_pin_hash,
    TRUE::BOOLEAN AS all_branches_access,
    '{}'::UUID[] AS allowed_branch_ids,
    '{}'::UUID[] AS allowed_terminal_ids,
    NULL::UUID AS default_terminal_id
FROM businesses b
CROSS JOIN sa_membership sa
WHERE b.is_active = TRUE
ORDER BY CASE WHEN b.id = '11111111-1111-1111-1111-111111111111' THEN 0 ELSE 1 END, b.name ASC;

-- name: GetSuperAdminContextForBusiness :one
SELECT
    ubr.id AS user_business_role_id,
    ubr.user_id,
    u.full_name,
    u.email,
    u.avatar_url,
    b.id AS business_id,
    b.name AS business_name,
    COALESCE(NULLIF(b.trade_name, ''), b.name)::TEXT AS trade_name,
    b.base_currency,
    b.tax_registration_no,
    b.logo_light_url,
    b.logo_dark_url,
    b.logo_receipt_url,
    COALESCE(NULLIF(b.primary_color_hex, ''), '#877FC1')::TEXT AS primary_color_hex,
    COALESCE(NULLIF(b.default_language, ''), 'en')::TEXT AS default_language,
    COALESCE(NULLIF(b.industry_profile, ''), 'retail')::TEXT AS industry_profile,
    r.id AS role_id,
    r.code AS role_code,
    r.name AS role_name,
    100.00::NUMERIC(5,2) AS max_pos_discount_pct,
    'System SuperAdmin'::TEXT AS designation_name,
    ubr.supervisor_pin_hash,
    TRUE::BOOLEAN AS all_branches_access,
    '{}'::UUID[] AS allowed_branch_ids,
    '{}'::UUID[] AS allowed_terminal_ids,
    NULL::UUID AS default_terminal_id
FROM users u
JOIN user_business_roles ubr ON ubr.user_id = u.id AND ubr.is_active = TRUE
JOIN roles r ON r.id = ubr.role_id AND r.code = 'SuperAdmin'
JOIN businesses b ON b.id = $2 AND b.is_active = TRUE
WHERE u.id = $1 AND u.is_active = TRUE
LIMIT 1;

-- name: ListPermissionsForRole :many
SELECT p.code
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id
WHERE rp.role_id = $1
ORDER BY p.code ASC;

-- name: ListSupervisorsForBusiness :many
SELECT
    ubr.user_id,
    u.full_name,
    u.email,
    r.code AS role_code,
    ubr.supervisor_pin_hash
FROM user_business_roles ubr
JOIN users u ON u.id = ubr.user_id AND u.is_active = TRUE
JOIN roles r ON r.id = ubr.role_id
WHERE ubr.business_id = $1
  AND ubr.is_active = TRUE
  AND ubr.supervisor_pin_hash <> ''
  AND r.code IN ('SuperAdmin', 'BusinessOwner', 'BranchManager');

-- name: ListBranchesForBusiness :many
SELECT id, business_id, code, name, country_code, country_name, city, address, is_warehouse, is_active
FROM branches
WHERE business_id = $1 AND is_active = TRUE
ORDER BY name ASC;

-- name: ListWarehousesForBusiness :many
SELECT id, business_id, branch_id, code, name, is_active
FROM warehouses
WHERE business_id = $1 AND is_active = TRUE
ORDER BY name ASC;

-- name: ListTerminalsForBranch :many
SELECT id, business_id, branch_id, code, name, hardware_serial, is_active
FROM terminals
WHERE business_id = $1 AND branch_id = $2 AND is_active = TRUE
ORDER BY code ASC;

-- name: ListActiveTerminalsForBusiness :many
SELECT id, business_id, branch_id, code, name, hardware_serial, is_active
FROM terminals
WHERE business_id = $1 AND is_active = TRUE
ORDER BY code ASC;

-- name: ListRolesWithPermissions :many
SELECT
    r.id AS role_id,
    r.business_id,
    r.code AS role_code,
    r.name AS role_name,
    r.description AS role_description,
    r.is_system,
    p.code AS permission_code,
    p.module AS permission_module,
    p.description AS permission_description
FROM roles r
LEFT JOIN role_permissions rp ON rp.role_id = r.id
LEFT JOIN permissions p ON p.id = rp.permission_id
ORDER BY r.is_system DESC, r.name ASC, p.code ASC;

-- name: ListRolesWithPermissionsForBusiness :many
SELECT
    r.id AS role_id,
    r.business_id,
    r.code AS role_code,
    r.name AS role_name,
    r.description AS role_description,
    r.is_system,
    p.code AS permission_code,
    p.module AS permission_module,
    p.description AS permission_description
FROM roles r
LEFT JOIN role_permissions rp ON rp.role_id = r.id
LEFT JOIN permissions p ON p.id = rp.permission_id
WHERE r.business_id IS NULL OR r.business_id = $1
ORDER BY r.is_system DESC, r.name ASC, p.code ASC;

-- name: GetUserByIDForAuth :one
SELECT id, email, full_name, password_hash, is_active
FROM users
WHERE id = $1 AND is_active = TRUE
LIMIT 1;

-- name: UpdateUserPasswordHash :exec
UPDATE users
SET password_hash = $2
WHERE id = $1 AND is_active = TRUE;

-- name: InvalidateUnusedPasswordResetTokens :exec
UPDATE password_reset_tokens
SET used_at = NOW()
WHERE user_id = $1 AND used_at IS NULL;

-- name: CreatePasswordResetToken :one
INSERT INTO password_reset_tokens (
    user_id, email, code_hash, token_hash, expires_at, requested_ip
) VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, user_id, email, code_hash, token_hash, expires_at, used_at, attempts, requested_ip, created_at;

-- name: GetLatestActivePasswordResetTokenByEmail :one
SELECT id, user_id, email, code_hash, token_hash, expires_at, used_at, attempts, requested_ip, created_at
FROM password_reset_tokens
WHERE user_id = $1
  AND LOWER(email) = LOWER($2)
  AND used_at IS NULL
  AND expires_at > NOW()
ORDER BY created_at DESC
LIMIT 1;

-- name: GetActivePasswordResetTokenByTokenHash :one
SELECT id, user_id, email, code_hash, token_hash, expires_at, used_at, attempts, requested_ip, created_at
FROM password_reset_tokens
WHERE token_hash = $1
  AND used_at IS NULL
  AND expires_at > NOW()
LIMIT 1;

-- name: IncrementPasswordResetTokenAttempts :one
UPDATE password_reset_tokens
SET attempts = attempts + 1,
    used_at = CASE WHEN attempts + 1 >= 5 THEN NOW() ELSE used_at END
WHERE id = $1
RETURNING attempts, used_at;

-- name: MarkPasswordResetTokenUsed :exec
UPDATE password_reset_tokens
SET used_at = NOW()
WHERE id = $1;

