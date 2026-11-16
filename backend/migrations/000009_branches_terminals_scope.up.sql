-- Phase 11: Multi-Branch & Terminal Access Scoping
-- Ensure ONLY SuperAdmin and BusinessOwner can switch/manage multiple branches.
-- Single-branch roles (BranchManager, Accountant, InventoryController, Cashier, custom roles) retain branches:view only.

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code NOT IN ('SuperAdmin', 'BusinessOwner')
  AND p.code IN ('branches:switch', 'branches:manage');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('branches:view', 'branches:switch', 'branches:manage')
WHERE r.code IN ('SuperAdmin', 'BusinessOwner')
  AND r.business_id IS NULL
ON CONFLICT DO NOTHING;

-- Ensure any existing non-owner/non-superadmin user assignment has a concrete assigned branch_id.
UPDATE user_business_roles ubr
SET branch_id = (
    SELECT br.id
    FROM branches br
    WHERE br.business_id = ubr.business_id
    ORDER BY br.is_active DESC, br.is_warehouse DESC, br.created_at ASC
    LIMIT 1
)
FROM roles r
WHERE ubr.role_id = r.id
  AND r.code NOT IN ('SuperAdmin', 'BusinessOwner')
  AND ubr.branch_id IS NULL
  AND EXISTS (SELECT 1 FROM branches br WHERE br.business_id = ubr.business_id);

