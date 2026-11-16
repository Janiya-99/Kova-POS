-- Rollback White-Label Branding & Multi-Language Localization Migration

DELETE FROM scoped_settings WHERE setting_key = 'system.default_language';
DELETE FROM setting_definitions WHERE key = 'system.default_language';

ALTER TABLE businesses
    DROP COLUMN IF EXISTS default_language,
    DROP COLUMN IF EXISTS primary_color_hex,
    DROP COLUMN IF EXISTS trade_name;

