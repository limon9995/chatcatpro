-- AlterTable: Page — Loyalty + Happy Hour settings
ALTER TABLE "Page" ADD COLUMN "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Page" ADD COLUMN "loyaltyThresholdOrders" INTEGER;
ALTER TABLE "Page" ADD COLUMN "loyaltyDiscountPercent" DOUBLE PRECISION;
ALTER TABLE "Page" ADD COLUMN "happyHourEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Page" ADD COLUMN "happyHourJson" TEXT;
ALTER TABLE "Page" ADD COLUMN "happyHourDiscountPercent" DOUBLE PRECISION;
ALTER TABLE "Page" ADD COLUMN "happyHourLabel" TEXT;

-- AlterTable: Order — computed discount amounts
ALTER TABLE "Order" ADD COLUMN "loyaltyDiscountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "happyHourDiscountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ComboItem" (
    "id" SERIAL NOT NULL,
    "comboProductId" INTEGER NOT NULL,
    "componentProductId" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ComboItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComboItem_comboProductId_idx" ON "ComboItem"("comboProductId");
CREATE INDEX "ComboItem_componentProductId_idx" ON "ComboItem"("componentProductId");

-- AddForeignKey
ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_comboProductId_fkey" FOREIGN KEY ("comboProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
