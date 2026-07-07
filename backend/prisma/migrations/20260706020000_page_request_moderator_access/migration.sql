-- AlterTable: fbProfile is no longer required (moderator-access flow doesn't
-- require proving Tester identity), and track which Page an approved request connected.
ALTER TABLE "PageRequest" ALTER COLUMN "fbProfile" DROP NOT NULL;
ALTER TABLE "PageRequest" ADD COLUMN "connectedPageId" INTEGER;

-- CreateIndex
CREATE INDEX "PageRequest_connectedPageId_idx" ON "PageRequest"("connectedPageId");

-- AddForeignKey
ALTER TABLE "PageRequest" ADD CONSTRAINT "PageRequest_connectedPageId_fkey" FOREIGN KEY ("connectedPageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;
