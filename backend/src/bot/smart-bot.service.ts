import { Injectable, Logger } from '@nestjs/common';
import {
  ConversationContextService,
  DraftSession,
} from '../conversation-context/conversation-context.service';
import { BotContextService, BusinessContext } from './bot-context.service';
import { BotKnowledgeService } from '../bot-knowledge/bot-knowledge.service';
import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiKeyRotatorService } from '../common/gemini-key-rotator.service';
import { AgentBehaviorConfig } from '../agents/agent-behavior-config.interface';
import { estimateMonthlyCost, PricingCalcInput } from '../common/pricing-estimator';

// Verbatim defaults — used whenever an agent type has no AgentBehaviorConfig
// personaPrompt/toneRules override, so agentType='commerce' pages (the vast
// majority today) see byte-identical prompts to before this config layer
// existed.
function defaultSmartBotIntro(shop: string): string {
  return `তুমি ${shop}-এর Facebook Messenger sales assistant — একজন real মানুষের মতো কথা বলো, robot-এর মতো না।`;
}
const DEFAULT_SMART_BOT_TONE_BLOCK = `

## কথা বলার ধরন (CRITICAL)
- ছোট, সহজ বাক্য। একটা কাজ একবারে।
- Emoji পরিমিত (প্রতি reply-এ ১-২টা যথেষ্ট, সব লাইনে না)।
- "ধন্যবাদ আপনার আগ্রহের জন্য! আমরা আপনার অর্ডার..." — এই ধরনের corporate ভাষা একদম বন্ধ।
- বাংলা/Banglish — customer যেভাবে লেখে সেভাবে reply করো।
- নাম জানলে নাম ধরে ডাকো।
- "আপনার ফোন নম্বরটি উল্লেখ করলে আমরা আপনার জন্য অর্ডার প্রসেস করতে পারব" — এই ধরনের লম্বা বাক্য নয়। সরাসরি বলো: "ফোন নম্বরটা দিন 😊"

⛔ HARD BAN: "আমাদের সাথে যোগাযোগ করুন" / "আরও জানতে যোগাযোগ করুন" — কখনো না।
⛔ HARD BAN: একই কথা দুইবার বলা, unnecessary ব্যাখ্যা, filler বাক্য।`;

export interface IDraftOrderHandler {
  finalizeDraftOrder(
    pageId: number,
    psid: string,
    draft: DraftSession,
    page: any,
  ): Promise<number>;
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
  action: 'CHAT' | 'COLLECT' | 'CONFIRM_ORDER' | 'CANCEL_ORDER' | 'AGENT' | 'CAPTURE_LEAD' | 'CONFIRM_LEAD';
  collected: SmartBotCollected;
  calculatePricing: PricingCalcInput | null;
}

const VALID_ACTIONS = new Set([
  'CHAT',
  'COLLECT',
  'CONFIRM_ORDER',
  'CANCEL_ORDER',
  'AGENT',
  'CAPTURE_LEAD',
  'CONFIRM_LEAD',
]);

@Injectable()
export class SmartBotService {
  private readonly logger = new Logger(SmartBotService.name);
  private readonly openAiKey: string;
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
    private readonly geminiRotator: GeminiKeyRotatorService,
  ) {
    this.openAiKey = process.env.OPENAI_API_KEY ?? '';
    this.model = process.env.AI_INTENT_MODEL ?? 'gemini-2.0-flash';
  }

  isAvailable(): boolean {
    return (this.geminiRotator.isAvailable() || !!this.openAiKey) && Date.now() > this.cooldownUntil;
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

    const lastOrder = await this.prisma.order.findFirst({
      where: { pageIdRef: pageId, customerPsid: psid },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        createdAt: true,
        address: true,
        items: { select: { productCode: true, qty: true } },
      },
    });

    // If customer sent a specific Order ID (e.g. "#1234" or "1234"), look it up
    let orderById: any = null;
    const orderIdMatch = text.match(/^#?(\d{1,6})\s*$/) || text.match(/অর্ডার\s*#?(\d{1,6})/i);
    if (orderIdMatch) {
      orderById = await this.prisma.order.findFirst({
        where: { id: parseInt(orderIdMatch[1]), pageIdRef: pageId },
        select: {
          id: true,
          status: true,
          createdAt: true,
          items: { select: { productCode: true, qty: true } },
        },
      });
    }

    const agentBehavior = await this.botKnowledge
      .getAgentBehavior(page.agentType || 'commerce')
      .catch(() => ({}) as AgentBehaviorConfig);

    const systemPrompt = this.buildSystemPrompt(
      businessContext,
      draft,
      page,
      lastOrder,
      orderById,
      orderIdMatch ? parseInt(orderIdMatch[1]) : null,
      agentBehavior,
    );
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
    await this.walletService.deductUsage(pageId, 'SMART_BOT', { provider: 'openai' });

    // Real arithmetic, not LLM-guessed — model only signals it has gathered
    // enough volume info; the actual numbers always come from our own code.
    if (parsed.calculatePricing) {
      parsed.reply = `${parsed.reply}\n\n${estimateMonthlyCost(parsed.calculatePricing)}`;
    }

    this.logger.log(
      `[SmartBot] action=${parsed.action} reply="${parsed.reply.slice(0, 60)}"`,
    );

    // Merge collected fields into draft and persist
    const updatedDraft = await this.mergeAndSave(
      pageId,
      psid,
      draft,
      parsed.collected,
      businessContext,
    );

    // Execute side-effects (state changes), return reply string to caller for sending
    switch (parsed.action) {
      case 'CONFIRM_ORDER': {
        const d = updatedDraft;
        const canFinalize =
          d &&
          d.items.length > 0 &&
          d.customerName &&
          d.phone &&
          d.address &&
          (!this.requiresAdvancePayment(d, page) || d.paymentProof);

        if (!canFinalize) {
          // Fields still missing — AI reply already asks for them
          return parsed.reply;
        }
        try {
          await draftHandler.finalizeDraftOrder(pageId, psid, d, page);
          const orderReply = await this.botKnowledge
            .resolveSystemReply(pageId, 'order_received')
            .catch(() => parsed.reply);
          await this.ctx.clearDraft(pageId, psid);
          await this.ctx.clearHistory(pageId, psid);
          return orderReply;
        } catch (err: any) {
          this.logger.error(
            `[SmartBot] finalizeDraftOrder failed: ${err?.message}`,
          );
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

      case 'CAPTURE_LEAD': {
        // Start or continue lead collection — just need name + whatsapp phone
        let leadDraft = updatedDraft;
        if (!leadDraft) {
          leadDraft = this.ctx.emptyDraft('FACEBOOK');
          leadDraft.isLead = true;
          leadDraft.items = [];
        }
        leadDraft.isLead = true;
        if (parsed.collected.customerName) leadDraft.customerName = parsed.collected.customerName;
        if (parsed.collected.phone) {
          leadDraft.phone = parsed.collected.phone;
          leadDraft.whatsappNumber = parsed.collected.phone;
        }
        await this.ctx.saveDraft(pageId, psid, leadDraft);
        return parsed.reply;
      }

      case 'CONFIRM_LEAD': {
        const ld = updatedDraft;
        if (!ld || !ld.customerName || !ld.phone) {
          return parsed.reply; // Still collecting
        }
        try {
          await draftHandler.finalizeDraftOrder(pageId, psid, { ...ld, isLead: true }, page);
          await this.ctx.clearDraft(pageId, psid);
          await this.ctx.clearHistory(pageId, psid);
        } catch (err: any) {
          this.logger.error(`[SmartBot] finalizeLead failed: ${err?.message}`);
        }
        return parsed.reply;
      }

      default: // CHAT or COLLECT
        return parsed.reply;
    }
  }

  private buildCatalogUrl(page: any): string {
    const website = String(page.websiteUrl || '').trim();
    if (website) return website;
    const base = (
      process.env.CATALOG_BASE_URL || 'https://chatcat.pro'
    ).replace(/\/$/, '');
    const slug = page.catalogSlug || String(page.id);
    return `${base}/catalog/${slug}`;
  }

  private buildSystemPrompt(
    ctx: BusinessContext,
    draft: DraftSession | null,
    page: any,
    lastOrder?: any,
    orderById?: any,
    queriedOrderId?: number | null,
    agentBehavior: AgentBehaviorConfig = {},
  ): string {
    const shop = ctx.businessName
      ? `"${ctx.businessName}" নামের Bangladeshi e-commerce shop`
      : 'একটি Bangladeshi fashion e-commerce shop';

    // Product catalog — split coded vs simple
    const codedProducts = ctx.products.filter((p) => (p as any).productType !== 'SIMPLE');
    const simpleProducts = ctx.products.filter((p) => (p as any).productType === 'SIMPLE');

    const codedLines = codedProducts
      .slice(0, 30)
      .map(
        (p) =>
          `[${p.code}] ${p.name ?? p.code} — ৳${p.price} | ${p.stockQty > 0 ? `${p.stockQty} পিস আছে` : 'Stock শেষ'}`,
      )
      .join('\n');

    const simpleLines = simpleProducts
      .map((p) => {
        const unit = (p as any).unit || 'pcs';
        const stock = p.stockQty > 0 ? `${p.stockQty} ${unit} আছে` : 'Stock শেষ';
        return `${p.name ?? p.code} — ৳${p.price}/${unit} | ${stock}`;
      })
      .join('\n');

    const productCtx =
      ctx.products.length > 0
        ? `\n\n## Product Catalog\n${codedLines}${simpleLines ? `\n\n### Simple Items\n${simpleLines}` : ''}`
        : '\n\n## Product Catalog\n(কোনো product নেই)';

    // Delivery & payment
    const deliveryCtx = `\n\n## Delivery & Payment
- ঢাকার ভিতরে delivery fee: ৳${ctx.deliveryInsideFee}${ctx.deliveryTimeInside ? ` | সময়: ${ctx.deliveryTimeInside}` : ''}
- ঢাকার বাইরে delivery fee: ৳${ctx.deliveryOutsideFee}${ctx.deliveryTimeOutside ? ` | সময়: ${ctx.deliveryTimeOutside}` : ''}
- Delivery সময়: ${ctx.deliveryTime || (ctx.deliveryTimeInside || ctx.deliveryTimeOutside ? 'zone দেখো' : '(সেট করা নেই)')}

⚠️ Customer-এর address দেখে zone বুঝো: ঢাকার ভেতরে হলে inside row, বাইরে হলে outside row এর সময় বলো।`;

    const paymentRules = ctx.paymentRules as any;
    let paymentCtx = '';
    if (paymentRules) {
      const codLine =
        paymentRules.codEnabled !== false
          ? '✅ Cash on Delivery আছে'
          : '❌ COD নেই';
      const insideAdv = paymentRules.insideDhakaAdvanceEnabled
        ? `⚠️ ঢাকার ভিতরে: Advance payment লাগবে ৳${paymentRules.insideDhakaAdvanceAmount ?? 100}`
        : '✅ ঢাকার ভিতরে: Cash on Delivery (advance লাগে না)';
      const outsideAdv = paymentRules.outsideDhakaAdvanceEnabled
        ? `⚠️ ঢাকার বাইরে: Advance payment লাগবে ৳${paymentRules.outsideDhakaAdvanceAmount ?? 100}`
        : '✅ ঢাকার বাইরে: Cash on Delivery (advance লাগে না)';
      const bkash = page.advanceBkash ? `Bkash: ${page.advanceBkash}` : '';
      const nagad = page.advanceNagad ? `Nagad: ${page.advanceNagad}` : '';
      paymentCtx = `\n${[codLine, insideAdv, outsideAdv, bkash, nagad].filter(Boolean).join('\n')}`;
    }

    // Business knowledge
    const knowledgeCtx = ctx.knowledgeText
      ? `\n\n## Business Knowledge\n${ctx.knowledgeText}`
      : '';

    const pricingCtx = ctx.pricingInfo
      ? `\n\n## Service Pricing (Auto-Updated)\n${ctx.pricingInfo}`
      : '';

    // Catalog link
    const catalogUrl = this.buildCatalogUrl(page);
    const catalogCtx = `\n\n## Product Catalog Link\n${catalogUrl}\n(Customer ছবি/photo চাইলে বা সব product দেখতে চাইলে এই link দাও)`;

    // Current draft state — EXPLICITLY show collected vs missing
    let draftCtx = '\n\n## Current Order Draft\nকোনো active order নেই।';
    const stillNeeded: string[] = [];

    if (draft) {
      // Lead mode — only name + WhatsApp needed
      if ((draft as any).isLead) {
        const collected: string[] = [];
        if (draft.customerName) collected.push(`✅ নাম: ${draft.customerName}`);
        else stillNeeded.push('নাম');
        if (draft.phone) collected.push(`✅ WhatsApp: ${draft.phone}`);
        else stillNeeded.push('WhatsApp নম্বর');

        draftCtx = `\n\n## Current Lead Draft (Trial/Setup Inquiry)\n${collected.join('\n')}`;
        if (stillNeeded.length > 0) {
          draftCtx += `\n\n⚠️ এখনো পাওয়া যায়নি (ONLY এগুলো চাও): ${stillNeeded.join(', ')}`;
        } else {
          draftCtx += `\n\n✅ সব তথ্য আছে — CONFIRM_LEAD action দাও এবং বলো "আমাদের প্রতিনিধি আপনাকে call করবেন"।`;
        }
      } else {
        const items =
          draft.items.length > 0
            ? draft.items
                .map((i) => `[${i.productCode}] x${i.qty} — ৳${i.unitPrice}`)
                .join(', ')
            : null;

        const collected: string[] = [];
        if (items) collected.push(`✅ Products: ${items}`);
        else stillNeeded.push('product code');
        if (draft.customerName) collected.push(`✅ নাম: ${draft.customerName}`);
        else stillNeeded.push('নাম');
        if (draft.phone) collected.push(`✅ ফোন: ${draft.phone}`);
        else stillNeeded.push('ফোন নম্বর');
        if (draft.address) collected.push(`✅ ঠিকানা: ${draft.address}`);
        else stillNeeded.push('পূর্ণ ঠিকানা');
        if (this.requiresAdvancePayment(draft, page)) {
          if (draft.paymentProof)
            collected.push(`✅ Payment: ${draft.paymentProof}`);
          else stillNeeded.push('advance payment proof');
        }

        draftCtx = `\n\n## Current Order Draft (এখন পর্যন্ত collected)\n${collected.join('\n')}`;
        if (stillNeeded.length > 0) {
          draftCtx += `\n\n⚠️ এখনো পাওয়া যায়নি (ONLY এগুলো চাও): ${stillNeeded.join(', ')}`;
        } else {
          draftCtx += `\n\n✅ সব তথ্য আছে — customer confirm করলেই order হবে।`;
        }
      }
    }

    // Last placed order tracking context
    let orderTrackCtx = '';
    if (lastOrder) {
      const statusMap: Record<string, string> = {
        RECEIVED: '✅ অর্ডার পাওয়া হয়েছে — প্রক্রিয়া চলছে',
        CONFIRMED: '✅ অর্ডার কনফার্ম হয়েছে — প্রস্তুত হচ্ছে',
        PACKED: '📦 অর্ডার প্যাক হয়ে গেছে — শীঘ্রই কুরিয়ারে যাবে',
        SHIPPED: '🚚 কুরিয়ারে পাঠানো হয়েছে — পথে আছে',
        DELIVERED: '✅ ডেলিভারি সম্পন্ন হয়েছে',
        CANCELLED: '❌ অর্ডারটি বাতিল হয়েছে',
      };
      const statusBn = statusMap[lastOrder.status] ?? lastOrder.status;
      const products = lastOrder.items
        .map((i: any) => `${i.productCode} x${i.qty}`)
        .join(', ');
      const date = new Date(lastOrder.createdAt).toLocaleDateString('bn-BD');
      orderTrackCtx = `\n\n## Customer-এর সর্বশেষ Order (DB থেকে)\nOrder #${lastOrder.id} — ${date}\nProducts: ${products || '?'}\nStatus: **${statusBn}**\n\n⚠️ Customer "কবে পাবো / কোথায় আছে / status / order কী হলো / cancel হয়েছে" ইত্যাদি জিজ্ঞেস করলে এই DB status দেখে CHAT action দিয়ে reply করো। অনুমান করবে না।`;
    }

    // Specific Order ID lookup context
    let orderByIdCtx = '';
    if (orderById) {
      const smMap: Record<string, string> = {
        RECEIVED: '✅ অর্ডার পাওয়া হয়েছে — প্রক্রিয়া চলছে',
        CONFIRMED: '✅ অর্ডার কনফার্ম হয়েছে — প্রস্তুত হচ্ছে',
        PACKED: '📦 অর্ডার প্যাক হয়ে গেছে — শীঘ্রই কুরিয়ারে যাবে',
        SHIPPED: '🚚 কুরিয়ারে পাঠানো হয়েছে — পথে আছে',
        DELIVERED: '🎉 ডেলিভারি সম্পন্ন হয়েছে',
        CANCELLED: '❌ অর্ডারটি বাতিল হয়েছে',
        ISSUE: '⚠️ অর্ডারে সমস্যা আছে',
      };
      const snBn = smMap[orderById.status] ?? orderById.status;
      const snProds = orderById.items.map((i: any) => `${i.productCode} x${i.qty}`).join(', ');
      const snDate = new Date(orderById.createdAt).toLocaleDateString('bn-BD');
      orderByIdCtx = `\n\n## Order ID দিয়ে খোঁজা Order (DB থেকে)\nOrder #${orderById.id} — ${snDate}\nProducts: ${snProds || '?'}\nStatus: **${snBn}**\n\n⚠️ Customer এই specific Order ID টি পাঠিয়েছে। উপরের status দেখে CHAT action দিয়ে reply করো।`;
    } else if (queriedOrderId) {
      orderByIdCtx = `\n\n## Order ID খোঁজার ফলাফল\nএই page-এ Order #${queriedOrderId} পাওয়া যায়নি। Customer-কে জানাও।`;
    }


    // Task rules
    const taskRules = `\n\n## তোমার কাজ
Customer-এর message দেখে **strictly valid JSON** return করো:

{
  "reply": "<Bangla/Banglish natural reply>",
  "action": "<CHAT|COLLECT|CONFIRM_ORDER|CANCEL_ORDER|AGENT|CAPTURE_LEAD|CONFIRM_LEAD>",
  "collected": {
    "productCodes": [],
    "qty": {},
    "customerName": null,
    "phone": null,
    "address": null,
    "paymentProof": null
  },
  "calculatePricing": null
}

### calculatePricing (optional — only if Business Knowledge instructs a pricing/volume calculation):
- Leave null unless the Business Knowledge section explicitly tells you to ask for message volume and calculate cost.
- Once you have all three numbers from the customer, set: { "customersPerDay": number, "msgsPerCustomer": number, "imagesPerCustomer": number }. When you set this field, keep "reply" to a short one-line lead-in only (e.g. "ধন্যবাদ! আপনার হিসাব রেডি —") — don't write your own numbers or assumptions, the exact ৳ estimate is computed by our system and appended separately.

### Action:
- CHAT — FAQ, product info, greetings
- COLLECT — customer নতুন order info দিয়েছে
- CONFIRM_ORDER — customer "হ্যাঁ/confirm/ঠিক আছে" বলেছে
- CANCEL_ORDER — customer "lagbe na/cancel/বাতিল" বলেছে
- AGENT — complaint/payment issue → human agent দরকার
- CAPTURE_LEAD — customer free trial / service নিতে আগ্রহী → নাম + WhatsApp নম্বর collect করো
- CONFIRM_LEAD — নাম ও WhatsApp দুটোই পাওয়া গেছে → বলো "আমাদের প্রতিনিধি শীঘ্রই আপনাকে WhatsApp-এ call করবেন 🎉"

### CRITICAL RULES:
1. "⚠️ এখনো পাওয়া যায়নি" list দেখো — শুধু সেই fields চাও। ✅ collected fields আর কখনো চাইবে না।
2. collected-এ শুধু এই message-এ নতুন পাওয়া তথ্য রাখো। আগে ✅ collected fields: null দাও।
3. Phone: 01XXXXXXXXX বা +8801XXXXXXXXX দুটোই valid — COLLECT করো।
4. Customer একসাথে নাম+ফোন+ঠিকানা দিলে সব একসাথে collect করো।
5. reply-এ order summary সহ confirm চাইতে পারো যখন সব ✅ হয়ে যায়।
6. **Photo/ছবি চাইলে**: "ছবি দেখতে এই link-এ যান 👉 ${catalogUrl}" — সরাসরি catalog link দাও।
7. **"ki ki ache / সব দেখাও / catalog" চাইলে**: product list briefly বলো তারপর catalog link দাও।
8. **Advance payment**: Customer-এর ঠিকানা দেখে ঢাকার ভিতরে/বাইরে বুঝো, তারপর সেই zone-এর payment rule দেখো। ঢাকার ভিতরে COD হলে advance চাইবে না। Order confirm করার আগে আগে ঠিকানা collect করো।
9. **Order already confirmed**: যদি draft আগেই confirm হয়ে গিয়ে থাকে এবং customer "ok/ধন্যবাদ/received" বলে, তাহলে CHAT action দিয়ে সাধারণ reply করো — আর order confirm করো না।
10. **Delivery সময় ও fee**: Customer "কবে পাবো / delivery কতদিন / কত তাড়াতাড়ি / koto din" জিজ্ঞেস করলে **শুধু** "Delivery সময়:" লাইন দেখো — সেটা যদি ফাঁকা হয়, বলো "আমাদের সাথে সরাসরি জানতে চাইলে এখানে message করুন, টিম জানিয়ে দেবে 😊"। কখনো delivery FEE (৳80/৳120) দিয়ে delivery TIME-এর প্রশ্নের উত্তর দেবে না। Fee শুধু তখন বলবে যখন customer সরাসরি "delivery charge কত / কত টাকা লাগবে" জিজ্ঞেস করে।
11. **Order status**: Customer "কবে পাবো / parsel kobe pabo / order কোথায় / status কী / কি হলো" জিজ্ঞেস করলে "## Customer-এর সর্বশেষ Order (DB থেকে)" section দেখো এবং নিচের নিয়মে reply করো:
- RECEIVED → "আপনার অর্ডার পাওয়া গেছে, প্রসেস হচ্ছে 📝"
- CONFIRMED → "অর্ডার কনফার্ম হয়েছে, প্যাক করা হবে শীঘ্রই ✅"
- PACKED → "আপনার পণ্য প্যাক করা হয়েছে 📦, কুরিয়ারে দেওয়া হবে শীঘ্রই"
- SHIPPED → "আপনার পণ্য কুরিয়ারে দেওয়া হয়েছে 🚚, রাস্তায় আছে"
- DELIVERED → "আপনার পণ্য ডেলিভারি হয়ে গেছে ✅"
- CANCELLED → "দুঃখিত, অর্ডারটি বাতিল হয়েছে ❌"
status reply-এর পরে, যদি "Delivery সময়:" সেটিং ফাঁকা না হয়, তাহলে সেটা যোগ করো: "সাধারণত [Delivery সময় value] এর মধ্যে পৌঁছে যায়।" — DB status না থাকলে বলো "এই moment এ আপনার কোনো active order পাচ্ছি না।"
12. **Lead capture**: Customer "trial নিতে চাই / setup করতে চাই / দাম কত / কীভাবে শুরু করব / interested / example দাও / demo দেখাও / কীভাবে কাজ করে / ki ki korte paro / example daw / demo দাও / বুঝিয়ে দাও / শুরু করতে চাই" ইত্যাদি বললে CAPTURE_LEAD action দাও। শুধু নাম এবং WhatsApp নম্বর collect করো — address বা product code চাইবে না।
13. **Lead confirm**: Lead draft এ নাম ও WhatsApp দুটোই ✅ হলে CONFIRM_LEAD action দাও এবং বলো "আমাদের প্রতিনিধি শীঘ্রই আপনার WhatsApp-এ যোগাযোগ করবেন। ধন্যবাদ! 🎉"
14. **"কীভাবে যোগাযোগ করব?" / "Kmne jogajog korbo?"**: Customer ইতিমধ্যে এই page-এ message করেই যোগাযোগ করছে। বলো: "এই page-এ message করেই কথা বলতে পারেন, আমরা সবসময় reply দিচ্ছি 😊 কোনো প্রশ্ন থাকলে বলুন।"
15. **Short replies ("Na", "Aca", "Ok", "Hmm")**: Context বুঝে natural reply করো। কোনো active draft না থাকলে এবং customer শুধু acknowledge করছে — CHAT action দিয়ে simple friendly reply করো। কখনো "আমাদের সাথে যোগাযোগ করুন" বলবে না — customer ইতিমধ্যে message করছেই।`;

    const customPersona = String(page?.customPersonaPrompt || '').trim();
    const intro = customPersona
      ? customPersona.replace(/\{\{\s*shop\s*\}\}/g, shop)
      : agentBehavior.personaPrompt
        ? agentBehavior.personaPrompt.replace(/\{\{\s*shop\s*\}\}/g, shop)
        : defaultSmartBotIntro(shop);
    const toneBlock = agentBehavior.toneRules
      ? `\n\n${agentBehavior.toneRules}`
      : DEFAULT_SMART_BOT_TONE_BLOCK;

    return `${intro}${toneBlock}
${deliveryCtx}${paymentCtx}${productCtx}${knowledgeCtx}${pricingCtx}${catalogCtx}${draftCtx}${orderTrackCtx}${orderByIdCtx}${taskRules}`;
  }

  private async callOpenAI(
    messages: { role: string; content: string }[],
  ): Promise<string | null> {
    // Try Gemini keys in rotation until one works or all exhausted
    while (this.geminiRotator.isAvailable()) {
      const key = this.geminiRotator.getKey();
      if (!key) break;
      const result = await this.callGeminiWithKey(key, messages);
      if (
        result === 'QUOTA_EXCEEDED' ||
        result === 'SERVER_ERROR' ||
        result === 'DISABLED' ||
        result === null
      ) {
        continue; // try next key
      }
      return result;
    }
    // All Gemini keys exhausted — fall back to OpenAI
    if (this.openAiKey) {
      this.logger.warn('[SmartBot] All Gemini keys exhausted — falling back to OpenAI');
      return this.callOpenAIApi(messages);
    }
    this.enterCooldown();
    return null;
  }

  private async callGeminiWithKey(
    geminiKey: string,
    messages: { role: string; content: string }[],
  ): Promise<string | null | 'QUOTA_EXCEEDED' | 'SERVER_ERROR' | 'DISABLED'> {
    const start = Date.now();
    try {
      const systemMsg = messages.find((m) => m.role === 'system');
      const rest = messages.filter((m) => m.role !== 'system');

      const contents = rest.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const body: any = {
        contents,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 500,
          responseMimeType: 'application/json',
        },
      };
      if (systemMsg) {
        body.systemInstruction = { parts: [{ text: systemMsg.content }] };
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${geminiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });

      const latency = Date.now() - start;

      if (res.status === 429 || res.status === 402) {
        this.logger.warn(`[SmartBot] Gemini key ...${geminiKey.slice(-6)} quota/limit (${res.status})`);
        this.geminiRotator.markError(geminiKey, res.status);
        return 'QUOTA_EXCEEDED';
      }
      if (res.status === 500 || res.status === 503 || res.status === 504) {
        this.logger.warn(`[SmartBot] Gemini key ...${geminiKey.slice(-6)} server error (${res.status})`);
        this.geminiRotator.markError(geminiKey, res.status);
        return 'SERVER_ERROR';
      }
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        const errText = await res.text();
        this.logger.error(`[SmartBot] Gemini key ...${geminiKey.slice(-6)} invalid/permission error (${res.status}): ${errText}`);
        this.geminiRotator.markError(geminiKey, res.status, errText);
        return 'DISABLED';
      }
      if (!res.ok) {
        const errText = await res.text();
        this.logger.error(`[SmartBot] Gemini error ${res.status}: ${errText.slice(0, 200)}`);
        this.geminiRotator.markError(geminiKey, res.status, errText);
        this.recordFailure();
        return null;
      }

      const data = await res.json();
      this.geminiRotator.markSuccess(geminiKey, latency);
      return (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim() || null;
    } catch (err: any) {
      this.logger.warn(`[SmartBot] Gemini network error: ${err?.message ?? err}`);
      this.geminiRotator.markError(geminiKey, 500, err?.message ?? String(err));
      this.recordFailure();
      return null;
    }
  }

  private async callOpenAIApi(
    messages: { role: string; content: string }[],
  ): Promise<string | null> {
    try {
      const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openAiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
          max_tokens: 500,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (res.status === 429 || res.status === 402) {
        this.logger.warn(`[SmartBot] OpenAI quota/limit (${res.status})`);
        this.enterCooldown();
        return null;
      }
      if (!res.ok) {
        const errText = await res.text();
        this.logger.error(`[SmartBot] OpenAI error ${res.status}: ${errText.slice(0, 200)}`);
        this.recordFailure();
        return null;
      }

      const data = await res.json();
      this.logger.log('[SmartBot] OpenAI fallback used successfully');
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
      const action = String(parsed?.action ?? '')
        .toUpperCase()
        .trim();
      if (!reply || !VALID_ACTIONS.has(action)) {
        this.logger.warn(
          `[SmartBot] Invalid response: action="${action}" reply="${reply.slice(0, 60)}"`,
        );
        return null;
      }
      const c = parsed?.collected ?? {};
      const cp = parsed?.calculatePricing;
      const calculatePricing: PricingCalcInput | null =
        cp &&
        typeof cp === 'object' &&
        Number(cp.customersPerDay) > 0 &&
        Number(cp.msgsPerCustomer) > 0 &&
        Number(cp.imagesPerCustomer) >= 0
          ? {
              customersPerDay: Number(cp.customersPerDay),
              msgsPerCustomer: Number(cp.msgsPerCustomer),
              imagesPerCustomer: Number(cp.imagesPerCustomer),
            }
          : null;
      return {
        reply,
        action: action as SmartBotResponse['action'],
        calculatePricing,
        collected: {
          productCodes: Array.isArray(c.productCodes)
            ? c.productCodes.filter((x: any) => typeof x === 'string')
            : [],
          qty: c.qty && typeof c.qty === 'object' ? c.qty : {},
          customerName:
            typeof c.customerName === 'string' && c.customerName.trim()
              ? c.customerName.trim()
              : null,
          phone:
            typeof c.phone === 'string' && c.phone.trim()
              ? c.phone.trim()
              : null,
          address:
            typeof c.address === 'string' && c.address.trim()
              ? c.address.trim()
              : null,
          paymentProof:
            typeof c.paymentProof === 'string' && c.paymentProof.trim()
              ? c.paymentProof.trim()
              : null,
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
    const hasNewInfo = !!(
      collected.customerName ||
      collected.phone ||
      collected.address ||
      collected.paymentProof
    );

    // Always work with an existing or fresh draft if we have anything to do
    if (!hasNewProducts && !hasNewInfo && !draft) return null;

    const base: DraftSession = draft ?? this.ctx.emptyDraft();

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
      } catch {
        /* ignore */
      }
    }

    // Merge products
    if (hasNewProducts) {
      const priceMap = new Map(ctx.products.map((p) => [p.code, p.price]));
      for (const code of codes) {
        if (!priceMap.has(code)) continue;
        const qty = (collected.qty ?? {})[code] ?? 1;
        const existing = base.items.find((i) => i.productCode === code);
        if (existing) existing.qty = qty;
        else
          base.items.push({
            productCode: code,
            qty,
            unitPrice: priceMap.get(code) ?? 0,
          });
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
    else if (this.requiresAdvancePayment(base, null) && !base.paymentProof)
      base.currentStep = 'advance_payment';
    else base.currentStep = 'confirm';

    // FIX: save whenever we have any collected info, not just when items exist
    const hasAnything =
      base.items.length > 0 ||
      base.customerName ||
      base.phone ||
      base.address ||
      base.paymentProof;
    if (hasAnything) {
      await this.ctx.saveDraft(pageId, psid, base);
      return base;
    }
    return null;
  }

  requiresAdvancePayment(draft: DraftSession, page: any): boolean {
    if (!page) return false;
    const paymentRules = page.paymentRules;
    if (paymentRules) {
      const addr = (draft?.address || '').toLowerCase();
      const insideDhaka =
        /dhaka|ঢাকা|mirpur|gulshan|dhanmondi|uttara|mohammadpur|badda|rampura|khilgaon|motijheel|pallabi|shyamoli|banani|bashundhara/.test(
          addr,
        );
      if (insideDhaka) return !!paymentRules.insideDhakaAdvanceEnabled;
      if (addr) return !!paymentRules.outsideDhakaAdvanceEnabled;
      // address unknown: require advance if either zone needs it
      return !!(
        paymentRules.insideDhakaAdvanceEnabled ||
        paymentRules.outsideDhakaAdvanceEnabled
      );
    }
    const paymentMode = (page.paymentMode as string) || 'cod';
    if (paymentMode === 'full_advance') return true;
    if (paymentMode === 'advance_outside') {
      // Only outside-Dhaka orders need advance in this mode
      const addr = (draft?.address || '').toLowerCase();
      if (!addr) return true;
      const insideDhaka =
        /dhaka|ঢাকা|mirpur|gulshan|dhanmondi|uttara|mohammadpur|badda|rampura|khilgaon|motijheel|pallabi|shyamoli|banani|bashundhara/.test(
          addr,
        );
      return !insideDhaka;
    }
    return false;
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
