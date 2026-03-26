import { Injectable, Logger } from '@nestjs/common';
import {
  BotFallbackProvider,
  FallbackContext,
  FallbackResponse,
} from '../fallback-ai.interface';

/**
 * OpenAI Fallback Provider — uses GPT-4o to generate a contextual reply
 * when the rule-based bot cannot handle the message.
 *
 * SETUP:
 *   1. Set FALLBACK_AI_PROVIDER=openai in .env
 *   2. Set OPENAI_API_KEY=sk-... in .env
 *   3. Optionally set FALLBACK_AI_MODEL=gpt-4o (default)
 *
 * The system prompt keeps the bot in-character as a Bangladeshi e-commerce assistant.
 */
@Injectable()
export class OpenAIFallbackProvider implements BotFallbackProvider {
  private readonly logger = new Logger(OpenAIFallbackProvider.name);
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY ?? '';
    this.model = process.env.FALLBACK_AI_MODEL ?? 'gpt-4o';
  }

  async generateReply(context: FallbackContext): Promise<FallbackResponse> {
    if (!this.apiKey) {
      this.logger.warn('[OpenAIFallback] OPENAI_API_KEY not set — escalating to agent');
      return { reply: null, escalateToAgent: true };
    }

    const businessCtx = context.businessName
      ? `You work for "${context.businessName}".`
      : 'You work for a Bangladeshi fashion e-commerce store on Facebook Messenger.';

    const systemPrompt = `${businessCtx}
You are a helpful, friendly customer service assistant for a Bangladeshi e-commerce shop.
You reply in Bangla (Bengali script) unless the customer writes in English.
Keep replies short, helpful, and commerce-focused.
Do NOT make up prices or product names. If you don't know, politely ask for clarification.
Do NOT promise delivery dates or discounts unless asked to confirm.
If the customer is asking about a product, help them describe it better so you can find it.`;

    const userMsg =
      context.reason === 'image_unclear' && context.visionDescription
        ? `Customer sent an image. Vision analysis: "${context.visionDescription}". Customer message: "${context.customerMessage}"`
        : context.customerMessage;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 200,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMsg },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        this.logger.error(`[OpenAIFallback] API error ${response.status}`);
        return { reply: null, escalateToAgent: true };
      }

      const data = await response.json() as any;
      const reply: string = (data?.choices?.[0]?.message?.content ?? '').trim();

      if (!reply) return { reply: null, escalateToAgent: true };

      this.logger.log(`[OpenAIFallback] Generated reply: ${reply.slice(0, 100)}`);
      return { reply, escalateToAgent: false };
    } catch (err: any) {
      this.logger.error(`[OpenAIFallback] Failed: ${err?.message ?? err}`);
      return { reply: null, escalateToAgent: true };
    }
  }
}
