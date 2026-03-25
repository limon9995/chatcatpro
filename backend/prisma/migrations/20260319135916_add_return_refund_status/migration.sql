-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReturnEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pageId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "returnType" TEXT NOT NULL DEFAULT 'full',
    "refundAmount" REAL NOT NULL DEFAULT 0,
    "returnCost" REAL NOT NULL DEFAULT 0,
    "note" TEXT,
    "refundStatus" TEXT NOT NULL DEFAULT 'pending',
    "refundGivenAt" DATETIME,
    "refundGivenAmount" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReturnEntry_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReturnEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ReturnEntry" ("createdAt", "id", "note", "orderId", "pageId", "refundAmount", "returnCost", "returnType", "updatedAt") SELECT "createdAt", "id", "note", "orderId", "pageId", "refundAmount", "returnCost", "returnType", "updatedAt" FROM "ReturnEntry";
DROP TABLE "ReturnEntry";
ALTER TABLE "new_ReturnEntry" RENAME TO "ReturnEntry";
CREATE INDEX "ReturnEntry_pageId_idx" ON "ReturnEntry"("pageId");
CREATE INDEX "ReturnEntry_orderId_idx" ON "ReturnEntry"("orderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
