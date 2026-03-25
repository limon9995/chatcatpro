-- AlterTable: add catalogSlug to Page
ALTER TABLE "Page" ADD COLUMN "catalogSlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Page_catalogSlug_key" ON "Page"("catalogSlug");
