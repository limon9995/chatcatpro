import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { SupportChatService } from './support-chat.service';

@Controller('support-chat')
@UseGuards(AuthGuard)
@SkipThrottle({ global: true, auth: true })
@Throttle({ chat: { ttl: 60_000, limit: 20 } })
export class SupportChatController {
  constructor(private readonly service: SupportChatService) {}

  @Post()
  async chat(@Body() body: any): Promise<{ reply: string }> {
    const message = String(body?.message ?? '')
      .trim()
      .slice(0, 500);
    if (!message) return { reply: 'কিছু লিখুন 😊' };

    const pageContext = String(body?.pageContext ?? '').trim();

    const rawHistory = Array.isArray(body?.history) ? body.history : [];
    const history = rawHistory
      .slice(-10)
      .filter((m: any) => m?.role && m?.content)
      .map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: String(m.content).slice(0, 500),
      }));

    const liveData =
      body?.liveData && typeof body.liveData === 'object'
        ? body.liveData
        : undefined;

    return this.service.chat(message, pageContext, history, liveData);
  }
}
