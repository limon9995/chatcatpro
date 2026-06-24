import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { TelegramNotificationService } from './telegram-notification.service';

@Controller('telegram')
@UseGuards(AuthGuard)
export class TelegramController {
  constructor(private readonly telegram: TelegramNotificationService) {}

  @Post('test')
  async test(@Body() body: { token: string; chatId: string }) {
    if (!body?.token || !body?.chatId) {
      return { ok: false, error: 'token and chatId are required' };
    }
    return this.telegram.sendTest(body.token.trim(), body.chatId.trim());
  }

  @Post('fetch-chat-id')
  async fetchChatId(@Body() body: { token: string }) {
    if (!body?.token) {
      return { ok: false, error: 'token is required' };
    }
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${body.token.trim()}/getUpdates?limit=10`,
        { signal: AbortSignal.timeout(8_000) },
      );
      const data = await res.json();
      if (!data.ok) {
        return { ok: false, error: 'Invalid token or Telegram API error' };
      }
      const update = (data.result ?? []).find(
        (u: any) => u.message?.chat?.id || u.channel_post?.chat?.id,
      );
      const chatId =
        update?.message?.chat?.id ?? update?.channel_post?.chat?.id ?? null;
      if (!chatId) {
        return {
          ok: false,
          error: 'No messages found. Please send a message to your bot first.',
        };
      }
      return { ok: true, chatId: String(chatId) };
    } catch {
      return { ok: false, error: 'Failed to reach Telegram API' };
    }
  }
}
