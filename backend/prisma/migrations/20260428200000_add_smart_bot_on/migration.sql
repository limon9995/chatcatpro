-- V19: Add SmartBot flag to Page model
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "smartBotOn" BOOLEAN NOT NULL DEFAULT false;
