-- AlterTable: add agent-type selector to Page (defaults to "commerce" for all existing rows)
ALTER TABLE "Page" ADD COLUMN "agentType" TEXT NOT NULL DEFAULT 'commerce';

-- Backfill: pages already in legacy university mode should carry that in agentType too
UPDATE "Page" SET "agentType" = 'university' WHERE "universityModeOn" = true;

-- CreateTable: BotAgentDefinition (agent catalog metadata for onboarding picker)
CREATE TABLE "BotAgentDefinition" (
    "id" SERIAL NOT NULL,
    "agentKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "suitableFor" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotAgentDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BotAgentDefinition_agentKey_key" ON "BotAgentDefinition"("agentKey");
CREATE INDEX "BotAgentDefinition_active_idx" ON "BotAgentDefinition"("active");

-- CreateTable: AgentRequest (custom-agent requests from onboarding)
CREATE TABLE "AgentRequest" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "contactInfo" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentRequest_userId_idx" ON "AgentRequest"("userId");
CREATE INDEX "AgentRequest_status_idx" ON "AgentRequest"("status");

ALTER TABLE "AgentRequest" ADD CONSTRAINT "AgentRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the two agents that already have dedicated behavior code
INSERT INTO "BotAgentDefinition" ("agentKey", "name", "description", "suitableFor", "active", "updatedAt")
VALUES
  ('commerce', 'কমার্স বট', 'পণ্য বিক্রি, অর্ডার নেওয়া, ডেলিভারি ট্র্যাকিং — ফ্যাশন, ইলেকট্রনিক্স বা যেকোনো প্রোডাক্ট-ভিত্তিক পেজের জন্য।', 'fashion,electronics,general-ecommerce', true, CURRENT_TIMESTAMP),
  ('university', 'ইউনিভার্সিটি/এডুকেশন বট', 'নোটিশ, FAQ, গ্রুপ লিংক শেয়ার করে — বিশ্ববিদ্যালয় বা শিক্ষা প্রতিষ্ঠানের পেজের জন্য।', 'university,education', true, CURRENT_TIMESTAMP);
