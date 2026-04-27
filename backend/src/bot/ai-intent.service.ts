import { Injectable, Logger } from '@nestjs/common';
import { GlobalSettingsService } from '../common/global-settings.service';
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
  private readonly ollamaBaseUrl: string;
  private readonly ollamaModel: string;

  private failCount = 0;
  private readonly MAX_FAILS = 5;
  private cooldownUntil = 0;
  private ollamaBusy = false; // true while an Ollama request is in-flight

  constructor(
    private readonly walletService: WalletService,
    private readonly globalSettings: GlobalSettingsService,
  ) {
    this.apiKey = process.env.OPENAI_API_KEY ?? '';
    this.model = process.env.AI_INTENT_MODEL ?? 'gpt-4o-mini';
    this.ollamaBaseUrl = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '');
    this.ollamaModel = process.env.OLLAMA_CHAT_MODEL ?? 'qwen2:1.5b';

    if (this.apiKey) {
      this.logger.log(`[AiIntent] Enabled — model=${this.model}`);
    } else {
      this.logger.warn('[AiIntent] OPENAI_API_KEY not set — keyword fallback only');
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey && Date.now() > this.cooldownUntil;
  }

  private async attemptOllama(
    userText: string,
    draftStep: string | null,
    awaitingConfirm: boolean,
  ): Promise<string | null> {
    if (this.ollamaBusy) {
      this.logger.log('[AiIntent] Ollama busy → OpenAI handles this one');
      return null;
    }
    this.ollamaBusy = true;
    try {
      this.logger.log(`[AiIntent] Ollama (${this.ollamaModel})`);
      const ollamaMessages = [
        { role: 'system', content: this.buildOllamaPrompt(draftStep, awaitingConfirm) },
        { role: 'user', content: `Customer: "${userText}"` },
      ];
      const res = await fetch(`${this.ollamaBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.ollamaModel,
          stream: false,
          options: { num_predict: 80 },
          messages: ollamaMessages,
        }),
        signal: AbortSignal.timeout(6_000),
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const data = await res.json() as any;
      const content = (data?.message?.content ?? '').trim();
      // Extract JSON object from response (Ollama may add extra text)
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) {
        this.logger.warn(`[AiIntent] Ollama no JSON in response: ${content.slice(0, 80)}`);
        return null;
      }
      JSON.parse(match[0]); // validate parseable
      this.logger.log(`[AiIntent] Ollama OK`);
      return match[0];
    } catch (err: any) {
      this.logger.warn(`[AiIntent] Ollama failed: ${err?.message ?? err}`);
      return null;
    } finally {
      this.ollamaBusy = false;
    }
  }

  private async attemptOpenAI(
    messages: { role: string; content: string }[],
    maxTokens: number,
    temperature: number,
  ): Promise<string | null> {
    if (!this.apiKey) return null;
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.model, max_tokens: maxTokens, temperature, response_format: { type: 'json_object' }, messages }),
        signal: AbortSignal.timeout(8_000),
      });
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
      const data = await res.json() as any;
      return (data?.choices?.[0]?.message?.content ?? '').trim() || null;
    } catch (err: any) {
      this.logger.warn(`[AiIntent] OpenAI network error: ${err?.message ?? err}`);
      this.recordFailure();
      return null;
    }
  }

  private async resolveProvider(
    messages: { role: string; content: string }[],
    maxTokens: number,
    temperature: number,
    label: string,
    ollamaCtx?: { userText: string; draftStep: string | null; awaitingConfirm: boolean },
  ): Promise<{ raw: string } | null> {
    const { localAiMode } = await this.globalSettings.get();

    // Try Ollama for bot only when mode is 'all' (generate_only skips bot)
    if (localAiMode === 'all' && this.ollamaBaseUrl && ollamaCtx) {
      const ollamaRaw = await this.attemptOllama(ollamaCtx.userText, ollamaCtx.draftStep, ollamaCtx.awaitingConfirm);
      if (ollamaRaw) {
        this.logger.log(`[AiIntent] ${label} — Ollama OK`);
        return { raw: ollamaRaw };
      }
    }

    // Fall back to OpenAI
    if (!this.apiKey) {
      this.logger.warn(`[AiIntent] No OpenAI key — keyword fallback`);
      return null;
    }
    this.logger.log(`[AiIntent] ${label} — OpenAI (${this.model})`);
    const raw = await this.attemptOpenAI(messages, maxTokens, temperature);
    if (!raw) return null;
    return { raw };
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

    const resolved = await this.resolveProvider(messages, 300, 0.4, 'detectIntent', { userText: text, draftStep, awaitingConfirm });
    if (!resolved) return { intent: null, reply: null };

    try {
      let parsed: any;
      try { parsed = JSON.parse(resolved.raw); } catch {
        this.logger.warn(`[AiIntent] JSON parse failed: ${resolved.raw.slice(0, 80)}`);
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
      this.logger.log(`[AiIntent] intent=${intent} reply="${reply?.slice(0, 60) ?? 'none'}"`);
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
      let parsed: any;
      try { parsed = JSON.parse(resolved.raw); } catch {
        this.logger.warn(`[AiIntent] Draft review JSON parse failed: ${resolved.raw.slice(0, 80)}`);
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
      this.logger.log(`[AiIntent] draft action=${action}`);
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

  private buildOllamaPrompt(draftStep: string | null, awaitingConfirm: boolean): string {
    const stepNote = draftStep ? `\nCurrent step: collecting "${STEP_LABELS[draftStep] ?? draftStep}".` : '';
    const confirmNote = awaitingConfirm ? '\nawaitingConfirm=true means "ok/haa/yes" → CONFIRM.' : '';
    return `You are a Bangladeshi e-commerce chatbot. Classify the customer message.
Return ONLY valid JSON: {"intent":"INTENT","reply":null}${stepNote}${confirmNote}

Intents: GREETING, ORDER_INTENT, CANCEL, CONFIRM, EDIT_ORDER, NEGOTIATION, SIZE_REQUEST, PHOTO_REQUEST, DELIVERY_TIME, DELIVERY_FEE, FABRIC_TYPE, CATALOG_REQUEST, SOFT_HESITATION, MULTI_CONFIRM, UNKNOWN

Rules:
- "nibo na"/"lagbe na"/"cancel"/"bad den" → CANCEL
- "lagbe"/"kinbo"/"order" (without "na") → ORDER_INTENT
- "ki ki ache"/"product list"/"catalog" → CATALOG_REQUEST
- "valo asen"/"kemon achen"/"how are you"/"hi"/"hello"/"salam" → GREETING
- Doubt → UNKNOWN
- Always set reply=null`;
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

    return `তুমি ${shop}-এর Facebook Messenger chatbot। Tone: warm, conversational Bangla/Banglish — template-এর মতো না, স্বাভাবিকভাবে কথা বলো। 💖 emoji মাঝে মাঝে।${stepCtx}${deliveryCtx}${paymentCtx}${productCtx}${knowledgeCtx}

Customer-এর message দেখে JSON return করো:
{ "intent": "<INTENT>", "reply": "<natural reply>" }

━━ INTENT LIST ━━
- GREETING — "hi/hello/salam/valo asen/kemon achen/how are you" জাতীয় কথা
- ORDER_INTENT — কিনতে বা order করতে চায়
- CANCEL — order বাতিল ("nibo na", "lagbe na", "chai na", "cancel", "বাতিল")
- CONFIRM — order confirm করছে (yes/haa/confirm — awaitingConfirm=true হলে)
- EDIT_ORDER — কিছু change করতে চায় (নাম/ফোন/ঠিকানা/size)
- NEGOTIATION — দাম কমাতে চায় ("kom hobe", "discount", "last price", "best price")
- SIZE_REQUEST — size জিজ্ঞেস করছে
- PHOTO_REQUEST — ছবি/photo চাইছে
- DELIVERY_TIME — delivery কবে হবে
- DELIVERY_FEE — delivery charge কত
- FABRIC_TYPE — কাপড়ের quality/material
- CATALOG_REQUEST — product list চাইছে ("ki ki ache", "ki ache", "catalog", "sob product")
- SOFT_HESITATION — পরে দেখবে, এখন না
- MULTI_CONFIRM — একসাথে সব order দিতে চায়
- UNKNOWN — অন্য সব

━━ CLASSIFICATION RULES (এগুলো কখনো ভুল করো না) ━━
1. CANCEL: "na/nibo na/lagbe na/chai na/bad den/cancel/বাতিল/দরকার নেই" → CANCEL। price question-এ na থাকলে CANCEL নয়।
2. ORDER_INTENT: "lagbe/kinbo/order korbo/nibo" (না ছাড়া) → ORDER_INTENT।
3. NEGOTIATION: শুধু তখন যখন customer explicitly দাম কমাতে চাইছে — "kom hobe?", "discount diben?", "last price?", "X taka te diben?" এই ধরনের। "ki ki ache?" কোনোভাবেই NEGOTIATION না।
4. CATALOG_REQUEST: "ki ki ache/ki ache/product list/catalog/sob dekhao/konta ache" → সবসময় CATALOG_REQUEST, NEGOTIATION না।
5. GREETING: "valo asen/kemon achen/hi/hello/salam" → GREETING। price বা product-এর কথা নেই।
6. "Ok/Thik" একা + no draft → UNKNOWN।
7. সন্দেহ হলে ORDER-এর চেয়ে CANCEL বেছে নাও।

━━ REPLY RULES — কোন তথ্য কোথা থেকে নেবে ━━

GREETING reply:
  • "valo asen / kemon achen / how are you" → নিজের কথা বলো ("আলহামদুলিল্লাহ, ভালো আছি 😊 আপনি কেমন আছেন?"), তারপর help offer করো। Products/code একদম mention করো না।
  • "hi / hello / salam / assalamu alaikum" → warmly greet, shop-এর নাম বলো, কীভাবে help করতে পারো জিজ্ঞেস করো। Product list দিও না।

DELIVERY_FEE reply:
  → উপরের Delivery section থেকে EXACT fee নাও। ঢাকার ভিতরে: ৳{insideFee}, বাইরে: ৳{outsideFee}। নিজে থেকে fee বানাবে না।

DELIVERY_TIME reply:
  → উপরের Delivery section-এর "সময়" থেকে নাও। নিজে থেকে সময় বানাবে না।

SIZE_REQUEST / FABRIC_TYPE reply:
  → Business Knowledge (FAQ/Policy) section থেকে তথ্য নাও। না থাকলে বলো "কোন product-এর size জানতে চান?" — কিছু বানাবে না।

NEGOTIATION reply:
  → Payment section-এর pricing policy দেখো। Sympathetic থাকো কিন্তু policy মেনে চলো।

CATALOG_REQUEST reply:
  → Products list থেকে top 5টি নাম ও দাম বলো (bullet: "• নাম — ৳দাম")। শেষে বলো "আরও আছে, সব দেখতে catalog link-এ যান"।

CANCEL reply → warmly acknowledge, কোনো সমস্যা নেই।
SOFT_HESITATION reply → বুঝলাম, যখন সুবিধা জানাবেন।
PHOTO_REQUEST reply → বলো photo পাঠানো হবে বা page-এ দেখুন।
UNKNOWN + draft চলছে → draft reminder দিয়ে warmly redirect।
UNKNOWN + no draft → তারা কী বলতে চাইছে acknowledge করো, suggest করো (product code/screenshot দিতে বলো অথবা delivery/size/payment নিয়ে জিজ্ঞেস করতে পারেন বলো)।
অন্য সব intent → reply=null`;
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
