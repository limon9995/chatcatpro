-- AlterTable: add chat history column to ConversationSession
ALTER TABLE "ConversationSession" ADD COLUMN "chatHistoryJson" TEXT;
