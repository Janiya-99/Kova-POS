-- name: ListRecentPOSActivity :many
SELECT
    si.id,
    si.invoice_number,
    si.status,
    si.invoice_type,
    si.grand_total,
    si.created_at,
    COALESCE(c.name, 'Walk-in Guest')::TEXT AS customer_name,
    COALESCE(NULLIF(c.avatar_url, ''), '')::TEXT AS customer_avatar,
    COALESCE((
        SELECT SUM(sii.qty)::INT FROM sales_invoice_items sii WHERE sii.invoice_id = si.id
    ), 0) AS total_items
FROM sales_invoices si
LEFT JOIN customers c ON c.id = si.customer_id
WHERE si.business_id = $1
ORDER BY si.created_at DESC
LIMIT 15;

-- name: ListTopSalesByCountry :many
SELECT
    br.country_code,
    br.country_name,
    COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.grand_total ELSE 0 END), 0)::NUMERIC(19,4) AS revenue
FROM branches br
LEFT JOIN sales_invoices si ON si.branch_id = br.id AND si.business_id = br.business_id
WHERE br.business_id = $1
GROUP BY br.country_code, br.country_name
ORDER BY revenue DESC;

-- name: ListProductSalesPerformance :many
SELECT
    p.id,
    p.sku,
    p.name,
    p.image_url,
    p.base_price,
    p.sale_price,
    p.discount_percent,
    COALESCE((
        SELECT SUM(ib.remaining_qty) FROM inventory_batches ib
        WHERE ib.business_id = p.business_id AND ib.product_id = p.id AND ib.remaining_qty > 0
    ), 0)::NUMERIC(19,4) AS total_stock,
    COALESCE((
        SELECT SUM(sii.qty) FROM sales_invoice_items sii
        JOIN sales_invoices si ON si.id = sii.invoice_id
        WHERE sii.product_id = p.id AND si.business_id = p.business_id AND si.status = 'PAID'
    ), 0)::NUMERIC(19,4) AS units_sold
FROM products p
WHERE p.business_id = $1 AND p.is_active = TRUE
ORDER BY units_sold DESC, p.name ASC
LIMIT 10;

-- name: GetBusinessKPISummary :one
SELECT
    (SELECT COUNT(*) FROM customers cu WHERE cu.business_id = b.id)::INT AS customer_count,
    COALESCE((SELECT SUM(si.grand_total) FROM sales_invoices si WHERE si.business_id = b.id AND si.status = 'PAID'), 0)::NUMERIC(19,4) AS paid_revenue,
    COALESCE((SELECT COUNT(*) FROM sales_invoices si WHERE si.business_id = b.id AND si.status = 'PAID'), 0)::INT AS paid_order_count,
    COALESCE((SELECT COUNT(*) FROM suspended_bills sb WHERE sb.business_id = b.id AND sb.status = 'HELD'), 0)::INT AS held_bill_count
FROM businesses b
WHERE b.id = $1;

-- name: ListSalesInvoicesReport :many
SELECT
    si.id,
    si.invoice_number,
    si.invoice_type,
    si.status,
    si.subtotal,
    si.discount_total,
    si.tax_total,
    si.grand_total,
    si.total_cogs,
    si.created_at,
    si.branch_id,
    br.name AS branch_name,
    COALESCE(c.name, 'Walk-in Guest')::TEXT AS customer_name,
    COALESCE(u.full_name, 'Cashier')::TEXT AS cashier_name,
    COALESCE((SELECT ip.payment_method FROM invoice_payments ip WHERE ip.invoice_id = si.id ORDER BY ip.paid_at ASC LIMIT 1), 'CARD')::TEXT AS payment_method,
    COALESCE((SELECT SUM(sii.qty)::INT FROM sales_invoice_items sii WHERE sii.invoice_id = si.id), 0) AS total_items
FROM sales_invoices si
JOIN branches br ON br.id = si.branch_id
LEFT JOIN customers c ON c.id = si.customer_id
LEFT JOIN users u ON u.id = si.cashier_user_id
WHERE si.business_id = $1
  AND si.created_at >= $2::TIMESTAMPTZ
  AND si.created_at <= $3::TIMESTAMPTZ
  AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID)
ORDER BY si.created_at DESC
LIMIT 250;

-- name: GetSalesReportTotals :one
SELECT
    COALESCE(COUNT(*) FILTER (WHERE si.status = 'PAID'), 0)::INT AS paid_count,
    COALESCE(COUNT(*) FILTER (WHERE (si.original_invoice_id IS NOT NULL AND si.status = 'REFUND') OR (si.original_invoice_id IS NULL AND si.status IN ('VOID', 'REFUND', 'REFUNDED') AND NOT EXISTS (SELECT 1 FROM sales_invoices ch WHERE ch.original_invoice_id = si.id))), 0)::INT AS void_refund_count,
    COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.subtotal ELSE 0 END), 0)::NUMERIC(19,4) AS gross_subtotal,
    COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.discount_total ELSE 0 END), 0)::NUMERIC(19,4) AS total_discounts,
    COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.tax_total ELSE 0 END), 0)::NUMERIC(19,4) AS total_taxes,
    COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN GREATEST(0, si.grand_total - si.refunded_total) ELSE 0 END), 0)::NUMERIC(19,4) AS net_revenue,
    COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.total_cogs ELSE 0 END), 0)::NUMERIC(19,4) AS total_cogs,
    COALESCE(SUM(
        CASE
            WHEN si.original_invoice_id IS NOT NULL AND si.status = 'REFUND' THEN si.grand_total
            WHEN si.original_invoice_id IS NULL AND si.status IN ('VOID', 'REFUND', 'REFUNDED') AND NOT EXISTS (SELECT 1 FROM sales_invoices ch WHERE ch.original_invoice_id = si.id) THEN si.grand_total
            ELSE 0
        END
    ), 0)::NUMERIC(19,4) AS refunded_amount
FROM sales_invoices si
WHERE si.business_id = $1
  AND si.created_at >= $2::TIMESTAMPTZ
  AND si.created_at <= $3::TIMESTAMPTZ
  AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID);

-- name: ListFIFOStockValuationReport :many
SELECT
    p.id,
    p.sku,
    p.name,
    c.name AS category_name,
    p.unit_of_measure,
    p.base_price,
    p.sale_price,
    p.reorder_point,
    p.reorder_qty,
    COALESCE(SUM(ib.remaining_qty), 0)::NUMERIC(19,4) AS total_remaining,
    COALESCE(SUM(ib.remaining_qty * ib.unit_cost), 0)::NUMERIC(19,4) AS fifo_valuation,
    (
        SELECT COUNT(*)::INT
        FROM purchase_orders po
        JOIN purchase_order_items poi ON poi.po_id = po.id
        WHERE po.business_id = p.business_id
          AND poi.product_id = p.id
          AND po.status IN ('DRAFT', 'SUBMITTED', 'PARTIAL')
    ) AS open_po_count
FROM products p
JOIN categories c ON c.id = p.category_id
LEFT JOIN inventory_batches ib
    ON ib.business_id = p.business_id
   AND ib.product_id = p.id
   AND ib.remaining_qty > 0
   AND ($2::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR ib.branch_id = $2::UUID)
WHERE p.business_id = $1 AND p.is_active = TRUE AND p.is_archived = FALSE
GROUP BY p.id, c.name
ORDER BY (COALESCE(SUM(ib.remaining_qty), 0) <= p.reorder_point) DESC, p.name ASC;

-- name: ListProductWiseSalesReport :many
WITH period_sales AS (
    SELECT
        sii.product_id,
        COUNT(DISTINCT si.id)::INT AS invoice_count,
        COALESCE(SUM(sii.qty), 0)::NUMERIC(19,4) AS units_sold,
        COALESCE(SUM(sii.qty * sii.unit_price), 0)::NUMERIC(19,4) AS gross_sales,
        COALESCE(SUM(sii.discount_amount), 0)::NUMERIC(19,4) AS discount_amount,
        COALESCE(SUM(sii.tax_amount), 0)::NUMERIC(19,4) AS tax_amount,
        COALESCE(SUM(sii.line_total - sii.tax_amount), 0)::NUMERIC(19,4) AS taxable_sales,
        COALESCE(SUM(sii.line_total), 0)::NUMERIC(19,4) AS net_revenue,
        COALESCE(SUM(sii.batch_cogs), 0)::NUMERIC(19,4) AS total_cogs
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON si.id = sii.invoice_id
    WHERE si.business_id = $1
      AND si.status = 'PAID'
      AND si.created_at >= $2::TIMESTAMPTZ
      AND si.created_at <= $3::TIMESTAMPTZ
      AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID)
    GROUP BY sii.product_id
),
branch_stock AS (
    SELECT
        ib.product_id,
        COALESCE(SUM(ib.remaining_qty), 0)::NUMERIC(19,4) AS stock_on_hand,
        COALESCE(SUM(ib.remaining_qty * ib.unit_cost), 0)::NUMERIC(19,4) AS fifo_value
    FROM inventory_batches ib
    WHERE ib.business_id = $1
      AND ib.remaining_qty > 0
      AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR ib.branch_id = $4::UUID)
    GROUP BY ib.product_id
)
SELECT
    p.id,
    p.sku,
    p.name,
    p.category_id,
    c.name AS category_name,
    c.gender_segment,
    p.unit_of_measure,
    p.base_price,
    p.sale_price,
    p.reorder_point,
    COALESCE(ps.invoice_count, 0)::INT AS invoice_count,
    COALESCE(ps.units_sold, 0)::NUMERIC(19,4) AS units_sold,
    COALESCE(ps.gross_sales, 0)::NUMERIC(19,4) AS gross_sales,
    COALESCE(ps.discount_amount, 0)::NUMERIC(19,4) AS discount_amount,
    COALESCE(ps.tax_amount, 0)::NUMERIC(19,4) AS tax_amount,
    COALESCE(ps.taxable_sales, 0)::NUMERIC(19,4) AS taxable_sales,
    COALESCE(ps.net_revenue, 0)::NUMERIC(19,4) AS net_revenue,
    COALESCE(ps.total_cogs, 0)::NUMERIC(19,4) AS total_cogs,
    COALESCE(bs.stock_on_hand, 0)::NUMERIC(19,4) AS stock_on_hand,
    COALESCE(bs.fifo_value, 0)::NUMERIC(19,4) AS fifo_value
FROM products p
JOIN categories c ON c.id = p.category_id
LEFT JOIN period_sales ps ON ps.product_id = p.id
LEFT JOIN branch_stock bs ON bs.product_id = p.id
WHERE p.business_id = $1 AND p.is_active = TRUE AND p.is_archived = FALSE
ORDER BY COALESCE(ps.net_revenue, 0) DESC, COALESCE(ps.units_sold, 0) DESC, p.name ASC;

-- name: ListCategoryWiseSalesReport :many
WITH cat_sales AS (
    SELECT
        p.category_id,
        COUNT(DISTINCT si.id)::INT AS invoice_count,
        COALESCE(SUM(sii.qty), 0)::NUMERIC(19,4) AS units_sold,
        COALESCE(SUM(sii.qty * sii.unit_price), 0)::NUMERIC(19,4) AS gross_sales,
        COALESCE(SUM(sii.discount_amount), 0)::NUMERIC(19,4) AS discount_amount,
        COALESCE(SUM(sii.tax_amount), 0)::NUMERIC(19,4) AS tax_amount,
        COALESCE(SUM(sii.line_total - sii.tax_amount), 0)::NUMERIC(19,4) AS taxable_sales,
        COALESCE(SUM(sii.line_total), 0)::NUMERIC(19,4) AS net_revenue,
        COALESCE(SUM(sii.batch_cogs), 0)::NUMERIC(19,4) AS total_cogs
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON si.id = sii.invoice_id
    JOIN products p ON p.id = sii.product_id
    WHERE si.business_id = $1
      AND si.status = 'PAID'
      AND si.created_at >= $2::TIMESTAMPTZ
      AND si.created_at <= $3::TIMESTAMPTZ
      AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID)
    GROUP BY p.category_id
),
cat_stock AS (
    SELECT
        p.category_id,
        COUNT(DISTINCT p.id)::INT AS sku_count,
        COALESCE(SUM(ib.remaining_qty), 0)::NUMERIC(19,4) AS stock_on_hand,
        COALESCE(SUM(ib.remaining_qty * ib.unit_cost), 0)::NUMERIC(19,4) AS stock_valuation
    FROM products p
    LEFT JOIN inventory_batches ib
        ON ib.business_id = p.business_id
       AND ib.product_id = p.id
       AND ib.remaining_qty > 0
       AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR ib.branch_id = $4::UUID)
    WHERE p.business_id = $1 AND p.is_active = TRUE AND p.is_archived = FALSE
    GROUP BY p.category_id
)
SELECT
    c.id,
    c.name,
    c.slug,
    c.gender_segment,
    COALESCE(cst.sku_count, 0)::INT AS sku_count,
    COALESCE(cs.invoice_count, 0)::INT AS invoice_count,
    COALESCE(cs.units_sold, 0)::NUMERIC(19,4) AS units_sold,
    COALESCE(cs.gross_sales, 0)::NUMERIC(19,4) AS gross_sales,
    COALESCE(cs.discount_amount, 0)::NUMERIC(19,4) AS discount_amount,
    COALESCE(cs.tax_amount, 0)::NUMERIC(19,4) AS tax_amount,
    COALESCE(cs.taxable_sales, 0)::NUMERIC(19,4) AS taxable_sales,
    COALESCE(cs.net_revenue, 0)::NUMERIC(19,4) AS net_revenue,
    COALESCE(cs.total_cogs, 0)::NUMERIC(19,4) AS total_cogs,
    COALESCE(cst.stock_on_hand, 0)::NUMERIC(19,4) AS stock_on_hand,
    COALESCE(cst.stock_valuation, 0)::NUMERIC(19,4) AS stock_valuation
FROM categories c
LEFT JOIN cat_sales cs ON cs.category_id = c.id
LEFT JOIN cat_stock cst ON cst.category_id = c.id
WHERE c.business_id = $1
ORDER BY COALESCE(cs.net_revenue, 0) DESC, COALESCE(cs.units_sold, 0) DESC, c.name ASC;

-- name: ListCustomerWiseSalesReport :many
WITH cust_items AS (
    SELECT
        si.customer_id,
        COALESCE(SUM(sii.qty), 0)::NUMERIC(19,4) AS items_bought
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON si.id = sii.invoice_id
    WHERE si.business_id = $1
      AND si.status = 'PAID'
      AND si.created_at >= $2::TIMESTAMPTZ
      AND si.created_at <= $3::TIMESTAMPTZ
      AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID)
    GROUP BY si.customer_id
),
cust_invoices AS (
    SELECT
        si.customer_id,
        COUNT(*) FILTER (WHERE si.status = 'PAID')::INT AS paid_orders,
        COUNT(*) FILTER (WHERE si.status IN ('VOID', 'REFUND', 'REFUNDED'))::INT AS refund_void_count,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.subtotal ELSE 0 END), 0)::NUMERIC(19,4) AS subtotal_spent,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.discount_total ELSE 0 END), 0)::NUMERIC(19,4) AS discount_total,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.tax_total ELSE 0 END), 0)::NUMERIC(19,4) AS tax_total,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.grand_total ELSE 0 END), 0)::NUMERIC(19,4) AS total_spent,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.total_cogs ELSE 0 END), 0)::NUMERIC(19,4) AS total_cogs,
        COALESCE(TO_CHAR(MAX(si.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '')::TEXT AS last_purchase_at
    FROM sales_invoices si
    WHERE si.business_id = $1
      AND si.created_at >= $2::TIMESTAMPTZ
      AND si.created_at <= $3::TIMESTAMPTZ
      AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID)
    GROUP BY si.customer_id
)
SELECT
    cu.id,
    cu.name,
    cu.email,
    cu.phone,
    cu.tier,
    cu.loyalty_points::INT AS loyalty_points,
    cu.credit_enabled,
    cu.credit_limit,
    cu.is_walk_in,
    COALESCE(cin.paid_orders, 0)::INT AS paid_orders,
    COALESCE(cin.refund_void_count, 0)::INT AS refund_void_count,
    COALESCE(cit.items_bought, 0)::NUMERIC(19,4) AS items_bought,
    COALESCE(cin.subtotal_spent, 0)::NUMERIC(19,4) AS subtotal_spent,
    COALESCE(cin.discount_total, 0)::NUMERIC(19,4) AS discount_total,
    COALESCE(cin.tax_total, 0)::NUMERIC(19,4) AS tax_total,
    COALESCE(cin.total_spent, 0)::NUMERIC(19,4) AS total_spent,
    COALESCE(cin.total_cogs, 0)::NUMERIC(19,4) AS total_cogs,
    COALESCE(cin.last_purchase_at, '')::TEXT AS last_purchase_at
FROM customers cu
LEFT JOIN cust_invoices cin ON cin.customer_id = cu.id
LEFT JOIN cust_items cit ON cit.customer_id = cu.id
WHERE cu.business_id = $1
UNION ALL
SELECT
    '00000000-0000-0000-0000-000000000000'::UUID AS id,
    'Walk-in Guests (Unregistered)'::TEXT AS name,
    ''::TEXT AS email,
    ''::TEXT AS phone,
    'Walk-in'::TEXT AS tier,
    0::INT AS loyalty_points,
    FALSE::BOOLEAN AS credit_enabled,
    0::NUMERIC(19,4) AS credit_limit,
    TRUE::BOOLEAN AS is_walk_in,
    cin.paid_orders,
    cin.refund_void_count,
    COALESCE(cit.items_bought, 0)::NUMERIC(19,4) AS items_bought,
    cin.subtotal_spent,
    cin.discount_total,
    cin.tax_total,
    cin.total_spent,
    cin.total_cogs,
    cin.last_purchase_at
FROM cust_invoices cin
LEFT JOIN cust_items cit ON cit.customer_id IS NULL
WHERE cin.customer_id IS NULL
ORDER BY total_spent DESC, paid_orders DESC, name ASC;

-- name: ListPaymentMethodSalesReport :many
SELECT
    ip.payment_method::TEXT AS payment_method,
    COUNT(*)::INT AS tx_count,
    COALESCE(SUM(ip.amount), 0)::NUMERIC(19,4) AS total_collected,
    COALESCE(SUM(ip.tendered_amount), 0)::NUMERIC(19,4) AS total_tendered,
    COALESCE(SUM(ip.change_given), 0)::NUMERIC(19,4) AS total_change
FROM invoice_payments ip
JOIN sales_invoices si ON si.id = ip.invoice_id
WHERE si.business_id = $1
  AND si.status = 'PAID'
  AND si.created_at >= $2::TIMESTAMPTZ
  AND si.created_at <= $3::TIMESTAMPTZ
  AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID)
GROUP BY ip.payment_method
ORDER BY total_collected DESC, ip.payment_method ASC;

-- name: ListBranchPerformanceReport :many
WITH br_sales AS (
    SELECT
        si.branch_id,
        COUNT(*) FILTER (WHERE si.status = 'PAID')::INT AS paid_count,
        COUNT(*) FILTER (WHERE si.status IN ('VOID', 'REFUND', 'REFUNDED'))::INT AS void_refund_count,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.subtotal ELSE 0 END), 0)::NUMERIC(19,4) AS gross_subtotal,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.discount_total ELSE 0 END), 0)::NUMERIC(19,4) AS total_discounts,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.tax_total ELSE 0 END), 0)::NUMERIC(19,4) AS total_taxes,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.grand_total ELSE 0 END), 0)::NUMERIC(19,4) AS net_revenue,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.total_cogs ELSE 0 END), 0)::NUMERIC(19,4) AS total_cogs
    FROM sales_invoices si
    WHERE si.business_id = $1
      AND si.created_at >= $2::TIMESTAMPTZ
      AND si.created_at <= $3::TIMESTAMPTZ
    GROUP BY si.branch_id
),
br_stock AS (
    SELECT
        ib.branch_id,
        COALESCE(SUM(ib.remaining_qty), 0)::NUMERIC(19,4) AS stock_units,
        COALESCE(SUM(ib.remaining_qty * ib.unit_cost), 0)::NUMERIC(19,4) AS stock_valuation
    FROM inventory_batches ib
    WHERE ib.business_id = $1 AND ib.remaining_qty > 0
    GROUP BY ib.branch_id
)
SELECT
    br.id,
    br.code,
    br.name,
    br.country_name,
    COALESCE(bs.paid_count, 0)::INT AS paid_count,
    COALESCE(bs.void_refund_count, 0)::INT AS void_refund_count,
    COALESCE(bs.gross_subtotal, 0)::NUMERIC(19,4) AS gross_subtotal,
    COALESCE(bs.total_discounts, 0)::NUMERIC(19,4) AS total_discounts,
    COALESCE(bs.total_taxes, 0)::NUMERIC(19,4) AS total_taxes,
    COALESCE(bs.net_revenue, 0)::NUMERIC(19,4) AS net_revenue,
    COALESCE(bs.total_cogs, 0)::NUMERIC(19,4) AS total_cogs,
    COALESCE(bst.stock_units, 0)::NUMERIC(19,4) AS stock_units,
    COALESCE(bst.stock_valuation, 0)::NUMERIC(19,4) AS stock_valuation
FROM branches br
LEFT JOIN br_sales bs ON bs.branch_id = br.id
LEFT JOIN br_stock bst ON bst.branch_id = br.id
WHERE br.business_id = $1
  AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR br.id = $4::UUID)
ORDER BY COALESCE(bs.net_revenue, 0) DESC, br.name ASC;

-- name: ListCashierPerformanceReport :many
WITH cashier_items AS (
    SELECT
        si.cashier_user_id,
        COALESCE(SUM(sii.qty), 0)::NUMERIC(19,4) AS items_sold
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON si.id = sii.invoice_id
    WHERE si.business_id = $1
      AND si.status = 'PAID'
      AND si.created_at >= $2::TIMESTAMPTZ
      AND si.created_at <= $3::TIMESTAMPTZ
      AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID)
    GROUP BY si.cashier_user_id
)
SELECT
    u.id AS user_id,
    u.full_name,
    u.email,
    COUNT(*) FILTER (WHERE si.status = 'PAID')::INT AS paid_count,
    COUNT(*) FILTER (WHERE si.status IN ('VOID', 'REFUND', 'REFUNDED'))::INT AS void_refund_count,
    COALESCE(MAX(ci.items_sold), 0)::NUMERIC(19,4) AS items_sold,
    COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.discount_total ELSE 0 END), 0)::NUMERIC(19,4) AS total_discounts,
    COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.grand_total ELSE 0 END), 0)::NUMERIC(19,4) AS net_revenue,
    COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.total_cogs ELSE 0 END), 0)::NUMERIC(19,4) AS total_cogs
FROM sales_invoices si
JOIN users u ON u.id = si.cashier_user_id
LEFT JOIN cashier_items ci ON ci.cashier_user_id = si.cashier_user_id
WHERE si.business_id = $1
  AND si.created_at >= $2::TIMESTAMPTZ
  AND si.created_at <= $3::TIMESTAMPTZ
  AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID)
GROUP BY u.id, u.full_name, u.email
ORDER BY net_revenue DESC, u.full_name ASC;

-- name: ListTaxBreakdownReport :many
SELECT
    sit.tax_name,
    sit.tax_type,
    sit.rate_percent::NUMERIC(8,4) AS rate_percent,
    COUNT(DISTINCT sit.invoice_id)::INT AS invoice_count,
    COALESCE(SUM(sit.taxable_base), 0)::NUMERIC(19,4) AS taxable_base,
    COALESCE(SUM(sit.tax_amount), 0)::NUMERIC(19,4) AS tax_collected
FROM sales_invoice_taxes sit
JOIN sales_invoices si ON si.id = sit.invoice_id
WHERE si.business_id = $1
  AND si.status = 'PAID'
  AND si.created_at >= $2::TIMESTAMPTZ
  AND si.created_at <= $3::TIMESTAMPTZ
  AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID)
GROUP BY sit.tax_name, sit.tax_type, sit.rate_percent
ORDER BY tax_collected DESC, sit.tax_name ASC;

-- name: ListDailySalesTrendReport :many
WITH day_units AS (
    SELECT
        TO_CHAR(si.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day_date,
        COALESCE(SUM(sii.qty), 0)::NUMERIC(19,4) AS units_sold
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON si.id = sii.invoice_id
    WHERE si.business_id = $1
      AND si.status = 'PAID'
      AND si.created_at >= $2::TIMESTAMPTZ
      AND si.created_at <= $3::TIMESTAMPTZ
      AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID)
    GROUP BY TO_CHAR(si.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
)
SELECT
    TO_CHAR(si.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')::TEXT AS day_date,
    COUNT(*)::INT AS invoice_count,
    COALESCE(MAX(du.units_sold), 0)::NUMERIC(19,4) AS units_sold,
    COALESCE(SUM(si.subtotal), 0)::NUMERIC(19,4) AS gross_subtotal,
    COALESCE(SUM(si.discount_total), 0)::NUMERIC(19,4) AS total_discounts,
    COALESCE(SUM(si.tax_total), 0)::NUMERIC(19,4) AS total_taxes,
    COALESCE(SUM(si.grand_total), 0)::NUMERIC(19,4) AS net_revenue,
    COALESCE(SUM(si.total_cogs), 0)::NUMERIC(19,4) AS total_cogs
FROM sales_invoices si
LEFT JOIN day_units du ON du.day_date = TO_CHAR(si.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
WHERE si.business_id = $1
  AND si.status = 'PAID'
  AND si.created_at >= $2::TIMESTAMPTZ
  AND si.created_at <= $3::TIMESTAMPTZ
  AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID)
GROUP BY TO_CHAR(si.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
ORDER BY day_date ASC;

-- name: ListSupplierProcurementReport :many
WITH sup_po AS (
    SELECT
        po.supplier_id,
        COUNT(*)::INT AS po_count,
        COUNT(*) FILTER (WHERE po.auto_generated = TRUE)::INT AS auto_po_count,
        COUNT(*) FILTER (WHERE po.status = 'RECEIVED')::INT AS received_po_count,
        COALESCE(SUM(po.total_amount), 0)::NUMERIC(19,4) AS total_ordered
    FROM purchase_orders po
    WHERE po.business_id = $1
      AND po.created_at >= $2::TIMESTAMPTZ
      AND po.created_at <= $3::TIMESTAMPTZ
      AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR po.branch_id = $4::UUID)
    GROUP BY po.supplier_id
),
sup_inv AS (
    SELECT
        pi.supplier_id,
        COUNT(*)::INT AS invoice_count,
        COALESCE(SUM(pi.grand_total), 0)::NUMERIC(19,4) AS invoiced_total,
        COALESCE(SUM(CASE WHEN pi.status = 'PAID' THEN pi.grand_total ELSE 0 END), 0)::NUMERIC(19,4) AS paid_total,
        COALESCE(SUM(CASE WHEN pi.status IN ('DRAFT', 'ISSUED') THEN pi.grand_total ELSE 0 END), 0)::NUMERIC(19,4) AS unpaid_total
    FROM purchase_invoices pi
    WHERE pi.business_id = $1
      AND pi.created_at >= $2::TIMESTAMPTZ
      AND pi.created_at <= $3::TIMESTAMPTZ
      AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR pi.branch_id = $4::UUID)
    GROUP BY pi.supplier_id
)
SELECT
    s.id,
    s.code,
    s.name,
    s.email,
    s.phone,
    s.payment_terms_days,
    COALESCE(sp.po_count, 0)::INT AS po_count,
    COALESCE(sp.auto_po_count, 0)::INT AS auto_po_count,
    COALESCE(sp.received_po_count, 0)::INT AS received_po_count,
    COALESCE(sp.total_ordered, 0)::NUMERIC(19,4) AS total_ordered,
    COALESCE(si.invoice_count, 0)::INT AS invoice_count,
    COALESCE(si.invoiced_total, 0)::NUMERIC(19,4) AS invoiced_total,
    COALESCE(si.paid_total, 0)::NUMERIC(19,4) AS paid_total,
    COALESCE(si.unpaid_total, 0)::NUMERIC(19,4) AS unpaid_total
FROM suppliers s
LEFT JOIN sup_po sp ON sp.supplier_id = s.id
LEFT JOIN sup_inv si ON si.supplier_id = s.id
WHERE s.business_id = $1
ORDER BY COALESCE(sp.total_ordered, 0) DESC, s.name ASC;

-- name: GetOverviewPeriodSummary :one
WITH inv_agg AS (
    SELECT
        COUNT(*) FILTER (WHERE si.status = 'PAID')::INT AS paid_order_count,
        COUNT(*) FILTER (WHERE (si.original_invoice_id IS NOT NULL AND si.status = 'REFUND') OR (si.original_invoice_id IS NULL AND si.status IN ('VOID', 'REFUND', 'REFUNDED') AND NOT EXISTS (SELECT 1 FROM sales_invoices ch WHERE ch.original_invoice_id = si.id)))::INT AS refund_void_count,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN GREATEST(0, si.grand_total - si.refunded_total) ELSE 0 END), 0)::NUMERIC(19,4) AS paid_revenue,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.subtotal ELSE 0 END), 0)::NUMERIC(19,4) AS gross_subtotal,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.discount_total ELSE 0 END), 0)::NUMERIC(19,4) AS total_discounts,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.tax_total ELSE 0 END), 0)::NUMERIC(19,4) AS total_taxes,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.total_cogs ELSE 0 END), 0)::NUMERIC(19,4) AS total_cogs,
        COUNT(DISTINCT COALESCE(si.customer_id, si.id)) FILTER (WHERE si.status = 'PAID')::INT AS unique_customers
    FROM sales_invoices si
    WHERE si.business_id = $1
      AND si.created_at >= $2::TIMESTAMPTZ
      AND si.created_at <= $3::TIMESTAMPTZ
      AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID)
      AND ($5::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.cashier_user_id = $5::UUID)
      AND ($6::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.terminal_id = $6::UUID)
),
item_agg AS (
    SELECT
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN GREATEST(0, sii.qty - sii.returned_qty) ELSE 0 END), 0)::NUMERIC(19,4) AS units_sold,
        COALESCE(SUM(CASE WHEN si.status IN ('VOID', 'REFUND', 'REFUNDED') THEN sii.qty WHEN si.status = 'PAID' THEN sii.returned_qty ELSE 0 END), 0)::NUMERIC(19,4) AS units_returned
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON si.id = sii.invoice_id
    WHERE si.business_id = $1
      AND si.created_at >= $2::TIMESTAMPTZ
      AND si.created_at <= $3::TIMESTAMPTZ
      AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID)
      AND ($5::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.cashier_user_id = $5::UUID)
      AND ($6::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.terminal_id = $6::UUID)
),
held_agg AS (
    SELECT
        COUNT(*)::INT AS held_bill_count,
        COALESCE(SUM(sb.grand_total), 0)::NUMERIC(19,4) AS held_bill_total
    FROM suspended_bills sb
    WHERE sb.business_id = $1
      AND sb.status = 'HELD'
      AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR sb.branch_id = $4::UUID)
      AND ($6::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR sb.terminal_id = $6::UUID)
)
SELECT
    inv_agg.paid_order_count,
    inv_agg.refund_void_count,
    inv_agg.paid_revenue,
    inv_agg.gross_subtotal,
    inv_agg.total_discounts,
    inv_agg.total_taxes,
    inv_agg.total_cogs,
    inv_agg.unique_customers,
    (SELECT COUNT(*)::INT FROM customers cu WHERE cu.business_id = $1) AS registered_customer_total,
    item_agg.units_sold,
    item_agg.units_returned,
    held_agg.held_bill_count,
    held_agg.held_bill_total
FROM inv_agg
CROSS JOIN item_agg
CROSS JOIN held_agg;

-- name: ListOverviewSalesTimeBuckets :many
WITH inv_buckets AS (
    SELECT
        (date_trunc($6::TEXT, si.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::TIMESTAMPTZ AS bucket_ts,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN GREATEST(0, si.grand_total - si.refunded_total) ELSE 0 END), 0)::NUMERIC(19,4) AS paid_revenue,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.total_cogs ELSE 0 END), 0)::NUMERIC(19,4) AS total_cogs,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.tax_total ELSE 0 END), 0)::NUMERIC(19,4) AS total_taxes,
        COUNT(*) FILTER (WHERE si.status = 'PAID')::INT AS order_count
    FROM sales_invoices si
    WHERE si.business_id = $1
      AND si.created_at >= $2::TIMESTAMPTZ
      AND si.created_at <= $3::TIMESTAMPTZ
      AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID)
      AND ($5::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.cashier_user_id = $5::UUID)
      AND ($7::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.terminal_id = $7::UUID)
    GROUP BY 1
),
item_buckets AS (
    SELECT
        (date_trunc($6::TEXT, si.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::TIMESTAMPTZ AS bucket_ts,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN sii.qty ELSE 0 END), 0)::NUMERIC(19,4) AS units_sold,
        COALESCE(SUM(CASE WHEN si.status IN ('VOID', 'REFUND', 'REFUNDED') THEN sii.qty ELSE 0 END), 0)::NUMERIC(19,4) AS units_returned,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' AND UPPER(COALESCE(c.gender_segment, 'UNISEX')) = 'WOMEN' THEN sii.qty ELSE 0 END), 0)::NUMERIC(19,4) AS women_units,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' AND UPPER(COALESCE(c.gender_segment, 'UNISEX')) = 'MEN' THEN sii.qty ELSE 0 END), 0)::NUMERIC(19,4) AS men_units,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' AND UPPER(COALESCE(c.gender_segment, 'UNISEX')) NOT IN ('WOMEN', 'MEN') THEN sii.qty ELSE 0 END), 0)::NUMERIC(19,4) AS unisex_units
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON si.id = sii.invoice_id
    JOIN products p ON p.id = sii.product_id
    JOIN categories c ON c.id = p.category_id
    WHERE si.business_id = $1
      AND si.created_at >= $2::TIMESTAMPTZ
      AND si.created_at <= $3::TIMESTAMPTZ
      AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID)
      AND ($5::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.cashier_user_id = $5::UUID)
      AND ($7::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.terminal_id = $7::UUID)
    GROUP BY 1
)
SELECT
    ib.bucket_ts,
    ib.paid_revenue,
    ib.total_cogs,
    ib.total_taxes,
    ib.order_count,
    COALESCE(it.units_sold, 0)::NUMERIC(19,4) AS units_sold,
    COALESCE(it.units_returned, 0)::NUMERIC(19,4) AS units_returned,
    COALESCE(it.women_units, 0)::NUMERIC(19,4) AS women_units,
    COALESCE(it.men_units, 0)::NUMERIC(19,4) AS men_units,
    COALESCE(it.unisex_units, 0)::NUMERIC(19,4) AS unisex_units
FROM inv_buckets ib
LEFT JOIN item_buckets it ON it.bucket_ts = ib.bucket_ts
ORDER BY ib.bucket_ts ASC;

-- name: ListOverviewGenderMix :many
SELECT
    UPPER(COALESCE(c.gender_segment, 'UNISEX'))::TEXT AS gender_segment,
    COALESCE(SUM(sii.qty), 0)::NUMERIC(19,4) AS units_sold,
    COALESCE(SUM(sii.line_total), 0)::NUMERIC(19,4) AS revenue
FROM sales_invoice_items sii
JOIN sales_invoices si ON si.id = sii.invoice_id
JOIN products p ON p.id = sii.product_id
JOIN categories c ON c.id = p.category_id
WHERE si.business_id = $1
  AND si.status = 'PAID'
  AND si.created_at >= $2::TIMESTAMPTZ
  AND si.created_at <= $3::TIMESTAMPTZ
  AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID)
  AND ($5::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.cashier_user_id = $5::UUID)
GROUP BY 1;

-- name: ListTopSalesByCountryScoped :many
SELECT
    br.country_code,
    br.country_name,
    COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.grand_total ELSE 0 END), 0)::NUMERIC(19,4) AS revenue
FROM branches br
LEFT JOIN sales_invoices si
    ON si.branch_id = br.id
   AND si.business_id = br.business_id
   AND si.created_at >= $2::TIMESTAMPTZ
   AND si.created_at <= $3::TIMESTAMPTZ
WHERE br.business_id = $1
  AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR br.id = $4::UUID)
GROUP BY br.country_code, br.country_name
ORDER BY revenue DESC, br.country_name ASC;

-- name: ListRecentPOSActivityScoped :many
SELECT
    si.id,
    si.invoice_number,
    si.status,
    si.invoice_type,
    si.grand_total,
    si.tax_total,
    si.order_channel,
    si.created_at,
    br.name AS branch_name,
    COALESCE(tm.code, '')::TEXT AS terminal_code,
    COALESCE(tm.name, '')::TEXT AS terminal_name,
    COALESCE(u.full_name, 'Cashier')::TEXT AS cashier_name,
    COALESCE(c.name, 'Walk-in Guest')::TEXT AS customer_name,
    COALESCE(NULLIF(c.avatar_url, ''), '')::TEXT AS customer_avatar,
    COALESCE((
        SELECT ip.payment_method FROM invoice_payments ip
        WHERE ip.invoice_id = si.id ORDER BY ip.paid_at ASC LIMIT 1
    ), 'CARD')::TEXT AS payment_method,
    COALESCE((
        SELECT SUM(sii.qty) FROM sales_invoice_items sii WHERE sii.invoice_id = si.id
    ), 0)::INT AS total_items,
    COALESCE((
        SELECT p2.image_url FROM sales_invoice_items sii2
        JOIN products p2 ON p2.id = sii2.product_id
        WHERE sii2.invoice_id = si.id ORDER BY sii2.id ASC LIMIT 1
    ), '')::TEXT AS preview_image_url,
    COALESCE((
        SELECT p2.name FROM sales_invoice_items sii2
        JOIN products p2 ON p2.id = sii2.product_id
        WHERE sii2.invoice_id = si.id ORDER BY sii2.id ASC LIMIT 1
    ), '')::TEXT AS preview_product_name,
    COALESCE((
        SELECT jsonb_agg(sub.image_url)
        FROM (
            SELECT p2.image_url
            FROM sales_invoice_items sii2
            JOIN products p2 ON p2.id = sii2.product_id
            WHERE sii2.invoice_id = si.id
            ORDER BY sii2.id ASC
            LIMIT 3
        ) sub
    ), '[]'::jsonb)::JSONB AS item_images_json
FROM sales_invoices si
JOIN branches br ON br.id = si.branch_id
LEFT JOIN terminals tm ON tm.id = si.terminal_id
LEFT JOIN customers c ON c.id = si.customer_id
LEFT JOIN users u ON u.id = si.cashier_user_id
WHERE si.business_id = $1
  AND si.created_at >= $2::TIMESTAMPTZ
  AND si.created_at <= $3::TIMESTAMPTZ
  AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID)
  AND ($5::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.cashier_user_id = $5::UUID)
  AND ($6::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.terminal_id = $6::UUID)
ORDER BY si.created_at DESC
LIMIT 20;

-- name: ListHeldBillsForOverview :many
SELECT
    sb.id,
    sb.hold_code,
    sb.notes,
    sb.order_channel,
    sb.table_or_bay_label,
    sb.vehicle_plate,
    sb.kot_status,
    sb.grand_total,
    sb.held_at,
    t.name AS terminal_name,
    br.name AS branch_name,
    COALESCE(u.full_name, 'Cashier')::TEXT AS cashier_name,
    COALESCE(c.name, 'Walk-in Guest')::TEXT AS customer_name,
    COALESCE(NULLIF(c.avatar_url, ''), '')::TEXT AS customer_avatar,
    COALESCE((
        SELECT SUM(sbi.qty) FROM suspended_bill_items sbi WHERE sbi.suspended_bill_id = sb.id
    ), 0)::INT AS item_count,
    COALESCE((
        SELECT p2.name FROM suspended_bill_items sbi2
        JOIN products p2 ON p2.id = sbi2.product_id
        WHERE sbi2.suspended_bill_id = sb.id ORDER BY sbi2.id ASC LIMIT 1
    ), '')::TEXT AS preview_product_name,
    COALESCE((
        SELECT jsonb_agg(sub.image_url)
        FROM (
            SELECT p2.image_url
            FROM suspended_bill_items sbi2
            JOIN products p2 ON p2.id = sbi2.product_id
            WHERE sbi2.suspended_bill_id = sb.id
            ORDER BY sbi2.id ASC
            LIMIT 3
        ) sub
    ), '[]'::jsonb)::JSONB AS item_images_json
FROM suspended_bills sb
JOIN terminals t ON t.id = sb.terminal_id
JOIN branches br ON br.id = sb.branch_id
LEFT JOIN customers c ON c.id = sb.customer_id
LEFT JOIN users u ON u.id = sb.cashier_user_id
WHERE sb.business_id = $1
  AND sb.status = 'HELD'
  AND ($2::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR sb.branch_id = $2::UUID)
ORDER BY sb.held_at DESC
LIMIT 15;

-- name: ListProductSalesPerformanceScoped :many
WITH prod_sales AS (
    SELECT
        sii.product_id,
        COALESCE(SUM(sii.qty), 0)::NUMERIC(19,4) AS units_sold,
        COALESCE(SUM(sii.line_total), 0)::NUMERIC(19,4) AS revenue
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON si.id = sii.invoice_id
    WHERE si.business_id = $1
      AND si.status = 'PAID'
      AND si.created_at >= $2::TIMESTAMPTZ
      AND si.created_at <= $3::TIMESTAMPTZ
      AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID)
    GROUP BY sii.product_id
),
prod_stock AS (
    SELECT
        ib.product_id,
        COALESCE(SUM(ib.remaining_qty), 0)::NUMERIC(19,4) AS total_stock,
        COALESCE(SUM(ib.remaining_qty * ib.unit_cost), 0)::NUMERIC(19,4) AS fifo_valuation
    FROM inventory_batches ib
    WHERE ib.business_id = $1
      AND ib.remaining_qty > 0
      AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR ib.branch_id = $4::UUID)
    GROUP BY ib.product_id
)
SELECT
    p.id,
    p.sku,
    p.name,
    c.name AS category_name,
    p.image_url,
    p.base_price,
    p.sale_price,
    p.discount_percent,
    p.reorder_point,
    COALESCE(pst.total_stock, 0)::NUMERIC(19,4) AS total_stock,
    COALESCE(pst.fifo_valuation, 0)::NUMERIC(19,4) AS fifo_valuation,
    COALESCE(ps.units_sold, 0)::NUMERIC(19,4) AS units_sold,
    COALESCE(ps.revenue, 0)::NUMERIC(19,4) AS revenue
FROM products p
JOIN categories c ON c.id = p.category_id
LEFT JOIN prod_sales ps ON ps.product_id = p.id
LEFT JOIN prod_stock pst ON pst.product_id = p.id
WHERE p.business_id = $1 AND p.is_active = TRUE AND p.is_archived = FALSE
ORDER BY COALESCE(ps.units_sold, 0) DESC, COALESCE(ps.revenue, 0) DESC, COALESCE(pst.total_stock, 0) DESC, p.name ASC
LIMIT 24;

-- name: GetOverviewInventoryTotals :one
WITH sku_stock AS (
    SELECT
        p.id,
        p.reorder_point,
        COALESCE(SUM(ib.remaining_qty), 0)::NUMERIC(19,4) AS total_stock,
        COALESCE(SUM(ib.remaining_qty * ib.unit_cost), 0)::NUMERIC(19,4) AS fifo_valuation
    FROM products p
    LEFT JOIN inventory_batches ib
        ON ib.business_id = p.business_id
       AND ib.product_id = p.id
       AND ib.remaining_qty > 0
       AND ($2::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR ib.branch_id = $2::UUID)
    WHERE p.business_id = $1 AND p.is_active = TRUE AND p.is_archived = FALSE
    GROUP BY p.id, p.reorder_point
)
SELECT
    COUNT(*)::INT AS active_sku_count,
    COUNT(*) FILTER (WHERE total_stock <= reorder_point)::INT AS low_stock_count,
    COALESCE(SUM(total_stock), 0)::NUMERIC(19,4) AS total_stock_units,
    COALESCE(SUM(fifo_valuation), 0)::NUMERIC(19,4) AS total_fifo_valuation,
    (
        SELECT COUNT(*)::INT
        FROM purchase_orders po
        WHERE po.business_id = $1
          AND po.status IN ('DRAFT', 'SUBMITTED', 'PARTIAL')
          AND ($2::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR po.branch_id = $2::UUID)
    ) AS open_po_count
FROM sku_stock;

-- name: GetOverviewGLAndFiscalSummary :one
SELECT
    (
        SELECT COUNT(*)::INT
        FROM journal_entries je
        WHERE je.business_id = $1
          AND je.created_at >= $2::TIMESTAMPTZ
          AND je.created_at <= $3::TIMESTAMPTZ
    ) AS period_journal_count,
    COALESCE((
        SELECT SUM(jl.debit)
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.journal_entry_id
        WHERE je.business_id = $1
          AND je.created_at >= $2::TIMESTAMPTZ
          AND je.created_at <= $3::TIMESTAMPTZ
    ), 0)::NUMERIC(19,4) AS period_total_debits,
    (
        SELECT COUNT(*)::INT
        FROM fiscal_periods fp
        WHERE fp.business_id = $1 AND fp.is_locked = FALSE
    ) AS open_fiscal_period_count,
    COALESCE((
        SELECT fp.period_name
        FROM fiscal_periods fp
        WHERE fp.business_id = $1
        ORDER BY fp.is_locked ASC, fp.start_date DESC
        LIMIT 1
    ), 'Current Period')::TEXT AS current_fiscal_period_name;

-- name: ListRecentJournalEntriesOverview :many
SELECT
    je.id,
    je.entry_number,
    je.source_type,
    je.description,
    je.entry_date,
    je.created_at,
    COALESCE(SUM(jl.debit), 0)::NUMERIC(19,4) AS total_debit,
    COALESCE(SUM(jl.credit), 0)::NUMERIC(19,4) AS total_credit
FROM journal_entries je
LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
WHERE je.business_id = $1
  AND je.created_at >= $2::TIMESTAMPTZ
  AND je.created_at <= $3::TIMESTAMPTZ
GROUP BY je.id
ORDER BY je.created_at DESC
LIMIT 8;

-- name: ListOverviewPaymentMix :many
SELECT
    ip.payment_method::TEXT AS payment_method,
    COUNT(*)::INT AS tx_count,
    COALESCE(SUM(ip.amount), 0)::NUMERIC(19,4) AS total_collected
FROM invoice_payments ip
JOIN sales_invoices si ON si.id = ip.invoice_id
WHERE si.business_id = $1
  AND si.status = 'PAID'
  AND si.created_at >= $2::TIMESTAMPTZ
  AND si.created_at <= $3::TIMESTAMPTZ
  AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID)
  AND ($5::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.cashier_user_id = $5::UUID)
  AND ($6::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.terminal_id = $6::UUID)
GROUP BY ip.payment_method
ORDER BY total_collected DESC, ip.payment_method ASC;

-- name: ListLowStockAlertsOverview :many
WITH sku_stock AS (
    SELECT
        ib.product_id,
        COALESCE(SUM(ib.remaining_qty), 0)::NUMERIC(19,4) AS total_stock
    FROM inventory_batches ib
    WHERE ib.business_id = $1
      AND ib.remaining_qty > 0
      AND ($2::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR ib.branch_id = $2::UUID)
    GROUP BY ib.product_id
)
SELECT
    p.id,
    p.sku,
    p.name,
    p.image_url,
    c.name AS category_name,
    p.reorder_point,
    p.reorder_qty,
    COALESCE(ss.total_stock, 0)::NUMERIC(19,4) AS total_stock,
    (
        SELECT COUNT(*)::INT
        FROM purchase_orders po
        JOIN purchase_order_items poi ON poi.po_id = po.id
        WHERE po.business_id = p.business_id
          AND poi.product_id = p.id
          AND po.status IN ('DRAFT', 'SUBMITTED', 'PARTIAL')
    ) AS open_po_count
FROM products p
JOIN categories c ON c.id = p.category_id
LEFT JOIN sku_stock ss ON ss.product_id = p.id
WHERE p.business_id = $1
  AND p.is_active = TRUE
  AND p.is_archived = FALSE
  AND COALESCE(ss.total_stock, 0) <= p.reorder_point
ORDER BY COALESCE(ss.total_stock, 0) ASC, p.name ASC
LIMIT 12;

-- name: ListCategoryBreakdownOverview :many
SELECT
    c.id,
    c.name AS category_name,
    COALESCE(c.gender_segment, 'UNISEX')::TEXT AS gender_segment,
    COALESCE(SUM(sii.qty), 0)::NUMERIC(19,4) AS units_sold,
    COALESCE(SUM(sii.line_total), 0)::NUMERIC(19,4) AS revenue
FROM sales_invoice_items sii
JOIN sales_invoices si ON si.id = sii.invoice_id
JOIN products p ON p.id = sii.product_id
JOIN categories c ON c.id = p.category_id
WHERE si.business_id = $1
  AND si.status = 'PAID'
  AND si.created_at >= $2::TIMESTAMPTZ
  AND si.created_at <= $3::TIMESTAMPTZ
  AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.branch_id = $4::UUID)
  AND ($5::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR si.cashier_user_id = $5::UUID)
GROUP BY c.id, c.name, c.gender_segment
ORDER BY revenue DESC, units_sold DESC, c.name ASC
LIMIT 8;

-- name: GetOverviewCompanySummary :one
SELECT
    b.id AS business_id,
    b.name AS business_name,
    COALESCE(NULLIF(b.trade_name, ''), b.name)::TEXT AS trade_name,
    b.legal_name,
    b.tax_registration_no,
    b.base_currency,
    COALESCE(NULLIF(b.industry_profile, ''), 'retail')::TEXT AS industry_profile,
    COALESCE(NULLIF(b.default_language, ''), 'en')::TEXT AS default_language,
    (SELECT COUNT(*)::INT FROM branches br WHERE br.business_id = b.id) AS total_branches,
    (SELECT COUNT(*)::INT FROM branches br WHERE br.business_id = b.id AND br.is_active = TRUE) AS active_branches,
    (SELECT COUNT(*)::INT FROM warehouses wh WHERE wh.business_id = b.id AND wh.is_active = TRUE) AS total_warehouses,
    (SELECT COUNT(*)::INT FROM terminals tm WHERE tm.business_id = b.id) AS total_terminals,
    (SELECT COUNT(*)::INT FROM terminals tm WHERE tm.business_id = b.id AND tm.is_active = TRUE) AS active_terminals,
    (SELECT COUNT(DISTINCT ps.terminal_id)::INT FROM pos_shifts ps WHERE ps.business_id = b.id AND ps.status = 'OPEN') AS open_shift_terminals,
    (SELECT COUNT(*)::INT FROM user_business_roles ubr WHERE ubr.business_id = b.id) AS total_staff,
    (SELECT COUNT(*)::INT FROM user_business_roles ubr WHERE ubr.business_id = b.id AND ubr.is_active = TRUE) AS active_staff,
    (SELECT COUNT(*)::INT FROM brands bd WHERE bd.business_id = b.id AND bd.is_active = TRUE) AS total_brands,
    (SELECT COUNT(*)::INT FROM categories ct WHERE ct.business_id = b.id) AS total_categories,
    (SELECT COUNT(*)::INT FROM products pr WHERE pr.business_id = b.id AND pr.is_active = TRUE AND pr.is_archived = FALSE) AS active_skus,
    (SELECT COUNT(*)::INT FROM customers cu WHERE cu.business_id = b.id) AS total_customers,
    (SELECT COUNT(*)::INT FROM suppliers sp WHERE sp.business_id = b.id) AS total_suppliers,
    COALESCE((
        SELECT SUM(ib.remaining_qty)
        FROM inventory_batches ib
        WHERE ib.business_id = b.id AND ib.remaining_qty > 0
    ), 0)::NUMERIC(19,4) AS total_stock_units,
    COALESCE((
        SELECT SUM(ib.remaining_qty * ib.unit_cost)
        FROM inventory_batches ib
        WHERE ib.business_id = b.id AND ib.remaining_qty > 0
    ), 0)::NUMERIC(19,4) AS total_fifo_valuation
FROM businesses b
WHERE b.id = $1
LIMIT 1;

-- name: ListOverviewBranchPerformance :many
WITH br_sales AS (
    SELECT
        si.branch_id,
        COUNT(*) FILTER (WHERE si.status = 'PAID')::INT AS paid_orders,
        COUNT(*) FILTER (WHERE si.status IN ('VOID', 'REFUND', 'REFUNDED'))::INT AS refund_void_count,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.subtotal ELSE 0 END), 0)::NUMERIC(19,4) AS gross_subtotal,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.discount_total ELSE 0 END), 0)::NUMERIC(19,4) AS discount_total,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.tax_total ELSE 0 END), 0)::NUMERIC(19,4) AS tax_total,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN GREATEST(0, si.grand_total - si.refunded_total) ELSE 0 END), 0)::NUMERIC(19,4) AS paid_revenue,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.total_cogs ELSE 0 END), 0)::NUMERIC(19,4) AS total_cogs
    FROM sales_invoices si
    WHERE si.business_id = $1
      AND si.created_at >= $2::TIMESTAMPTZ
      AND si.created_at <= $3::TIMESTAMPTZ
    GROUP BY si.branch_id
),
br_items AS (
    SELECT
        si.branch_id,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN GREATEST(0, sii.qty - sii.returned_qty) ELSE 0 END), 0)::NUMERIC(19,4) AS units_sold
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON si.id = sii.invoice_id
    WHERE si.business_id = $1
      AND si.created_at >= $2::TIMESTAMPTZ
      AND si.created_at <= $3::TIMESTAMPTZ
    GROUP BY si.branch_id
),
br_stock AS (
    SELECT
        ib.branch_id,
        COALESCE(SUM(ib.remaining_qty), 0)::NUMERIC(19,4) AS fifo_stock_units,
        COALESCE(SUM(ib.remaining_qty * ib.unit_cost), 0)::NUMERIC(19,4) AS fifo_valuation
    FROM inventory_batches ib
    WHERE ib.business_id = $1
      AND ib.remaining_qty > 0
    GROUP BY ib.branch_id
),
br_held AS (
    SELECT
        sb.branch_id,
        COUNT(*)::INT AS held_bill_count,
        COALESCE(SUM(sb.grand_total), 0)::NUMERIC(19,4) AS held_bill_total
    FROM suspended_bills sb
    WHERE sb.business_id = $1
      AND sb.status = 'HELD'
    GROUP BY sb.branch_id
)
SELECT
    br.id AS branch_id,
    br.code AS branch_code,
    br.name AS branch_name,
    br.city,
    br.country_code,
    br.country_name,
    br.address,
    br.is_warehouse,
    br.is_active,
    (SELECT COUNT(*)::INT FROM terminals tm WHERE tm.business_id = br.business_id AND tm.branch_id = br.id) AS terminal_count,
    (SELECT COUNT(*)::INT FROM terminals tm WHERE tm.business_id = br.business_id AND tm.branch_id = br.id AND tm.is_active = TRUE) AS active_terminal_count,
    (SELECT COUNT(DISTINCT ps.terminal_id)::INT FROM pos_shifts ps WHERE ps.business_id = br.business_id AND ps.branch_id = br.id AND ps.status = 'OPEN') AS open_shift_count,
    (
        SELECT COUNT(*)::INT
        FROM user_business_roles ubr
        WHERE ubr.business_id = br.business_id
          AND ubr.is_active = TRUE
          AND (
              ubr.all_branches_access = TRUE
              OR ubr.branch_id IS NULL
              OR ubr.branch_id = br.id
              OR br.id = ANY(ubr.allowed_branch_ids)
          )
    ) AS staff_count,
    COALESCE(bs.paid_orders, 0)::INT AS paid_orders,
    COALESCE(bs.refund_void_count, 0)::INT AS refund_void_count,
    COALESCE(bi.units_sold, 0)::NUMERIC(19,4) AS units_sold,
    COALESCE(bs.gross_subtotal, 0)::NUMERIC(19,4) AS gross_subtotal,
    COALESCE(bs.discount_total, 0)::NUMERIC(19,4) AS discount_total,
    COALESCE(bs.tax_total, 0)::NUMERIC(19,4) AS tax_total,
    COALESCE(bs.paid_revenue, 0)::NUMERIC(19,4) AS paid_revenue,
    COALESCE(bs.total_cogs, 0)::NUMERIC(19,4) AS total_cogs,
    COALESCE(bh.held_bill_count, 0)::INT AS held_bill_count,
    COALESCE(bh.held_bill_total, 0)::NUMERIC(19,4) AS held_bill_total,
    COALESCE(bst.fifo_stock_units, 0)::NUMERIC(19,4) AS fifo_stock_units,
    COALESCE(bst.fifo_valuation, 0)::NUMERIC(19,4) AS fifo_valuation
FROM branches br
LEFT JOIN br_sales bs ON bs.branch_id = br.id
LEFT JOIN br_items bi ON bi.branch_id = br.id
LEFT JOIN br_stock bst ON bst.branch_id = br.id
LEFT JOIN br_held bh ON bh.branch_id = br.id
WHERE br.business_id = $1
ORDER BY COALESCE(bs.paid_revenue, 0) DESC, br.code ASC;

-- name: ListOverviewTerminalPerformance :many
WITH tm_sales AS (
    SELECT
        si.terminal_id,
        COUNT(*) FILTER (WHERE si.status = 'PAID')::INT AS paid_orders,
        COUNT(*) FILTER (WHERE si.status IN ('VOID', 'REFUND', 'REFUNDED'))::INT AS refund_void_count,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.subtotal ELSE 0 END), 0)::NUMERIC(19,4) AS gross_subtotal,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.discount_total ELSE 0 END), 0)::NUMERIC(19,4) AS discount_total,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.tax_total ELSE 0 END), 0)::NUMERIC(19,4) AS tax_total,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN GREATEST(0, si.grand_total - si.refunded_total) ELSE 0 END), 0)::NUMERIC(19,4) AS paid_revenue,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN si.total_cogs ELSE 0 END), 0)::NUMERIC(19,4) AS total_cogs
    FROM sales_invoices si
    WHERE si.business_id = $1
      AND si.created_at >= $2::TIMESTAMPTZ
      AND si.created_at <= $3::TIMESTAMPTZ
    GROUP BY si.terminal_id
),
tm_items AS (
    SELECT
        si.terminal_id,
        COALESCE(SUM(CASE WHEN si.status = 'PAID' THEN GREATEST(0, sii.qty - sii.returned_qty) ELSE 0 END), 0)::NUMERIC(19,4) AS units_sold
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON si.id = sii.invoice_id
    WHERE si.business_id = $1
      AND si.created_at >= $2::TIMESTAMPTZ
      AND si.created_at <= $3::TIMESTAMPTZ
    GROUP BY si.terminal_id
),
tm_payments AS (
    SELECT
        si.terminal_id,
        COALESCE(SUM(CASE WHEN UPPER(ip.payment_method) = 'CASH' THEN ip.amount ELSE 0 END), 0)::NUMERIC(19,4) AS cash_sales,
        COALESCE(SUM(CASE WHEN UPPER(ip.payment_method) = 'CARD' THEN ip.amount ELSE 0 END), 0)::NUMERIC(19,4) AS card_sales,
        COALESCE(SUM(CASE WHEN UPPER(ip.payment_method) NOT IN ('CASH', 'CARD') THEN ip.amount ELSE 0 END), 0)::NUMERIC(19,4) AS qr_other_sales
    FROM invoice_payments ip
    JOIN sales_invoices si ON si.id = ip.invoice_id
    WHERE si.business_id = $1
      AND si.status = 'PAID'
      AND si.created_at >= $2::TIMESTAMPTZ
      AND si.created_at <= $3::TIMESTAMPTZ
    GROUP BY si.terminal_id
),
tm_held AS (
    SELECT
        sb.terminal_id,
        COUNT(*)::INT AS held_bill_count,
        COALESCE(SUM(sb.grand_total), 0)::NUMERIC(19,4) AS held_bill_total
    FROM suspended_bills sb
    WHERE sb.business_id = $1
      AND sb.status = 'HELD'
    GROUP BY sb.terminal_id
)
SELECT
    tm.id AS terminal_id,
    tm.code AS terminal_code,
    tm.name AS terminal_name,
    tm.hardware_serial,
    tm.is_active,
    br.id AS branch_id,
    br.code AS branch_code,
    br.name AS branch_name,
    COALESCE((
        SELECT ps.status
        FROM pos_shifts ps
        WHERE ps.business_id = tm.business_id AND ps.terminal_id = tm.id
        ORDER BY CASE WHEN ps.status = 'OPEN' THEN 0 ELSE 1 END, ps.opened_at DESC
        LIMIT 1
    ), 'CLOSED')::TEXT AS shift_status,
    COALESCE((
        SELECT u.full_name
        FROM pos_shifts ps
        JOIN users u ON u.id = ps.cashier_user_id
        WHERE ps.business_id = tm.business_id AND ps.terminal_id = tm.id
        ORDER BY CASE WHEN ps.status = 'OPEN' THEN 0 ELSE 1 END, ps.opened_at DESC
        LIMIT 1
    ), 'Unassigned')::TEXT AS active_cashier_name,
    COALESCE((
        SELECT ps.opening_float
        FROM pos_shifts ps
        WHERE ps.business_id = tm.business_id AND ps.terminal_id = tm.id
        ORDER BY CASE WHEN ps.status = 'OPEN' THEN 0 ELSE 1 END, ps.opened_at DESC
        LIMIT 1
    ), 0)::NUMERIC(19,4) AS opening_float,
    COALESCE(ts.paid_orders, 0)::INT AS paid_orders,
    COALESCE(ts.refund_void_count, 0)::INT AS refund_void_count,
    COALESCE(ti.units_sold, 0)::NUMERIC(19,4) AS units_sold,
    COALESCE(ts.gross_subtotal, 0)::NUMERIC(19,4) AS gross_subtotal,
    COALESCE(ts.discount_total, 0)::NUMERIC(19,4) AS discount_total,
    COALESCE(ts.tax_total, 0)::NUMERIC(19,4) AS tax_total,
    COALESCE(ts.paid_revenue, 0)::NUMERIC(19,4) AS paid_revenue,
    COALESCE(ts.total_cogs, 0)::NUMERIC(19,4) AS total_cogs,
    COALESCE(tp.cash_sales, 0)::NUMERIC(19,4) AS cash_sales,
    COALESCE(tp.card_sales, 0)::NUMERIC(19,4) AS card_sales,
    COALESCE(tp.qr_other_sales, 0)::NUMERIC(19,4) AS qr_other_sales,
    COALESCE(th.held_bill_count, 0)::INT AS held_bill_count,
    COALESCE(th.held_bill_total, 0)::NUMERIC(19,4) AS held_bill_total,
    COALESCE((
        SELECT si2.invoice_number
        FROM sales_invoices si2
        WHERE si2.business_id = tm.business_id AND si2.terminal_id = tm.id AND si2.status = 'PAID'
        ORDER BY si2.created_at DESC
        LIMIT 1
    ), '')::TEXT AS last_invoice_number,
    COALESCE((
        SELECT TO_CHAR(si2.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        FROM sales_invoices si2
        WHERE si2.business_id = tm.business_id AND si2.terminal_id = tm.id AND si2.status = 'PAID'
        ORDER BY si2.created_at DESC
        LIMIT 1
    ), '')::TEXT AS last_sale_at
FROM terminals tm
JOIN branches br ON br.id = tm.branch_id
LEFT JOIN tm_sales ts ON ts.terminal_id = tm.id
LEFT JOIN tm_items ti ON ti.terminal_id = tm.id
LEFT JOIN tm_payments tp ON tp.terminal_id = tm.id
LEFT JOIN tm_held th ON th.terminal_id = tm.id
WHERE tm.business_id = $1
  AND ($4::UUID = '00000000-0000-0000-0000-000000000000'::UUID OR tm.branch_id = $4::UUID)
ORDER BY COALESCE(ts.paid_revenue, 0) DESC, br.code ASC, tm.code ASC;



