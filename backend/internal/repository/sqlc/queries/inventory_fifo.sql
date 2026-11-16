-- name: ListSuppliersForBusiness :many
SELECT id, business_id, code, name, email, phone, tax_id, payment_terms_days
FROM suppliers
WHERE business_id = $1
ORDER BY name ASC;

-- name: ListInventoryBatchesForBranch :many
SELECT
    ib.id,
    ib.business_id,
    ib.branch_id,
    ib.product_id,
    p.sku,
    p.name AS product_name,
    ib.batch_number,
    ib.received_at,
    ib.expiry_date,
    ib.unit_cost,
    ib.initial_qty,
    ib.remaining_qty
FROM inventory_batches ib
JOIN products p ON p.id = ib.product_id
WHERE ib.business_id = $1 AND ib.branch_id = $2
ORDER BY p.name ASC, ib.received_at ASC, ib.expiry_date ASC NULLS LAST;

-- name: LockActiveFIFOBatchesForProduct :many
SELECT id, business_id, branch_id, product_id, batch_number, received_at, expiry_date, unit_cost, remaining_qty
FROM inventory_batches
WHERE business_id = $1
  AND branch_id = $2
  AND product_id = $3
  AND remaining_qty > 0
ORDER BY received_at ASC, expiry_date ASC NULLS LAST, id ASC
FOR UPDATE;

-- name: UpdateBatchRemainingQty :exec
UPDATE inventory_batches
SET remaining_qty = $2
WHERE business_id = $1 AND id = $3;

-- name: InsertInventoryBatch :one
INSERT INTO inventory_batches (
    business_id, branch_id, product_id, grn_item_id,
    batch_number, received_at, expiry_date, unit_cost, initial_qty, remaining_qty
)
VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $8)
RETURNING id, business_id, branch_id, product_id, batch_number, received_at, expiry_date, unit_cost, initial_qty, remaining_qty;

-- name: InsertStockMovement :one
INSERT INTO stock_movements (
    business_id, branch_id, product_id, batch_id,
    movement_type, qty_delta, unit_cost, reference_type, reference_id, created_by
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING id;

-- name: ListGRNsForBusiness :many
SELECT
    g.id, g.business_id, g.branch_id, br.name AS branch_name,
    g.po_id, g.supplier_id, s.name AS supplier_name,
    g.grn_number, g.supplier_invoice_no, g.attachment_name,
    g.status, g.total_cost, g.approved_at, g.created_at
FROM goods_received_notes g
JOIN branches br ON br.id = g.branch_id
JOIN suppliers s ON s.id = g.supplier_id
WHERE g.business_id = $1
ORDER BY g.created_at DESC
LIMIT 50;

-- name: GetGRNForUpdate :one
SELECT id, business_id, branch_id, po_id, supplier_id, grn_number, supplier_invoice_no, attachment_name, status, total_cost
FROM goods_received_notes
WHERE business_id = $1 AND id = $2
FOR UPDATE;

-- name: InsertGRN :one
INSERT INTO goods_received_notes (
    business_id, branch_id, po_id, supplier_id, grn_number,
    supplier_invoice_no, attachment_name, status, total_cost, received_by
)
VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT', $8, $9)
RETURNING id, grn_number, status, total_cost, created_at;

-- name: InsertGRNItem :one
INSERT INTO grn_items (
    business_id, grn_id, product_id, batch_number, expiry_date, ordered_qty, qty_received, unit_cost, line_total
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id;

-- name: ListGRNItems :many
SELECT gi.id, gi.business_id, gi.grn_id, gi.product_id, p.sku, p.name AS product_name, gi.batch_number, gi.expiry_date, gi.ordered_qty, gi.qty_received, gi.unit_cost, gi.line_total
FROM grn_items gi
JOIN products p ON p.id = gi.product_id
WHERE gi.business_id = $1 AND gi.grn_id = $2
ORDER BY gi.id ASC;

-- name: GetGRNDetail :one
SELECT
    g.id, g.business_id, g.branch_id, br.name AS branch_name, br.code AS branch_code,
    g.po_id, g.supplier_id, s.code AS supplier_code, s.name AS supplier_name,
    s.email AS supplier_email, s.phone AS supplier_phone, s.tax_id AS supplier_tax_id,
    g.grn_number, g.supplier_invoice_no, g.attachment_name,
    g.status, g.total_cost, g.received_by, COALESCE(ru.full_name, '')::TEXT AS received_by_name,
    g.approved_by, COALESCE(au.full_name, '')::TEXT AS approved_by_name,
    g.approved_at, g.created_at
FROM goods_received_notes g
JOIN branches br ON br.id = g.branch_id
JOIN suppliers s ON s.id = g.supplier_id
LEFT JOIN users ru ON ru.id = g.received_by
LEFT JOIN users au ON au.id = g.approved_by
WHERE g.business_id = $1 AND g.id = $2;

-- name: DeleteGRNItems :exec
DELETE FROM grn_items
WHERE business_id = $1 AND grn_id = $2;

-- name: UpdateGRNHeader :one
UPDATE goods_received_notes
SET branch_id = $3,
    supplier_id = $4,
    supplier_invoice_no = $5,
    attachment_name = $6,
    total_cost = $7
WHERE business_id = $1 AND id = $2 AND status = 'DRAFT'
RETURNING id, grn_number, status, total_cost, created_at;

-- name: MarkGRNApproved :exec
UPDATE goods_received_notes
SET status = 'APPROVED', approved_by = $3, approved_at = NOW()
WHERE business_id = $1 AND id = $2;

-- name: GetBranchStockSummary :one
SELECT
    p.id AS product_id,
    p.sku,
    p.name AS product_name,
    p.base_price,
    p.sale_price,
    p.reorder_point,
    p.reorder_qty,
    COALESCE(SUM(ib.remaining_qty), 0)::NUMERIC(19,4) AS total_remaining,
    COALESCE((
        SELECT ib2.unit_cost
        FROM inventory_batches ib2
        WHERE ib2.business_id = p.business_id AND ib2.product_id = p.id
        ORDER BY ib2.received_at DESC
        LIMIT 1
    ), ROUND(p.base_price * 0.65, 4))::NUMERIC(19,4) AS preferred_unit_cost
FROM products p
LEFT JOIN inventory_batches ib ON ib.business_id = p.business_id AND ib.branch_id = $2 AND ib.product_id = p.id AND ib.remaining_qty > 0
WHERE p.business_id = $1 AND p.id = $3
GROUP BY p.id;

-- name: HasOpenPOForProductBranch :one
SELECT EXISTS (
    SELECT 1
    FROM purchase_orders po
    JOIN purchase_order_items poi ON poi.po_id = po.id
    WHERE po.business_id = $1
      AND po.branch_id = $2
      AND poi.product_id = $3
      AND po.status IN ('DRAFT', 'SUBMITTED', 'PARTIAL')
)::BOOLEAN AS has_open_po;

-- name: GetPreferredSupplierForProduct :one
SELECT COALESCE(
    (
        SELECT g.supplier_id
        FROM grn_items gi
        JOIN goods_received_notes g ON g.id = gi.grn_id
        WHERE gi.business_id = $1 AND gi.product_id = $2
        ORDER BY g.created_at DESC
        LIMIT 1
    ),
    (
        SELECT s.id
        FROM suppliers s
        WHERE s.business_id = $1
        ORDER BY s.created_at ASC
        LIMIT 1
    )
)::UUID AS supplier_id;

-- name: InsertDraftPO :one
INSERT INTO purchase_orders (business_id, branch_id, supplier_id, po_number, status, expected_date, total_amount, auto_generated, notes)
VALUES ($1, $2, $3, $4, 'DRAFT', CURRENT_DATE + 7, $5, $6, $7)
RETURNING id, po_number;

-- name: InsertPOItem :exec
INSERT INTO purchase_order_items (business_id, po_id, product_id, ordered_qty, unit_cost, min_stock_threshold, stock_at_order)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: InsertPurchaseInvoice :one
INSERT INTO purchase_invoices (
    business_id, branch_id, po_id, supplier_id, invoice_number, status,
    subtotal, tax_total, grand_total, due_date, auto_generated, notes
)
VALUES ($1, $2, $3, $4, $5, 'ISSUED', $6, $7, $8, CURRENT_DATE + $9::INT, $10, $11)
RETURNING id, invoice_number, status, grand_total, due_date, created_at;

-- name: ListPurchaseOrdersWithDetails :many
SELECT
    po.id, po.business_id, po.branch_id, br.name AS branch_name,
    po.supplier_id, s.name AS supplier_name, s.payment_terms_days,
    po.po_number, po.status, po.expected_date, po.total_amount,
    po.auto_generated, po.notes, po.created_at,
    COALESCE(pi.id::TEXT, '')::TEXT AS invoice_id,
    COALESCE(pi.invoice_number, '')::TEXT AS invoice_number,
    COALESCE(pi.status, '')::TEXT AS invoice_status,
    COALESCE(pi.grand_total, 0)::NUMERIC(19,4) AS invoice_grand_total
FROM purchase_orders po
JOIN branches br ON br.id = po.branch_id
JOIN suppliers s ON s.id = po.supplier_id
LEFT JOIN purchase_invoices pi ON pi.po_id = po.id AND pi.business_id = po.business_id
WHERE po.business_id = $1
ORDER BY po.created_at DESC
LIMIT 60;

-- name: ListPOItemsForPO :many
SELECT
    poi.id, poi.po_id, poi.product_id, p.sku, p.name AS product_name,
    p.reorder_point, p.reorder_qty,
    poi.ordered_qty, poi.received_qty, poi.unit_cost,
    poi.min_stock_threshold, poi.stock_at_order
FROM purchase_order_items poi
JOIN products p ON p.id = poi.product_id
WHERE poi.business_id = $1 AND poi.po_id = $2
ORDER BY p.name ASC;

-- name: ListPurchaseInvoicesForBusiness :many
SELECT
    pi.id, pi.business_id, pi.branch_id, br.name AS branch_name,
    pi.po_id, COALESCE(po.po_number, '')::TEXT AS po_number,
    pi.supplier_id, s.name AS supplier_name,
    pi.invoice_number, pi.status, pi.subtotal, pi.tax_total, pi.grand_total,
    pi.due_date, pi.auto_generated, pi.notes, pi.created_at
FROM purchase_invoices pi
JOIN branches br ON br.id = pi.branch_id
JOIN suppliers s ON s.id = pi.supplier_id
LEFT JOIN purchase_orders po ON po.id = pi.po_id
WHERE pi.business_id = $1
ORDER BY pi.created_at DESC
LIMIT 60;

-- name: UpdatePurchaseInvoiceStatus :one
UPDATE purchase_invoices
SET status = $3
WHERE business_id = $1 AND id = $2
RETURNING id, invoice_number, status;

-- name: UpdatePOStatus :exec
UPDATE purchase_orders
SET status = $3
WHERE business_id = $1 AND id = $2;

-- name: ListLowStockBranchProducts :many
SELECT
    p.id AS product_id,
    p.sku,
    p.name AS product_name,
    p.reorder_point,
    p.reorder_qty,
    COALESCE(SUM(ib.remaining_qty), 0)::NUMERIC(19,4) AS total_remaining
FROM products p
LEFT JOIN inventory_batches ib
    ON ib.business_id = p.business_id AND ib.branch_id = $2 AND ib.product_id = p.id AND ib.remaining_qty > 0
WHERE p.business_id = $1
  AND p.is_active = TRUE
  AND p.is_archived = FALSE
GROUP BY p.id
HAVING COALESCE(SUM(ib.remaining_qty), 0) <= p.reorder_point
ORDER BY total_remaining ASC, p.name ASC;

-- name: GetDefaultSupplierForBusiness :one
SELECT id, name, payment_terms_days FROM suppliers WHERE business_id = $1 ORDER BY created_at ASC LIMIT 1;

