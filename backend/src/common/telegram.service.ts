import { Injectable, Logger } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private readonly apiKeys: ApiKeysService) {}

  async sendMessage(text: string): Promise<void> {
    const token = this.apiKeys.getSync('telegramBotToken');
    const chatId = this.apiKeys.getSync('telegramChatId');
    if (!token || !chatId) return;

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      });
      if (!res.ok) {
        const err = await res.text();
        this.logger.warn(`[Telegram] Send failed: ${err}`);
      }
    } catch (e) {
      this.logger.warn(`[Telegram] Error: ${(e as Error).message}`);
    }
  }
}
