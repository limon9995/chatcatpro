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

  // Step labels in Bangla for richer OpenAI context
  private static readonly STEP_LABELS: Record<string, string> = {
    name: 'নাম চাওয়া হচ্ছিল',
    phone: 'ফোন নম্বর চাওয়া হচ্ছিল',
    address: 'ঠিকানা চাওয়া হচ্ছিল',
    confirm: 'order confirm করতে বলা হচ্ছিল',
    advance_payment: 'advance payment-এর transaction ID বা screenshot চাওয়া হচ্ছিল',
  };

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY ?? '';
    // Default to gpt-4o-mini — much cheaper, sufficient for recovery replies
    this.model = process.env.FALLBACK_AI_MODEL ?? 'gpt-4o-mini';
  }

  async generateReply(context: FallbackContext): Promise<FallbackResponse> {
    if (!this.apiKey) {
      this.logger.warn('[OpenAIFallback] OPENAI_API_KEY not set — escalating to agent');
      return { reply: null, escalateToAgent: true };
    }

    const businessCtx = context.businessName
      ? `তুমি "${context.businessName}" এর customer service assistant।`
      : 'তুমি একটি Bangladeshi fashion e-commerce shop-এর Facebook Messenger customer service assistant।';

    // Build a clear situation description for OpenAI
    let situationCtx = '';
    if (context.draftStep) {
      const stepLabel = OpenAIFallbackProvider.STEP_LABELS[context.draftStep] ?? `"${context.draftStep}" step চলছিল`;
      situationCtx = `\nBot এর current situation: ${stepLabel}।`;
      if (context.draftSummary) {
        situationCtx += ` (${context.draftSummary})`;
      }
    } else if (context.draftSummary) {
      situationCtx = `\nBot এর current situation: ${context.draftSummary}।`;
    }

    const systemPrompt = `${businessCtx}${situationCtx}

তোমার কাজ: Bot যে situation-এ আটকে গেছে সেটা সামলানো।
- Customer কে warmly respond করো
- Bot যা চাইছিল সেদিকে customer কে ফিরিয়ে আনো
- Off-topic হলে হাসিমুখে redirect করো
- Frustrated হলে acknowledge করে সামনে এগিয়ে যাও
- সর্বোচ্চ 2-3 sentence
- Customer Bangla লিখলে Bangla তে reply করো, English লিখলে English এ
- কোনো price বা product নাম বানিয়ে বলবে না
- Order complete করতে সাহায্য করাই মূল লক্ষ্য`;

    const userMsg =
      context.reason === 'image_unclear' && context.visionDescription
        ? `Customer একটি ছবি পাঠিয়েছে। Vision analysis: "${context.visionDescription}"। Customer message: "${context.customerMessage}"`
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
          max_tokens: 120,
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
