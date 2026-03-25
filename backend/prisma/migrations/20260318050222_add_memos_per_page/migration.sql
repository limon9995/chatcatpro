-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Page" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL DEFAULT '',
    "pageToken" TEXT NOT NULL DEFAULT '',
    "verifyToken" TEXT NOT NULL DEFAULT '',
    "ownerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "automationOn" BOOLEAN NOT NULL DEFAULT false,
    "ocrOn" BOOLEAN NOT NULL DEFAULT false,
    "infoModeOn" BOOLEAN NOT NULL DEFAULT true,
    "orderModeOn" BOOLEAN NOT NULL DEFAULT true,
    "printModeOn" BOOLEAN NOT NULL DEFAULT false,
    "memoSaveModeOn" BOOLEAN NOT NULL DEFAULT false,
    "memoTemplateModeOn" BOOLEAN NOT NULL DEFAULT false,
    "autoMemoDesignModeOn" BOOLEAN NOT NULL DEFAULT false,
    "memoTheme" TEXT NOT NULL DEFAULT 'classic',
    "memoLayout" TEXT NOT NULL DEFAULT 'memo',
    "memosPerPage" INTEGER NOT NULL DEFAULT 3,
    "businessName" TEXT,
    "businessPhone" TEXT,
    "businessAddress" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "logoUrl" TEXT,
    "memoFooterText" TEXT,
    "codLabel" TEXT NOT NULL DEFAULT 'COD',
    "currencySymbol" TEXT NOT NULL DEFAULT '৳',
    "primaryColor" TEXT,
    "productCodePrefix" TEXT NOT NULL DEFAULT 'DF',
    "deliveryFeeInsideDhaka" REAL NOT NULL DEFAULT 80,
    "deliveryFeeOutsideDhaka" REAL NOT NULL DEFAULT 120,
    "deliveryTimeText" TEXT,
    "callConfirmModeOn" BOOLEAN NOT NULL DEFAULT false,
    "callMode" TEXT NOT NULL DEFAULT 'MANUAL',
    "callConfirmationScope" TEXT NOT NULL DEFAULT 'ALL',
    "retryIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "maxCallRetries" INTEGER NOT NULL DEFAULT 3,
    "callLanguage" TEXT NOT NULL DEFAULT 'BN',
    "voiceType" TEXT NOT NULL DEFAULT 'FEMALE',
    "voiceStyle" TEXT NOT NULL DEFAULT 'NATURAL',
    "callProvider" TEXT,
    "ttsProvider" TEXT,
    "banglaVoiceId" TEXT,
    "englishVoiceId" TEXT,
    "banglaCallScript" TEXT,
    "englishCallScript" TEXT,
    "banglaVoiceFileUrl" TEXT,
    "englishVoiceFileUrl" TEXT,
    "voiceGeneratedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Page_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Page" ("address", "autoMemoDesignModeOn", "automationOn", "banglaCallScript", "banglaVoiceFileUrl", "banglaVoiceId", "businessAddress", "businessName", "businessPhone", "callConfirmModeOn", "callConfirmationScope", "callLanguage", "callMode", "callProvider", "codLabel", "createdAt", "currencySymbol", "deliveryFeeInsideDhaka", "deliveryFeeOutsideDhaka", "deliveryTimeText", "englishCallScript", "englishVoiceFileUrl", "englishVoiceId", "id", "infoModeOn", "isActive", "logoUrl", "maxCallRetries", "memoFooterText", "memoLayout", "memoSaveModeOn", "memoTemplateModeOn", "memoTheme", "ocrOn", "orderModeOn", "ownerId", "pageId", "pageName", "pageToken", "phone", "primaryColor", "printModeOn", "productCodePrefix", "retryIntervalMinutes", "ttsProvider", "updatedAt", "verifyToken", "voiceGeneratedAt", "voiceStyle", "voiceType") SELECT "address", "autoMemoDesignModeOn", "automationOn", "banglaCallScript", "banglaVoiceFileUrl", "banglaVoiceId", "businessAddress", "businessName", "businessPhone", "callConfirmModeOn", "callConfirmationScope", "callLanguage", "callMode", "callProvider", "codLabel", "createdAt", "currencySymbol", "deliveryFeeInsideDhaka", "deliveryFeeOutsideDhaka", "deliveryTimeText", "englishCallScript", "englishVoiceFileUrl", "englishVoiceId", "id", "infoModeOn", "isActive", "logoUrl", "maxCallRetries", "memoFooterText", "memoLayout", "memoSaveModeOn", "memoTemplateModeOn", "memoTheme", "ocrOn", "orderModeOn", "ownerId", "pageId", "pageName", "pageToken", "phone", "primaryColor", "printModeOn", "productCodePrefix", "retryIntervalMinutes", "ttsProvider", "updatedAt", "verifyToken", "voiceGeneratedAt", "voiceStyle", "voiceType" FROM "Page";
DROP TABLE "Page";
ALTER TABLE "new_Page" RENAME TO "Page";
CREATE UNIQUE INDEX "Page_pageId_key" ON "Page"("pageId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
