-- Add knowledgeText for client FAQ/policy fed to AI
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "knowledgeText" TEXT NOT NULL DEFAULT '';

-- Add costPerAiGenerateBdt for AI text generation cost
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "costPerAiGenerateBdt" DOUBLE PRECISION NOT NULL DEFAULT 0.10;

-- Update image pricing to new defaults (OpenAI Vision costs dropped)
UPDATE "Page" SET "costPerImageBdt" = 0.50 WHERE "costPerImageBdt" = 1.70;
UPDATE "Page" SET "costPerAnalyzeBdt" = 0.50 WHERE "costPerAnalyzeBdt" = 1.70;
