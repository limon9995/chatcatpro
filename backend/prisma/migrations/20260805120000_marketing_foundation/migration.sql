-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "targetIndustry" TEXT,
    "targetLocation" TEXT,
    "minLeadScore" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "dailyLimit" INTEGER NOT NULL DEFAULT 20,
    "outreachSequenceJson" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingLead" (
    "id" SERIAL NOT NULL,
    "businessName" TEXT NOT NULL,
    "category" TEXT,
    "location" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "followerCount" INTEGER,
    "reviewCount" INTEGER,
    "rating" DOUBLE PRECISION,
    "estimatedMessageVolume" TEXT,
    "onlineOrderPresence" BOOLEAN NOT NULL DEFAULT false,
    "leadScore" INTEGER NOT NULL DEFAULT 0,
    "leadTemperature" TEXT NOT NULL DEFAULT 'LOW_PRIORITY',
    "painPointsJson" TEXT,
    "aiSummary" TEXT,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "pipelineStatus" TEXT NOT NULL DEFAULT 'NEW',
    "contactStatus" TEXT NOT NULL DEFAULT 'NOT_CONTACTED',
    "outreachStatus" TEXT NOT NULL DEFAULT 'NONE',
    "lastContactAt" TIMESTAMP(3),
    "nextFollowupAt" TIMESTAMP(3),
    "assignedUserId" TEXT,
    "convertedUserId" TEXT,
    "campaignId" INTEGER,
    "notes" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachMessage" (
    "id" SERIAL NOT NULL,
    "leadId" INTEGER NOT NULL,
    "campaignId" INTEGER,
    "channel" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedByUserId" TEXT,
    "sentAt" TIMESTAMP(3),
    "response" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadFollowUp" (
    "id" SERIAL NOT NULL,
    "leadId" INTEGER NOT NULL,
    "campaignId" INTEGER,
    "sequenceStep" INTEGER NOT NULL DEFAULT 0,
    "channel" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesConversation" (
    "id" SERIAL NOT NULL,
    "leadId" INTEGER NOT NULL,
    "transcriptJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoBooking" (
    "id" SERIAL NOT NULL,
    "leadId" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "assignedUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "pricingJson" TEXT,
    "featuresJson" TEXT,
    "strengths" TEXT,
    "weaknesses" TEXT,
    "targetMarket" TEXT,
    "threatLevel" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" SERIAL NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "referredLeadId" INTEGER,
    "referredUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rewardAmount" DOUBLE PRECISION,
    "rewardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentDraft" (
    "id" SERIAL NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "killSwitchEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scoringWeightsJson" TEXT NOT NULL DEFAULT '{}',
    "sequenceConfigJson" TEXT NOT NULL DEFAULT '[]',
    "dailyOutreachLimit" INTEGER NOT NULL DEFAULT 50,
    "outreachRequiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingAuditLog" (
    "id" SERIAL NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER,
    "actorUserId" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesConversation_leadId_key" ON "SalesConversation"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_code_key" ON "Referral"("code");

-- CreateIndex
CREATE INDEX "MarketingLead_pipelineStatus_idx" ON "MarketingLead"("pipelineStatus");

-- CreateIndex
CREATE INDEX "MarketingLead_leadTemperature_idx" ON "MarketingLead"("leadTemperature");

-- CreateIndex
CREATE INDEX "MarketingLead_campaignId_idx" ON "MarketingLead"("campaignId");

-- CreateIndex
CREATE INDEX "MarketingLead_businessName_idx" ON "MarketingLead"("businessName");

-- CreateIndex
CREATE INDEX "MarketingLead_phone_idx" ON "MarketingLead"("phone");

-- CreateIndex
CREATE INDEX "MarketingLead_website_idx" ON "MarketingLead"("website");

-- CreateIndex
CREATE INDEX "MarketingLead_facebookUrl_idx" ON "MarketingLead"("facebookUrl");

-- CreateIndex
CREATE INDEX "MarketingLead_instagramUrl_idx" ON "MarketingLead"("instagramUrl");

-- CreateIndex
CREATE INDEX "OutreachMessage_leadId_idx" ON "OutreachMessage"("leadId");

-- CreateIndex
CREATE INDEX "OutreachMessage_campaignId_idx" ON "OutreachMessage"("campaignId");

-- CreateIndex
CREATE INDEX "OutreachMessage_status_idx" ON "OutreachMessage"("status");

-- CreateIndex
CREATE INDEX "LeadFollowUp_status_scheduledAt_idx" ON "LeadFollowUp"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "LeadFollowUp_leadId_idx" ON "LeadFollowUp"("leadId");

-- CreateIndex
CREATE INDEX "LeadFollowUp_campaignId_idx" ON "LeadFollowUp"("campaignId");

-- CreateIndex
CREATE INDEX "DemoBooking_scheduledAt_idx" ON "DemoBooking"("scheduledAt");

-- CreateIndex
CREATE INDEX "DemoBooking_leadId_idx" ON "DemoBooking"("leadId");

-- CreateIndex
CREATE INDEX "Referral_referrerUserId_idx" ON "Referral"("referrerUserId");

-- CreateIndex
CREATE INDEX "Referral_referredUserId_idx" ON "Referral"("referredUserId");

-- CreateIndex
CREATE INDEX "ContentDraft_status_idx" ON "ContentDraft"("status");

-- CreateIndex
CREATE INDEX "MarketingAuditLog_eventType_idx" ON "MarketingAuditLog"("eventType");

-- CreateIndex
CREATE INDEX "MarketingAuditLog_entityType_entityId_idx" ON "MarketingAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "MarketingAuditLog_createdAt_idx" ON "MarketingAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "MarketingLead" ADD CONSTRAINT "MarketingLead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "MarketingLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadFollowUp" ADD CONSTRAINT "LeadFollowUp_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "MarketingLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadFollowUp" ADD CONSTRAINT "LeadFollowUp_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesConversation" ADD CONSTRAINT "SalesConversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "MarketingLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoBooking" ADD CONSTRAINT "DemoBooking_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "MarketingLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the singleton MarketingSettings row so the app can always assume row id=1 exists.
INSERT INTO "MarketingSettings" ("id", "updatedAt") VALUES (1, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
