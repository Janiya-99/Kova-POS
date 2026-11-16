-- Revert Phase 11 branch permission restrictions if rolled back
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'branches:switch'
WHERE r.code IN ('BranchManager', 'Accountant', 'InventoryController')
  AND r.business_id IS NULL
ON CONFLICT DO NOTHING;

