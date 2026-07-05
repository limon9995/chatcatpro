import { Injectable } from '@nestjs/common';
import { AgentType } from '@prisma/client';
import { UniversityBotService } from '../../university/university-bot.service';
import { ReplyTrackingService } from '../reply-tracking.service';
import { BotAgent } from '../bot-agent.interface';

/**
 * Thin adapter over the existing, self-contained UniversityBotService.
 * Preserves the exact behavior of the former `page.universityModeOn` bypass
 * branch in WebhookService — including calling handleMessage even when the
 * trimmed text is empty, matching the original code path exactly.
 */
@Injectable()
export class UniversityBotAgent implements BotAgent {
  readonly type = AgentType.UNIVERSITY;

  constructor(
    private readonly universityBot: UniversityBotService,
    private readonly replyTracking: ReplyTrackingService,
  ) {}

  async handleMessage(page: any, psid: string, message: any): Promise<void> {
    const token = page.pageToken as string;
    const text = message.text?.trim() || '';
    const reply = await this.universityBot.handleMessage(page, psid, text);
    if (reply) await this.replyTracking.safeSend(token, psid, reply);
  }
}
