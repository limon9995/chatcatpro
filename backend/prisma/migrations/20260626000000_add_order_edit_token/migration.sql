ALTER TABLE "Order" ADD COLUMN "editToken" TEXT;
CREATE UNIQUE INDEX "Order_editToken_key" ON "Order"("editToken");
