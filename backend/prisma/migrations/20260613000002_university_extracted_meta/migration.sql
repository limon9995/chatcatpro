-- Add extractedMeta field to UniversityConfig for AI-extracted department/semester/course lists
ALTER TABLE "UniversityConfig" ADD COLUMN IF NOT EXISTS "extractedMeta" TEXT NOT NULL DEFAULT '{}';
