import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MessengerService } from '../messenger/messenger.service';
import { BotKnowledgeService } from '../bot-knowledge/bot-knowledge.service';
import { OcrService } from '../ocr/ocr.service';
import { OcrQueueService } from '../ocr-queue/ocr-queue.service';
import { BotIntentService } from '../bot/bot-intent.service';
import {
  ConversationContextService,
  DraftSession,
  CustomFieldDef,
} from '../conversation-context/conversation-context.service';
import { DraftOrderHandler } from './handlers/draft-order.handler';
import { ProductInfoHandler } from './handlers/product-info.handler';
import { NegotiationHandler } from './handlers/negotiation.handler';
import { CrmService } from '../crm/crm.service';
// V18: Image recognition imports
import { VisionAnalysisService } from '../vision-analysis/vision-analysis.service';
import { ProductMatchService, ProductMatchResult } from '../product-match/product-match.service';
import { FallbackAiService } from '../fallback-ai/fallback-ai.service';
import { AiIntentService } from '../bot/ai-intent.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messenger: MessengerService,
    private readonly botKnowledge: BotKnowledgeService,
    private readonly ocr: OcrService,
    private readonly ocrQueue: OcrQueueService,
    private readonly botIntent: BotIntentService,
    private readonly ctx: ConversationContextService,
    private readonly draftHandler: DraftOrderHandler,
    private readonly productHandler: ProductInfoHandler,
    private readonly negotiationHandler: NegotiationHandler,
    private readonly crm: CrmService,
    // V18: Image recognition services
    private readonly visionAnalysis: VisionAnalysisService,
    private readonly productMatch: ProductMatchService,
    private readonly fallbackAi: FallbackAiService,
    private readonly aiIntent: AiIntentService,
  ) {}

  // ── Entry point ────────────────────────────────────────────────────────────

  async handle(body: any): Promise<void> {
    if (!body || body.object !== 'page') return;

    for (const entry of body.entry ?? []) {
      const rows = await this.prisma.$queryRaw<any[]>`
        SELECT * FROM "Page" WHERE "pageId" = ${String(entry.id)} AND "isActive" = true LIMIT 1
      `;
      const page = rows[0] ?? null;

      if (!page) {
        this.logger.warn(
          `[Webhook] Entry id=${entry.id} — no active page found`,
        );
        continue;
      }
      if (!page.pageToken) {
        this.logger.warn(
          `[Webhook] Page ${page.pageId} (db id=${page.id}) has no pageToken — skipping`,
        );
        continue;
      }

      for (const event of entry.messaging ?? []) {
        // Echo: message sent BY the page itself (agent manual reply)
        if (event.message?.is_echo) {
          const customerPsid: string = event?.recipient?.id;
          if (customerPsid) {
            this.handleAgentEcho(page as any, customerPsid).catch(() => {});
          }
          continue;
        }

        const psid: string = event?.sender?.id;
        if (!psid || event.delivery || event.read) continue;
        if (!event.message) continue;

        // Process async — do NOT await (webhook must return 200 fast)
        this.processMessage(page as any, psid, event.message).catch((err) =>
          this.logger.error(
            `[Webhook] page=${page.pageId} psid=${psid} unhandled: ${err}`,
          ),
        );
      }
    }
  }

  // ── Message router ─────────────────────────────────────────────────────────

  private async processMessage(
    page: any,
    psid: string,
    message: any,
  ): Promise<void> {
    const pageId = page.id as number;
    await this._processMessageInner(page, psid, message);
    // Record the current draft step after processing so loop detection can compare next time
    const updatedDraft = await this.ctx.getActiveDraft(pageId, psid);
    await this.ctx.recordDraftStepAfterProcessing(pageId, psid, updatedDraft?.currentStep ?? null);
  }

  private async _processMessageInner(
    page: any,
    psid: string,
    message: any,
  ): Promise<void> {
    const pageId = page.id as number;
    const token = page.pageToken as string; // encrypted — MessengerService decrypts it

    // FIX 4: skip blocked customers — no reply, no order, no OCR
    const isBlocked = await this.crm.isBlocked(pageId, psid);
    if (isBlocked) {
      this.logger.log(
        `[Webhook] Skipping blocked customer psid=${psid} page=${page.pageId}`,
      );
      return;
    }

    // Agent handling mode — if a new customer message arrives, re-activate the bot
    // so matched greetings/order/catalog requests can still receive a reply.
    const agentHandling = await this.ctx.isAgentHandling(pageId, psid);
    if (agentHandling) {
      await this.ctx.setAgentHandling(pageId, psid, false);
      this.logger.log(
        `[Webhook] Agent handling cleared on new inbound message. psid=${psid} page=${page.pageId}`,
      );
    }

    // ── Image → payment screenshot OR product OCR ─────────────────────────
    const img = message.attachments?.find(
      (a: any) => a.type === 'image' && a.payload?.url,
    );
    if (img) {
      // V17: if customer is at advance_payment step, route to payment screenshot handler
      const currentDraft = await this.ctx.getActiveDraft(pageId, psid);
      if (currentDraft?.currentStep === 'advance_payment') {
        this.ocrQueue.add(() =>
          this.handlePaymentScreenshot(
            page,
            psid,
            img.payload.url,
            currentDraft,
          ),
        );
        return;
      }

      if (!page.infoModeOn) return;
      const processingMsg = await this.botKnowledge.resolveSystemReply(
        pageId,
        'ocr_processing',
      );
      await this.messenger
        .sendText(token, psid, processingMsg)
        .catch((e) =>
          this.logger.error(
            `[Webhook] sendText(ocr_processing) failed psid=${psid}: ${e}`,
          ),
        );
      // V8: pass caption text alongside image URL for combined detection
      const caption = (message.text || '').trim() || undefined;
      this.ocrQueue.add(() =>
        this.handleImageAttachment(page, psid, img.payload.url, caption),
      );
      return;
    }

    const text = (message.text || '').trim();
    if (!text) return;

    // Auto-expire drafts older than 24 hours
    let draft = await this.ctx.getActiveDraft(pageId, psid);
    if (draft) {
      const session = await this.ctx.getSession(pageId, psid);
      const hoursSince = session
        ? (Date.now() - new Date(session.updatedAt).getTime()) / 3_600_000
        : 0;
      if (hoursSince > 24) {
        await this.ctx.clearDraft(pageId, psid);
        draft = null;
        this.logger.log(`[Draft] Expired (${Math.floor(hoursSince)}h old) for psid=${psid}`);
      }
    }
    const awaitingConfirm =
      draft?.currentStep === 'confirm' ||
      (draft?.pendingMultiPreview?.length ?? 0) > 0;

    // AI-first intent detection — falls back to keyword matching on any API error/quota
    const aiResult = await this.aiIntent.detectIntent(
      text,
      awaitingConfirm,
      draft?.currentStep ?? null,
      page.businessName ?? null,
    );
    const intent = aiResult.intent !== null && aiResult.intent !== 'UNKNOWN'
      ? aiResult.intent
      : this.botIntent.detectIntent(text, awaitingConfirm);

    // ── LOOP / STUCK DETECTION ────────────────────────────────────────────
    const aiEnabled = page.textFallbackAiOn || this.fallbackAi.isAvailable();
    if (aiEnabled) {
      const loopCount = await this.ctx.checkAndUpdateLoop(
        pageId, psid, text, draft?.currentStep ?? null,
      );
      if (loopCount >= 2) {
        this.logger.warn(`[Loop] Detected loop (count=${loopCount}) for psid=${psid} step=${draft?.currentStep ?? 'none'} text="${text.slice(0, 60)}"`);
        const draftSummary = draft
          ? `Customer has an active order draft (step: ${draft.currentStep ?? 'unknown'}, products: ${(draft.items ?? []).map((i: any) => i.code).join(', ') || 'none'})`
          : null;
        const fbResult = await this.fallbackAi.generateReply({
          customerMessage: text,
          reason: 'unmatched_intent',
          businessName: page.businessName ?? undefined,
          draftStep: draft?.currentStep ?? null,
          draftSummary,
        });
        if (fbResult.reply) {
          const reply = draft
            ? `${fbResult.reply}\n\n${this.draftHandler.reminder(draft)}`
            : fbResult.reply;
          await this.safeSend(token, psid, reply);
          await this.ctx.resetLoop(pageId, psid);
          return;
        }
      }
    }

    // ── MULTI-ADDRESS INTENT — 2 products to 2 different addresses ────────
    if (!draft && this.isMultiAddressIntent(text)) {
      await this.safeSend(
        token,
        psid,
        '💡 আলাদা ঠিকানায় পাঠাতে হলে আলাদাভাবে order করতে হবে।\n\n১ম order confirm করুন → তারপর ২য় product এর order শুরু করুন 💖\n\nকোন product দিয়ে শুরু করবেন?',
      );
      return;
    }

    // ── CANCEL — only when there's something to cancel ────────────────────
    if (intent === 'CANCEL') {
      const hasOpenOrder = !draft && !!(await this.prisma.order.findFirst({
        where: { pageIdRef: page.id, customerPsid: psid, status: { in: ['RECEIVED', 'PENDING'] } },
        select: { id: true },
      }));
      if (draft || hasOpenOrder) {
        await this.handleCancel(page, psid, draft);
      } else {
        // Nothing to cancel — acknowledge softly and stop, don't fall through to order flow
        await this.safeSend(token, psid, 'ঠিক আছে 💖 কোনো সমস্যা নেই। কিছু জানার থাকলে বলুন।');
      }
      return;
    }

    // ── PENDING MULTI-PRODUCT PREVIEW ──────────────────────────────────────
    if ((draft?.pendingMultiPreview?.length ?? 0) > 0) {
      await this.handleMultiProductPreview(page, psid, text, intent, draft!);
      return;
    }

    // ── NEGOTIATION ────────────────────────────────────────────────────────
    if (intent === 'NEGOTIATION') {
      const reply = await this.negotiationHandler.handle(
        pageId,
        psid,
        text,
        draft,
        message?.reply_to?.text,
      );
      const reminder = draft ? `\n\n${this.draftHandler.reminder(draft)}` : '';
      await this.safeSend(token, psid, reply + reminder);
      return;
    }

    // ── REMOVE ITEM FROM DRAFT ─────────────────────────────────────────────
    if (intent === 'ORDER_REMOVE_ITEM' && draft) {
      await this.handleRemoveItem(page, psid, text, draft);
      return;
    }

    // ── IN-DRAFT EDITS ─────────────────────────────────────────────────────
    if (draft && intent === 'EDIT_ORDER') {
      const handled = await this.handleDraftEdit(page, psid, text, draft);
      if (handled) return;
    }

    // ── SIDE QUESTION during active draft ─────────────────────────────────
    if (draft && this.botIntent.isSideQuestion(intent) && page.infoModeOn) {
      try {
        const learned = await this.botKnowledge.resolveReply(
          pageId,
          text,
          psid,
        );
        if (learned?.reply) {
          await this.safeSend(
            token,
            psid,
            `${learned.reply}\n\n${this.draftHandler.reminder(draft)}`,
          );
          return;
        }
      } catch {}
    }

    // ── MULTI PRODUCT CODES ────────────────────────────────────────────────
    const allCodes = this.botIntent.extractAllCodes(text);
    if (allCodes.length > 1 && page.infoModeOn) {
      const found = await this.productHandler.getProductsByCodes(
        pageId,
        allCodes,
      );
      if (found.length > 0) {
        const newDraft = this.draftHandler.emptyDraft();
        newDraft.pendingMultiPreview = allCodes;
        await this.ctx.saveDraft(pageId, psid, newDraft);
        await this.productHandler.sendMultiProductPreview(page, psid, allCodes);
        return;
      }
    }

    // ── SINGLE PRODUCT CODE ────────────────────────────────────────────────
    if (allCodes.length === 1 && page.infoModeOn) {
      await this.handleExplicitProductCode(
        page,
        psid,
        text,
        intent,
        draft,
        message,
        allCodes[0],
      );
      return;
    }

    // ── ACTIVE DRAFT: capture next field ──────────────────────────────────
    if (draft && page.orderModeOn) {
      const result = await this.draftHandler.captureField(
        pageId,
        psid,
        text,
        draft,
        page,
      );

      if (result === null) {
        const stillExists = await this.ctx.getActiveDraft(pageId, psid);
        if (!stillExists) {
          const wasConfirm =
            draft.currentStep === 'confirm' &&
            this.botIntent.detectIntent(text, true) === 'CONFIRM';
          const key = wasConfirm ? 'order_received' : 'order_cancelled';
          const msg = await this.botKnowledge.resolveSystemReply(pageId, key);
          await this.safeSend(token, psid, msg);
        }
        return;
      }

      if (typeof result === 'string') {
        // If AI is available and this looks like a validation retry (not a progress message),
        // let AI generate a warmer contextual response instead of the rigid retry message
        const isRetry = result.includes('আবার দিন') || result.includes('পুরো');
        if (isRetry && aiEnabled) {
          const updatedDraft = await this.ctx.getActiveDraft(pageId, psid);
          const draftSummary = updatedDraft
            ? `Customer has an active order draft (step: ${updatedDraft.currentStep ?? 'unknown'}, products: ${(updatedDraft.items ?? []).map((i: any) => i.code).join(', ') || 'none'})`
            : null;
          const fbResult = await this.fallbackAi.generateReply({
            customerMessage: text,
            reason: 'unmatched_intent',
            businessName: page.businessName ?? undefined,
            draftStep: updatedDraft?.currentStep ?? draft.currentStep ?? null,
            draftSummary,
          });
          if (fbResult.reply) {
            await this.safeSend(token, psid, fbResult.reply);
            return;
          }
        }
        await this.safeSend(token, psid, result);
        return;
      }
    }

    const recentOrder =
      !draft && page.orderModeOn
        ? await this.findRecentCustomerOrder(pageId, psid)
        : null;

    // ── POST-ORDER FOLLOW-UP (after draft already finalized) ──────────────
    if (recentOrder && intent === 'EDIT_ORDER') {
      await this.handlePostOrderEdit(page, psid, text, recentOrder);
      return;
    }

    if (recentOrder && (intent === 'CONFIRM' || this.isPostOrderAck(text))) {
      await this.safeSend(
        token,
        psid,
        'ধন্যবাদ 💖 আপনার order request already received হয়েছে। দরকার হলে "size change", "phone change", "address change" বা "name change" লিখুন।',
      );
      return;
    }

    // ── ORDER INFO detected without active draft (smart field capture) ────
    if (!draft && page.orderModeOn) {
      const parsed = this.draftHandler.parseCustomerInfo(text);
      const hasOrderInfo = !!(
        parsed.phone ||
        (parsed.name && parsed.address) ||
        parsed.address
      );
      if (hasOrderInfo) {
        const contextCode = await this.resolveReferencedProductCode(
          pageId,
          psid,
          message,
        );
        if (contextCode) {
          const product = await this.prisma.product.findFirst({
            where: { pageId, code: contextCode, stockQty: { gt: 0 } },
          });
          if (product) {
            let variantOptions: any[] = [];
            try {
              if (product.variantOptions)
                variantOptions = this.draftHandler.normalizeVariantOptions(
                  JSON.parse(product.variantOptions),
                );
            } catch {}
            const newDraft = this.draftHandler.startDraftFromCodes(
              [contextCode],
              [product as any],
              variantOptions,
            );
            await this.ctx.saveDraft(pageId, psid, newDraft);
            const result = await this.draftHandler.captureField(
              pageId,
              psid,
              text,
              newDraft,
              page,
            );
            if (typeof result === 'string')
              await this.safeSend(token, psid, result);
            return;
          }
        }
        // Has order info but no product context — ask which product
        await this.safeSend(
          token,
          psid,
          'কোন product এর order করবেন? code বা screenshot দিন 💖',
        );
        return;
      }
    }

    // ── ORDER INTENT without product code ─────────────────────────────────
    if (intent === 'ORDER_INTENT' && page.orderModeOn) {
      const contextCode = await this.resolveReferencedProductCode(
        pageId,
        psid,
        message,
      );
      if (contextCode) {
        const product = await this.prisma.product.findFirst({
          where: { pageId, code: contextCode },
        });
        if (product && product.stockQty > 0) {
          let variantOptions: CustomFieldDef[] = [];
          if (product.variantOptions) {
            try {
              variantOptions = this.draftHandler.normalizeVariantOptions(
                JSON.parse(product.variantOptions),
              );
            } catch {
              /* ignore */
            }
          }
          const newDraft = this.draftHandler.startDraftFromCodes(
            [contextCode],
            [product as any],
            variantOptions,
          );
          await this.ctx.saveDraft(pageId, psid, newDraft);
          if (variantOptions.length > 0) {
            const firstField = variantOptions[0];
            const opts = firstField.choices?.length
              ? `\n${firstField.choices.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
              : '';
            await this.safeSend(
              token,
              psid,
              `ঠিক আছে 💖 ${contextCode} এর জন্য order নিচ্ছি।\n\n${firstField.label} কোনটা নেবেন?${opts}`,
            );
          } else {
            await this.safeSend(
              token,
              psid,
              `ঠিক আছে 💖 ${contextCode} এর জন্য order নিচ্ছি।\n\nআপনার **নাম + ফোন নম্বর + ঠিকানা** দিন।`,
            );
          }
          return;
        }
      }
      await this.safeSend(
        token,
        psid,
        'কোন product এর order করবেন? code বা screenshot দিন 💖',
      );
      return;
    }

    // ── GREETING ───────────────────────────────────────────────────────────
    if (intent === 'GREETING') {
      const greetMsg = await this.botKnowledge.resolveSystemReply(pageId, 'greeting');
      await this.safeSend(token, psid, greetMsg);
      return;
    }

    // ── CATALOG REQUEST ────────────────────────────────────────────────────
    if (intent === 'CATALOG_REQUEST') {
      const catalogBaseUrl = (process.env.CATALOG_BASE_URL || 'https://chatcat.pro').replace(/\/$/, '');
      const slug = page.catalogSlug || String(page.id);
      const catalogUrl = `${catalogBaseUrl}/catalog/${slug}`;
      const businessName = page.businessName || page.pageName || 'আমাদের';
      await this.safeSend(
        token,
        psid,
        `${businessName} এর সব product দেখতে এই link এ click করুন 👇\n\n${catalogUrl}\n\nপছন্দের product এর code বা screenshot দিন — আমরা order নেব 💖`,
      );
      return;
    }

    // ── SOFT HESITATION ────────────────────────────────────────────────────
    if (intent === 'SOFT_HESITATION') {
      await this.safeSend(token, psid, 'ঠিক আছে 💖 যখন সুবিধা হয় জানাবেন।');
      return;
    }

    // ── KNOWLEDGE BASE FALLBACK ────────────────────────────────────────────
    if (page.infoModeOn) {
      try {
        const learned = await this.botKnowledge.resolveReply(
          pageId,
          text,
          psid,
        );
        if (learned?.reply) {
          const reply = draft
            ? `${learned.reply}\n\n${this.draftHandler.reminder(draft)}`
            : learned.reply;
          await this.safeSend(token, psid, reply);
          return;
        }
      } catch {}
    }

    // ── UNMATCHED — use AI reply (already generated above) or fallback AI ──
    this.logger.log(
      `[Webhook] Unmatched message — psid=${psid} page=${page.pageId} text="${text.slice(0, 80)}"`,
    );

    // If AI already generated a reply for UNKNOWN intent, use it directly (no 2nd API call)
    if (aiResult.reply) {
      const reply = draft
        ? `${aiResult.reply}\n\n${this.draftHandler.reminder(draft)}`
        : aiResult.reply;
      await this.safeSend(token, psid, reply);
      return;
    }

    // AI was unavailable (quota/error) — try fallbackAi as last resort
    if (aiEnabled) {
      const draftSummary = draft
        ? `Customer has an active order draft (step: ${draft.currentStep ?? 'unknown'}, products: ${(draft.items ?? []).map((i: any) => i.code).join(', ') || 'none'})`
        : null;

      const fbResult = await this.fallbackAi.generateReply({
        customerMessage: text,
        reason: 'unmatched_intent',
        businessName: page.businessName ?? undefined,
        draftStep: draft?.currentStep ?? null,
        draftSummary,
      });

      if (fbResult.reply) {
        const reply = draft
          ? `${fbResult.reply}\n\n${this.draftHandler.reminder(draft)}`
          : fbResult.reply;
        await this.safeSend(token, psid, reply);
        return;
      }
    }

    await this.safeSend(
      token,
      psid,
      'দুঃখিত, আমি এটা পুরোপুরি বুঝতে পারিনি 💖\n\nআপনি product code, screenshot, "catalog", বা "order" লিখে আবার পাঠান।',
    );
  }

  // ── Sub-handlers ──────────────────────────────────────────────────────────

  private async handleCancel(
    page: any,
    psid: string,
    draft: DraftSession | null,
  ): Promise<void> {
    if (draft) {
      await this.ctx.clearDraft(page.id, psid);
    } else {
      const open = await this.prisma.order.findFirst({
        where: {
          pageIdRef: page.id,
          customerPsid: psid,
          status: { in: ['RECEIVED', 'PENDING'] },
        },
        orderBy: { id: 'desc' },
      });
      if (open) {
        await this.prisma.order.update({
          where: { id: open.id },
          data: { status: 'CANCELLED' },
        });
        this.logger.log(
          `[Webhook] order #${open.id} cancelled by customer psid=${psid}`,
        );
      }
    }
    const reply = await this.botKnowledge.resolveSystemReply(
      page.id,
      'order_cancelled',
    );
    await this.safeSend(page.pageToken, psid, reply);
  }

  private async handleMultiProductPreview(
    page: any,
    psid: string,
    text: string,
    intent: string | null,
    draft: DraftSession,
  ): Promise<void> {
    const pageId = page.id as number;
    const token = page.pageToken as string;
    const codes = draft.pendingMultiPreview as string[];

    if (intent === 'CONFIRM' || intent === 'MULTI_CONFIRM') {
      const products = await this.productHandler.getProductsByCodes(
        pageId,
        codes,
      );
      const newDraft = this.draftHandler.startDraftFromCodes(
        codes,
        products as any[],
      );
      await this.ctx.saveDraft(pageId, psid, newDraft);
      await this.safeSend(token, psid, 'ঠিক আছে 💖 আপনার নাম দিন।');
    } else {
      await this.safeSend(
        token,
        psid,
        'সবগুলো order করতে **confirm** লিখুন, বাতিল করতে **cancel** লিখুন 💖',
      );
    }
  }

  private async handleExplicitProductCode(
    page: any,
    psid: string,
    text: string,
    intent: string | null,
    draft: DraftSession | null,
    message: any,
    code: string,
  ): Promise<void> {
    const pageId = page.id as number;
    const token = page.pageToken as string;

    // Always show product info first
    await this.productHandler.sendProductInfo(page, psid, code);

    // Broad order-intent check: explicit intent OR common Banglish/Bengali order phrases
    const isOrderIntent =
      intent === 'ORDER_INTENT' ||
      /\b(nibo|lagbe|nite\s*c[ah]i|kinbo|nebo|kinte|order|korte\s*c[ah]i|dite\s*c[ah]i)\b/i.test(
        text,
      );

    if (isOrderIntent && page.orderModeOn) {
      const qtyMap = this.botIntent.extractQuantityMap(text);
      const qty = qtyMap.get(code) ?? 1;
      const product = await this.prisma.product.findFirst({
        where: { pageId, code },
      });

      if (!product) {
        this.logger.warn(
          `[Webhook] Product not found: pageId=${pageId} code=${code}`,
        );
        return;
      }
      if (product.stockQty <= 0) {
        this.logger.log(`[Webhook] Stock out: pageId=${pageId} code=${code}`);
        return;
      }

      if (!draft) {
        // Parse product variantOptions (e.g. [{label:"Size",choices:["S","M","L","XL"]}])
        let variantOptions: CustomFieldDef[] = [];
        if (product.variantOptions) {
          try {
            variantOptions = this.draftHandler.normalizeVariantOptions(
              JSON.parse(product.variantOptions),
            );
          } catch {
            /* ignore */
          }
        }
        const newDraft = this.draftHandler.startDraftFromCodes(
          [code],
          [product as any],
          variantOptions,
        );
        newDraft.items[0].qty = qty;

        // Prefill from CRM if returning customer
        const crmCustomer = await this.prisma.customer.findUnique({
          where: { pageId_psid: { pageId, psid } },
          select: { name: true, phone: true, address: true, totalOrders: true },
        });
        if (crmCustomer?.name) newDraft.customerName = crmCustomer.name;
        if (crmCustomer?.phone) newDraft.phone = crmCustomer.phone;
        if (crmCustomer?.address) newDraft.address = crmCustomer.address;

        await this.ctx.saveDraft(pageId, psid, newDraft);

        const returnGreet = crmCustomer?.totalOrders
          ? `স্বাগতম ফিরে! 🎉 আপনার আগের ${crmCustomer.totalOrders}টি order এর তথ্য দিয়ে রেখেছি।\n`
          : '';

        if (variantOptions.length > 0) {
          const firstField = variantOptions[0];
          const opts = firstField.choices?.length
            ? `\n${firstField.choices.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
            : '';
          await this.safeSend(
            token,
            psid,
            `${returnGreet}ঠিক আছে 💖 ${code} এর জন্য order নিচ্ছি।\n\n${firstField.label} কোনটা নেবেন?${opts}`,
          );
        } else if (crmCustomer?.name && crmCustomer?.phone && crmCustomer?.address) {
          // All info prefilled — confirm address before going to summary
          // Customer may want to deliver to a different address this time
          newDraft.currentStep = 'confirm_address';
          await this.ctx.saveDraft(pageId, psid, newDraft);
          await this.safeSend(
            token,
            psid,
            `স্বাগতম ফিরে ${crmCustomer.name}! 🎉\n\nআগের ঠিকানায় পাঠাব?\n📍 *${crmCustomer.address}*\n\n"হ্যাঁ" বললে এই ঠিকানায় যাবে, অথবা নতুন ঠিকানা দিন 💖`,
          );
        } else {
          await this.safeSend(
            token,
            psid,
            `${returnGreet}ঠিক আছে 💖 আপনার **নাম + ফোন নম্বর + ঠিকানা** দিন।`,
          );
        }
      } else {
        // Adding to existing draft
        const existing = draft.items.find((i) => i.productCode === code);
        if (existing) existing.qty = qty;
        else
          draft.items.push({
            productCode: code,
            qty,
            unitPrice: product.price,
          });
        await this.ctx.saveDraft(pageId, psid, draft);
      }
    }
  }

  private async handleRemoveItem(
    page: any,
    psid: string,
    text: string,
    draft: DraftSession,
  ): Promise<void> {
    const removeCode = this.botIntent.extractRemoveCode?.(text);
    if (!removeCode) return;

    draft.items = draft.items.filter((i) => i.productCode !== removeCode);

    if (draft.items.length === 0) {
      await this.ctx.clearDraft(page.id, psid);
      await this.safeSend(page.pageToken, psid, '✅ Draft cancel হয়েছে।');
    } else {
      await this.ctx.saveDraft(page.id, psid, draft);
      await this.safeSend(
        page.pageToken,
        psid,
        `✅ ${removeCode} remove হয়েছে।\n\n${this.draftHandler.buildSummary(draft, page)}`,
      );
    }
  }

  private async handleDraftEdit(
    page: any,
    psid: string,
    text: string,
    draft: DraftSession,
  ): Promise<boolean> {
    const t = text.toLowerCase();

    // ── Name change ────────────────────────────────────────────────────────
    if (
      /name|naam|নাম/.test(t) &&
      /change|badla|ভুল|bhul|bul|wrong|thik\s*na|নতুন/i.test(t)
    ) {
      draft.currentStep = 'name';
      await this.ctx.saveDraft(page.id, psid, draft);
      await this.safeSend(page.pageToken, psid, 'নতুন নাম দিন 💖');
      return true;
    }

    // ── Phone change ───────────────────────────────────────────────────────
    if (
      /phone|number|mobile|নম্বর|ফোন/.test(t) &&
      /change|badla|ভুল|bhul|bul|wrong|thik\s*na|নতুন/i.test(t)
    ) {
      draft.currentStep = 'phone';
      await this.ctx.saveDraft(page.id, psid, draft);
      await this.safeSend(page.pageToken, psid, 'নতুন ফোন নাম্বার দিন 💖');
      return true;
    }

    // ── Address change ─────────────────────────────────────────────────────
    if (
      /address|thikana|location|ঠিকানা/.test(t) &&
      /change|badla|ভুল|bhul|bul|wrong|thik\s*na|নতুন/i.test(t)
    ) {
      draft.currentStep = 'address';
      await this.ctx.saveDraft(page.id, psid, draft);
      await this.safeSend(page.pageToken, psid, 'নতুন ঠিকানা দিন 💖');
      return true;
    }

    // ── Variant change (size, color, etc.) ────────────────────────────────
    if (/size|color|colour|rong|সাইজ|কালার|রং/.test(t)) {
      const allVariants = Object.keys(draft.customFieldValues || {});
      // Find which variant they want to change
      const sizeMatch =
        /size|সাইজ/i.test(t) && allVariants.find((k) => /size/i.test(k));
      const colorMatch =
        /color|colour|rong|কালার|রং/i.test(t) &&
        allVariants.find((k) => /color|colour|rong/i.test(k));
      const targetField = sizeMatch || colorMatch || allVariants[0];

      if (targetField) {
        // Re-ask that specific variant field
        draft.currentStep = `cf:${targetField}`;
        // Find field definition to show choices
        const fieldDef = { label: targetField, choices: [] as string[] };
        // Try to get choices from the existing customFieldValues context (not stored — just re-ask)
        await this.ctx.saveDraft(page.id, psid, draft);
        await this.safeSend(
          page.pageToken,
          psid,
          `নতুন ${targetField} বলুন 💖`,
        );
        return true;
      }
    }

    // ── Generic "bhul ache" / "thik nai" — ask which field ────────────────
    if (
      /ভুল|bhul|bul|wrong|thik\s*nai|thik\s*na|ঠিক\s*না|ঠিক\s*নাই/.test(t) &&
      !/phone|number|address|thikana|name|naam|নাম|ফোন|ঠিকানা/.test(t)
    ) {
      await this.safeSend(
        page.pageToken,
        psid,
        'কোনটা ঠিক করতে চান? 💖\n👤 নাম → "name change"\n📞 ফোন → "phone change"\n📍 ঠিকানা → "address change"',
      );
      return true;
    }

    // ── Quantity change ────────────────────────────────────────────────────
    const qtyMap = this.botIntent.extractQuantityMap(text);
    if (qtyMap.size > 0) {
      qtyMap.forEach((qty, code) => {
        const item = draft.items.find((i) => i.productCode === code);
        if (item) item.qty = qty;
      });
      await this.ctx.saveDraft(page.id, psid, draft);
      await this.safeSend(
        page.pageToken,
        psid,
        `✅ Updated!\n\n${this.draftHandler.buildSummary(draft, page)}`,
      );
      return true;
    }

    return false;
  }

  private async findRecentCustomerOrder(pageId: number, psid: string) {
    return this.prisma.order.findFirst({
      where: {
        pageIdRef: pageId,
        customerPsid: psid,
        status: { in: ['RECEIVED', 'PENDING', 'CONFIRMED'] },
      },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        orderNote: true,
        status: true,
        createdAt: true,
      },
    });
  }

  private isPostOrderAck(text: string): boolean {
    const t = text.toLowerCase().trim();
    return /^(ok|okay|okey|okk|okkk|done|thanks|thank you|thik|thik ache|thik ase|ঠিক|ঠিক আছে|ধন্যবাদ|acha|accha|আচ্ছা)$/.test(
      t,
    );
  }

  private detectPostOrderEditField(text: string): {
    label: string;
    prompt: string;
  } | null {
    const t = text.toLowerCase();
    if (
      /name|naam|নাম/.test(t) &&
      /change|badla|ভুল|bhul|bul|wrong|thik\s*na|নতুন/i.test(t)
    ) {
      return {
        label: 'name',
        prompt:
          'ঠিক আছে 💖 নাম change request note করা হয়েছে। আমাদের agent updated নাম confirm করবে।',
      };
    }
    if (
      /phone|number|mobile|নম্বর|ফোন/.test(t) &&
      /change|badla|ভুল|bhul|bul|wrong|thik\s*na|নতুন/i.test(t)
    ) {
      return {
        label: 'phone',
        prompt:
          'ঠিক আছে 💖 phone change request note করা হয়েছে। আমাদের agent updated নাম্বার confirm করবে।',
      };
    }
    if (
      /address|thikana|location|ঠিকানা/.test(t) &&
      /change|badla|ভুল|bhul|bul|wrong|thik\s*na|নতুন/i.test(t)
    ) {
      return {
        label: 'address',
        prompt:
          'ঠিক আছে 💖 address change request note করা হয়েছে। আমাদের agent updated ঠিকানা confirm করবে।',
      };
    }
    if (/size|সাইজ/.test(t)) {
      return {
        label: 'size',
        prompt:
          'ঠিক আছে 💖 size change request note করা হয়েছে। আমাদের agent updated size confirm করবে।',
      };
    }
    if (/color|colour|rong|কালার|রং/.test(t)) {
      return {
        label: 'color',
        prompt:
          'ঠিক আছে 💖 color change request note করা হয়েছে। আমাদের agent updated option confirm করবে।',
      };
    }
    return null;
  }

  private async handlePostOrderEdit(
    page: any,
    psid: string,
    text: string,
    order: { id: number; orderNote: string | null },
  ): Promise<void> {
    const parsed = this.detectPostOrderEditField(text);
    if (!parsed) {
      await this.safeSend(
        page.pageToken,
        psid,
        'কোনটা বদলাতে চান লিখুন 💖\n👤 name change\n📞 phone change\n📍 address change\n📌 size change',
      );
      return;
    }

    const existing = order.orderNote?.trim();
    const appended = `[Customer requested ${parsed.label} change after order]`;
    const nextNote = existing ? `${existing} | ${appended}` : appended;
    await this.prisma.order.update({
      where: { id: order.id },
      data: { orderNote: nextNote },
    });
    await this.ctx.setAgentHandling(page.id, psid, true);
    await this.safeSend(page.pageToken, psid, parsed.prompt);
  }

  /** V17: Payment screenshot OCR — called when draft.currentStep === 'advance_payment' */
  private async handlePaymentScreenshot(
    page: any,
    psid: string,
    imageUrl: string,
    draft: DraftSession,
  ): Promise<void> {
    const pageId = page.id as number;
    const token = page.pageToken as string;

    this.logger.log(
      `[PaymentOCR] Processing screenshot for page=${page.pageId} psid=${psid}`,
    );

    try {
      const rawText = await this.ocr.extractTextFromImageUrl(imageUrl);
      this.logger.log(`[PaymentOCR] Raw text: ${rawText.slice(0, 200)}`);

      // Try to extract transaction ID from common Bkash/Nagad patterns
      // e.g. "TrxID 8NO3DQXQPR", "Transaction ID: ABC123DEF4", "Ref: XYZ987"
      const txnId = this.extractTransactionId(rawText);

      if (txnId) {
        draft.paymentProof = txnId;
        draft.paymentScreenshotUrl = imageUrl;
        draft.currentStep = 'confirm';
        await this.ctx.saveDraft(pageId, psid, draft);
        const summary = this.draftHandler.buildSummary(draft, page);
        await this.safeSend(
          token,
          psid,
          `✅ Payment পাওয়া গেছে! Transaction ID: *${txnId}*\n\n${summary}`,
        );
      } else {
        // Screenshot not readable — save URL, ask for last 4 digits
        draft.paymentScreenshotUrl = imageUrl;
        await this.ctx.saveDraft(pageId, psid, draft);
        await this.safeSend(
          token,
          psid,
          '📷 Screenshot পেয়েছি, কিন্তু Transaction ID পড়া যাচ্ছে না।\n\nTransaction ID টা লিখে পাঠান, অথবা শেষের ৪টি সংখ্যা দিন 💖',
        );
      }
    } catch (err) {
      this.logger.error(
        `[PaymentOCR] Failed page=${page.pageId} psid=${psid}: ${err}`,
      );
      draft.paymentScreenshotUrl = imageUrl;
      await this.ctx.saveDraft(pageId, psid, draft);
      await this.safeSend(
        token,
        psid,
        '📷 Screenshot পেয়েছি 💖 Transaction ID টাও লিখে পাঠান (অথবা শেষের ৪টি সংখ্যা)।',
      );
    }
  }

  /** Extract transaction ID from Bkash/Nagad OCR text */
  private extractTransactionId(text: string): string | null {
    if (!text) return null;

    // Priority patterns (labeled)
    const labeled = text.match(
      /(?:TrxID|Trx\s*ID|Transaction\s*ID|Trans(?:action)?\s*(?:ID|No\.?)|Ref(?:erence)?(?:\s*No\.?)?|Txn\s*(?:ID|No\.?))[:\s#]+([A-Z0-9]{6,20})/i,
    );
    if (labeled) return labeled[1].toUpperCase();

    // Bkash/Nagad style: 10-char alphanumeric block (uppercase letters + digits)
    const bkashStyle = text.match(/\b([A-Z]{2,}[0-9]{2,}[A-Z0-9]{4,})\b/);
    if (bkashStyle && bkashStyle[1].length >= 8 && bkashStyle[1].length <= 15)
      return bkashStyle[1].toUpperCase();

    return null;
  }

  /** OCR image processing — runs inside the global OCR queue */
  private async handleImageAttachment(
    page: any,
    psid: string,
    imageUrl: string,
    customerText?: string,
  ): Promise<void> {
    const pageId = page.id as number;
    const token = page.pageToken as string;

    this.logger.log(
      `[OCR] Starting for page=${page.pageId} psid=${psid} hasCustomerText=${Boolean(customerText)}`,
    );

    try {
      // Load all active products — check if any use product codes (non-visionSearchable)
      const pageProducts = await this.prisma.product.findMany({
        where: { pageId, isActive: true },
        select: { code: true, postCaption: true, visionSearchable: true },
      });

      // If ALL active products are vision-searchable (none use product codes),
      // skip OCR entirely and go straight to vision for faster response
      const hasCodeProducts = pageProducts.some((p) => !p.visionSearchable);
      if (!hasCodeProducts && page.imageRecognitionOn) {
        this.logger.log(`[OCR] All products are vision-searchable — skipping OCR, going straight to vision`);
        await this.visionProductRecognition(page, psid, imageUrl);
        return;
      }

      // V8: pass page's custom code prefix to OCR
      const customPrefix =
        (page.productCodePrefix as string | undefined) || 'DF';
      const ocrResult = await this.ocr.extractFull(
        imageUrl,
        customerText,
        pageProducts,
        customPrefix,
      );

      // Use HIGH+MEDIUM verified codes as primary, LOW as fallback
      const highMedium = ocrResult.verifiedCodes
        .filter((v) => v.confidence === 'HIGH' || v.confidence === 'MEDIUM')
        .map((v) => v.code);
      const lowOnly = ocrResult.verifiedCodes
        .filter((v) => v.confidence === 'LOW')
        .map((v) => v.code);

      // Prefer HIGH/MEDIUM; fall back to LOW only if nothing else
      const codes = highMedium.length > 0 ? highMedium : lowOnly;

      // Log confidence breakdown
      if (ocrResult.verifiedCodes.length > 0) {
        this.logger.log(
          `[OCR] Confidence breakdown: ` +
            ocrResult.verifiedCodes
              .map((v) => `${v.code}=${v.confidence}(${v.source})`)
              .join(', '),
        );
      }

      // Save to context so customer can say "eta nibo"
      if (codes.length > 0) {
        await this.ctx.setLastPresentedProducts(
          pageId,
          psid,
          codes.map((c) => ({ code: c, price: 0 })),
        );
      }

      // No codes at all
      if (!codes.length) {
        this.logger.warn(
          `[OCR] No codes — conf=${ocrResult.confidence.toFixed(0)} overall=${ocrResult.ocrConfidence}`,
        );

        // V18: Try vision-based product recognition if enabled for this page
        if (page.imageRecognitionOn) {
          await this.visionProductRecognition(page, psid, imageUrl);
          return;
        }

        const isLowConf =
          ocrResult.confidence < 30 && ocrResult.ocrConfidence === 'NONE';
        const key = isLowConf ? 'ocr_low_confidence' : 'ocr_fail';
        const reply = await this.botKnowledge.resolveSystemReply(pageId, key);
        await this.safeSend(token, psid, reply);
        return;
      }

      if (codes.length === 1) {
        const vc = ocrResult.verifiedCodes.find((v) => v.code === codes[0]);
        this.logger.log(
          `[OCR] Single code: ${codes[0]} confidence=${vc?.confidence}`,
        );
        await this.productHandler.sendProductInfo(page, psid, codes[0]);
        return;
      }

      // Multiple codes → multi-preview
      this.logger.log(`[OCR] Multiple codes: [${codes.join(',')}]`);
      const newDraft = this.draftHandler.emptyDraft();
      newDraft.pendingMultiPreview = codes;
      await this.ctx.saveDraft(pageId, psid, newDraft);
      await this.productHandler.sendMultiProductPreview(page, psid, codes);
    } catch (err) {
      this.logger.error(
        `[OCR] Uncaught error page=${page.pageId} psid=${psid}: ${err}`,
      );
      const reply = await this.botKnowledge
        .resolveSystemReply(pageId, 'ocr_fail')
        .catch(() => 'Sorry, something went wrong.');
      await this.safeSend(token, psid, reply);
    }
  }

  // ── V18: Vision-based product recognition ────────────────────────────────

  /**
   * Called when OCR finds no product codes AND page.imageRecognitionOn = true.
   * Analyzes the image with the configured AI vision provider, matches products,
   * then routes based on confidence thresholds set per page.
   */
  private async visionProductRecognition(
    page: any,
    psid: string,
    imageUrl: string,
  ): Promise<void> {
    const pageId = page.id as number;
    const token = page.pageToken as string;

    // Read per-page thresholds (fall back to safe defaults)
    const highThreshold: number = typeof page.imageHighConfidence === 'number'
      ? page.imageHighConfidence
      : 0.75;
    const medThreshold: number = typeof page.imageMediumConfidence === 'number'
      ? page.imageMediumConfidence
      : 0.45;

    this.logger.log(
      `[VisionRecog] Starting for page=${page.pageId} psid=${psid} ` +
        `thresholds: high=${highThreshold} med=${medThreshold}`,
    );

    try {
      // Step 1: Analyze image with vision provider
      const attrs = await this.visionAnalysis.analyze(imageUrl);

      this.logger.log(
        `[VisionRecog] Attributes — cat=${attrs.category} color=${attrs.color} ` +
          `pattern=${attrs.pattern} confidence=${attrs.confidence.toFixed(2)}`,
      );

      // If vision provider itself has zero confidence (mock or bad image)
      if (attrs.confidence <= 0 || !attrs.category) {
        this.logger.warn(`[VisionRecog] Zero confidence from vision provider — falling back`);
        await this.visionLowConfidenceFallback(page, psid, attrs, null);
        return;
      }

      // Step 2: Match products by extracted attributes
      const matches = await this.productMatch.findMatches(pageId, attrs, 4);

      this.logger.log(
        `[VisionRecog] Found ${matches.length} candidate match(es). ` +
          (matches[0]
            ? `Top: ${matches[0].productCode} score=${matches[0].matchScore.toFixed(2)}`
            : 'none'),
      );

      if (!matches.length) {
        // No products matched at all
        await this.visionLowConfidenceFallback(page, psid, attrs, null);
        return;
      }

      const topMatch = matches[0];
      const topScore = topMatch.matchScore;

      // Step 3: Route by confidence
      if (topScore >= highThreshold) {
        // HIGH confidence — proceed as if customer sent the product code directly
        this.logger.log(`[VisionRecog] HIGH confidence (${topScore.toFixed(2)}) — auto-proceed with ${topMatch.productCode}`);
        await this.safeSend(
          token,
          psid,
          this.buildVisionHighConfidenceMsg(attrs, topMatch),
        );
        await this.productHandler.sendProductInfo(page, psid, topMatch.productCode);

      } else if (topScore >= medThreshold) {
        // MEDIUM confidence — show 2–4 options, ask customer to pick
        this.logger.log(
          `[VisionRecog] MEDIUM confidence (${topScore.toFixed(2)}) — showing ${matches.length} options`,
        );
        await this.safeSend(
          token,
          psid,
          this.buildVisionMediumConfidenceMsg(attrs, matches),
        );
        // Save matches as "last presented" so customer can reply with a number or code
        await this.ctx.setLastPresentedProducts(
          pageId,
          psid,
          matches.map((m) => ({ code: m.productCode, price: m.price })),
        );

      } else {
        // LOW confidence
        this.logger.warn(`[VisionRecog] LOW confidence (${topScore.toFixed(2)}) — triggering fallback`);
        await this.visionLowConfidenceFallback(page, psid, attrs, matches);
      }

    } catch (err: any) {
      this.logger.error(`[VisionRecog] Uncaught error page=${page.pageId} psid=${psid}: ${err?.message ?? err}`);
      // Fail gracefully — send a generic helpful reply
      await this.safeSend(
        token,
        psid,
        'ছবিটি বিশ্লেষণ করতে সমস্যা হয়েছে। আপনি কি পণ্যের কোড বা আরও স্পষ্ট ছবি পাঠাতে পারবেন?',
      );
    }
  }

  /** Build reply for high-confidence vision match */
  private buildVisionHighConfidenceMsg(
    attrs: import('../vision-analysis/vision-analysis.interface').VisionAttributes,
    match: ProductMatchResult,
  ): string {
    const catLabel = attrs.category ?? 'পণ্য';
    const colorLabel = attrs.color ? ` ${attrs.color}` : '';
    const patternLabel = attrs.pattern && attrs.pattern !== 'plain' ? ` ${attrs.pattern}` : '';
    return (
      `আপনার ছবিটা দেখে মনে হচ্ছে এটা${colorLabel}${patternLabel} ${catLabel} টাইপের। ` +
      `এই পণ্যটি পেয়েছি:`
    );
  }

  /** Build reply for medium-confidence vision match — show options list */
  private buildVisionMediumConfidenceMsg(
    attrs: import('../vision-analysis/vision-analysis.interface').VisionAttributes,
    matches: ProductMatchResult[],
  ): string {
    const catLabel = attrs.category ?? 'পণ্য';
    const colorLabel = attrs.color ? ` ${attrs.color}` : '';
    const patternLabel = attrs.pattern && attrs.pattern !== 'plain' ? ` ${attrs.pattern}` : '';

    const header =
      `আপনার ছবিটা দেখে মনে হচ্ছে এটা${colorLabel}${patternLabel} ${catLabel} টাইপের। ` +
      `এই ধরনের কয়েকটি product পেয়েছি:\n\n`;

    const lines = matches.map((m, i) => {
      const name = m.productName ? ` — ${m.productName}` : '';
      return `${i + 1}. ${m.productCode}${name} (৳${m.price})`;
    });

    return header + lines.join('\n') + '\n\nকোনটি নিতে চান? কোড বা নম্বর লিখুন।';
  }

  /**
   * Called when vision confidence is too low to show products.
   * If fallbackAiOn: try AI reply. Otherwise: ask for clearer image.
   */
  private async visionLowConfidenceFallback(
    page: any,
    psid: string,
    attrs: import('../vision-analysis/vision-analysis.interface').VisionAttributes,
    _partialMatches: ProductMatchResult[] | null,
  ): Promise<void> {
    const token = page.pageToken as string;

    if (page.imageFallbackAiOn) {
      const fbResult = await this.fallbackAi.generateReply({
        customerMessage: '',
        reason: 'image_unclear',
        visionDescription: attrs.rawDescription,
        businessName: page.businessName ?? undefined,
      });

      if (fbResult.reply) {
        await this.safeSend(token, psid, fbResult.reply);
        if (fbResult.escalateToAgent) {
          await this.ctx.setAgentHandling(page.id, psid, true);
        }
        return;
      }
    }

    // Default: ask for a clearer image or product code
    await this.safeSend(
      token,
      psid,
      'ছবিটা থেকে পণ্যটি চেনা যাচ্ছে না। আপনি কি আরও স্পষ্ট ছবি পাঠাবেন, ' +
        'অথবা পণ্যের কোড জানালে সাহায্য করতে পারব।',
    );
  }

  private async resolveReferencedProductCode(
    pageId: number,
    psid: string,
    message: any,
  ): Promise<string | null> {
    for (const field of [
      message?.reply_to?.text,
      message?.reply_to?.payload?.text,
    ]) {
      if (field) {
        const code = this.botIntent.extractSingleCode(String(field));
        if (code) return code;
      }
    }
    const last = await this.ctx.getLastPresentedProducts(pageId, psid);
    return last.length === 1 ? last[0].code : null;
  }

  /** Detect when customer wants 2 products sent to 2 different addresses */
  private isMultiAddressIntent(text: string): boolean {
    const t = text.toLowerCase();
    return /2\s*t[ai]\s*address|2\s*t[ai]\s*jaga|alag\s*address|alada\s*address|আলাদা\s*ঠিকানা|দুই\s*ঠিকানা|2\s*ঠিকানা|different\s*address|split.*order|2.*order.*address|address.*2.*jaga/i.test(t);
  }

  /**
   * Called when Facebook sends an echo (page sent a message to a customer).
   * If that customer has an agent_required order, auto-mute the bot.
   */
  private async handleAgentEcho(page: any, customerPsid: string): Promise<void> {
    const pageId = page.id as number;
    // Agent manually replied → reset agentHandling so bot re-activates for next customer message
    const wasHandling = await this.ctx.isAgentHandling(pageId, customerPsid);
    if (wasHandling) {
      await this.ctx.setAgentHandling(pageId, customerPsid, false);
      this.logger.log(
        `[AgentEcho] Agent replied — bot re-activated for psid=${customerPsid} page=${page.pageId}`,
      );
    }
  }

  /** Safe sendText — logs error but does not throw */
  private async safeSend(
    token: string,
    psid: string,
    text: string,
  ): Promise<void> {
    try {
      await this.messenger.sendText(token, psid, text);
    } catch (err) {
      this.logger.error(`[Webhook] safeSend failed psid=${psid}: ${err}`);
    }
  }
}
