-- V26: Real AI token usage per call — priced with official provider rates so
-- the platform profit report reflects measured cost, not per-call guesses.
-- CreateTable
CREATE TABLE "AiUsage" (
    "id" SERIAL NOT NULL,
    "pageId" INTEGER,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "usageType" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_pageId_idx" ON "AiUsage"("pageId");
