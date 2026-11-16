-- name: ListSettingDefinitions :many
SELECT key, value_type, default_value, category, label, description
FROM setting_definitions
ORDER BY category ASC, key ASC;

-- name: ListScopedSettingsForBusiness :many
SELECT id, business_id, setting_key, scope_level, scope_target_id, value_json, updated_by, updated_at
FROM scoped_settings
WHERE business_id = $1
ORDER BY setting_key ASC, scope_level ASC;

-- name: UpsertScopedSetting :one
INSERT INTO scoped_settings (business_id, setting_key, scope_level, scope_target_id, value_json, updated_by, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, NOW())
ON CONFLICT (business_id, setting_key, scope_level, COALESCE(scope_target_id, '00000000-0000-0000-0000-000000000000'::UUID))
DO UPDATE SET value_json = EXCLUDED.value_json, updated_by = EXCLUDED.updated_by, updated_at = NOW()
RETURNING id, business_id, setting_key, scope_level, scope_target_id, value_json, updated_at;

-- name: DeleteScopedSetting :exec
DELETE FROM scoped_settings
WHERE business_id = $1
  AND setting_key = $2
  AND scope_level = $3
  AND COALESCE(scope_target_id, '00000000-0000-0000-0000-000000000000'::UUID) = COALESCE($4::UUID, '00000000-0000-0000-0000-000000000000'::UUID);

