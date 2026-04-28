import { Injectable, Logger } from '@nestjs/common';
import { MessengerService } from '../messenger/messenger.service';
import { ConversationContextService, DraftSession } from '../conversation-context/conversation-context.service';
import { BotContextService, BusinessContext } from './bot-context.service';
import { BotKnowledgeService } from '../bot-knowledge/bot-knowledge.service';
import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';

export interface IDraftOrderHandler {
  finalizeDraftOrder(pageId: number, psid: string, draft: DraftSession, page: any): Promise<number>;
}

export interface SmartBotCollected {
  productCodes?: string[];
  qty?: Record<string, number>;
  customerName?: string | null;
  phone?: string | null;
  address?: string | null;
  paymentProof?: string | null;
}

export interface SmartBotResponse {
  reply: string;
  action: 'CHAT' | 'COLLECT' | 'CONFIRM_ORDER' | 'CANCEL_ORDER' | 'AGENT';
  collected: SmartBotCollected;
}

const VALID_ACTIONS = new Set(['CHAT', 'COLLECT', 'CONFIRM_ORDER', 'CANCEL_ORDER', 'AGENT']);

@Injectable()
export class SmartBotService {
  private readonly logger = new Logger(SmartBotService.name);
  private readonly apiKey: string;
  private readonly model: string;

  private failCount = 0;
  private readonly MAX_FAILS = 5;
  private cooldownUntil = 0;

  constructor(
    private readonly messenger: MessengerService,
    private readonly ctx: ConversationContextService,
    private readonly botContext: BotContextService,
    private readonly botKnowledge: BotKnowledgeService,
    private readonly walletService: WalletService,
    private readonly prisma: PrismaService,
  ) {
    this.apiKey = process.env.OPENAI_API_KEY ?? '';
    this.model = process.env.AI_INTENT_MODEL ?? 'gpt-4o-mini';
  }

  isAvailable(): boolean {
    return !!this.apiKey && Date.now() > this.cooldownUntil;
  }

  /**
   * Main entry point. Returns true if SmartBot handled the message (no fallback needed).
   * Returns false if AI failed/unavailable → caller should run keyword pipeline.
   */
  async handle(
    page: any,
    psid: string,
    text: string,
    draft: DraftSession | null,
    message: any,
    draftHandler: IDraftOrderHandler,
  ): Promise<boolean> {
    const pageId = page.id as number;
    const token = page.pageToken as string;

    if (!this.isAvailable()) {
      this.logger.warn('[SmartBot] Not available (no key or cooldown)');
      return false;
    }

    if (!(await this.walletService.canProcessAi(pageId))) {
      this.logger.warn(`[SmartBot] pageId=${pageId} insufficient balance`);
      return false;
    }

    const businessContext = await this.botContext.buildBusinessContext(pageId);
    const history = await this.ctx.getHistory(pageId, psid);

    const systemPrompt = this.buildSystemPrompt(businessContext, draft, page);
    const messages: { role: string; content: string }[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: text },
    ];

    const raw = await this.callOpenAI(messages);
    if (!raw) return false;

    const parsed = this.parseResponse(raw);
    if (!parsed) return false;

    this.failCount = 0;
    await this.walletService.deductUsage(pageId, 'TEXT');

    this.logger.log(`[SmartBot] action=${parsed.action} reply="${parsed.reply.slice(0, 60)}"`);

    // Merge collected fields into draft
    const updatedDraft = await this.mergeAndSave(pageId, psid, draft, parsed.collected, businessContext);

    // Execute action
    switch (parsed.action) {
      case 'CONFIRM_ORDER': {
        const d = updatedDraft;
        const canFinalize = d && d.items.length > 0 && d.customerName && d.phone && d.address
          && (!this.requiresAdvancePayment(d, page) || d.paymentProof);

        if (!canFinalize) {
          // Downgrade to COLLECT — AI reply already asks for missing fields
          await this.safeSend(token, psid, parsed.reply);
          break;
        }
        // Finalize order then send reply
        try {
          await draftHandler.finalizeDraftOrder(pageId, psid, d!, page);
          const orderReply = await this.botKnowledge.resolveSystemReply(pageId, 'order_received').catch(() => parsed.reply);
          await this.safeSend(token, psid, orderReply);
          await this.ctx.clearDraft(pageId, psid);
          await this.ctx.clearHistory(pageId, psid);
        } catch (err: any) {
          this.logger.error(`[SmartBot] finalizeDraftOrder failed: ${err?.message}`);
          await this.safeSend(token, psid, parsed.reply);
        }
        break;
      }

      case 'CANCEL_ORDER': {
        await this.ctx.clearDraft(pageId, psid);
        await this.safeSend(token, psid, parsed.reply);
        break;
      }

      case 'AGENT': {
        await this.ctx.setAgentHandling(pageId, psid, true);
        await this.safeSend(token, psid, parsed.reply);
        break;
      }

      default: // CHAT or COLLECT
        await this.safeSend(token, psid, parsed.reply);
        break;
    }

    return true;
  }

  private async safeSend(token: string, psid: string, text: string): Promise<void> {
    try {
      await this.messenger.sendText(token, psid, text);
    } catch (err: any) {
      this.logger.error(`[SmartBot] sendText failed psid=${psid}: ${err?.message}`);
    }
  }

  private buildSystemPrompt(ctx: BusinessContext, draft: DraftSession | null, page: any): string {
    const shop = ctx.businessName
      ? `"${ctx.businessName}" নামের Bangladeshi e-commerce shop`
      : 'একটি Bangladeshi fashion e-commerce shop';

    // Product catalog (max 30)
    const productLines = ctx.products.slice(0, 30).map(p =>
      `[${p.code}] ${p.name} — ৳${p.price} | ${p.stockQty > 0 ? `${p.stockQty} পিস আছে` : 'Stock শেষ'}`
    ).join('\n');
    const productCtx = ctx.products.length > 0
      ? `\n\n## Product Catalog\n${productLines}`
      : '\n\n## Product Catalog\n(কোনো product নেই)';

    // Delivery & payment
    const deliveryCtx = `\n\n## Delivery & Payment
- ঢাকার ভিতরে delivery: ৳${ctx.deliveryInsideFee}
- ঢাকার বাইরে delivery: ৳${ctx.deliveryOutsideFee}
- Delivery সময়: ${ctx.deliveryTime}`;

    const paymentRules = ctx.paymentRules as any;
    let paymentCtx = '';
    if (paymentRules) {
      const codLine = paymentRules.codEnabled !== false ? '✅ Cash on Delivery আছে' : '❌ COD নেই';
      const insideAdv = paymentRules.insideDhakaAdvanceEnabled
        ? `ঢাকার ভিতরে advance: ৳${paymentRules.insideDhakaAdvanceAmount ?? 100}` : '';
      const outsideAdv = paymentRules.outsideDhakaAdvanceEnabled
        ? `ঢাকার বাইরে advance: ৳${paymentRules.outsideDhakaAdvanceAmount ?? 100}` : '';
      const bkash = page.advanceBkash ? `Bkash: ${page.advanceBkash}` : '';
      const nagad = page.advanceNagad ? `Nagad: ${page.advanceNagad}` : '';
      paymentCtx = `\n${[codLine, insideAdv, outsideAdv, bkash, nagad].filter(Boolean).join('\n')}`;
    }

    // Business knowledge
    const knowledgeCtx = ctx.knowledgeText
      ? `\n\n## Business Knowledge (সব তথ্য)\n${ctx.knowledgeText}`
      : '';

    // Current draft state
    let draftCtx = '\n\n## Current Order Draft\nকোনো active order নেই।';
    if (draft) {
      const items = draft.items.map(i => `${i.productCode} x${i.qty} ৳${i.unitPrice}`).join(', ');
      const fields = [
        `Products: ${items || '❓ নেই'}`,
        `নাম: ${draft.customerName ?? '❓ জানা নেই'}`,
        `ফোন: ${draft.phone ?? '❓ জানা নেই'}`,
        `ঠিকানা: ${draft.address ?? '❓ জানা নেই'}`,
      ];
      if (this.requiresAdvancePayment(draft, page)) {
        fields.push(`Payment proof: ${draft.paymentProof ?? '❓ দেওয়া হয়নি'}`);
      }
      draftCtx = `\n\n## Current Order Draft\n${fields.join('\n')}`;
    }

    // Task rules
    const taskRules = `\n\n## তোমার কাজ
Customer-এর message দেখে **strictly valid JSON** return করো — শুধু JSON, আর কিছু না:

{
  "reply": "<customer-এর জন্য natural Bangla/Banglish reply>",
  "action": "<CHAT|COLLECT|CONFIRM_ORDER|CANCEL_ORDER|AGENT>",
  "collected": {
    "productCodes": ["DF-0001"],
    "qty": {"DF-0001": 1},
    "customerName": null,
    "phone": null,
    "address": null,
    "paymentProof": null
  }
}

### Action rules:
- **CHAT** — product info, FAQ, greetings, delivery info — কোনো order নেই বা নেওয়া হচ্ছে না
- **COLLECT** — customer কিছু order info দিয়েছে (product/name/phone/address); collected-এ নতুন তথ্য রাখো; reply-তে বাকি missing fields চাও
- **CONFIRM_ORDER** — customer "haa/yes/confirm/দিন/ঠিক আছে" বলেছে AND draft-এ সব fields ❓ ছাড়া আছে
- **CANCEL_ORDER** — customer "nibo na/lagbe na/cancel/বাতিল/চাই না" বলেছে
- **AGENT** — complaint/payment problem/confused/অসন্তুষ্ট → bot বন্ধ, human agent দরকার

### collected rules:
- শুধু এই message থেকে নতুন তথ্য রাখো; আগে collected থাকলে তা আবার দেওয়ার দরকার নেই
- productCodes-এ শুধু product catalog-এ থাকা valid codes দাও
- qty default 1 (customer না বললে)
- কোনো field collect না হলে null রাখো (empty string না)

### reply rules:
- সহজ Bangla/Banglish, friendly tone, emoji মাঝে মাঝে 💖
- Draft-এ একটাও field missing (❓) থাকলে reply-তে সেটা জিজ্ঞেস করো
- Order confirm হলে order summary বলো (product, name, phone, address, total)
- Order cancel হলে warmly acknowledge করো
- Business Knowledge section-এর তথ্য দিয়ে প্রশ্নের উত্তর দাও — নিজে বানিও না`;

    return `তুমি ${shop}-এর Facebook Messenger order management AI। Tone: warm, helpful, conversational।${deliveryCtx}${paymentCtx}${productCtx}${knowledgeCtx}${draftCtx}${taskRules}`;
  }

  private async callOpenAI(
    messages: { role: string; content: string }[],
  ): Promise<string | null> {
    if (!this.apiKey) return null;
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 500,
          temperature: 0.4,
          response_format: { type: 'json_object' },
          messages,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (res.status === 429 || res.status === 402) {
        this.logger.warn(`[SmartBot] OpenAI quota/limit (${res.status})`);
        this.enterCooldown();
        return null;
      }
      if (!res.ok) {
        this.logger.error(`[SmartBot] OpenAI error ${res.status}`);
        this.recordFailure();
        return null;
      }

      const data = await res.json() as any;
      return (data?.choices?.[0]?.message?.content ?? '').trim() || null;
    } catch (err: any) {
      this.logger.warn(`[SmartBot] OpenAI network error: ${err?.message ?? err}`);
      this.recordFailure();
      return null;
    }
  }

  private parseResponse(raw: string): SmartBotResponse | null {
    try {
      const parsed = JSON.parse(raw);
      const reply = String(parsed?.reply ?? '').trim();
      const action = String(parsed?.action ?? '').toUpperCase().trim();
      if (!reply || !VALID_ACTIONS.has(action)) {
        this.logger.warn(`[SmartBot] Invalid response: action="${action}" reply="${reply.slice(0, 60)}"`);
        return null;
      }
      const c = parsed?.collected ?? {};
      return {
        reply,
        action: action as SmartBotResponse['action'],
        collected: {
          productCodes: Array.isArray(c.productCodes) ? c.productCodes.filter((x: any) => typeof x === 'string') : [],
          qty: (c.qty && typeof c.qty === 'object') ? c.qty : {},
          customerName: typeof c.customerName === 'string' && c.customerName ? c.customerName : null,
          phone: typeof c.phone === 'string' && c.phone ? c.phone : null,
          address: typeof c.address === 'string' && c.address ? c.address : null,
          paymentProof: typeof c.paymentProof === 'string' && c.paymentProof ? c.paymentProof : null,
        },
      };
    } catch (err: any) {
      this.logger.warn(`[SmartBot] JSON parse failed: ${raw.slice(0, 80)}`);
      this.recordFailure();
      return null;
    }
  }

  async mergeAndSave(
    pageId: number,
    psid: string,
    draft: DraftSession | null,
    collected: SmartBotCollected,
    ctx: BusinessContext,
  ): Promise<DraftSession | null> {
    const codes = collected.productCodes ?? [];
    const hasNewProducts = codes.length > 0;
    const hasNewInfo = collected.customerName || collected.phone || collected.address || collected.paymentProof;

    if (!hasNewProducts && !hasNewInfo && !draft) return null;

    // If no draft exists, try CRM pre-fill for returning customers
    let base: DraftSession = draft ?? this.ctx.emptyDraft();

    if (!draft && hasNewProducts) {
      // Pre-fill from CRM if returning customer
      try {
        const crmCustomer = await this.prisma.customer.findUnique({
          where: { pageId_psid: { pageId, psid } },
          select: { name: true, phone: true, address: true },
        });
        if (crmCustomer?.name) base.customerName = crmCustomer.name;
        if (crmCustomer?.phone) base.phone = crmCustomer.phone;
        if (crmCustomer?.address) base.address = crmCustomer.address;
      } catch { /* ignore */ }
    }

    // Merge products
    if (hasNewProducts) {
      const priceMap = new Map(ctx.products.map(p => [p.code, p.price]));
      for (const code of codes) {
        if (!priceMap.has(code)) continue; // skip invalid codes
        const qty = (collected.qty ?? {})[code] ?? 1;
        const existing = base.items.find(i => i.productCode === code);
        if (existing) {
          existing.qty = qty;
        } else {
          base.items.push({ productCode: code, qty, unitPrice: priceMap.get(code) ?? 0 });
        }
      }
    }

    // Merge contact info
    if (collected.customerName) base.customerName = collected.customerName;
    if (collected.phone) base.phone = collected.phone;
    if (collected.address) base.address = collected.address;
    if (collected.paymentProof) base.paymentProof = collected.paymentProof;

    // Determine currentStep (what's still missing)
    if (!base.customerName) base.currentStep = 'name';
    else if (!base.phone) base.currentStep = 'phone';
    else if (!base.address) base.currentStep = 'address';
    else if (this.requiresAdvancePayment(base, null) && !base.paymentProof) base.currentStep = 'advance_payment';
    else base.currentStep = 'confirm';

    if (base.items.length > 0 || draft) {
      await this.ctx.saveDraft(pageId, psid, base);
      return base;
    }
    return null;
  }

  requiresAdvancePayment(draft: DraftSession, page: any): boolean {
    if (!page) return false;
    const paymentMode = (page.paymentMode as string) || 'cod';
    return paymentMode === 'full_advance' || paymentMode === 'advance_outside';
  }

  private recordFailure(): void {
    this.failCount++;
    if (this.failCount >= this.MAX_FAILS) {
      this.logger.warn(`[SmartBot] ${this.MAX_FAILS} failures — cooldown 5min`);
      this.enterCooldown();
    }
  }

  private enterCooldown(): void {
    this.cooldownUntil = Date.now() + 5 * 60 * 1000;
    this.failCount = 0;
  }
}
