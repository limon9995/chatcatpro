-- AlterTable: add university mode fields to Page
ALTER TABLE "Page" ADD COLUMN "universityModeOn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Page" ADD COLUMN "universityModeAllowed" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: UniversityConfig
CREATE TABLE "UniversityConfig" (
    "id" SERIAL NOT NULL,
    "pageId" INTEGER NOT NULL,
    "scrapeUrl" TEXT NOT NULL DEFAULT '',
    "scrapeInterval" INTEGER NOT NULL DEFAULT 30,
    "scrapeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoPostEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastScrapedAt" TIMESTAMP(3),
    "knowledgeText" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversityConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable: UniversityNotice
CREATE TABLE "UniversityNotice" (
    "id" SERIAL NOT NULL,
    "configId" INTEGER NOT NULL,
    "pageId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "publishedAt" TEXT,
    "contentHash" TEXT NOT NULL,
    "fbPostId" TEXT,
    "autoPosted" BOOLEAN NOT NULL DEFAULT false,
    "postError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UniversityNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable: GroupLink
CREATE TABLE "GroupLink" (
    "id" SERIAL NOT NULL,
    "configId" INTEGER NOT NULL,
    "pageId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "semester" TEXT,
    "department" TEXT,
    "course" TEXT,
    "linkType" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UniversityConfig_pageId_key" ON "UniversityConfig"("pageId");
CREATE UNIQUE INDEX "UniversityNotice_configId_contentHash_key" ON "UniversityNotice"("configId", "contentHash");
CREATE INDEX "UniversityNotice_pageId_idx" ON "UniversityNotice"("pageId");
CREATE INDEX "GroupLink_configId_idx" ON "GroupLink"("configId");
CREATE INDEX "GroupLink_pageId_idx" ON "GroupLink"("pageId");

-- AddForeignKey
ALTER TABLE "UniversityConfig" ADD CONSTRAINT "UniversityConfig_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UniversityNotice" ADD CONSTRAINT "UniversityNotice_configId_fkey" FOREIGN KEY ("configId") REFERENCES "UniversityConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupLink" ADD CONSTRAINT "GroupLink_configId_fkey" FOREIGN KEY ("configId") REFERENCES "UniversityConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
