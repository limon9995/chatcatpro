import { Injectable, Logger } from '@nestjs/common';

/**
 * AiIntentService — PRIMARY intent detector using gpt-4o-mini
 *
 * Flow:
 *   1. Send customer message + context to OpenAI
 *   2. OpenAI returns { intent, reply }
 *   3. On any error (429, quota, no key, timeout) → returns null → caller falls back to keyword matching
 *
 * Cost: gpt-4o-mini @ ~$0.15/1M input tokens. Typical call < 200 tokens.
 * Speed: ~300–600ms average.
 */

export interface AiIntentResult {
  intent: string | null;   // null = AI couldn't classify, use keyword fallback
  reply: string | null;    // only set for UNKNOWN intent — AI-generated reply
}

const VALID_INTENTS = new Set([
  'GREETING',
  'ORDER_INTENT',
  'CANCEL',
  'CONFIRM',
  'EDIT_ORDER',
  'NEGOTIATION',
  'SIZE_REQUEST',
  'PHOTO_REQUEST',
  'DELIVERY_TIME',
  'DELIVERY_FEE',
  'FABRIC_TYPE',
  'CATALOG_REQUEST',
  'SOFT_HESITATION',
  'MULTI_CONFIRM',
  'UNKNOWN',
]);

@Injectable()
export class AiIntentService {
  private readonly logger = new Logger(AiIntentService.name);
  private readonly apiKey: string;
  private readonly model: string;

  // Track consecutive failures to avoid hammering a dead API key
  private failCount = 0;
  private readonly MAX_FAILS = 5;
  private cooldownUntil = 0;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY ?? '';
    this.model = process.env.AI_INTENT_MODEL ?? 'gpt-4o-mini';

    if (this.apiKey) {
      this.logger.log(`[AiIntent] Enabled — model=${this.model}`);
    } else {
      this.logger.warn('[AiIntent] OPENAI_API_KEY not set — will use keyword fallback only');
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey && Date.now() > this.cooldownUntil;
  }

  async detectIntent(
    text: string,
    awaitingConfirm: boolean,
    draftStep: string | null,
    businessName: string | null,
  ): Promise<AiIntentResult> {
    if (!this.isAvailable()) return { intent: null, reply: null };

    const systemPrompt = this.buildSystemPrompt(businessName);
    const userMsg = this.buildUserMessage(text, awaitingConfirm, draftStep);

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
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMsg },
          ],
        }),
        signal: AbortSignal.timeout(8_000),
      });

      // Rate limit / quota exceeded → trigger cooldown, fall back to keywords
      if (response.status === 429 || response.status === 402) {
        this.logger.warn(`[AiIntent] API limit/quota hit (${response.status}) — switching to keyword fallback`);
        this.enterCooldown();
        return { intent: null, reply: null };
      }

      if (!response.ok) {
        this.logger.error(`[AiIntent] API error ${response.status}`);
        this.recordFailure();
        return { intent: null, reply: null };
      }

      const data = await response.json() as any;
      const raw = (data?.choices?.[0]?.message?.content ?? '').trim();

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        this.logger.warn(`[AiIntent] JSON parse failed: ${raw.slice(0, 80)}`);
        this.recordFailure();
        return { intent: null, reply: null };
      }

      const intent: string = (parsed?.intent ?? '').toUpperCase().trim();
      if (!VALID_INTENTS.has(intent)) {
        this.logger.warn(`[AiIntent] Unknown intent returned: "${intent}"`);
        return { intent: null, reply: null };
      }

      this.failCount = 0; // reset on success

      if (intent === 'UNKNOWN') {
        const reply = (parsed?.reply ?? '').trim() || null;
        this.logger.log(`[AiIntent] UNKNOWN — AI reply: ${reply?.slice(0, 80) ?? 'none'}`);
        return { intent: 'UNKNOWN', reply };
      }

      this.logger.log(`[AiIntent] Detected intent=${intent} for text="${text.slice(0, 60)}"`);
      return { intent, reply: null };

    } catch (err: any) {
      this.logger.error(`[AiIntent] Request failed: ${err?.message ?? err}`);
      this.recordFailure();
      return { intent: null, reply: null };
    }
  }

  private buildSystemPrompt(businessName: string | null): string {
    const shop = businessName
      ? `"${businessName}" নামের একটি Bangladeshi e-commerce shop`
      : 'একটি Bangladeshi fashion e-commerce shop';

    return `তুমি ${shop}-এর Facebook Messenger bot। Customer-এর message দেখে intent classify করো।

Return JSON only:
{ "intent": "<INTENT>", "reply": "<reply if UNKNOWN, else null>" }

Valid intents:
- GREETING — সালাম/হ্যালো/hi/hello type message
- ORDER_INTENT — কিনতে চায়, order করতে চায়, lagbe, kinbo
- CANCEL — বাতিল করতে চায়, cancel, lagbe na, chai na
- CONFIRM — order confirm করছে (awaitingConfirm=true হলে বেশি likely)
- EDIT_ORDER — কিছু change/update/বদলাতে চায় (নাম, ঠিকানা, ফোন, size)
- NEGOTIATION — দাম কমাতে চায়, discount চায়, last price
- SIZE_REQUEST — size জিজ্ঞেস করছে
- PHOTO_REQUEST — ছবি চাইছে
- DELIVERY_TIME — কতদিনে পাবে জিজ্ঞেস করছে
- DELIVERY_FEE — delivery charge জিজ্ঞেস করছে
- FABRIC_TYPE — কাপড়ের quality/material জিজ্ঞেস করছে
- CATALOG_REQUEST — কি কি product আছে জানতে চাইছে
- SOFT_HESITATION — পরে দেখবে, এখন না, ভেবে দেখছে
- MULTI_CONFIRM — একসাথে অনেকগুলো order দিতে চায় (sob nibo, duto nibo)
- UNKNOWN — উপরের কোনোটাই না, বা random/অপ্রাসঙ্গিক message

UNKNOWN হলে reply field-এ 2 sentence-এ Bangla/Banglish-এ warm reply দাও।
অন্য সব intent-এ reply=null।`;
  }

  private buildUserMessage(
    text: string,
    awaitingConfirm: boolean,
    draftStep: string | null,
  ): string {
    let ctx = '';
    if (draftStep) ctx += ` | Current order step: "${draftStep}"`;
    if (awaitingConfirm) ctx += ' | awaiting order confirmation';
    return `Message: "${text}"${ctx}`;
  }

  private recordFailure(): void {
    this.failCount++;
    if (this.failCount >= this.MAX_FAILS) {
      this.logger.warn(`[AiIntent] ${this.MAX_FAILS} consecutive failures — cooling down 5 min`);
      this.enterCooldown();
    }
  }

  private enterCooldown(): void {
    this.cooldownUntil = Date.now() + 5 * 60 * 1000; // 5 minutes
    this.failCount = 0;
  }
}
