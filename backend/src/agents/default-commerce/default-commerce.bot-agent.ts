import { Injectable } from '@nestjs/common';
import { WebhookService } from '../../webhook/webhook.service';
import { BotAgent } from '../bot-agent.interface';

/**
 * Thin delegate — does NOT duplicate WebhookService's commerce pipeline.
 * WebhookService.processMessage already handles the full commerce flow
 * (and, via its internal universityModeOn check, the legacy university
 * bypass too), so this agent simply forwards to it unchanged. This keeps
 * the existing, heavily-exercised pipeline in one place while giving it a
 * registry-addressable identity for future agents to sit alongside.
 */
@Injectable()
export class DefaultCommerceBotAgent implements BotAgent {
  readonly key = 'commerce';

  constructor(private readonly webhookService: WebhookService) {}

  async handle(page: any, psid: string, message: any): Promise<void> {
    await this.webhookService.processMessage(page, psid, message);
  }
}
