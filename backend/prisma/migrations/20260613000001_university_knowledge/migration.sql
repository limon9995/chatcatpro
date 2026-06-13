-- AlterTable: add full-crawl fields to UniversityConfig
ALTER TABLE "UniversityConfig" ADD COLUMN "crawlBaseUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UniversityConfig" ADD COLUMN "lastFullCrawlAt" TIMESTAMP(3);
ALTER TABLE "UniversityConfig" ADD COLUMN "scrapedKnowledgeText" TEXT NOT NULL DEFAULT '';

-- CreateTable: UniversityFaq
CREATE TABLE "UniversityFaq" (
    "id" SERIAL NOT NULL,
    "configId" INTEGER NOT NULL,
    "pageId" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversityFaq_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UniversityFaq_pageId_idx" ON "UniversityFaq"("pageId");
CREATE INDEX "UniversityFaq_configId_idx" ON "UniversityFaq"("configId");

ALTER TABLE "UniversityFaq" ADD CONSTRAINT "UniversityFaq_configId_fkey"
  FOREIGN KEY ("configId") REFERENCES "UniversityConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
