-- V24: per-product discount (originalPrice) and pricing-policy override
-- AlterTable
ALTER TABLE "Product" ADD COLUMN "originalPrice" DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN "pricingPolicyOverride" TEXT;

-- AlterTable
ALTER TABLE "Page" ADD COLUMN "orderEmailNotifEnabled" BOOLEAN NOT NULL DEFAULT true;
