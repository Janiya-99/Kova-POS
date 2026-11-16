ALTER TABLE audit_logs
    DROP COLUMN IF EXISTS branch_name,
    DROP COLUMN IF EXISTS db_name,
    DROP COLUMN IF EXISTS company_name,
    DROP COLUMN IF EXISTS company_slug;

DROP TABLE IF EXISTS platform_companies;
DROP TABLE IF EXISTS platform_admins;

