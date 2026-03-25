-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pageIdRef" INTEGER NOT NULL,
    "customerPsid" TEXT NOT NULL DEFAULT '',
    "customerName" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "source" TEXT NOT NULL DEFAULT 'FACEBOOK',
    "negotiationRequested" BOOLEAN NOT NULL DEFAULT false,
    "customerOfferedPrice" REAL,
    "orderNote" TEXT,
    "callStatus" TEXT NOT NULL DEFAULT 'NONE',
    "callRetryCount" INTEGER NOT NULL DEFAULT 0,
    "lastCallAt" DATETIME,
    "callResult" TEXT,
    "callSessionId" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'not_required',
    "transactionId" TEXT,
    "paymentScreenshotUrl" TEXT,
    "paymentVerifyStatus" TEXT NOT NULL DEFAULT 'pending_review',
    "printedAt" DATETIME,
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_pageIdRef_fkey" FOREIGN KEY ("pageIdRef") REFERENCES "Page" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("address", "callResult", "callRetryCount", "callSessionId", "callStatus", "confirmedAt", "createdAt", "customerName", "customerOfferedPrice", "customerPsid", "id", "lastCallAt", "negotiationRequested", "orderNote", "pageIdRef", "paymentScreenshotUrl", "paymentStatus", "phone", "printedAt", "source", "status", "transactionId", "updatedAt") SELECT "address", "callResult", "callRetryCount", "callSessionId", "callStatus", "confirmedAt", "createdAt", "customerName", "customerOfferedPrice", "customerPsid", "id", "lastCallAt", "negotiationRequested", "orderNote", "pageIdRef", "paymentScreenshotUrl", "paymentStatus", "phone", "printedAt", "source", "status", "transactionId", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE INDEX "Order_pageIdRef_idx" ON "Order"("pageIdRef");
CREATE INDEX "Order_customerPsid_idx" ON "Order"("customerPsid");
CREATE INDEX "Order_status_idx" ON "Order"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
