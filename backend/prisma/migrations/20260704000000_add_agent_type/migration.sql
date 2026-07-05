-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('DEFAULT', 'UNIVERSITY');

-- AlterTable: add agentType selector to Page (defaults to DEFAULT for all existing rows)
ALTER TABLE "Page" ADD COLUMN "agentType" "AgentType" NOT NULL DEFAULT 'DEFAULT';

-- Backfill: pages currently in university mode become UNIVERSITY-typed
UPDATE "Page" SET "agentType" = 'UNIVERSITY' WHERE "universityModeOn" = true;
