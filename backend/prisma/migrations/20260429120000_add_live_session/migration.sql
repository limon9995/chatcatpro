-- CreateTable: LiveSession (new Dual Photo system)
CREATE TABLE IF NOT EXISTS "LiveSession" (
    "id"            SERIAL PRIMARY KEY,
    "pageId"        INTEGER NOT NULL,
    "label"         TEXT,
    "screenshots"   TEXT NOT NULL DEFAULT '[]',
    "wornProductId" INTEGER,
    "heldProductId" INTEGER,
    "aiMemo"        TEXT,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_pageId_fkey"
    FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (optional product links)
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_wornProductId_fkey"
    FOREIGN KEY ("wornProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_heldProductId_fkey"
    FOREIGN KEY ("heldProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LiveSession_pageId_idx" ON "LiveSession"("pageId");
CREATE INDEX IF NOT EXISTS "LiveSession_pageId_isActive_idx" ON "LiveSession"("pageId", "isActive");
