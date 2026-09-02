-- AlterTable
ALTER TABLE "User" ADD COLUMN     "resellerId" TEXT;

-- CreateTable
CREATE TABLE "Reseller" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT DEFAULT '#5b63f5',
    "accentColor" TEXT,
    "tagline" TEXT,
    "supportEmail" TEXT,
    "supportPhone" TEXT,
    "websiteUrl" TEXT,
    "customDomain" TEXT,
    "customDomainActive" BOOLEAN NOT NULL DEFAULT false,
    "customDomainCheckedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "wholesaleOverridesJson" JSONB,
    "markupPercent" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "walletOwedBdt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reseller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResellerSettlementRequest" (
    "id" SERIAL NOT NULL,
    "resellerId" TEXT NOT NULL,
    "amountBdt" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectedReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResellerSettlementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResellerLedgerEntry" (
    "id" SERIAL NOT NULL,
    "resellerId" TEXT NOT NULL,
    "pageId" INTEGER,
    "type" TEXT NOT NULL,
    "amountBdt" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResellerLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reseller_slug_key" ON "Reseller"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Reseller_ownerId_key" ON "Reseller"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Reseller_customDomain_key" ON "Reseller"("customDomain");

-- CreateIndex
CREATE INDEX "Reseller_ownerId_idx" ON "Reseller"("ownerId");

-- CreateIndex
CREATE INDEX "ResellerSettlementRequest_resellerId_idx" ON "ResellerSettlementRequest"("resellerId");

-- CreateIndex
CREATE INDEX "ResellerSettlementRequest_status_idx" ON "ResellerSettlementRequest"("status");

-- CreateIndex
CREATE INDEX "ResellerLedgerEntry_resellerId_idx" ON "ResellerLedgerEntry"("resellerId");

-- CreateIndex
CREATE INDEX "ResellerLedgerEntry_pageId_idx" ON "ResellerLedgerEntry"("pageId");

-- CreateIndex
CREATE INDEX "User_resellerId_idx" ON "User"("resellerId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reseller" ADD CONSTRAINT "Reseller_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerSettlementRequest" ADD CONSTRAINT "ResellerSettlementRequest_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerLedgerEntry" ADD CONSTRAINT "ResellerLedgerEntry_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

