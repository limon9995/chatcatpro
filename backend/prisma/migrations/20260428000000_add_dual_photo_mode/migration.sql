-- Add Dual Photo Mode fields to Page
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "dualPhotoMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "dualWearingProductId" INTEGER;
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "dualHoldingProductId" INTEGER;

-- Add foreign key constraints
ALTER TABLE "Page" ADD CONSTRAINT "Page_dualWearingProductId_fkey"
  FOREIGN KEY ("dualWearingProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Page" ADD CONSTRAINT "Page_dualHoldingProductId_fkey"
  FOREIGN KEY ("dualHoldingProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
