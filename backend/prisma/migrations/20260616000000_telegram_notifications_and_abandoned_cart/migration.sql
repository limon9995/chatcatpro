-- Telegram merchant notifications + abandoned-cart debounce
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "telegramBotToken" TEXT;
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "telegramNotifEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "lowBalanceNotifiedAt" TIMESTAMP(3);
ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "subExpiryNotifiedAt" TIMESTAMP(3);

ALTER TABLE "ConversationSession" ADD COLUMN IF NOT EXISTS "abandonedCartNotifiedAt" TIMESTAMP(3);
