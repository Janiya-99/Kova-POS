-- Enterprise Multi-Business POS & ERP — Tenant User Session Management & Security Policies
CREATE TABLE IF NOT EXISTS user_sessions (
    id              UUID PRIMARY KEY,
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
    terminal_id     UUID REFERENCES terminals(id) ON DELETE SET NULL,
    role_code       TEXT NOT NULL DEFAULT '',
    ip_address      TEXT NOT NULL DEFAULT '',
    user_agent      TEXT NOT NULL DEFAULT '',
    device_label    TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idle_expires_at TIMESTAMPTZ NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    revoked_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    revoked_reason  TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS ix_user_sessions_biz_user_active
    ON user_sessions (business_id, user_id, created_at DESC)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_user_sessions_biz_expires
    ON user_sessions (business_id, expires_at DESC);

-- 6-Level Inherited Security, Session & Rate-Limit Policies
INSERT INTO setting_definitions (key, value_type, default_value, category, label, description)
VALUES
    ('security.session.ttl_hours', 'NUMBER', '24'::jsonb, 'Security & Sessions', 'Session Lifetime (Hours)', 'Maximum absolute session duration before re-authentication is required'),
    ('security.session.idle_timeout_minutes', 'NUMBER', '480'::jsonb, 'Security & Sessions', 'Idle Session Timeout (Minutes)', 'Minutes of inactivity after which a signed-in session expires automatically'),
    ('security.session.max_concurrent', 'NUMBER', '5'::jsonb, 'Security & Sessions', 'Max Concurrent Sessions', 'Maximum simultaneous active sessions per user (oldest evicted automatically; 0 = unlimited)'),
    ('security.rate_limit.enabled', 'BOOLEAN', 'true'::jsonb, 'Security & Sessions', 'Enable API Rate Limiting', 'Enforces Redis-backed burst and brute-force rate protections across endpoints'),
    ('security.rate_limit.api_rpm', 'NUMBER', '240'::jsonb, 'Security & Sessions', 'Tenant API Requests / Min', 'Maximum authenticated requests per user per minute across tenant endpoints'),
    ('security.rate_limit.login_max_attempts', 'NUMBER', '10'::jsonb, 'Security & Sessions', 'Max Login Attempts / Min', 'Per-IP login requests per minute before temporary 429 cooldown'),
    ('security.rate_limit.pin_max_attempts', 'NUMBER', '5'::jsonb, 'Security & Sessions', 'Max Supervisor PIN Attempts / 5 Min', 'Incorrect 6-digit PIN override attempts per 5 minutes before cooldown')
ON CONFLICT (key) DO NOTHING;

-- Session Management RBAC Permissions
INSERT INTO permissions (module, action, code, description)
VALUES
    ('security', 'sessions_view', 'security:sessions_view', 'View active staff sessions and rate-limiting telemetry'),
    ('security', 'sessions_manage', 'security:sessions_manage', 'Revoke active staff sessions and enforce sign-outs')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('security:sessions_view', 'security:sessions_manage')
WHERE r.code IN ('SuperAdmin', 'BusinessOwner', 'BranchManager')
ON CONFLICT DO NOTHING;

