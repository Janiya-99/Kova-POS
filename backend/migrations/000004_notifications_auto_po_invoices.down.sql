DROP TABLE IF EXISTS system_notifications;
DROP TABLE IF EXISTS purchase_invoices;
ALTER TABLE purchase_order_items
    DROP COLUMN IF EXISTS min_stock_threshold,
    DROP COLUMN IF EXISTS stock_at_order;
ALTER TABLE purchase_orders
    DROP COLUMN IF EXISTS auto_generated;

