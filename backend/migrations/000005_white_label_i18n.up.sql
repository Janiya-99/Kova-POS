-- White-Label Branding & Multi-Language Localization (i18n) Migration

ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS trade_name        TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS primary_color_hex VARCHAR(16) NOT NULL DEFAULT '#877FC1',
    ADD COLUMN IF NOT EXISTS default_language  VARCHAR(8) NOT NULL DEFAULT 'en';

UPDATE businesses
SET trade_name = name
WHERE COALESCE(TRIM(trade_name), '') = '';

UPDATE businesses
SET primary_color_hex = '#877FC1'
WHERE COALESCE(TRIM(primary_color_hex), '') = '';

UPDATE businesses
SET default_language = 'en'
WHERE COALESCE(TRIM(default_language), '') = '';

INSERT INTO setting_definitions (key, value_type, default_value, category, label, description)
VALUES (
    'system.default_language',
    'STRING',
    '"en"'::jsonb,
    'Localization',
    'System Language',
    'Default interface language across dashboards, POS terminals, and receipts (en, si, ta)'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO scoped_settings (business_id, setting_key, scope_level, scope_target_id, value_json, updated_by)
SELECT
    b.id,
    'system.default_language',
    'BUSINESS',
    b.id,
    to_jsonb(COALESCE(NULLIF(b.default_language, ''), 'en')),
    NULL
FROM businesses b
WHERE NOT EXISTS (
    SELECT 1
    FROM scoped_settings ss
    WHERE ss.business_id = b.id
      AND ss.setting_key = 'system.default_language'
      AND ss.scope_level = 'BUSINESS'
      AND COALESCE(ss.scope_target_id, '00000000-0000-0000-0000-000000000000'::UUID) = b.id
);

