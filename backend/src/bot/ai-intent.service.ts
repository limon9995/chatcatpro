import { Injectable, Logger } from '@nestjs/common';
import { WalletService } from '../wallet/wallet.service';
import { BusinessContext } from './bot-context.service';

export interface AiIntentResult {
  intent: string | null;   // null = use keyword fallback
  reply: string | null;    // AI-generated natural reply (always set when AI succeeds)
}

export interface DraftStepReviewResult {
  action:
    | 'CAPTURE'
    | 'RETRY'
    | 'EXIT_DRAFT'
    | 'CONFIRM'
    | 'CANCEL'
    | 'EDIT';
  reply: string | null;
  normalizedValue: string | null;
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

// Intents where AI reply replaces the hardcoded template
// Now includes knowledge-based intents that require business-specific answers
const AI_REPLY_INTENTS = new Set([
  'GREETING',
  'CANCEL',
  'SOFT_HESITATION',
  'NEGOTIATION',
  'UNKNOWN',
  'SIZE_REQUEST',      // AI answers from knowledgeText
  'DELIVERY_TIME',     // AI uses real deliveryTime from DB
  'DELIVERY_FEE',      // AI uses real inside/outside fee from DB
  'FABRIC_TYPE',       // AI answers from knowledgeText
  'CATALOG_REQUEST',   // AI lists real products from DB
  'PHOTO_REQUEST',     // AI explains photo process
]);

const STEP_LABELS: Record<string, string> = {
  name: 'নাম',
  phone: 'ফোন নম্বর',
  address: 'পুরো ঠিকানা',
  confirm: 'order confirm করতে হ্যাঁ/না বলুন',
  advance_payment: 'advance payment-এর transaction ID বা screenshot',
};

@Injectable()
export class AiIntentService {
  private readonly logger = new Logger(AiIntentService.name);
  private readonly apiKey: string;
  private readonly model: string;

  private failCount = 0;
  private readonly MAX_FAILS = 5;
  private cooldownUntil = 0;

  constructor(private readonly walletService: WalletService) {
    this.apiKey = process.env.OPENAI_API_KEY ?? '';
    this.model = process.env.AI_INTENT_MODEL ?? 'gpt-4o-mini';

    if (this.apiKey) {
      this.logger.log(`[AiIntent] Enabled — model=${this.model}`);
    } else {
      this.logger.warn('[AiIntent] OPENAI_API_KEY not set — keyword fallback only');
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey && Date.now() > this.cooldownUntil;
  }

  private async attemptRequest(
    messages: { role: string; content: string }[],
    maxTokens: number,
    temperature: number,
  ): Promise<Response | null> {
    try {
      return await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.model, max_tokens: maxTokens, temperature, response_format: { type: 'json_object' }, messages }),
        signal: AbortSignal.timeout(8_000),
      });
    } catch (err: any) {
      this.logger.warn(`[AiIntent] OpenAI network error: ${err?.message ?? err}`);
      return null;
    }
  }

  private async resolveProvider(
    messages: { role: string; content: string }[],
    maxTokens: number,
    temperature: number,
    label: string,
  ): Promise<{ response: Response } | null> {
    if (!this.apiKey) {
      this.logger.warn(`[AiIntent] No OpenAI key — keyword fallback`);
      return null;
    }

    this.logger.log(`[AiIntent] ${label} — OpenAI (${this.model})`);
    const res = await this.attemptRequest(messages, maxTokens, temperature);
    if (!res) { this.recordFailure(); return null; }

    if (res.status === 429 || res.status === 402) {
      this.logger.warn(`[AiIntent] OpenAI quota/limit (${res.status}) — keyword fallback`);
      this.enterCooldown();
      return null;
    }
    if (!res.ok) {
      this.logger.error(`[AiIntent] OpenAI error ${res.status}`);
      this.recordFailure();
      return null;
    }

    return { response: res };
  }

  async detectIntent(
    pageId: number,
    text: string,
    awaitingConfirm: boolean,
    draftStep: string | null,
    context: BusinessContext,
  ): Promise<AiIntentResult> {
    if (!this.isAvailable()) return { intent: null, reply: null };
    if (!(await this.walletService.canProcessAi(pageId))) {
      this.logger.warn(`[AiIntent] pageId=${pageId} suspended or insufficient balance`);
      return { intent: null, reply: null };
    }

    const messages = [
      { role: 'system', content: this.buildSystemPrompt(context, draftStep) },
      { role: 'user', content: this.buildUserMessage(text, awaitingConfirm, draftStep) },
    ];

    const resolved = await this.resolveProvider(messages, 300, 0.4, 'detectIntent');
    if (!resolved) return { intent: null, reply: null };

    try {
      const data = await resolved.response.json() as any;
      const raw = (data?.choices?.[0]?.message?.content ?? '').trim();
      let parsed: any;
      try { parsed = JSON.parse(raw); } catch {
        this.logger.warn(`[AiIntent] JSON parse failed: ${raw.slice(0, 80)}`);
        this.recordFailure();
        return { intent: null, reply: null };
      }

      const intent = (parsed?.intent ?? '').toUpperCase().trim();
      if (!VALID_INTENTS.has(intent)) {
        this.logger.warn(`[AiIntent] Invalid intent: "${intent}"`);
        return { intent: null, reply: null };
      }

      this.failCount = 0;
      const reply = (parsed?.reply ?? '').trim() || null;
      await this.walletService.deductUsage(pageId, 'TEXT');
      this.logger.log(`[AiIntent] [OpenAI] intent=${intent} reply="${reply?.slice(0, 60) ?? 'none'}"`);
      return { intent, reply };
    } catch (err: any) {
      this.logger.error(`[AiIntent] detectIntent parse error: ${err?.message ?? err}`);
      this.recordFailure();
      return { intent: null, reply: null };
    }
  }

  async reviewDraftStep(
    pageId: number,
    text: string,
    draftStep: string,
    businessName: string | null,
  ): Promise<DraftStepReviewResult | null> {
    if (!this.isAvailable()) return null;
    if (!(await this.walletService.canProcessAi(pageId))) {
      this.logger.warn(`[AiIntent] pageId=${pageId} suspended or insufficient balance for draft review`);
      return null;
    }

    const messages = [
      { role: 'system', content: this.buildDraftReviewPrompt(businessName, draftStep) },
      { role: 'user', content: `Customer message: "${text}"` },
    ];

    const resolved = await this.resolveProvider(messages, 180, 0.2, 'reviewDraftStep');
    if (!resolved) return null;

    try {
      const data = await resolved.response.json() as any;
      const raw = (data?.choices?.[0]?.message?.content ?? '').trim();
      let parsed: any;
      try { parsed = JSON.parse(raw); } catch {
        this.logger.warn(`[AiIntent] Draft review JSON parse failed: ${raw.slice(0, 80)}`);
        this.recordFailure();
        return null;
      }

      const action = String(parsed?.action ?? '').toUpperCase().trim();
      if (!['CAPTURE', 'RETRY', 'EXIT_DRAFT', 'CONFIRM', 'CANCEL', 'EDIT'].includes(action)) {
        this.logger.warn(`[AiIntent] Invalid draft action: "${action}"`);
        return null;
      }

      this.failCount = 0;
      await this.walletService.deductUsage(pageId, 'TEXT');
      this.logger.log(`[AiIntent] [OpenAI] draft action=${action}`);
      return {
        action: action as DraftStepReviewResult['action'],
        reply: (parsed?.reply ?? '').trim() || null,
        normalizedValue: (parsed?.normalizedValue ?? '').trim() || null,
      };
    } catch (err: any) {
      this.logger.error(`[AiIntent] reviewDraftStep parse error: ${err?.message ?? err}`);
      this.recordFailure();
      return null;
    }
  }

  shouldUseAiReply(intent: string): boolean {
    return AI_REPLY_INTENTS.has(intent);
  }

  private buildSystemPrompt(context: BusinessContext, draftStep: string | null): string {
    const shop = context.businessName
      ? `"${context.businessName}" নামের Bangladeshi e-commerce shop`
      : 'একটি Bangladeshi fashion e-commerce shop';

    const stepCtx = draftStep
      ? `\nএখন bot customer-এর কাছ থেকে "${STEP_LABELS[draftStep] ?? draftStep}" চাইছে।`
      : '';

    // Build product catalog context (max 25 products)
    const productLines = context.products.slice(0, 25).map(p =>
      `- ${p.name}: ৳${p.price} | ${p.stockQty > 0 ? `${p.stockQty} পিস আছে` : 'Stock নেই'}`
    ).join('\n');
    const productCtx = context.products.length > 0
      ? `\n\nProducts (${context.products.length} টি):\n${productLines}`
      : '';

    // Delivery and payment context
    const deliveryCtx = `\n\nDelivery:
- ঢাকার ভিতরে: ৳${context.deliveryInsideFee}
- ঢাকার বাইরে: ৳${context.deliveryOutsideFee}
- সময়: ${context.deliveryTime}`;

    const paymentRules = context.paymentRules as any;
    const paymentCtx = paymentRules ? `\n\nPayment:
- COD: ${paymentRules.codEnabled !== false ? 'আছে' : 'নেই'}
- Advance (inside Dhaka): ${paymentRules.insideDhakaAdvanceEnabled ? `৳${paymentRules.insideDhakaAdvanceAmount ?? 100}` : 'লাগবে না'}
- Advance (outside Dhaka): ${paymentRules.outsideDhakaAdvanceEnabled ? `৳${paymentRules.outsideDhakaAdvanceAmount ?? 100}` : 'লাগবে না'}` : '';

    const knowledgeCtx = context.knowledgeText
      ? `\n\nBusiness Knowledge (FAQ/Policy):\n${context.knowledgeText}`
      : '';

    return `তুমি ${shop}-এর Facebook Messenger-এ কথা বলছ।${stepCtx}${deliveryCtx}${paymentCtx}${productCtx}${knowledgeCtx}

Customer-এর message দেখে JSON return করো:
{ "intent": "<INTENT>", "reply": "<natural reply>" }

Valid intents:
- GREETING — hi/hello/সালাম জাতীয় কথা
- ORDER_INTENT — কিনতে/order করতে চায়
- CANCEL — order বাতিল করতে চায় ("nibo na", "lagbe na", "chai na", "cancel", "বাতিল" — যেকোনো step-এ)
- CONFIRM — order confirm করছে
- EDIT_ORDER — কিছু change করতে চায় (নাম/ফোন/ঠিকানা/size)
- NEGOTIATION — দাম কমাতে চায়
- SIZE_REQUEST — size জিজ্ঞেস করছে
- PHOTO_REQUEST — ছবি চাইছে
- DELIVERY_TIME — delivery কবে হবে জিজ্ঞেস করছে
- DELIVERY_FEE — delivery charge জিজ্ঞেস করছে
- FABRIC_TYPE — কাপড়ের quality জিজ্ঞেস করছে
- CATALOG_REQUEST — product list / catalog চাইছে (যেমন: "ki ki ache", "ki ki products ache", "apnader ki ki product ache", "catalog dao", "sob product dekhao", "কি কি আছে", "কি আছে", "কি পাওয়া যায়", "product list dao")
- SOFT_HESITATION — পরে দেখবে, এখন না
- MULTI_CONFIRM — একসাথে অনেক order দিতে চায়
- UNKNOWN — অন্য সব

নিয়ম:
1. CANCEL চেনার উপায় — message-এ "na", "nibo na", "krbo na", "lagbe na", "chai na", "bad den", "cancel", "বাতিল", "দরকার নেই" থাকলে CANCEL।
2. ORDER_INTENT শুধু তখন — customer clearly কিছু কিনতে চাইছে, "lagbe", "kinbo", "order korbo", "nibo" (না ছাড়া)।
3. "Ok", "Okay", "Thik" একা — draft না থাকলে UNKNOWN। awaitingConfirm=true হলে CONFIRM।
4. Name step-এ "hi"/"hello" → GREETING।
5. Draft step চলাকালে off-topic → UNKNOWN।
6. সন্দেহ হলে CANCEL বেছে নাও ORDER-এর চেয়ে — ভুল order শুরু করা বেশি ক্ষতিকর।
7. "ki ki ache", "ki ki products ache" — এগুলো সবসময় CATALOG_REQUEST।

reply field:
- GREETING → friendly greeting
- CANCEL → warmly acknowledge
- SOFT_HESITATION → বুঝলাম, যখন সুবিধা
- NEGOTIATION → sympathetic, pricing policy অনুযায়ী
- DELIVERY_FEE → উপরের delivery info থেকে সঠিক charge বলো
- DELIVERY_TIME → উপরের delivery time বলো
- SIZE_REQUEST → knowledgeText থেকে size info বলো, না থাকলে জিজ্ঞেস করো কোন product
- CATALOG_REQUEST → উপরের product list থেকে ২-৩টা highlight করো, বলো আরও আছে
- FABRIC_TYPE → knowledgeText থেকে fabric info বলো
- PHOTO_REQUEST → বলো photo পাঠানো হবে/page-এ দেখুন
- UNKNOWN + draft চলছে → warmly redirect
- UNKNOWN + কোনো draft নেই → helpful reply
- অন্য সব → reply=null`;
  }

  private buildUserMessage(
    text: string,
    awaitingConfirm: boolean,
    draftStep: string | null,
  ): string {
    let ctx = '';
    if (draftStep) ctx += ` | draft_step="${draftStep}"`;
    if (awaitingConfirm) ctx += ' | awaiting_confirm=true';
    return `Customer: "${text}"${ctx}`;
  }

  private buildDraftReviewPrompt(
    businessName: string | null,
    draftStep: string,
  ): string {
    const shop = businessName
      ? `"${businessName}" নামের Bangladeshi e-commerce shop`
      : 'একটি Bangladeshi e-commerce shop';

    const stepLabel = STEP_LABELS[draftStep] ?? draftStep;

    return `তুমি ${shop}-এর Messenger order flow monitor করছ।
Bot এখন customer-এর কাছ থেকে "${stepLabel}" চাইছে।

Customer message দেখে strict JSON return করো:
{ "action": "<ACTION>", "normalizedValue": "<value or null>", "reply": "<reply or null>" }

Allowed ACTION:
- CAPTURE: customer requested info-টাই দিয়েছে; normalizedValue-এ clean value দাও
- RETRY: customer flow-তেই আছে কিন্তু expected answer দেয়নি/invalid দিয়েছে; reply-তে same step gently re-ask করো
- EXIT_DRAFT: customer clearly off-topic / topic change / normal chat / unrelated question; reply-তে normal conversational উত্তর দাও, order flow continue করবে না
- CONFIRM: confirm/yes দিয়েছে
- CANCEL: cancel/not interested দিয়েছে
- EDIT: change করতে চায়

Rules:
1. step=name হলে শুধু মানুষের নাম হলে CAPTURE। greeting, প্রশ্ন, product query, address-like text, long sentence, phone number, negotiation text name না।
2. step=phone হলে valid Bangladeshi phone number থাকলে CAPTURE। অন্য কিছু RETRY বা EXIT_DRAFT।
3. step=address হলে full location/address-like text হলে CAPTURE। ছোট chat message address না।
4. step=confirm হলে confirm/cancel/edit আলাদা action দাও। unrelated হলে RETRY বা EXIT_DRAFT।
5. step=confirm_address হলে "হ্যাঁ/ঠিক আছে" টাইপ হলে CONFIRM, নতুন address হলে CAPTURE।
6. step=advance_payment হলে valid transaction id / payment proof হলে CAPTURE। সমস্যা/agent/help চাইলে RETRY with helpful guidance, clear cancel হলে CANCEL।
7. step=cf:... হলে only direct option/value হলে CAPTURE। unrelated হলে RETRY বা EXIT_DRAFT।
8. User যদি order context ছেড়ে অন্য topic-এ চলে যায়, EXIT_DRAFT বেছে নাও।
9. reply field RETRY বা EXIT_DRAFT হলে সবসময় দাও। CAPTURE/CONFIRM/CANCEL/EDIT হলে reply=null।
10. normalizedValue-এ শুধু clean user value দাও; না থাকলে null।`;
  }

  private recordFailure(): void {
    this.failCount++;
    if (this.failCount >= this.MAX_FAILS) {
      this.logger.warn(`[AiIntent] ${this.MAX_FAILS} failures — cooldown 5min`);
      this.enterCooldown();
    }
  }

  private enterCooldown(): void {
    this.cooldownUntil = Date.now() + 5 * 60 * 1000;
    this.failCount = 0;
  }
}
