import { Body, Controller, Post } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { ChatService } from './chat.service';

@Controller('chat')
@SkipThrottle({ global: true, auth: true })
@Throttle({ chat: { ttl: 60_000, limit: 20 } })
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async chat(@Body() body: any): Promise<{ reply: string }> {
    const message = String(body?.message ?? '').trim().slice(0, 500);
    if (!message) return { reply: 'কিছু লিখুন 😊' };

    const rawHistory = Array.isArray(body?.history) ? body.history : [];
    const history = rawHistory
      .slice(-10)
      .filter((m: any) => m?.role && m?.content)
      .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, 500) }));

    const reply = await this.chatService.chat(message, history);
    return { reply };
  }
}
