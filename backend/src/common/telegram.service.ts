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

  /**
   * Send an admin-bot message with inline keyboard buttons (e.g. Approve/Reject).
   * buttons: array of rows, each row is array of { text, callback_data }.
   */
  async sendMessageWithButtons(
    text: string,
    buttons: Array<Array<{ text: string; callback_data: string }>>,
  ): Promise<void> {
    const token = this.apiKeys.getSync('telegramBotToken');
    const chatId = this.apiKeys.getSync('telegramChatId');
    if (!token || !chatId) return;

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: buttons },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const err = await res.text();
        this.logger.warn(`[Telegram] sendMessageWithButtons failed: ${err}`);
      }
    } catch (e) {
      this.logger.warn(`[Telegram] sendMessageWithButtons error: ${(e as Error).message}`);
    }
  }

  /** Answer a Telegram callback_query (removes the loading spinner on the button). */
  async answerCallback(callbackQueryId: string, text?: string): Promise<void> {
    const token = this.apiKeys.getSync('telegramBotToken');
    if (!token) return;
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: text ?? '' }),
      signal: AbortSignal.timeout(5_000),
    }).catch(() => {});
  }

  /** Register (or re-register) the admin bot's webhook for callback_query buttons. */
  async setAdminWebhook(webhookUrl: string): Promise<{ ok: boolean; error?: string }> {
    const token = this.apiKeys.getSync('telegramBotToken');
    if (!token) return { ok: false, error: 'No admin telegramBotToken configured' };
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl, allowed_updates: ['callback_query'] }),
        signal: AbortSignal.timeout(10_000),
      });
      const data: any = await res.json();
      return data.ok ? { ok: true } : { ok: false, error: data.description };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  /** Current admin bot token — used to build/verify the secret webhook URL. */
  getAdminBotToken(): string {
    return this.apiKeys.getSync('telegramBotToken');
  }
}
