-- AlterTable
ALTER TABLE "Page" ALTER COLUMN "costPerCommentReplyBdt" SET DEFAULT 0.08125,
ALTER COLUMN "costPerTextMsgBdt" SET DEFAULT 0.08125,
ALTER COLUMN "costPerVoiceMsgBdt" SET DEFAULT 1.625,
ALTER COLUMN "costPerImageBdt" SET DEFAULT 0.325,
ALTER COLUMN "costPerImageLocalBdt" SET DEFAULT 0.1625,
ALTER COLUMN "costPerAnalyzeBdt" SET DEFAULT 0.325,
ALTER COLUMN "costPerAiGenerateBdt" SET DEFAULT 0.1625,
ALTER COLUMN "costPerKeywordReplyBdt" SET DEFAULT 0.0325,
ALTER COLUMN "costPerMemoPrintBdt" SET DEFAULT 0.1625,
ALTER COLUMN "costPerBroadcastMsgBdt" SET DEFAULT 0.08125,
ALTER COLUMN "costPerOcrAiBdt" SET DEFAULT 0.08125,
ALTER COLUMN "costPerOcrLocalBdt" SET DEFAULT 0.0325,
ALTER COLUMN "costPerRecurringNotifBdt" SET DEFAULT 0.1625;

-- AlterTable
ALTER TABLE "WalletRechargeRequest" ADD COLUMN     "creditsGranted" DOUBLE PRECISION,
ADD COLUMN     "packageId" TEXT;

-- CreateTable
CREATE TABLE "CreditPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceBdt" DOUBLE PRECISION,
    "credits" DOUBLE PRECISION,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditPackage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WalletRechargeRequest" ADD CONSTRAINT "WalletRechargeRequest_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "CreditPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Data migration: existing Page balances/rates and historical
-- WalletTransaction amounts were real BDT; convert them to the new
-- credit-denominated scale (x1.625) so every merchant's purchasing power
-- and the historical ledger stay internally consistent. See
-- backend/src/common/pricing-fields.ts CREDITS_PER_TAKA.
UPDATE "Page" SET
  "walletBalanceBdt" = "walletBalanceBdt" * 1.625,
  "costPerTextMsgBdt" = "costPerTextMsgBdt" * 1.625,
  "costPerVoiceMsgBdt" = "costPerVoiceMsgBdt" * 1.625,
  "costPerImageBdt" = "costPerImageBdt" * 1.625,
  "costPerImageLocalBdt" = "costPerImageLocalBdt" * 1.625,
  "costPerAnalyzeBdt" = "costPerAnalyzeBdt" * 1.625,
  "costPerAiGenerateBdt" = "costPerAiGenerateBdt" * 1.625,
  "costPerKeywordReplyBdt" = "costPerKeywordReplyBdt" * 1.625,
  "costPerBroadcastMsgBdt" = "costPerBroadcastMsgBdt" * 1.625,
  "costPerOcrLocalBdt" = "costPerOcrLocalBdt" * 1.625,
  "costPerOcrAiBdt" = "costPerOcrAiBdt" * 1.625,
  "costPerRecurringNotifBdt" = "costPerRecurringNotifBdt" * 1.625,
  "costPerCommentReplyBdt" = "costPerCommentReplyBdt" * 1.625,
  "costPerMemoPrintBdt" = "costPerMemoPrintBdt" * 1.625;

UPDATE "WalletTransaction" SET "amountBdt" = "amountBdt" * 1.625;

-- Seed the two fixed packages + custom tier (mirrors AdminService.seedCreditPackages,
-- included here too so the migration itself leaves packages ready even before first boot).
INSERT INTO "CreditPackage" (id, name, "priceBdt", credits, "isCustom", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('pkg_starter', 'Starter', 3000, 5000, false, true, 1, now(), now()),
  ('pkg_growth', 'Growth', 5000, 8000, false, true, 2, now(), now()),
  ('pkg_custom', 'Custom', NULL, NULL, true, true, 3, now(), now())
ON CONFLICT (id) DO NOTHING;
