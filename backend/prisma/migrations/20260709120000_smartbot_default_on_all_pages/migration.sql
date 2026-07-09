-- V20: SmartBot becomes the default bot brain for ALL pages.
-- The keyword-matching pipeline is retired; every message now goes straight
-- to the AI (SmartBot), which reads chat history for context.

-- 1) New pages default to SmartBot ON
ALTER TABLE "Page" ALTER COLUMN "smartBotOn" SET DEFAULT true;

-- 2) Turn SmartBot ON for all existing pages (owners can still opt out via dashboard)
UPDATE "Page" SET "smartBotOn" = true WHERE "smartBotOn" = false;
