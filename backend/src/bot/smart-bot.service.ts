import { Injectable, Logger } from '@nestjs/common';
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
   * Returns the reply string to send (WebhookService.safeSend handles it for history tracking).
   * Returns false if AI failed/unavailable → caller should run keyword pipeline.
   */
  async handle(
    page: any,
    psid: string,
    text: string,
    draft: DraftSession | null,
    draftHandler: IDraftOrderHandler,
  ): Promise<string | false> {
    const pageId = page.id as number;

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
    await this.walletService.deductUsage(pageId, 'SMART_BOT');

    this.logger.log(`[SmartBot] action=${parsed.action} reply="${parsed.reply.slice(0, 60)}"`);

    // Merge collected fields into draft and persist
    const updatedDraft = await this.mergeAndSave(pageId, psid, draft, parsed.collected, businessContext);

    // Execute side-effects (state changes), return reply string to caller for sending
    switch (parsed.action) {
      case 'CONFIRM_ORDER': {
        const d = updatedDraft;
        const canFinalize = d && d.items.length > 0 && d.customerName && d.phone && d.address
          && (!this.requiresAdvancePayment(d, page) || d.paymentProof);

        if (!canFinalize) {
          // Fields still missing — AI reply already asks for them
          return parsed.reply;
        }
        try {
          await draftHandler.finalizeDraftOrder(pageId, psid, d!, page);
          const orderReply = await this.botKnowledge.resolveSystemReply(pageId, 'order_received').catch(() => parsed.reply);
          await this.ctx.clearDraft(pageId, psid);
          await this.ctx.clearHistory(pageId, psid);
          return orderReply;
        } catch (err: any) {
          this.logger.error(`[SmartBot] finalizeDraftOrder failed: ${err?.message}`);
          return parsed.reply;
        }
      }

      case 'CANCEL_ORDER': {
        await this.ctx.clearDraft(pageId, psid);
        return parsed.reply;
      }

      case 'AGENT': {
        await this.ctx.setAgentHandling(pageId, psid, true);
        return parsed.reply;
      }

      default: // CHAT or COLLECT
        return parsed.reply;
    }
  }

  private buildCatalogUrl(page: any): string {
    const website = String(page.websiteUrl || '').trim();
    if (website) return website;
    const base = (process.env.CATALOG_BASE_URL || 'https://chatcat.pro').replace(/\/$/, '');
    const slug = page.catalogSlug || String(page.id);
    return `${base}/catalog/${slug}`;
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
      ? `\n\n## Business Knowledge\n${ctx.knowledgeText}`
      : '';

    // Catalog link
    const catalogUrl = this.buildCatalogUrl(page);
    const catalogCtx = `\n\n## Product Catalog Link\n${catalogUrl}\n(Customer ছবি/photo চাইলে বা সব product দেখতে চাইলে এই link দাও)`;

    // Current draft state — EXPLICITLY show collected vs missing
    let draftCtx = '\n\n## Current Order Draft\nকোনো active order নেই।';
    const stillNeeded: string[] = [];

    if (draft) {
      const items = draft.items.length > 0
        ? draft.items.map(i => `[${i.productCode}] x${i.qty} — ৳${i.unitPrice}`).join(', ')
        : null;

      const collected: string[] = [];
      if (items) collected.push(`✅ Products: ${items}`); else stillNeeded.push('product code');
      if (draft.customerName) collected.push(`✅ নাম: ${draft.customerName}`); else stillNeeded.push('নাম');
      if (draft.phone) collected.push(`✅ ফোন: ${draft.phone}`); else stillNeeded.push('ফোন নম্বর');
      if (draft.address) collected.push(`✅ ঠিকানা: ${draft.address}`); else stillNeeded.push('পূর্ণ ঠিকানা');
      if (this.requiresAdvancePayment(draft, page)) {
        if (draft.paymentProof) collected.push(`✅ Payment: ${draft.paymentProof}`);
        else stillNeeded.push('advance payment proof');
      }

      draftCtx = `\n\n## Current Order Draft (এখন পর্যন্ত collected)\n${collected.join('\n')}`;
      if (stillNeeded.length > 0) {
        draftCtx += `\n\n⚠️ এখনো পাওয়া যায়নি (ONLY এগুলো চাও): ${stillNeeded.join(', ')}`;
      } else {
        draftCtx += `\n\n✅ সব তথ্য আছে — customer confirm করলেই order হবে।`;
      }
    }

    // Task rules
    const taskRules = `\n\n## তোমার কাজ
Customer-এর message দেখে **strictly valid JSON** return করো:

{
  "reply": "<Bangla/Banglish natural reply>",
  "action": "<CHAT|COLLECT|CONFIRM_ORDER|CANCEL_ORDER|AGENT>",
  "collected": {
    "productCodes": [],
    "qty": {},
    "customerName": null,
    "phone": null,
    "address": null,
    "paymentProof": null
  }
}

### Action:
- CHAT — FAQ, product info, greetings
- COLLECT — customer নতুন order info দিয়েছে
- CONFIRM_ORDER — customer "হ্যাঁ/confirm/ঠিক আছে" বলেছে
- CANCEL_ORDER — customer "lagbe na/cancel/বাতিল" বলেছে
- AGENT — complaint/payment issue → human agent দরকার

### CRITICAL RULES:
1. "⚠️ এখনো পাওয়া যায়নি" list দেখো — শুধু সেই fields চাও। ✅ collected fields আর কখনো চাইবে না।
2. collected-এ শুধু এই message-এ নতুন পাওয়া তথ্য রাখো। আগে ✅ collected fields: null দাও।
3. Phone: 01XXXXXXXXX বা +8801XXXXXXXXX দুটোই valid — COLLECT করো।
4. Customer একসাথে নাম+ফোন+ঠিকানা দিলে সব একসাথে collect করো।
5. reply-এ order summary সহ confirm চাইতে পারো যখন সব ✅ হয়ে যায়।
6. **Photo/ছবি চাইলে**: "ছবি দেখতে এই link-এ যান 👉 ${catalogUrl}" — সরাসরি catalog link দাও।
7. **"ki ki ache / সব দেখাও / catalog" চাইলে**: product list briefly বলো তারপর catalog link দাও।`;

    return `তুমি ${shop}-এর Facebook Messenger AI sales assistant।${deliveryCtx}${paymentCtx}${productCtx}${knowledgeCtx}${catalogCtx}${draftCtx}${taskRules}`;
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
          temperature: 0.3,
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
          customerName: typeof c.customerName === 'string' && c.customerName.trim() ? c.customerName.trim() : null,
          phone: typeof c.phone === 'string' && c.phone.trim() ? c.phone.trim() : null,
          address: typeof c.address === 'string' && c.address.trim() ? c.address.trim() : null,
          paymentProof: typeof c.paymentProof === 'string' && c.paymentProof.trim() ? c.paymentProof.trim() : null,
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
    const hasNewInfo = !!(collected.customerName || collected.phone || collected.address || collected.paymentProof);

    // Always work with an existing or fresh draft if we have anything to do
    if (!hasNewProducts && !hasNewInfo && !draft) return null;

    let base: DraftSession = draft ?? this.ctx.emptyDraft();

    // CRM pre-fill only when starting a brand new draft with a product
    if (!draft && hasNewProducts) {
      try {
        const crm = await this.prisma.customer.findUnique({
          where: { pageId_psid: { pageId, psid } },
          select: { name: true, phone: true, address: true },
        });
        if (crm?.name) base.customerName = crm.name;
        if (crm?.phone) base.phone = crm.phone;
        if (crm?.address) base.address = crm.address;
      } catch { /* ignore */ }
    }

    // Merge products
    if (hasNewProducts) {
      const priceMap = new Map(ctx.products.map(p => [p.code, p.price]));
      for (const code of codes) {
        if (!priceMap.has(code)) continue;
        const qty = (collected.qty ?? {})[code] ?? 1;
        const existing = base.items.find(i => i.productCode === code);
        if (existing) existing.qty = qty;
        else base.items.push({ productCode: code, qty, unitPrice: priceMap.get(code) ?? 0 });
      }
    }

    // Merge contact info — never overwrite with null
    if (collected.customerName) base.customerName = collected.customerName;
    if (collected.phone) base.phone = collected.phone;
    if (collected.address) base.address = collected.address;
    if (collected.paymentProof) base.paymentProof = collected.paymentProof;

    // Determine currentStep based on what's still missing
    if (!base.customerName) base.currentStep = 'name';
    else if (!base.phone) base.currentStep = 'phone';
    else if (!base.address) base.currentStep = 'address';
    else if (this.requiresAdvancePayment(base, null) && !base.paymentProof) base.currentStep = 'advance_payment';
    else base.currentStep = 'confirm';

    // FIX: save whenever we have any collected info, not just when items exist
    const hasAnything = base.items.length > 0 || base.customerName || base.phone || base.address || base.paymentProof;
    if (hasAnything) {
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
