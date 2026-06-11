CREATE TABLE "SmsDevice" (
  "id" SERIAL NOT NULL,
  "pageId" INTEGER,
  "deviceName" TEXT NOT NULL,
  "deviceModel" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SmsDevice_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SmsDevice_pageId_idx" ON "SmsDevice"("pageId");
