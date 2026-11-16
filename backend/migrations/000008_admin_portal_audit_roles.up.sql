-- Phase 10: Platform SuperAdmin Portal, Multi-Tenant Custom Roles & Centralized Audit Logs

-- 1. Allow tenant-scoped custom roles alongside global system roles
ALTER TABLE roles
    ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE roles
    DROP CONSTRAINT IF EXISTS roles_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_roles_business_code
    ON roles (COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::UUID), code);

-- 2. Add SuperAdmin platform administration permission and sync SuperAdmin grant
INSERT INTO permissions (module, action, code, description)
VALUES (
    'platform',
    'admin',
    'platform:admin',
    'Access SuperAdmin Platform Portal, Company Setup & All-Company Audit Logs'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SuperAdmin'
  AND r.business_id IS NULL
ON CONFLICT DO NOTHING;

-- Ensure BusinessOwner and BranchManager have all non-platform RBAC / operations grants cleanly
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'BusinessOwner'
  AND r.business_id IS NULL
  AND p.code <> 'platform:admin'
ON CONFLICT DO NOTHING;

-- 3. Centralized Multi-Tenant Audit & Activity Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id   UUID REFERENCES businesses(id) ON DELETE SET NULL,
    branch_id     UUID REFERENCES branches(id) ON DELETE SET NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_email   TEXT NOT NULL DEFAULT '',
    actor_name    TEXT NOT NULL DEFAULT '',
    actor_role    TEXT NOT NULL DEFAULT '',
    module        TEXT NOT NULL,
    action        TEXT NOT NULL,
    entity_type   TEXT NOT NULL DEFAULT '',
    entity_id     TEXT NOT NULL DEFAULT '',
    summary       TEXT NOT NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address    TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS', 'DENIED', 'ERROR')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at
    ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_logs_business_created
    ON audit_logs (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_logs_module_created
    ON audit_logs (module, created_at DESC);

-- Seed initial platform bootstrap log entry when audit_logs is empty
INSERT INTO audit_logs (
    business_id, actor_email, actor_name, actor_role,
    module, action, entity_type, entity_id, summary, metadata_json, status
)
SELECT
    b.id,
    'admin@zonaretail.com',
    'System SuperAdmin',
    'SuperAdmin',
    'platform',
    'TENANT_INITIALIZED',
    'business',
    b.id::TEXT,
    'Tenant business workspace provisioned (' || COALESCE(NULLIF(b.industry_profile, ''), 'retail') || ')',
    jsonb_build_object(
        'business_name', b.name,
        'industry_profile', COALESCE(NULLIF(b.industry_profile, ''), 'retail'),
        'base_currency', b.base_currency
    ),
    'SUCCESS'
FROM businesses b
WHERE NOT EXISTS (SELECT 1 FROM audit_logs);

