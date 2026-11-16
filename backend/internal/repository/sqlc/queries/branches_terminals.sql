-- name: ListBranchesWithStatsForBusiness :many
SELECT
    br.id,
    br.business_id,
    br.code,
    br.name,
    br.country_code,
    br.country_name,
    br.city,
    br.address,
    br.is_warehouse,
    br.is_active,
    br.created_at,
    COALESCE((SELECT COUNT(*)::INT FROM terminals t WHERE t.business_id = br.business_id AND t.branch_id = br.id), 0) AS terminal_count,
    COALESCE((SELECT COUNT(*)::INT FROM terminals t WHERE t.business_id = br.business_id AND t.branch_id = br.id AND t.is_active = TRUE), 0) AS active_terminal_count,
    COALESCE((SELECT COUNT(*)::INT FROM warehouses w WHERE w.business_id = br.business_id AND w.branch_id = br.id AND w.is_active = TRUE), 0) AS warehouse_count,
    COALESCE((SELECT COUNT(*)::INT FROM user_business_roles ubr WHERE ubr.business_id = br.business_id AND ubr.branch_id = br.id AND ubr.is_active = TRUE), 0) AS assigned_user_count
FROM branches br
WHERE br.business_id = $1
  AND ($2::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR br.id = $2::UUID)
ORDER BY br.is_active DESC, br.created_at ASC, br.name ASC;

-- name: GetBranchForBusiness :one
SELECT id, business_id, code, name, country_code, country_name, city, address, is_warehouse, is_active, created_at
FROM branches
WHERE business_id = $1 AND id = $2
LIMIT 1;

-- name: CountActiveBranchesForBusiness :one
SELECT COUNT(*)::INT AS active_count
FROM branches
WHERE business_id = $1 AND is_active = TRUE;

-- name: CreateBranchRecord :one
INSERT INTO branches (
    business_id, code, name, country_code, country_name, city, address, is_warehouse, is_active
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id, business_id, code, name, country_code, country_name, city, address, is_warehouse, is_active, created_at;

-- name: UpdateBranchRecord :one
UPDATE branches
SET
    code = $3,
    name = $4,
    country_code = $5,
    country_name = $6,
    city = $7,
    address = $8,
    is_warehouse = $9,
    is_active = $10
WHERE business_id = $1 AND id = $2
RETURNING id, business_id, code, name, country_code, country_name, city, address, is_warehouse, is_active, created_at;

-- name: GetWarehouseByBranch :one
SELECT id, business_id, branch_id, code, name, is_active, created_at
FROM warehouses
WHERE business_id = $1 AND branch_id = $2
ORDER BY created_at ASC
LIMIT 1;

-- name: InsertWarehouseForBranch :one
INSERT INTO warehouses (business_id, branch_id, code, name, is_active)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, business_id, branch_id, code, name, is_active, created_at;

-- name: ListTerminalsWithBranchForBusiness :many
SELECT
    t.id,
    t.business_id,
    t.branch_id,
    br.code AS branch_code,
    br.name AS branch_name,
    t.code,
    t.name,
    t.hardware_serial,
    t.is_active,
    t.created_at
FROM terminals t
JOIN branches br ON br.id = t.branch_id AND br.business_id = t.business_id
WHERE t.business_id = $1
  AND ($2::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR t.branch_id = $2::UUID)
ORDER BY br.name ASC, t.code ASC;

-- name: GetTerminalForBusiness :one
SELECT id, business_id, branch_id, code, name, hardware_serial, is_active, created_at
FROM terminals
WHERE business_id = $1 AND id = $2
LIMIT 1;

-- name: CreateTerminalRecord :one
INSERT INTO terminals (business_id, branch_id, code, name, hardware_serial, is_active)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, business_id, branch_id, code, name, hardware_serial, is_active, created_at;

-- name: UpdateTerminalRecord :one
UPDATE terminals
SET
    branch_id = $3,
    code = $4,
    name = $5,
    hardware_serial = $6,
    is_active = $7
WHERE business_id = $1 AND id = $2
RETURNING id, business_id, branch_id, code, name, hardware_serial, is_active, created_at;

