import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MessengerService } from '../messenger/messenger.service';
import { MessageQueueService } from '../message-queue/message-queue.service';
import { BotIntentService } from '../bot/bot-intent.service';
import {
  ConversationContextService,
  CustomFieldDef,
} from '../conversation-context/conversation-context.service';
import { DraftOrderHandler } from './handlers/draft-order.handler';
import { CrmService } from '../crm/crm.service';
import { WalletService } from '../wallet/wallet.service';
import { ReplyTrackingService } from '../agents/reply-tracking.service';
import { BotAgentRegistry } from '../agents/bot-agent.registry';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  // Debounce postback ORDER clicks — prevents double-click duplicate
  private readonly recentPostbacks = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly messenger: MessengerService,
    private readonly messageQueue: MessageQueueService,
    private readonly botIntent: BotIntentService,
    private readonly ctx: ConversationContextService,
    private readonly draftHandler: DraftOrderHandler,
    private readonly crm: CrmService,
    private readonly walletService: WalletService,
    private readonly replyTracking: ReplyTrackingService,
    private readonly botAgentRegistry: BotAgentRegistry,
  ) {}

  // ── Entry point ────────────────────────────────────────────────────────────

  async handle(body: any): Promise<void> {
    if (!body || body.object !== 'page') return;

    for (const entry of body.entry ?? []) {
      const rows = await this.prisma.$queryRaw<any[]>`
        SELECT p.* FROM "Page" p
        LEFT JOIN "User" u ON u.id = p."ownerId"
        WHERE p."pageId" = ${String(entry.id)}
          AND p."isActive" = true
          AND (u.id IS NULL OR u."isActive" = true)
        LIMIT 1
      `;
      const page = rows[0] ?? null;

      if (!page) {
        this.logger.warn(
          `[Webhook] Entry id=${entry.id} — no active page found (or owner account disabled)`,
        );
        continue;
      }
      if (!page.pageToken) {
        this.logger.warn(
          `[Webhook] Page ${page.pageId} (db id=${page.id}) has no pageToken — skipping`,
        );
        continue;
      }

      // ── Subscription gate ────────────────────────────────────────────────
      if (page.subscriptionStatus === 'SUSPENDED') {
        this.logger.log(
          `[Webhook] Page ${page.pageId} subscription SUSPENDED — skipping`,
        );
        continue;
      }
      if (page.nextBillingDate && new Date(page.nextBillingDate) < new Date()) {
        this.logger.log(
          `[Webhook] Page ${page.pageId} subscription expired (${page.nextBillingDate}) — suspending`,
        );
        await this.prisma.page.update({
          where: { id: page.id },
          data: { subscriptionStatus: 'SUSPENDED' },
        });
        continue;
      }

      // Linked page: inherit settings from master, keep own credentials + id
      let resolvedPage = page;
      if (page.masterPageId) {
        const masterRows = await this.prisma.$queryRaw<any[]>`
          SELECT * FROM "Page" WHERE "id" = ${Number(page.masterPageId)} LIMIT 1
        `;
        if (masterRows[0]) {
          resolvedPage = {
            ...masterRows[0],
            // Preserve linked page identity (id used for orders/sessions, pageId/token for FB API)
            id: page.id,
            ownerId: page.ownerId,
            pageId: page.pageId,
            pageName: page.pageName,
            pageToken: page.pageToken,
            verifyToken: page.verifyToken,
            masterPageId: page.masterPageId,
            // Preserve this page's own mode flags so university pages linked to commerce masters still work
            universityModeOn: page.universityModeOn,
            automationOn: page.automationOn ?? masterRows[0].automationOn,
          };
        }
      }

      for (const event of entry.messaging ?? []) {
        // Echo: message sent BY the page itself (agent manual reply)
        if (event.message?.is_echo) {
          const customerPsid: string = event?.recipient?.id;
          if (customerPsid) {
            this.handleAgentEcho(resolvedPage, customerPsid).catch(() => {});
          }
          continue;
        }

        const psid: string = event?.sender?.id;
        if (!psid || event.delivery || event.read) continue;

        // V21: m.me catalog referral — ORDER_PRODUCTCODE ref triggers auto order flow
        if (event.referral?.ref || event.postback?.referral?.ref) {
          const ref: string =
            event.referral?.ref ?? event.postback?.referral?.ref ?? '';
          if (ref.startsWith('ORDER_')) {
            const productCode = ref.slice(6).toUpperCase();
            this.handleCatalogReferral(resolvedPage, psid, productCode).catch(
              () => {},
            );
          }
          if (!event.message) continue;
        }

        // Card view "Order করব" postback — payload: ORDER_<code>
        if (event.postback?.payload && !event.message) {
          const payload: string = String(event.postback.payload);
          if (payload.startsWith('ORDER_')) {
            const productCode = payload.slice(6).toUpperCase();
            // Debounce: ignore duplicate postback within 5 seconds (double-click)
            const debounceKey = `${psid}:${payload}`;
            const lastAt = this.recentPostbacks.get(debounceKey) ?? 0;
            const now = Date.now();
            if (now - lastAt < 5000) {
              continue; // duplicate click, skip
            }
            this.recentPostbacks.set(debounceKey, now);
            // Clean up old entries to prevent memory leak
            if (this.recentPostbacks.size > 1000) {
              const cutoff = now - 10000;
              for (const [k, t] of this.recentPostbacks) {
                if (t < cutoff) this.recentPostbacks.delete(k);
              }
            }
            this.handleCatalogReferral(resolvedPage, psid, productCode).catch(() => {});
          }
          continue;
        }

        if (!event.message) continue;

        // Push to persistent queue — returns immediately, worker processes async
        await this.messageQueue
          .add(resolvedPage, psid, event.message)
          .catch((err) =>
            this.logger.error(
              `[Webhook] page=${resolvedPage.pageId} psid=${psid} queue error: ${err}`,
            ),
          );
      }

      // ── Feed events: Facebook post comments ──────────────────────────────
      for (const change of entry.changes ?? []) {
        if (change.field !== 'feed') continue;
        const val = change.value ?? {};
        if (val.item !== 'comment' || val.verb !== 'add') continue;
        // Facebook sends sender as val.from.id (not val.sender_id)
        const senderId: string = String(val.sender_id ?? val.from?.id ?? '');
        if (senderId && senderId === String(resolvedPage.pageId)) continue;

        const commentId: string = val.comment_id ?? '';
        const postId: string = val.post_id ?? '';
        const commentText: string = String(val.message ?? '').trim();
        const commenterName: string = String(val.from?.name ?? '').trim();
        const commenterId: string = String(val.from?.id ?? '').trim();
        if (!commentId || !commentText) continue;

        this.handleCommentReply(
          resolvedPage,
          commentId,
          postId,
          commentText,
          commenterName,
          commenterId,
        ).catch((err) =>
          this.logger.error(`[Webhook] Comment reply error: ${err}`),
        );
      }
    }
  }

  // ── Comment reply handler ─────────────────────────────────────────────────

  private async handleCommentReply(
    page: any,
    commentId: string,
    postId: string,
    commentText: string,
    commenterName: string = '',
    commenterId: string = '',
  ): Promise<void> {
    if (!page.commentReplyOn || !page.automationOn) return;
    // M-4: skip if page has no token
    if (!page.pageToken) return;

    const postIdPart = postId.includes('_')
      ? postId.split('_').slice(1).join('_')
      : postId;

    type ProductInfo = {
      code: string;
      name: string | null;
      price: number;
      stockQty: number;
      description: string | null;
    };
    const productSelect = {
      code: true,
      name: true,
      price: true,
      stockQty: true,
      description: true,
    } as const;

    // Try post-linked products first; fall back to full page catalog (capped at 15)
    let products: ProductInfo[] = await this.prisma.product.findMany({
      where: { pageId: page.id, isActive: true, fbPostId: postIdPart },
      select: productSelect,
    });
    if (products.length === 0) {
      products = await this.prisma.product.findMany({
        where: { pageId: page.id, isActive: true },
        select: productSelect,
        orderBy: { stockQty: 'desc' },
        take: 15,
      });
    }

    const classification = await this.botIntent.classifyComment(
      products,
      commentText,
    );
    if (!classification?.shouldReply) return;

    const { productCodes, intent } = classification;
    const mention = commenterId
      ? `@[${commenterId}] `
      : commenterName
        ? `${commenterName} `
        : '';
    const inboxCta = `\n\n📩 Order বা আরও তথ্যের জন্য আমাদের Inbox-এ message করুন।`;

    // M-8: deduct wallet before send so cost is always recorded even if send fails
    const deduct = () =>
      this.walletService.deductUsage(page.id, 'COMMENT_REPLY');

    // All-prices intent: list every post product's price
    if (
      intent === 'all_prices' ||
      (intent === 'price' && productCodes.length === 0 && products.length > 0)
    ) {
      const lines = products
        .map((p, i) => `${i + 1}. ${p.name ?? p.code} — ${p.price}৳`)
        .join('\n');
      const reply = `${mention}📦 আমাদের সব product এর দাম:\n${lines}${inboxCta}`;
      await deduct();
      await this.messenger.sendCommentReply(page.pageToken, commentId, reply);
      this.logger.log(
        `[Webhook] All-prices comment reply page=${page.pageId} commentId=${commentId}`,
      );
      return;
    }

    // Emoji or praise comment → warm appreciation reply
    if (intent === 'emoji_praise') {
      const reply = `${mention}ধন্যবাদ! ❤️ আপনার ভালোবাসাই আমাদের অনুপ্রেরণা! 😊 কোনো product সম্পর্কে জানতে চাইলে Inbox-এ message করুন। 📩`;
      await deduct();
      await this.messenger.sendCommentReply(page.pageToken, commentId, reply);
      this.logger.log(
        `[Webhook] Emoji/praise comment reply page=${page.pageId} commentId=${commentId}`,
      );
      return;
    }

    // No specific product or general question → generic inbox CTA
    if (productCodes.length === 0 || intent === 'other') {
      await deduct();
      await this.messenger.sendCommentReply(
        page.pageToken,
        commentId,
        mention + this.getGenericCommentReply(),
      );
      this.logger.log(
        `[Webhook] Generic comment reply page=${page.pageId} commentId=${commentId}`,
      );
      return;
    }

    const matched = products.filter((p) => productCodes.includes(p.code));
    if (matched.length === 0) {
      await deduct();
      await this.messenger.sendCommentReply(
        page.pageToken,
        commentId,
        mention + this.getGenericCommentReply(),
      );
      return;
    }

    // Multiple specific products matched — combine replies without per-item CTA
    if (matched.length > 1) {
      const parts = matched
        .map((p) => this.buildProductLine(p, intent, page))
        .filter(Boolean);
      if (!parts.length) return;
      const reply = mention + parts.join('\n') + inboxCta;
      await deduct();
      await this.messenger.sendCommentReply(page.pageToken, commentId, reply);
      this.logger.log(
        `[Webhook] Multi-product comment reply page=${page.pageId} commentId=${commentId} codes=${productCodes.join(',')}`,
      );
      return;
    }

    // Single product
    const reply = this.buildCommentReply(matched[0], intent, page);
    if (!reply) return;
    await deduct();
    await this.messenger.sendCommentReply(
      page.pageToken,
      commentId,
      mention + reply,
    );
    this.logger.log(
      `[Webhook] Comment replied page=${page.pageId} commentId=${commentId} code=${productCodes[0]} intent=${intent}`,
    );
  }

  // Single-line summary for multi-product reply (no CTA — added once at the end)
  private buildProductLine(
    product: any,
    intent: string,
    page: any,
  ): string | null {
    const label = product.name ?? product.code;
    switch (intent) {
      case 'price':
        return `• ${label} — ${product.price}৳ 🏷️`;
      case 'stock':
        return `• ${label} — ${product.stockQty > 0 ? `${product.stockQty}টি stock ✅` : 'stock নেই ❌'}`;
      case 'delivery':
        return `• ঢাকার ভেতরে ${page.deliveryFeeInsideDhaka ?? 80}৳, বাইরে ${page.deliveryFeeOutsideDhaka ?? 120}৳ 🚚`;
      case 'description':
        return product.description
          ? `• ${label}: ${product.description}`
          : null;
      default:
        return null;
    }
  }

  private buildCommentReply(
    product: any,
    intent: string,
    page: any,
  ): string | null {
    const label = product.name
      ? `${product.name} (${product.code})`
      : product.code;
    const inboxCta = `\n\n📩 Order বা আরও তথ্যের জন্য আমাদের Inbox-এ message করুন।`;
    switch (intent) {
      case 'price':
        return `${label} এর দাম ${product.price}৳ 🏷️${inboxCta}`;
      case 'stock':
        return (
          (product.stockQty > 0
            ? `${label} এ ${product.stockQty} টি stock আছে ✅`
            : `${label} বর্তমানে stock এ নেই ❌`) + inboxCta
        );
      case 'delivery':
        return `ঢাকার ভেতরে ডেলিভারি ${page.deliveryFeeInsideDhaka ?? 80}৳, বাইরে ${page.deliveryFeeOutsideDhaka ?? 120}৳ 🚚${inboxCta}`;
      case 'description':
        return product.description ? `${product.description}${inboxCta}` : null;
      default:
        return null;
    }
  }

  private getGenericCommentReply(): string {
    return `আগ্রহের জন্য ধন্যবাদ! 😊 আমাদের Inbox-এ message করুন — দাম, stock ও অর্ডার সম্পর্কে সব তথ্য পাবেন। 📩`;
  }

  // ── V21: Catalog referral handler ─────────────────────────────────────────

  private async handleCatalogReferral(
    page: any,
    psid: string,
    productCode: string,
  ): Promise<void> {
    const pageId = page.id as number;
    const tok = page.pageToken as string;

    const product = await this.prisma.product.findFirst({
      where: { pageId, code: productCode, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        price: true,
        stockQty: true,
        imageUrl: true,
        variantOptions: true,
      },
    });

    if (!product) {
      this.logger.warn(
        `[CatalogRef] Product ${productCode} not found for page ${pageId}`,
      );
      return;
    }

    const currency = page.currencySymbol || '৳';
    const inStock = product.stockQty > 0;
    const priceFormatted = Number(product.price).toLocaleString();

    // Parse variant options (size, color, etc.)
    let variantOptions: CustomFieldDef[] = [];
    if (product.variantOptions) {
      try {
        variantOptions = this.draftHandler.normalizeVariantOptions(
          JSON.parse(product.variantOptions as string),
        );
      } catch {}
    }

    // Increment product view from referral click
    void this.prisma.product
      .update({
        where: { id: product.id },
        data: { productViews: { increment: 1 } },
      })
      .catch(() => {});

    if (!inStock) {
      await this.messenger
        .sendText(tok, psid, `🛍️ ${product.name || product.code}\n\n💰 মূল্য: ${currency}${priceFormatted}\n❌ এই product এর stock শেষ।\n\nআমাদের অন্য product দেখতে চাইলে বলুন।`)
        .catch(() => {});
      return;
    }

    const newDraft = this.draftHandler.startDraftFromCodes(
      [product.code],
      [{ code: product.code, price: Number(product.price) }],
      variantOptions,
    );
    await this.ctx.saveDraft(pageId, psid, newDraft).catch(() => {});

    // First prompt: variant if exists, else name
    let firstMsg: string;
    if (variantOptions.length > 0) {
      const firstField = variantOptions[0];
      firstMsg = `🛍️ ${product.name || product.code} — ${currency}${priceFormatted}\n✅ Stock আছে\n\n`;
      if (firstField.choices?.length) {
        firstMsg += `${firstField.label} কোনটা নেবেন?\n${firstField.choices.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;
      } else {
        firstMsg += `${firstField.label} জানান 💖`;
      }
    } else {
      firstMsg = `🛍️ ${product.name || product.code} — ${currency}${priceFormatted}\n✅ Stock আছে\n\nঅর্ডার করতে আপনার নামটা বলুন 💖`;
    }

    await this.messenger
      .sendText(tok, psid, firstMsg)
      .catch((err) =>
        this.logger.error(`[CatalogRef] sendText failed psid=${psid}: ${err}`),
      );

    this.logger.log(
      `[CatalogRef] psid=${psid} opened catalog for product ${productCode} — referral handled`,
    );
  }

  // ── Message router ─────────────────────────────────────────────────────────

  async processMessage(page: any, psid: string, message: any): Promise<void> {
    const pageId = page.id as number;
    const customerText = (message.text || '').trim();

    // Master automation switch — if OFF, bot stays completely silent
    if (!page.automationOn) return;

    // FIX 4: skip blocked customers — no reply, no order, no OCR
    const isBlocked = await this.crm.isBlocked(pageId, psid);
    if (isBlocked) {
      this.logger.log(
        `[Webhook] Skipping blocked customer psid=${psid} page=${page.pageId}`,
      );
      return;
    }

    // Agent handling mode — bot stays silent until agent resumes bot from dashboard
    const agentHandling = await this.ctx.isAgentHandling(pageId, psid);
    if (agentHandling) {
      this.logger.log(
        `[Webhook] Bot muted (agent mode) — ignoring message. psid=${psid} page=${page.pageId}`,
      );
      return;
    }

    // Clear any stale reply tracking for this page+psid before processing
    this.replyTracking.beginTracking(pageId, psid);

    const agent = this.botAgentRegistry.resolve(page.agentType);
    await agent.handleMessage(page, psid, message);

    // Save conversation exchange to history for AI context
    if (customerText) {
      const botReply = this.replyTracking.takeLastReply(pageId, psid);
      if (botReply) {
        await this.ctx
          .appendToHistory(pageId, psid, customerText, botReply)
          .catch(() => {});
      }
    }
    this.replyTracking.endTracking(psid);

    // Record the current draft step after processing so loop detection can compare next time
    const updatedDraft = await this.ctx.getActiveDraft(pageId, psid);
    await this.ctx.recordDraftStepAfterProcessing(
      pageId,
      psid,
      updatedDraft?.currentStep ?? null,
    );
  }

  /**
   * Called when Facebook sends an echo (page sent a message to a customer).
   * If that customer has an agent_required order, auto-mute the bot.
   */
  private async handleAgentEcho(
    page: any,
    customerPsid: string,
  ): Promise<void> {
    const pageId = page.id as number;
    // Agent manually replied → mute the bot for this customer until dashboard resume
    await this.ctx.setAgentHandling(pageId, customerPsid, true);
    this.logger.log(
      `[AgentEcho] Agent replied — bot muted for psid=${customerPsid} page=${page.pageId}`,
    );
  }

}
