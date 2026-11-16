-- Phase 12: Separate Master Control Plane (Platform SuperAdmins & Database-per-Company Registry)

CREATE TABLE IF NOT EXISTS platform_admins (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    full_name     TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    title         TEXT NOT NULL DEFAULT 'Platform SuperAdmin',
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_companies (
    id                  UUID PRIMARY KEY,
    slug                TEXT NOT NULL UNIQUE,
    db_name             TEXT NOT NULL UNIQUE,
    name                TEXT NOT NULL,
    trade_name          TEXT NOT NULL DEFAULT '',
    legal_name          TEXT NOT NULL DEFAULT '',
    industry_profile    TEXT NOT NULL DEFAULT 'retail',
    base_currency       VARCHAR(3) NOT NULL DEFAULT 'USD',
    default_language    VARCHAR(8) NOT NULL DEFAULT 'en',
    tax_registration_no TEXT NOT NULL DEFAULT '',
    primary_color_hex   VARCHAR(16) NOT NULL DEFAULT '#877FC1',
    logo_light_url      TEXT NOT NULL DEFAULT '',
    owner_email         TEXT NOT NULL DEFAULT '',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Decouple centralized audit_logs from local tenant FK constraints so events across isolated DBs persist in Master DB.
ALTER TABLE audit_logs
    DROP CONSTRAINT IF EXISTS audit_logs_business_id_fkey,
    DROP CONSTRAINT IF EXISTS audit_logs_branch_id_fkey,
    DROP CONSTRAINT IF EXISTS audit_logs_actor_user_id_fkey;

ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS company_slug TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS company_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS db_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS branch_name TEXT NOT NULL DEFAULT '';

-- Seed default Platform SuperAdmin (separate from any tenant company database)
INSERT INTO platform_admins (email, full_name, password_hash, title, is_active)
VALUES (
    'admin@zonaplatform.com',
    'Platform Root Admin',
    crypt('Zona@2026!', gen_salt('bf', 10)),
    'Platform SuperAdmin',
    TRUE
)
ON CONFLICT (email) DO NOTHING;

-- Register Zona Retail Ltd (preserving live branding/currency if already present in businesses)
INSERT INTO platform_companies (
    id, slug, db_name, name, trade_name, legal_name, industry_profile,
    base_currency, default_language, tax_registration_no, primary_color_hex,
    logo_light_url, owner_email, is_active
)
SELECT
    b.id,
    'zona-retail',
    'pos_tenant_zona_retail',
    b.name,
    COALESCE(NULLIF(b.trade_name, ''), b.name),
    b.legal_name,
    COALESCE(NULLIF(b.industry_profile, ''), 'retail'),
    b.base_currency,
    COALESCE(NULLIF(b.default_language, ''), 'en'),
    b.tax_registration_no,
    COALESCE(NULLIF(b.primary_color_hex, ''), '#877FC1'),
    COALESCE(b.logo_light_url, ''),
    'owner@zonaretail.com',
    b.is_active
FROM businesses b
WHERE b.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (id) DO NOTHING;

-- Fallback if fresh Master DB had no businesses table populated yet
INSERT INTO platform_companies (
    id, slug, db_name, name, trade_name, legal_name, industry_profile,
    base_currency, default_language, tax_registration_no, primary_color_hex,
    logo_light_url, owner_email, is_active
)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'zona-retail',
    'pos_tenant_zona_retail',
    'Zona Retail Ltd',
    'Zona Retail Ltd',
    'Zona Retail Global Holdings LLC',
    'retail',
    'USD',
    'en',
    'US-ZR-882940',
    '#877FC1',
    '',
    'owner@zonaretail.com',
    TRUE
)
ON CONFLICT (id) DO NOTHING;

UPDATE audit_logs al
SET
    company_slug = 'zona-retail',
    company_name = COALESCE(NULLIF(pc.trade_name, ''), pc.name, 'Zona Retail Ltd'),
    db_name = 'pos_tenant_zona_retail'
FROM platform_companies pc
WHERE al.business_id = pc.id
  AND (al.company_slug = '' OR al.db_name = '');

