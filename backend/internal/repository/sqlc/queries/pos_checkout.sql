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

