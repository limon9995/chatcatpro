import { Injectable, Logger } from '@nestjs/common';
import {
  BotFallbackProvider,
  FallbackContext,
  FallbackResponse,
} from '../fallback-ai.interface';

/**
 * Mock Fallback Provider — safe default, no external API calls.
 * Returns null reply, which causes the bot to escalate to agent handling.
 * This is the correct safe behavior when no real AI is configured.
 */
@Injectable()
export class MockFallbackProvider implements BotFallbackProvider {
  private readonly logger = new Logger(MockFallbackProvider.name);

  async generateReply(context: FallbackContext): Promise<FallbackResponse> {
    this.logger.log(
      `[MockFallback] Called for reason=${context.reason} — no real provider configured`,
    );
    // Signal to escalate to human agent
    return { reply: null, escalateToAgent: true };
  }
}
