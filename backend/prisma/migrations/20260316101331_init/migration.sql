-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'client',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "passwordHash" TEXT NOT NULL DEFAULT '',
    "salt" TEXT NOT NULL DEFAULT '',
    "forcePasswordChange" BOOLEAN NOT NULL DEFAULT false,
    "pageIds" TEXT NOT NULL DEFAULT '[]'
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'client',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Page" (
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

-- CreateTable
CREATE TABLE "Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pageId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "price" REAL NOT NULL DEFAULT 0,
    "costPrice" REAL NOT NULL DEFAULT 0,
    "stockQty" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "postCaption" TEXT,
    "videoUrl" TEXT,
    "catalogVisible" BOOLEAN NOT NULL DEFAULT true,
    "catalogSortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pageIdRef" INTEGER NOT NULL,
    "customerPsid" TEXT NOT NULL DEFAULT '',
    "customerName" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "negotiationRequested" BOOLEAN NOT NULL DEFAULT false,
    "customerOfferedPrice" REAL,
    "orderNote" TEXT,
    "callStatus" TEXT NOT NULL DEFAULT 'NONE',
    "callRetryCount" INTEGER NOT NULL DEFAULT 0,
    "lastCallAt" DATETIME,
    "callResult" TEXT,
    "callSessionId" TEXT,
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_pageIdRef_fkey" FOREIGN KEY ("pageIdRef") REFERENCES "Page" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "productId" INTEGER,
    "productCode" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" REAL NOT NULL DEFAULT 0,
    "productName" TEXT,
    "metaJson" TEXT,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConversationSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pageIdRef" INTEGER NOT NULL,
    "customerPsid" TEXT NOT NULL,
    "activeDraftJson" TEXT,
    "lastPresentedProductsJson" TEXT,
    "awaitingField" TEXT,
    "lastIntent" TEXT,
    "referencedMessageId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationSession_pageIdRef_fkey" FOREIGN KEY ("pageIdRef") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CallAttempt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "pageId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "callProvider" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'INITIATED',
    "dtmfInput" TEXT,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "errorMsg" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CallAttempt_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MemoTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pageIdRef" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "mapping" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "renderMode" TEXT NOT NULL DEFAULT 'fallback-auto',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MemoTemplate_pageIdRef_fkey" FOREIGN KEY ("pageIdRef") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pageId" INTEGER NOT NULL,
    "orderId" INTEGER,
    "type" TEXT NOT NULL DEFAULT 'full_payment',
    "method" TEXT NOT NULL DEFAULT 'cash',
    "amount" REAL NOT NULL DEFAULT 0,
    "note" TEXT,
    "collectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Collection_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Collection_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pageId" INTEGER NOT NULL,
    "orderId" INTEGER,
    "category" TEXT NOT NULL DEFAULT 'misc',
    "amount" REAL NOT NULL DEFAULT 0,
    "note" TEXT,
    "spentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expense_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReturnEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pageId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "returnType" TEXT NOT NULL DEFAULT 'full',
    "refundAmount" REAL NOT NULL DEFAULT 0,
    "returnCost" REAL NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReturnEntry_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReturnEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExchangeEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pageId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "extraCharge" REAL NOT NULL DEFAULT 0,
    "refundAdjustment" REAL NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExchangeEntry_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExchangeEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pageId" INTEGER NOT NULL,
    "psid" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "note" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" REAL NOT NULL DEFAULT 0,
    "firstOrderAt" DATETIME,
    "lastOrderAt" DATETIME,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Customer_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pageId" INTEGER NOT NULL,
    "customerId" INTEGER,
    "psid" TEXT NOT NULL,
    "orderId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "triggerType" TEXT NOT NULL DEFAULT 'custom',
    "message" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "sentAt" DATETIME,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FollowUp_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FollowUp_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FollowUp_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CourierShipment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pageId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "courierName" TEXT NOT NULL,
    "trackingId" TEXT,
    "trackingUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "codAmount" REAL NOT NULL DEFAULT 0,
    "weight" REAL NOT NULL DEFAULT 0.5,
    "courierFee" REAL,
    "bookedAt" DATETIME,
    "deliveredAt" DATETIME,
    "returnedAt" DATETIME,
    "rawResponse" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourierShipment_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourierShipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pageId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT 'all',
    "targetValue" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "totalTarget" INTEGER NOT NULL DEFAULT 0,
    "totalSent" INTEGER NOT NULL DEFAULT 0,
    "totalFailed" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Broadcast_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "priceMonthly" REAL NOT NULL DEFAULT 0,
    "ordersLimit" INTEGER NOT NULL DEFAULT 500,
    "pagesLimit" INTEGER NOT NULL DEFAULT 1,
    "agentsLimit" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'trial',
    "periodStart" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodEnd" DATETIME NOT NULL,
    "ordersUsed" INTEGER NOT NULL DEFAULT 0,
    "ordersLimit" INTEGER NOT NULL DEFAULT 500,
    "trialEndsAt" DATETIME,
    "isTrialUsed" BOOLEAN NOT NULL DEFAULT false,
    "lastPaymentAt" DATETIME,
    "nextPaymentDue" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "method" TEXT NOT NULL DEFAULT 'manual',
    "transactionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "confirmedAt" DATETIME,
    "confirmedBy" TEXT,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Page_pageId_key" ON "Page"("pageId");

-- CreateIndex
CREATE INDEX "Product_pageId_idx" ON "Product"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_pageId_code_key" ON "Product"("pageId", "code");

-- CreateIndex
CREATE INDEX "Order_pageIdRef_idx" ON "Order"("pageIdRef");

-- CreateIndex
CREATE INDEX "Order_customerPsid_idx" ON "Order"("customerPsid");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "ConversationSession_pageIdRef_idx" ON "ConversationSession"("pageIdRef");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationSession_pageIdRef_customerPsid_key" ON "ConversationSession"("pageIdRef", "customerPsid");

-- CreateIndex
CREATE INDEX "CallAttempt_orderId_idx" ON "CallAttempt"("orderId");

-- CreateIndex
CREATE INDEX "CallAttempt_pageId_idx" ON "CallAttempt"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "MemoTemplate_pageIdRef_key" ON "MemoTemplate"("pageIdRef");

-- CreateIndex
CREATE INDEX "Collection_pageId_idx" ON "Collection"("pageId");

-- CreateIndex
CREATE INDEX "Collection_orderId_idx" ON "Collection"("orderId");

-- CreateIndex
CREATE INDEX "Collection_collectedAt_idx" ON "Collection"("collectedAt");

-- CreateIndex
CREATE INDEX "Expense_pageId_idx" ON "Expense"("pageId");

-- CreateIndex
CREATE INDEX "Expense_orderId_idx" ON "Expense"("orderId");

-- CreateIndex
CREATE INDEX "Expense_spentAt_idx" ON "Expense"("spentAt");

-- CreateIndex
CREATE INDEX "ReturnEntry_pageId_idx" ON "ReturnEntry"("pageId");

-- CreateIndex
CREATE INDEX "ReturnEntry_orderId_idx" ON "ReturnEntry"("orderId");

-- CreateIndex
CREATE INDEX "ExchangeEntry_pageId_idx" ON "ExchangeEntry"("pageId");

-- CreateIndex
CREATE INDEX "ExchangeEntry_orderId_idx" ON "ExchangeEntry"("orderId");

-- CreateIndex
CREATE INDEX "Customer_pageId_idx" ON "Customer"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_pageId_psid_key" ON "Customer"("pageId", "psid");

-- CreateIndex
CREATE INDEX "FollowUp_pageId_idx" ON "FollowUp"("pageId");

-- CreateIndex
CREATE INDEX "FollowUp_status_scheduledAt_idx" ON "FollowUp"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourierShipment_orderId_key" ON "CourierShipment"("orderId");

-- CreateIndex
CREATE INDEX "CourierShipment_pageId_idx" ON "CourierShipment"("pageId");

-- CreateIndex
CREATE INDEX "CourierShipment_status_idx" ON "CourierShipment"("status");

-- CreateIndex
CREATE INDEX "Broadcast_pageId_idx" ON "Broadcast"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Payment_subscriptionId_idx" ON "Payment"("subscriptionId");
