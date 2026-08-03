-- AlterTable: MilestoneReward — new reward type "DISCOUNT_PERCENT"
ALTER TABLE "MilestoneReward" ADD COLUMN "discountPercent" DOUBLE PRECISION;

-- AlterTable: Order — taka amount of any DISCOUNT_PERCENT milestone reward(s) applied
ALTER TABLE "Order" ADD COLUMN "milestoneDiscountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
