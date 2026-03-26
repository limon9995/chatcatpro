import { Injectable, Logger } from '@nestjs/common';
import {
  BotFallbackProvider,
  FallbackContext,
  FallbackResponse,
} from './fallback-ai.interface';
import { MockFallbackProvider } from './providers/mock.fallback.provider';
import { OpenAIFallbackProvider } from './providers/openai.fallback.provider';

/**
 * V18: FallbackAiService
 *
 * Selects the correct fallback provider based on FALLBACK_AI_PROVIDER env var.
 * Called ONLY when:
 *   1. Rule-based bot fails to match any intent (and imageFallbackAiOn = true)
 *   2. Vision match confidence is too low to auto-proceed (< imageMediumConfidence)
 *
 * This service is intentionally lazy — never called for normal text flow.
 */
@Injectable()
export class FallbackAiService {
  private readonly logger = new Logger(FallbackAiService.name);
  private readonly provider: BotFallbackProvider;

  constructor(
    private readonly mockProvider: MockFallbackProvider,
    private readonly openaiProvider: OpenAIFallbackProvider,
  ) {
    const configured = (process.env.FALLBACK_AI_PROVIDER ?? '').toLowerCase().trim();
    if (configured === 'openai') {
      this.provider = this.openaiProvider;
      this.logger.log('[FallbackAI] Using OpenAI fallback provider');
    } else {
      this.provider = this.mockProvider;
      this.logger.log(
        '[FallbackAI] Using mock fallback provider (set FALLBACK_AI_PROVIDER=openai to enable real AI)',
      );
    }
  }

  async generateReply(context: FallbackContext): Promise<FallbackResponse> {
    this.logger.log(`[FallbackAI] Triggered — reason=${context.reason}`);
    try {
      return await this.provider.generateReply(context);
    } catch (err: any) {
      this.logger.error(`[FallbackAI] Provider threw: ${err?.message ?? err}`);
      return { reply: null, escalateToAgent: true };
    }
  }
}
