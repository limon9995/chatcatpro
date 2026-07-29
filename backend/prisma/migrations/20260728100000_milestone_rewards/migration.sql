-- AlterTable: Page — Milestone Rewards master toggle
ALTER TABLE "Page" ADD COLUMN "milestoneRewardsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Order — snapshot of the reward granted, if any
ALTER TABLE "Order" ADD COLUMN "milestoneRewardAppliedJson" TEXT;

-- CreateTable
CREATE TABLE "MilestoneReward" (
    "id" SERIAL NOT NULL,
    "pageId" INTEGER NOT NULL,
    "orderInterval" INTEGER NOT NULL,
    "rewardType" TEXT NOT NULL,
    "productId" INTEGER,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MilestoneReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MilestoneReward_pageId_orderInterval_key" ON "MilestoneReward"("pageId", "orderInterval");
CREATE INDEX "MilestoneReward_pageId_idx" ON "MilestoneReward"("pageId");

-- AddForeignKey
ALTER TABLE "MilestoneReward" ADD CONSTRAINT "MilestoneReward_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MilestoneReward" ADD CONSTRAINT "MilestoneReward_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
