-- Add WA fallback template name field to Page
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "waFallbackTemplateName" TEXT;

-- Add IG comment-to-DM toggle to Page (defaults true)
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "igCommentToDmEnabled" BOOLEAN NOT NULL DEFAULT true;
