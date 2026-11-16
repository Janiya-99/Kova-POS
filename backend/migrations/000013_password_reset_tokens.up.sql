-- Password Reset OTP & Verification Token Store (Tenant + Master User Accounts)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email        TEXT NOT NULL,
    code_hash    TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,
    expires_at   TIMESTAMPTZ NOT NULL,
    used_at      TIMESTAMPTZ,
    attempts     INT NOT NULL DEFAULT 0,
    requested_ip TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_user_active
    ON password_reset_tokens (user_id, created_at DESC)
    WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_expires
    ON password_reset_tokens (expires_at DESC);

