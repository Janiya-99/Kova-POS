DROP TABLE IF EXISTS audit_logs;

DELETE FROM role_permissions
WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'platform:admin');

DELETE FROM permissions WHERE code = 'platform:admin';

DROP INDEX IF EXISTS ux_roles_business_code;
ALTER TABLE roles DROP COLUMN IF EXISTS business_id;

