ALTER TABLE "ConversationSession" ADD COLUMN "lastCustomerMsg" TEXT;
ALTER TABLE "ConversationSession" ADD COLUMN "lastDraftStep" TEXT;
ALTER TABLE "ConversationSession" ADD COLUMN "loopCount" INTEGER NOT NULL DEFAULT 0;
