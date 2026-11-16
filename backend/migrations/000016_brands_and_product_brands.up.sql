-- Multi-Tenant Brand Catalog & Product Brand Assignment

CREATE TABLE IF NOT EXISTS brands (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL,
    country     TEXT NOT NULL DEFAULT '',
    website     TEXT NOT NULL DEFAULT '',
    logo_url    TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, slug),
    UNIQUE (business_id, name)
);

CREATE INDEX IF NOT EXISTS ix_brands_business_active
    ON brands (business_id, is_active, name);

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_products_business_brand
    ON products (business_id, brand_id)
    WHERE is_archived = FALSE;

