-- Admin-owned test pages are excluded from the profit/revenue report
ALTER TABLE "Page" ADD COLUMN "isTestPage" BOOLEAN NOT NULL DEFAULT false;
