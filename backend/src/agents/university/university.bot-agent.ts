import { Injectable } from '@nestjs/common';
import { WebhookService } from '../../webhook/webhook.service';
import { BotAgent } from '../bot-agent.interface';

/**
 * Thin delegate — WebhookService.processMessage already branches on
 * page.universityModeOn internally and routes to UniversityBotService, so
 * this agent forwards unchanged rather than duplicating that logic. This is
 * scaffolding for the registry; the university-specific behavior itself
 * still lives entirely in WebhookService/UniversityBotService.
 */
@Injectable()
export class UniversityBotAgent implements BotAgent {
  readonly key = 'university';

  constructor(private readonly webhookService: WebhookService) {}

  async handle(page: any, psid: string, message: any): Promise<void> {
    await this.webhookService.processMessage(page, psid, message);
  }
}
