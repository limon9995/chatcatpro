-- V20: Add local CLIP visual embedding column to Product table
-- 512-dim float array stored as JSON string, generated in background on product save
ALTER TABLE "Product" ADD COLUMN "embedding" TEXT;
