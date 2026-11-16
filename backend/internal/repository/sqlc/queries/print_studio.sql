-- name: ListPrintTemplates :many
SELECT
    id, business_id, branch_id, name, document_type,
    paper_width_mm, paper_height_mm, snap_grid_mm,
    is_default, canvas_schema, printer_profile,
    created_by, created_at, updated_at
FROM print_templates
WHERE business_id = $1
ORDER BY is_default DESC, document_type ASC, updated_at DESC;

-- name: GetPrintTemplateByID :one
SELECT
    id, business_id, branch_id, name, document_type,
    paper_width_mm, paper_height_mm, snap_grid_mm,
    is_default, canvas_schema, printer_profile,
    created_by, created_at, updated_at
FROM print_templates
WHERE business_id = $1 AND id = $2
LIMIT 1;

-- name: ClearDefaultPrintTemplateForType :exec
UPDATE print_templates
SET is_default = FALSE, updated_at = NOW()
WHERE business_id = $1 AND document_type = $2 AND is_default = TRUE;

-- name: CreatePrintTemplate :one
INSERT INTO print_templates (
    business_id, branch_id, name, document_type,
    paper_width_mm, paper_height_mm, snap_grid_mm,
    is_default, canvas_schema, printer_profile, created_by
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING
    id, business_id, branch_id, name, document_type,
    paper_width_mm, paper_height_mm, snap_grid_mm,
    is_default, canvas_schema, printer_profile,
    created_by, created_at, updated_at;

-- name: UpdatePrintTemplate :one
UPDATE print_templates
SET
    branch_id = $3,
    name = $4,
    document_type = $5,
    paper_width_mm = $6,
    paper_height_mm = $7,
    snap_grid_mm = $8,
    is_default = $9,
    canvas_schema = $10,
    printer_profile = $11,
    updated_at = NOW()
WHERE business_id = $1 AND id = $2
RETURNING
    id, business_id, branch_id, name, document_type,
    paper_width_mm, paper_height_mm, snap_grid_mm,
    is_default, canvas_schema, printer_profile,
    created_by, created_at, updated_at;

-- name: MarkPrintTemplateDefault :one
UPDATE print_templates
SET is_default = TRUE, updated_at = NOW()
WHERE business_id = $1 AND id = $2
RETURNING
    id, business_id, branch_id, name, document_type,
    paper_width_mm, paper_height_mm, snap_grid_mm,
    is_default, canvas_schema, printer_profile,
    created_by, created_at, updated_at;

-- name: DeletePrintTemplate :execrows
DELETE FROM print_templates
WHERE business_id = $1 AND id = $2;

