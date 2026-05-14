-- V21: Catalog analytics — view counters for pages and products
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "catalogViews" INTEGER DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "productViews" INTEGER DEFAULT 0;
