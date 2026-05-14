-- Add customDomain field to Page for personal domain support
ALTER TABLE "Page" ADD COLUMN "customDomain" TEXT;
CREATE UNIQUE INDEX "Page_customDomain_key" ON "Page"("customDomain");
