DELETE FROM permissions WHERE code IN ('security:sessions_view', 'security:sessions_manage');

DELETE FROM setting_definitions WHERE key IN (
    'security.session.ttl_hours',
    'security.session.idle_timeout_minutes',
    'security.session.max_concurrent',
    'security.rate_limit.enabled',
    'security.rate_limit.api_rpm',
    'security.rate_limit.login_max_attempts',
    'security.rate_limit.pin_max_attempts'
);

DROP TABLE IF EXISTS user_sessions CASCADE;

