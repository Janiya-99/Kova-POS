DROP INDEX IF EXISTS ix_products_business_brand;
ALTER TABLE products DROP COLUMN IF EXISTS brand_id;
DROP INDEX IF EXISTS ix_brands_business_active;
DROP TABLE IF EXISTS brands;

