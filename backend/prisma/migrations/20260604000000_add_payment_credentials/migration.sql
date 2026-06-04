-- CreateTable PaymentCredential
CREATE TABLE "PaymentCredential" (
    "id" TEXT NOT NULL,
    "pageId" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "credJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable PendingPayment
CREATE TABLE "PendingPayment" (
    "id" TEXT NOT NULL,
    "pageId" INTEGER NOT NULL,
    "psid" TEXT NOT NULL,
    "draftJson" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL,
    "gatewayTxId" TEXT,
    "sessionToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentCredential_pageId_idx" ON "PaymentCredential"("pageId");
CREATE UNIQUE INDEX "PaymentCredential_pageId_method_key" ON "PaymentCredential"("pageId", "method");

-- CreateIndex
CREATE UNIQUE INDEX "PendingPayment_sessionToken_key" ON "PendingPayment"("sessionToken");
CREATE INDEX "PendingPayment_pageId_idx" ON "PendingPayment"("pageId");
CREATE INDEX "PendingPayment_sessionToken_idx" ON "PendingPayment"("sessionToken");
CREATE INDEX "PendingPayment_status_idx" ON "PendingPayment"("status");

-- AddForeignKey
ALTER TABLE "PaymentCredential" ADD CONSTRAINT "PaymentCredential_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
