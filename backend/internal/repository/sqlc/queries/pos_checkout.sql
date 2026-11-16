-- name: GetInvoiceByIdempotencyKey :one
SELECT id, invoice_number, status, subtotal, discount_total, tax_total, grand_total, total_cogs, created_at
FROM sales_invoices
WHERE business_id = $1 AND idempotency_key = $2
LIMIT 1;

-- name: GetInvoiceByID :one
SELECT
    si.id, si.business_id, si.branch_id, si.terminal_id, si.cashier_user_id,
    si.customer_id, COALESCE(c.name, 'Walk-in Guest')::TEXT AS customer_name,
    si.invoice_number, si.idempotency_key, si.invoice_type, si.status,
    si.subtotal, si.discount_total, si.tax_total, si.grand_total, si.total_cogs,
    si.order_channel, si.order_meta_json, si.created_at
FROM sales_invoices si
LEFT JOIN customers c ON c.id = si.customer_id
WHERE si.business_id = $1 AND si.id = $2
LIMIT 1;

-- name: InsertSalesInvoice :one
INSERT INTO sales_invoices (
    business_id, branch_id, terminal_id, shift_id, cashier_user_id, customer_id,
    invoice_number, idempotency_key, invoice_type, original_invoice_id, status,
    subtotal, discount_total, tax_total, grand_total, total_cogs, override_supervisor_id, override_reason,
    order_channel, order_meta_json
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
RETURNING id, invoice_number, status, subtotal, discount_total, tax_total, grand_total, total_cogs, order_channel, order_meta_json, created_at;

-- name: InsertSalesInvoiceItem :one
INSERT INTO sales_invoice_items (
    business_id, invoice_id, product_id, qty, unit_price, discount_amount, tax_amount, line_total, batch_cogs, item_meta_json
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING id;

-- name: InsertSalesInvoiceTax :exec
INSERT INTO sales_invoice_taxes (
    business_id, invoice_id, tax_rule_id, tax_name, tax_type, rate_percent, taxable_base, tax_amount
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: InsertInvoicePayment :exec
INSERT INTO invoice_payments (
    business_id, invoice_id, payment_method, amount, tendered_amount, change_given, reference_no
)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: UpdateInvoiceStatus :exec
UPDATE sales_invoices
SET status = $3, override_supervisor_id = $4, override_reason = $5
WHERE business_id = $1 AND id = $2;

-- name: ListSalesInvoiceItems :many
SELECT
    sii.id, sii.product_id, p.sku, p.name AS product_name, p.image_url,
    sii.qty, sii.unit_price, sii.discount_amount, sii.tax_amount, sii.line_total, sii.batch_cogs, sii.item_meta_json
FROM sales_invoice_items sii
JOIN products p ON p.id = sii.product_id
WHERE sii.business_id = $1 AND sii.invoice_id = $2;

-- name: ListHeldBillsForBranch :many
SELECT
    sb.id, sb.business_id, sb.branch_id, sb.terminal_id, t.name AS terminal_name,
    sb.cashier_user_id, sb.customer_id, COALESCE(c.name, 'Walk-in Guest')::TEXT AS customer_name,
    sb.hold_code, sb.notes, sb.order_channel, sb.table_or_bay_label, sb.vehicle_plate, sb.kot_status,
    sb.subtotal, sb.tax_total, sb.grand_total, sb.status, sb.held_at
FROM suspended_bills sb
JOIN terminals t ON t.id = sb.terminal_id
LEFT JOIN customers c ON c.id = sb.customer_id
WHERE sb.business_id = $1 AND sb.branch_id = $2 AND sb.status = 'HELD'
ORDER BY sb.held_at DESC;

-- name: ListHeldBillItems :many
SELECT
    sbi.id, sbi.product_id, p.sku, p.name AS product_name, p.image_url,
    sbi.qty, sbi.unit_price, sbi.discount_percent, sbi.item_meta_json
FROM suspended_bill_items sbi
JOIN products p ON p.id = sbi.product_id
WHERE sbi.business_id = $1 AND sbi.suspended_bill_id = $2;

-- name: InsertHeldBill :one
INSERT INTO suspended_bills (
    business_id, branch_id, terminal_id, cashier_user_id, customer_id,
    hold_code, notes, subtotal, tax_total, grand_total, status,
    order_channel, table_or_bay_label, vehicle_plate, kot_status
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'HELD', $11, $12, $13, $14)
RETURNING id, hold_code, order_channel, table_or_bay_label, vehicle_plate, kot_status, held_at;

-- name: InsertHeldBillItem :exec
INSERT INTO suspended_bill_items (
    business_id, suspended_bill_id, product_id, qty, unit_price, discount_percent, item_meta_json
)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: UpdateHeldBillStatus :exec
UPDATE suspended_bills
SET status = $3, updated_at = NOW()
WHERE business_id = $1 AND id = $2;

-- name: UpdateHeldBillWorkflowStatus :one
UPDATE suspended_bills
SET
    kot_status = COALESCE(NULLIF($3, ''), kot_status),
    table_or_bay_label = COALESCE(NULLIF($4, ''), table_or_bay_label),
    updated_at = NOW()
WHERE business_id = $1 AND id = $2 AND status = 'HELD'
RETURNING id, hold_code, order_channel, table_or_bay_label, vehicle_plate, kot_status, status, updated_at;

-- name: ListRecentPOSInvoicesForReturn :many
SELECT
    si.id,
    si.branch_id,
    br.name AS branch_name,
    si.terminal_id,
    COALESCE(tm.name, 'POS-01')::TEXT AS terminal_name,
    si.cashier_user_id,
    COALESCE(u.full_name, 'Cashier')::TEXT AS cashier_name,
    si.customer_id,
    COALESCE(c.name, 'Walk-in Guest')::TEXT AS customer_name,
    COALESCE(c.phone, '')::TEXT AS customer_phone,
    si.invoice_number,
    si.invoice_type,
    si.status,
    si.subtotal,
    si.discount_total,
    si.tax_total,
    si.grand_total,
    si.refunded_total,
    si.total_cogs,
    si.order_channel,
    si.created_at,
    COALESCE((
        SELECT ip.payment_method FROM invoice_payments ip
        WHERE ip.invoice_id = si.id ORDER BY ip.paid_at ASC LIMIT 1
    ), 'CASH')::TEXT AS payment_method,
    COALESCE((
        SELECT SUM(GREATEST(0, sii.qty - sii.returned_qty))
        FROM sales_invoice_items sii
        WHERE sii.invoice_id = si.id
    ), 0)::NUMERIC(19,4) AS returnable_qty_total
FROM sales_invoices si
JOIN branches br ON br.id = si.branch_id
LEFT JOIN terminals tm ON tm.id = si.terminal_id
LEFT JOIN users u ON u.id = si.cashier_user_id
LEFT JOIN customers c ON c.id = si.customer_id
WHERE si.business_id = $1
  AND si.branch_id = $2
  AND si.invoice_type = 'SALE'
  AND (
      $3::TEXT = ''
      OR si.invoice_number ILIKE '%' || $3::TEXT || '%'
      OR COALESCE(c.name, '') ILIKE '%' || $3::TEXT || '%'
      OR COALESCE(c.phone, '') ILIKE '%' || $3::TEXT || '%'
      OR EXISTS (
          SELECT 1
          FROM sales_invoice_items sii2
          WHERE sii2.invoice_id = si.id
            AND sii2.item_meta_json::TEXT ILIKE '%' || $3::TEXT || '%'
      )
  )
ORDER BY si.created_at DESC
LIMIT 40;

-- name: ListSalesInvoiceItemsForReturn :many
SELECT
    sii.id,
    sii.invoice_id,
    sii.product_id,
    p.sku,
    p.name AS product_name,
    p.image_url,
    p.unit_of_measure,
    p.enable_serial_tracking,
    p.allow_fractional_qty,
    sii.qty,
    sii.returned_qty,
    GREATEST(0, sii.qty - sii.returned_qty)::NUMERIC(19,4) AS returnable_qty,
    sii.unit_price,
    sii.discount_amount,
    sii.tax_amount,
    sii.line_total,
    sii.batch_cogs,
    sii.item_meta_json
FROM sales_invoice_items sii
JOIN products p ON p.id = sii.product_id
WHERE sii.business_id = $1 AND sii.invoice_id = $2
ORDER BY sii.id ASC;

-- name: IncrementSalesInvoiceItemReturnedQty :one
UPDATE sales_invoice_items
SET returned_qty = returned_qty + $3
WHERE business_id = $1 AND id = $2 AND (qty - returned_qty) >= $3
RETURNING id, qty, returned_qty;

-- name: UpdateInvoiceRefundProgress :one
UPDATE sales_invoices
SET
    refunded_total = refunded_total + $3,
    status = CASE WHEN $4::BOOLEAN THEN 'REFUND' ELSE status END,
    override_supervisor_id = COALESCE($5, override_supervisor_id),
    override_reason = CASE WHEN $6::TEXT <> '' THEN $6::TEXT ELSE override_reason END
WHERE business_id = $1 AND id = $2
RETURNING id, status, refunded_total;


