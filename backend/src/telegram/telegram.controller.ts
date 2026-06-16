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
}
