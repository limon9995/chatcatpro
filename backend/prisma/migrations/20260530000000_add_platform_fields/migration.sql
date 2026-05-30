-- Add platform field to Customer table (FACEBOOK | INSTAGRAM | WHATSAPP)
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "platform" TEXT NOT NULL DEFAULT 'FACEBOOK';

-- Add platform field to FollowUp table
ALTER TABLE "FollowUp" ADD COLUMN IF NOT EXISTS "platform" TEXT NOT NULL DEFAULT 'FACEBOOK';

-- Add platform field to Broadcast table
ALTER TABLE "Broadcast" ADD COLUMN IF NOT EXISTS "platform" TEXT NOT NULL DEFAULT 'FACEBOOK';
