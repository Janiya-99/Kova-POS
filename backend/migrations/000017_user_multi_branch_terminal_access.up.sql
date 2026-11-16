-- 000017_user_multi_branch_terminal_access.up.sql
-- Enables Company Owners to assign staff to multiple branches, all branches, and specific POS terminals.

ALTER TABLE user_business_roles
    ADD COLUMN IF NOT EXISTS all_branches_access BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS allowed_branch_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
    ADD COLUMN IF NOT EXISTS allowed_terminal_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
    ADD COLUMN IF NOT EXISTS default_terminal_id UUID REFERENCES terminals(id) ON DELETE SET NULL;

-- Backfill existing records cleanly:
-- 1. Any user with branch_id IS NULL (e.g. BusinessOwner / SuperAdmin) gets all_branches_access = TRUE.
UPDATE user_business_roles
SET all_branches_access = TRUE
WHERE branch_id IS NULL;

-- 2. Any user with a concrete branch_id and empty allowed_branch_ids gets ARRAY[branch_id].
UPDATE user_business_roles
SET allowed_branch_ids = ARRAY[branch_id]
WHERE branch_id IS NOT NULL
  AND cardinality(allowed_branch_ids) = 0;

CREATE INDEX IF NOT EXISTS idx_ubr_allowed_branches ON user_business_roles USING GIN (allowed_branch_ids);
CREATE INDEX IF NOT EXISTS idx_ubr_allowed_terminals ON user_business_roles USING GIN (allowed_terminal_ids);

-- 3. Drop legacy retail-only gender_segment CHECK constraint so all 6 business verticals can store industry-specific segments.
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_gender_segment_check;
ALTER TABLE categories ALTER COLUMN gender_segment SET DEFAULT 'General';

-- 4. Upgrade existing Mobile & Electronics categories from 'Unisex' to accurate Mobile & Tech segments.
UPDATE categories
SET gender_segment = CASE
    WHEN slug IN ('smartphones', 'flagship-smartphones', 'midrange-5g-phones', 'tablets-foldables') THEN 'Devices & Handsets'
    WHEN slug IN ('audio-wearables', 'audio-anc-gear', 'smartwatches-wearables') THEN 'Audio & Wearables'
    WHEN slug IN ('power-chargers', 'fast-charging-power', 'cases-armor', 'cases-screen-protection', 'mobile-accessories') THEN 'Power & Accessories'
    WHEN slug IN ('networking-storage', 'networking-storage-services', 'mobile-repairs') THEN 'Networking & Services'
    ELSE gender_segment
END
WHERE gender_segment = 'Unisex'
  AND slug IN (
      'smartphones', 'flagship-smartphones', 'midrange-5g-phones', 'tablets-foldables',
      'audio-wearables', 'audio-anc-gear', 'smartwatches-wearables',
      'power-chargers', 'fast-charging-power', 'cases-armor', 'cases-screen-protection', 'mobile-accessories',
      'networking-storage', 'networking-storage-services', 'mobile-repairs'
  );

