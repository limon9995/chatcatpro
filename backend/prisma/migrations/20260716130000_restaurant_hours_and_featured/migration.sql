-- AlterTable
ALTER TABLE "Page" ADD COLUMN "businessHoursJson" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;
