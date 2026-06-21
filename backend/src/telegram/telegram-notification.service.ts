import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption.service';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = [1000, 2000, 4000];

@Injectable()
export class TelegramNotificationService {
  private readonly logger = new Logger(TelegramNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  /** Send a merchant alert for a given page, if Telegram is configured and enabled. */
  async notify(pageId: number, message: string): Promise<void> {
    try {
      const page = await this.prisma.page.findUnique({
        where: { id: pageId },
        select: {
          telegramNotifEnabled: true,
          telegramBotToken: true,
          telegramChatId: true,
        },
      });
      if (
        !page?.telegramNotifEnabled ||
        !page.telegramBotToken ||
        !page.telegramChatId
      ) {
        return;
      }
      const token = this.encryption.decrypt(page.telegramBotToken);
      await this.send(token, page.telegramChatId, message);
    } catch (err: any) {
      this.logger.error(
        `[Telegram] notify failed pageId=${pageId}: ${err.message}`,
      );
    }
  }

  /** Send a raw test message — used by the "Test Connection" button before saving. */
  async sendTest(
    token: string,
    chatId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: '✅ Chatcat Telegram notification test successful!',
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (res.ok) return { ok: true };
      const errText = await res.text().catch(() => '');
      return {
        ok: false,
        error: errText.slice(0, 200) || `HTTP ${res.status}`,
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /** Send a photo (buffer) to merchant's Telegram — used for payment screenshots */
  async sendPhoto(pageId: number, photoBuffer: Buffer, caption: string): Promise<void> {
    try {
      const page = await this.prisma.page.findUnique({
        where: { id: pageId },
        select: { telegramNotifEnabled: true, telegramBotToken: true, telegramChatId: true },
      });
      if (!page?.telegramNotifEnabled || !page.telegramBotToken || !page.telegramChatId) return;
      const token = this.encryption.decrypt(page.telegramBotToken);
      const FormData = (await import('form-data')).default;
      const fd = new FormData();
      fd.append('chat_id', page.telegramChatId);
      fd.append('caption', caption);
      fd.append('photo', photoBuffer, { filename: 'payment.jpg', contentType: 'image/jpeg' });
      const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: 'POST',
        body: fd as any,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) this.logger.warn(`[Telegram] sendPhoto failed: ${res.status}`);
      else this.logger.log(`[Telegram] Photo sent to chat_id=${page.telegramChatId}`);
    } catch (err: any) {
      this.logger.error(`[Telegram] sendPhoto error pageId=${pageId}: ${err.message}`);
    }
  }

  private async send(
    token: string,
    chatId: string,
    text: string,
  ): Promise<void> {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const body = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(10_000),
        });

        if (res.ok) {
          this.logger.log(`[Telegram] Sent chat_id=${chatId}`);
          return;
        }

        const errText = await res.text().catch(() => '');
        if (
          (res.status === 429 || res.status >= 500) &&
          attempt < MAX_RETRIES
        ) {
          const delay = RETRY_DELAY_MS[attempt];
          this.logger.warn(
            `[Telegram] status=${res.status} chat_id=${chatId} — retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`,
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        this.logger.error(
          `[Telegram] Send failed status=${res.status} chat_id=${chatId} body=${errText.slice(0, 200)}`,
        );
        return;
      } catch (err: any) {
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY_MS[attempt];
          await new Promise((r) => setTimeout(r, delay));
        } else {
          this.logger.error(
            `[Telegram] Network error chat_id=${chatId} (exhausted retries): ${err.message}`,
          );
        }
      }
    }
  }
}
