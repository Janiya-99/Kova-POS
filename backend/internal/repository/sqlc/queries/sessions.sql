-- name: CreateUserSession :one
INSERT INTO user_sessions (
    id, business_id, user_id, branch_id, terminal_id, role_code,
    ip_address, user_agent, device_label, idle_expires_at, expires_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING id, business_id, user_id, branch_id, terminal_id, role_code, ip_address, user_agent, device_label, created_at, last_seen_at, idle_expires_at, expires_at, revoked_at, revoked_by, revoked_reason;

-- name: GetUserSessionByID :one
SELECT id, business_id, user_id, branch_id, terminal_id, role_code, ip_address, user_agent, device_label, created_at, last_seen_at, idle_expires_at, expires_at, revoked_at, revoked_by, revoked_reason
FROM user_sessions
WHERE business_id = $1 AND id = $2
LIMIT 1;

-- name: TouchUserSession :exec
UPDATE user_sessions
SET
    last_seen_at = NOW(),
    idle_expires_at = $3
WHERE business_id = $1 AND id = $2 AND revoked_at IS NULL;

-- name: UpdateUserSessionScopeAndExpiry :exec
UPDATE user_sessions
SET
    branch_id = $3,
    terminal_id = $4,
    last_seen_at = NOW(),
    idle_expires_at = $5,
    expires_at = $6
WHERE business_id = $1 AND id = $2 AND revoked_at IS NULL;

-- name: ListUserActiveSessions :many
SELECT
    us.id,
    us.business_id,
    us.user_id,
    u.full_name AS user_name,
    u.email AS user_email,
    us.branch_id,
    COALESCE(br.name, 'All Branches')::TEXT AS branch_name,
    us.terminal_id,
    COALESCE(tm.name, 'Web Session')::TEXT AS terminal_name,
    us.role_code,
    us.ip_address,
    us.user_agent,
    us.device_label,
    us.created_at,
    us.last_seen_at,
    us.idle_expires_at,
    us.expires_at
FROM user_sessions us
JOIN users u ON u.id = us.user_id
LEFT JOIN branches br ON br.id = us.branch_id
LEFT JOIN terminals tm ON tm.id = us.terminal_id
WHERE us.business_id = $1
  AND us.user_id = $2
  AND us.revoked_at IS NULL
  AND us.expires_at > NOW()
  AND us.idle_expires_at > NOW()
ORDER BY us.last_seen_at DESC, us.created_at DESC;

-- name: ListBusinessActiveSessions :many
SELECT
    us.id,
    us.business_id,
    us.user_id,
    u.full_name AS user_name,
    u.email AS user_email,
    us.branch_id,
    COALESCE(br.name, 'All Branches')::TEXT AS branch_name,
    us.terminal_id,
    COALESCE(tm.name, 'Web Session')::TEXT AS terminal_name,
    us.role_code,
    us.ip_address,
    us.user_agent,
    us.device_label,
    us.created_at,
    us.last_seen_at,
    us.idle_expires_at,
    us.expires_at
FROM user_sessions us
JOIN users u ON u.id = us.user_id
LEFT JOIN branches br ON br.id = us.branch_id
LEFT JOIN terminals tm ON tm.id = us.terminal_id
WHERE us.business_id = $1
  AND us.revoked_at IS NULL
  AND us.expires_at > NOW()
  AND us.idle_expires_at > NOW()
ORDER BY us.last_seen_at DESC, us.created_at DESC
LIMIT $2;

-- name: RevokeUserSession :one
UPDATE user_sessions
SET
    revoked_at = NOW(),
    revoked_by = $3,
    revoked_reason = $4
WHERE business_id = $1
  AND id = $2
  AND revoked_at IS NULL
RETURNING id, user_id;

-- name: RevokeUserSessionsExcept :many
UPDATE user_sessions
SET
    revoked_at = NOW(),
    revoked_by = $3,
    revoked_reason = $4
WHERE business_id = $1
  AND user_id = $2
  AND id <> $5
  AND revoked_at IS NULL
RETURNING id, user_id;

-- name: RevokeAllUserSessions :many
UPDATE user_sessions
SET
    revoked_at = NOW(),
    revoked_by = $3,
    revoked_reason = $4
WHERE business_id = $1
  AND user_id = $2
  AND revoked_at IS NULL
RETURNING id, user_id;

-- name: ListUserActiveSessionIDsAsc :many
SELECT id
FROM user_sessions
WHERE business_id = $1
  AND user_id = $2
  AND revoked_at IS NULL
  AND expires_at > NOW()
  AND idle_expires_at > NOW()
ORDER BY last_seen_at ASC, created_at ASC;
