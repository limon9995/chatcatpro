-- AlterTable: add WhatsApp Business API fields to Page
ALTER TABLE "Page"
  ADD COLUMN IF NOT EXISTS "waEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "waPhoneNumberId" TEXT,
  ADD COLUMN IF NOT EXISTS "waToken" TEXT,
  ADD COLUMN IF NOT EXISTS "waVerifyToken" TEXT;
