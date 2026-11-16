-- 000017_user_multi_branch_terminal_access.down.sql

DROP INDEX IF EXISTS idx_ubr_allowed_terminals;
DROP INDEX IF EXISTS idx_ubr_allowed_branches;

ALTER TABLE user_business_roles
    DROP COLUMN IF EXISTS default_terminal_id,
    DROP COLUMN IF EXISTS allowed_terminal_ids,
    DROP COLUMN IF EXISTS allowed_branch_ids,
    DROP COLUMN IF EXISTS all_branches_access;

