-- CreateTable: WaConnectRequest (zero-touch WhatsApp connection request queue,
-- mirrors PageRequest's moderator-access pattern for the WhatsApp channel;
-- always tied to an existing Page since a client requesting WhatsApp already
-- has Facebook automation running)
CREATE TABLE "WaConnectRequest" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "pageId" INTEGER NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaConnectRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WaConnectRequest_userId_idx" ON "WaConnectRequest"("userId");
CREATE INDEX "WaConnectRequest_pageId_idx" ON "WaConnectRequest"("pageId");
CREATE INDEX "WaConnectRequest_status_idx" ON "WaConnectRequest"("status");

ALTER TABLE "WaConnectRequest" ADD CONSTRAINT "WaConnectRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaConnectRequest" ADD CONSTRAINT "WaConnectRequest_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
