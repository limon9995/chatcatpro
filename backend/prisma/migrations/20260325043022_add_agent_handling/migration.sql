-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ConversationSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pageIdRef" INTEGER NOT NULL,
    "customerPsid" TEXT NOT NULL,
    "activeDraftJson" TEXT,
    "lastPresentedProductsJson" TEXT,
    "awaitingField" TEXT,
    "lastIntent" TEXT,
    "referencedMessageId" TEXT,
    "agentHandling" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationSession_pageIdRef_fkey" FOREIGN KEY ("pageIdRef") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ConversationSession" ("activeDraftJson", "awaitingField", "createdAt", "customerPsid", "id", "lastIntent", "lastPresentedProductsJson", "pageIdRef", "referencedMessageId", "updatedAt") SELECT "activeDraftJson", "awaitingField", "createdAt", "customerPsid", "id", "lastIntent", "lastPresentedProductsJson", "pageIdRef", "referencedMessageId", "updatedAt" FROM "ConversationSession";
DROP TABLE "ConversationSession";
ALTER TABLE "new_ConversationSession" RENAME TO "ConversationSession";
CREATE INDEX "ConversationSession_pageIdRef_idx" ON "ConversationSession"("pageIdRef");
CREATE UNIQUE INDEX "ConversationSession_pageIdRef_customerPsid_key" ON "ConversationSession"("pageIdRef", "customerPsid");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
