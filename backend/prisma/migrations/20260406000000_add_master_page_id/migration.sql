-- AlterTable: add masterPageId to Page
ALTER TABLE "Page" ADD COLUMN "masterPageId" INTEGER;

-- CreateIndex
CREATE INDEX "Page_masterPageId_idx" ON "Page"("masterPageId");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_masterPageId_fkey" FOREIGN KEY ("masterPageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;
