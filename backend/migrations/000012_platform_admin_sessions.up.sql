-- Master Control Plane Platform SuperAdmin Sessions (Master DB Only)
CREATE TABLE IF NOT EXISTS platform_admin_sessions (
    id              UUID PRIMARY KEY,
    admin_id        UUID NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
    ip_address      TEXT NOT NULL DEFAULT '',
    user_agent      TEXT NOT NULL DEFAULT '',
    device_label    TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idle_expires_at TIMESTAMPTZ NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    revoked_reason  TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS ix_platform_admin_sessions_active
    ON platform_admin_sessions (admin_id, created_at DESC)
    WHERE revoked_at IS NULL;

