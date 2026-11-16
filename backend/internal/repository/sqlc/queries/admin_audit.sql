-- name: GetPlatformAdminByEmail :one
SELECT id, email, full_name, password_hash, title, is_active, created_at, updated_at
FROM platform_admins
WHERE LOWER(email) = LOWER($1) AND is_active = TRUE
LIMIT 1;

-- name: GetPlatformAdminByID :one
SELECT id, email, full_name, password_hash, title, is_active, created_at, updated_at
FROM platform_admins
WHERE id = $1 AND is_active = TRUE
LIMIT 1;

-- name: ListPlatformAdmins :many
SELECT id, email, full_name, title, is_active, created_at, updated_at
FROM platform_admins
ORDER BY created_at ASC, email ASC;

-- name: CountPlatformAdmins :one
SELECT COUNT(*)::BIGINT AS total_count
FROM platform_admins
WHERE is_active = TRUE;

-- name: CreatePlatformAdmin :one
INSERT INTO platform_admins (email, full_name, password_hash, title, is_active)
VALUES ($1, $2, $3, $4, TRUE)
RETURNING id, email, full_name, title, is_active, created_at, updated_at;

-- name: UpdatePlatformAdmin :one
UPDATE platform_admins
SET
    full_name = COALESCE(NULLIF($2::TEXT, ''), full_name),
    title = COALESCE(NULLIF($3::TEXT, ''), title),
    is_active = $4,
    updated_at = NOW()
WHERE id = $1
RETURNING id, email, full_name, title, is_active, created_at, updated_at;

-- name: ListPlatformCompanies :many
SELECT
    id, slug, db_name, name,
    COALESCE(NULLIF(trade_name, ''), name)::TEXT AS trade_name,
    legal_name,
    COALESCE(NULLIF(industry_profile, ''), 'retail')::TEXT AS industry_profile,
    base_currency,
    COALESCE(NULLIF(default_language, ''), 'en')::TEXT AS default_language,
    tax_registration_no,
    COALESCE(NULLIF(primary_color_hex, ''), '#877FC1')::TEXT AS primary_color_hex,
    logo_light_url,
    owner_email,
    is_active,
    created_at,
    updated_at
FROM platform_companies
ORDER BY CASE WHEN id = '11111111-1111-1111-1111-111111111111' THEN 0 ELSE 1 END, created_at DESC, name ASC;

-- name: ListPublicPlatformCompanies :many
SELECT
    id, slug, name,
    COALESCE(NULLIF(trade_name, ''), name)::TEXT AS trade_name,
    COALESCE(NULLIF(industry_profile, ''), 'retail')::TEXT AS industry_profile,
    base_currency,
    COALESCE(NULLIF(default_language, ''), 'en')::TEXT AS default_language,
    COALESCE(NULLIF(primary_color_hex, ''), '#877FC1')::TEXT AS primary_color_hex,
    logo_light_url
FROM platform_companies
WHERE is_active = TRUE
ORDER BY CASE WHEN id = '11111111-1111-1111-1111-111111111111' THEN 0 ELSE 1 END, name ASC;

-- name: GetPlatformCompanyBySlug :one
SELECT
    id, slug, db_name, name,
    COALESCE(NULLIF(trade_name, ''), name)::TEXT AS trade_name,
    legal_name,
    COALESCE(NULLIF(industry_profile, ''), 'retail')::TEXT AS industry_profile,
    base_currency,
    COALESCE(NULLIF(default_language, ''), 'en')::TEXT AS default_language,
    tax_registration_no,
    COALESCE(NULLIF(primary_color_hex, ''), '#877FC1')::TEXT AS primary_color_hex,
    logo_light_url,
    owner_email,
    is_active,
    created_at,
    updated_at
FROM platform_companies
WHERE LOWER(slug) = LOWER($1)
LIMIT 1;

-- name: GetPlatformCompanyByID :one
SELECT
    id, slug, db_name, name,
    COALESCE(NULLIF(trade_name, ''), name)::TEXT AS trade_name,
    legal_name,
    COALESCE(NULLIF(industry_profile, ''), 'retail')::TEXT AS industry_profile,
    base_currency,
    COALESCE(NULLIF(default_language, ''), 'en')::TEXT AS default_language,
    tax_registration_no,
    COALESCE(NULLIF(primary_color_hex, ''), '#877FC1')::TEXT AS primary_color_hex,
    logo_light_url,
    owner_email,
    is_active,
    created_at,
    updated_at
FROM platform_companies
WHERE id = $1
LIMIT 1;

-- name: InsertPlatformCompany :one
INSERT INTO platform_companies (
    id, slug, db_name, name, trade_name, legal_name, industry_profile,
    base_currency, default_language, tax_registration_no, primary_color_hex,
    logo_light_url, owner_email, is_active
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE)
RETURNING id, slug, db_name, name, trade_name, legal_name, industry_profile, base_currency, default_language, tax_registration_no, primary_color_hex, logo_light_url, owner_email, is_active, created_at, updated_at;

-- name: UpdatePlatformCompanyMaster :one
UPDATE platform_companies
SET
    name = COALESCE(NULLIF($2::TEXT, ''), name),
    trade_name = COALESCE(NULLIF($3::TEXT, ''), trade_name),
    base_currency = COALESCE(NULLIF($4::TEXT, ''), base_currency),
    industry_profile = COALESCE(NULLIF($5::TEXT, ''), industry_profile),
    is_active = $6,
    updated_at = NOW()
WHERE id = $1
RETURNING id, slug, db_name, name, trade_name, legal_name, industry_profile, base_currency, default_language, tax_registration_no, primary_color_hex, logo_light_url, owner_email, is_active, created_at, updated_at;

-- name: GetTenantDatabaseStats :one
SELECT
    (SELECT COUNT(*)::BIGINT FROM branches br WHERE br.business_id = $1 AND br.is_active = TRUE) AS branch_count,
    (SELECT COUNT(*)::BIGINT FROM terminals tm WHERE tm.business_id = $1 AND tm.is_active = TRUE) AS terminal_count,
    (SELECT COUNT(DISTINCT ubr.user_id)::BIGINT FROM user_business_roles ubr JOIN roles r ON r.id = ubr.role_id WHERE ubr.business_id = $1 AND ubr.is_active = TRUE AND r.code <> 'SuperAdmin') AS user_count,
    (SELECT COUNT(*)::BIGINT FROM sales_invoices si WHERE si.business_id = $1) AS invoice_count;

-- name: UpdateCompanyAdminProfile :one
UPDATE businesses
SET
    name = COALESCE(NULLIF($2::TEXT, ''), name),
    trade_name = COALESCE(NULLIF($3::TEXT, ''), trade_name),
    base_currency = COALESCE(NULLIF($4::TEXT, ''), base_currency),
    industry_profile = COALESCE(NULLIF($5::TEXT, ''), industry_profile),
    is_active = $6
WHERE id = $1
RETURNING id, name, trade_name, legal_name, tax_registration_no, base_currency, default_language, primary_color_hex, industry_profile, is_active, created_at;

-- name: InsertAuditLog :one
INSERT INTO audit_logs (
    business_id,
    company_slug,
    company_name,
    db_name,
    branch_id,
    branch_name,
    actor_user_id,
    actor_email,
    actor_name,
    actor_role,
    module,
    action,
    entity_type,
    entity_id,
    summary,
    metadata_json,
    ip_address,
    status
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
RETURNING id, created_at;

-- name: ListAuditLogs :many
SELECT
    al.id,
    al.business_id,
    COALESCE(NULLIF(al.company_slug, ''), pc.slug, '')::TEXT AS company_slug,
    COALESCE(NULLIF(al.company_name, ''), NULLIF(pc.trade_name, ''), pc.name, 'Platform System')::TEXT AS company_name,
    COALESCE(NULLIF(al.db_name, ''), pc.db_name, '')::TEXT AS db_name,
    COALESCE(NULLIF(pc.industry_profile, ''), '')::TEXT AS company_industry,
    al.branch_id,
    al.branch_name,
    al.actor_user_id,
    al.actor_email,
    al.actor_name,
    al.actor_role,
    al.module,
    al.action,
    al.entity_type,
    al.entity_id,
    al.summary,
    al.metadata_json,
    al.ip_address,
    al.status,
    al.created_at
FROM audit_logs al
LEFT JOIN platform_companies pc ON pc.id = al.business_id
WHERE ($1::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR al.business_id = $1::UUID)
  AND ($2::TEXT = '' OR LOWER(al.module) = LOWER($2::TEXT))
  AND ($3::TEXT = '' OR UPPER(al.status) = UPPER($3::TEXT))
  AND (
      $4::TEXT = ''
      OR al.summary ILIKE '%' || $4::TEXT || '%'
      OR al.action ILIKE '%' || $4::TEXT || '%'
      OR al.actor_email ILIKE '%' || $4::TEXT || '%'
      OR al.actor_name ILIKE '%' || $4::TEXT || '%'
      OR COALESCE(NULLIF(al.company_name, ''), pc.name, '') ILIKE '%' || $4::TEXT || '%'
      OR COALESCE(NULLIF(al.company_slug, ''), pc.slug, '') ILIKE '%' || $4::TEXT || '%'
      OR al.entity_id ILIKE '%' || $4::TEXT || '%'
  )
ORDER BY al.created_at DESC
LIMIT $5::INT OFFSET $6::INT;

-- name: CountAuditLogs :one
SELECT COUNT(*)::BIGINT AS total_count
FROM audit_logs al
LEFT JOIN platform_companies pc ON pc.id = al.business_id
WHERE ($1::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR al.business_id = $1::UUID)
  AND ($2::TEXT = '' OR LOWER(al.module) = LOWER($2::TEXT))
  AND ($3::TEXT = '' OR UPPER(al.status) = UPPER($3::TEXT))
  AND (
      $4::TEXT = ''
      OR al.summary ILIKE '%' || $4::TEXT || '%'
      OR al.action ILIKE '%' || $4::TEXT || '%'
      OR al.actor_email ILIKE '%' || $4::TEXT || '%'
      OR al.actor_name ILIKE '%' || $4::TEXT || '%'
      OR COALESCE(NULLIF(al.company_name, ''), pc.name, '') ILIKE '%' || $4::TEXT || '%'
      OR COALESCE(NULLIF(al.company_slug, ''), pc.slug, '') ILIKE '%' || $4::TEXT || '%'
      OR al.entity_id ILIKE '%' || $4::TEXT || '%'
  );

-- name: CreatePlatformAdminSession :one
INSERT INTO platform_admin_sessions (
    id, admin_id, ip_address, user_agent, device_label, idle_expires_at, expires_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, admin_id, ip_address, user_agent, device_label, created_at, last_seen_at, idle_expires_at, expires_at, revoked_at, revoked_reason;

-- name: GetPlatformAdminSessionByID :one
SELECT id, admin_id, ip_address, user_agent, device_label, created_at, last_seen_at, idle_expires_at, expires_at, revoked_at, revoked_reason
FROM platform_admin_sessions
WHERE id = $1
LIMIT 1;

-- name: TouchPlatformAdminSession :exec
UPDATE platform_admin_sessions
SET
    last_seen_at = NOW(),
    idle_expires_at = $2
WHERE id = $1 AND revoked_at IS NULL;

-- name: RefreshPlatformAdminSessionExpiry :exec
UPDATE platform_admin_sessions
SET
    last_seen_at = NOW(),
    idle_expires_at = $2,
    expires_at = $3
WHERE id = $1 AND revoked_at IS NULL;

-- name: ListPlatformAdminSessions :many
SELECT
    s.id,
    s.admin_id,
    pa.email AS admin_email,
    pa.full_name AS admin_name,
    pa.title AS admin_title,
    s.ip_address,
    s.user_agent,
    s.device_label,
    s.created_at,
    s.last_seen_at,
    s.idle_expires_at,
    s.expires_at
FROM platform_admin_sessions s
JOIN platform_admins pa ON pa.id = s.admin_id
WHERE s.revoked_at IS NULL
  AND s.expires_at > NOW()
  AND s.idle_expires_at > NOW()
ORDER BY s.last_seen_at DESC, s.created_at DESC
LIMIT $1;

-- name: RevokePlatformAdminSession :one
UPDATE platform_admin_sessions
SET
    revoked_at = NOW(),
    revoked_reason = $2
WHERE id = $1 AND revoked_at IS NULL
RETURNING id, admin_id;

-- name: RevokeOtherPlatformAdminSessions :many
UPDATE platform_admin_sessions
SET
    revoked_at = NOW(),
    revoked_reason = $3
WHERE admin_id = $1
  AND id <> $2
  AND revoked_at IS NULL
RETURNING id, admin_id;

-- name: RevokeAllPlatformAdminSessions :many
UPDATE platform_admin_sessions
SET
    revoked_at = NOW(),
    revoked_reason = $2
WHERE admin_id = $1
  AND revoked_at IS NULL
RETURNING id, admin_id;
