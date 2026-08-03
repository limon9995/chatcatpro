-- AlterTable: Page — restaurant catalog layout (full menu vs category pages) + category order
ALTER TABLE "Page" ADD COLUMN "menuLayoutMode" TEXT NOT NULL DEFAULT 'single';
ALTER TABLE "Page" ADD COLUMN "menuCategoryOrderJson" TEXT;
