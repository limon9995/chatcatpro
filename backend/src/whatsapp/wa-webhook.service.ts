import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption.service';
import { WaMessengerService } from './wa-messenger.service';
import { BotKnowledgeService } from '../bot-knowledge/bot-knowledge.service';
import { BotIntentService } from '../bot/bot-intent.service';
import { ConversationContextService } from '../conversation-context/conversation-context.service';
import { DraftOrderHandler } from '../webhook/handlers/draft-order.handler';
import { CrmService } from '../crm/crm.service';

@Injectable()
export class WaWebhookService {
  private readonly logger = new Logger(WaWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly waMessenger: WaMessengerService,
    private readonly botKnowledge: BotKnowledgeService,
    private readonly botIntent: BotIntentService,
    private readonly ctx: ConversationContextService,
    private readonly draftHandler: DraftOrderHandler,
    private readonly crm: CrmService,
  ) {}

  // ── Entry point ─────────────────────────────────────────────────────────────

  async handle(body: any): Promise<void> {
    if (!body || body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        const phoneNumberId = value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        // Find matching page by WA phone number ID
        const page = await this.prisma.page.findFirst({
          where: { waPhoneNumberId: phoneNumberId, waEnabled: true, isActive: true },
        });

        if (!page) {
          this.logger.warn(`[WA] No active page for phoneNumberId=${phoneNumberId}`);
          continue;
        }

        if (!page.waToken) {
          this.logger.warn(`[WA] Page id=${page.id} has no waToken`);
          continue;
        }

        // Subscription gate
        if (page.subscriptionStatus === 'SUSPENDED') {
          this.logger.log(`[WA] Page id=${page.id} SUSPENDED — skipping`);
          continue;
        }
        if (page.nextBillingDate && new Date(page.nextBillingDate) < new Date()) {
          await this.prisma.page.update({
            where: { id: page.id },
            data: { subscriptionStatus: 'SUSPENDED' },
          });
          continue;
        }

        // ── Message status updates (delivered / read / failed) ───────────────
        for (const status of value.statuses ?? []) {
          this.handleStatusUpdate(page.id, status);
        }

        // ── Incoming messages ─────────────────────────────────────────────────
        for (const msg of value.messages ?? []) {
          const waId: string = msg.from; // sender's phone number
          if (!waId) continue;
          this.processMessage(page, waId, msg).catch((err) =>
            this.logger.error(`[WA] processMessage error waId=${waId}: ${err}`),
          );
        }
      }
    }
  }

  // ── Message status handler ───────────────────────────────────────────────────

  private handleStatusUpdate(pageId: number, status: any): void {
    const { id: msgId, status: state, recipient_id, errors } = status ?? {};
    if (!msgId || !state) return;

    if (state === 'failed') {
      const errCode = errors?.[0]?.code;
      const errTitle = errors?.[0]?.title ?? 'unknown';

      if (errCode === 131047) {
        this.logger.warn(
          `[WA] pageId=${pageId} 24h window expired for recipient=${recipient_id} — outbound message blocked. Use approved template to re-open conversation.`,
        );
      } else {
        this.logger.warn(
          `[WA] pageId=${pageId} message failed msgId=${msgId} recipient=${recipient_id} errCode=${errCode} title="${errTitle}"`,
        );
      }
    } else {
      this.logger.debug(
        `[WA] pageId=${pageId} message status=${state} msgId=${msgId} recipient=${recipient_id}`,
      );
    }
  }

  // ── Message processor ────────────────────────────────────────────────────────

  async processMessage(page: any, waId: string, msg: any): Promise<void> {
    const pageId = page.id as number;
    const rawToken = this.encryption.decrypt(page.waToken as string);
    const phoneNumberId = page.waPhoneNumberId as string;

    const safeSend = async (text: string) => {
      if (!text) return;
      try {
        await this.waMessenger.sendText(phoneNumberId, rawToken, waId, text);
      } catch (err) {
        this.logger.error(`[WA] safeSend waId=${waId}: ${err}`);
      }
    };

    // Record platform for this customer (fire-and-forget)
    const senderName: string | undefined = msg?.profile?.name;
    this.crm.touchPlatform(pageId, waId, 'WHATSAPP', senderName).catch(() => {});

    // Block check
    const isBlocked = await this.crm.isBlocked(pageId, waId);
    if (isBlocked) {
      this.logger.log(`[WA] Blocked customer waId=${waId}`);
      return;
    }

    // Agent handling — bot silent
    const agentHandling = await this.ctx.isAgentHandling(pageId, waId);
    if (agentHandling) return;

    // ── Image message ──────────────────────────────────────────────────────────
    if (msg.type === 'image') {
      if (!page.automationOn) return;
      await safeSend('📸 ছবি পেয়েছি! Product code দিলে আরও দ্রুত সাহায্য করতে পারব 💖');
      return;
    }

    // ── Audio message ──────────────────────────────────────────────────────────
    if (msg.type === 'audio') {
      if (!page.automationOn) return;
      await safeSend('🎤 ভয়েস মেসেজ পেয়েছি! Text-এ লিখলে আরও ভালো সাহায্য করতে পারব 💖');
      return;
    }

    // ── Text message ───────────────────────────────────────────────────────────
    if (msg.type !== 'text') return; // skip reactions, location etc.

    const text = (msg.text?.body || '').trim();
    if (!text) return;

    if (!page.automationOn) return;

    // Auto-expire draft older than 24 hours
    let draft = await this.ctx.getActiveDraft(pageId, waId);
    if (draft) {
      const session = await this.ctx.getSession(pageId, waId);
      const hoursSince = session
        ? (Date.now() - new Date(session.updatedAt).getTime()) / 3_600_000
        : 0;
      if (hoursSince > 24) {
        await this.ctx.clearDraft(pageId, waId);
        draft = null;
      }
    }

    const awaitingConfirm =
      draft?.currentStep === 'confirm' ||
      (draft?.pendingMultiPreview?.length ?? 0) > 0;

    const intent = this.botIntent.detectIntent(text, awaitingConfirm);

    // ── CANCEL ─────────────────────────────────────────────────────────────────
    if (intent === 'CANCEL' && draft) {
      await this.ctx.clearDraft(pageId, waId);
      const msg2 = await this.botKnowledge.resolveSystemReply(pageId, 'order_cancelled');
      await safeSend(msg2 || 'ঠিক আছে 💖 কোনো সমস্যা নেই।');
      return;
    }

    // ── PENDING MULTI-PRODUCT PREVIEW ──────────────────────────────────────────
    if ((draft?.pendingMultiPreview?.length ?? 0) > 0) {
      await this.handleMultiProductPreview(page, waId, safeSend, text, intent, draft!);
      return;
    }

    // ── ACTIVE DRAFT: capture next field ──────────────────────────────────────
    if (draft && page.orderModeOn) {
      const result = await this.draftHandler.captureField(pageId, waId, text, draft, page);

      if (result === null) {
        const stillExists = await this.ctx.getActiveDraft(pageId, waId);
        if (!stillExists) {
          const wasConfirm =
            draft.currentStep === 'confirm' &&
            this.botIntent.detectIntent(text, true) === 'CONFIRM';
          const key = wasConfirm ? 'order_received' : 'order_cancelled';
          const replyMsg = await this.botKnowledge.resolveSystemReply(pageId, key);
          await safeSend(replyMsg);
        }
        return;
      }

      if (typeof result === 'string') {
        await safeSend(result);
        return;
      }
    }

    // ── PRODUCT CODE detection ─────────────────────────────────────────────────
    if (page.infoModeOn) {
      const prefix = (page.productCodePrefix as string | undefined) || 'DF';
      const codes = this.botIntent.extractAllCodes(text, prefix);

      if (codes.length > 1) {
        const found = await this.prisma.product.findMany({
          where: { pageId, code: { in: codes }, stockQty: { gt: 0 } },
        });
        if (found.length > 0) {
          const newDraft = this.draftHandler.emptyDraft('WHATSAPP');
          newDraft.pendingMultiPreview = codes;
          await this.ctx.saveDraft(pageId, waId, newDraft);
          await this.sendMultiProductPreview(page, waId, safeSend, codes);
          return;
        }
      }

      if (codes.length >= 1) {
        const code = codes[0];
        const product = await this.prisma.product.findFirst({
          where: { pageId, code, stockQty: { gt: 0 } },
        });

        if (product) {
          let infoMsg = await this.botKnowledge.resolveSystemReply(
            pageId,
            'product_info',
            {
              productCode: product.code,
              productPrice: product.price,
              productStock: product.stockQty,
              productInfoNote: product.description || '',
            },
          );

          if (page.orderModeOn) {
            const prompt = await this.botKnowledge.resolveSystemReply(pageId, 'order_prompt');
            if (prompt) infoMsg += `\n\n${prompt}`;

            let variantOptions: any[] = [];
            try {
              if (product.variantOptions)
                variantOptions = this.draftHandler.normalizeVariantOptions(
                  JSON.parse(product.variantOptions),
                );
            } catch {}
            const newDraft = this.draftHandler.startDraftFromCodes(
              [code],
              [product as any],
              variantOptions,
              'WHATSAPP',
            );
            await this.ctx.saveDraft(pageId, waId, newDraft);
          }

          await safeSend(infoMsg.trim());
          return;
        } else if (product === null) {
          const notFound = await this.botKnowledge.resolveSystemReply(
            pageId,
            'product_not_found',
            { productCode: code },
          );
          await safeSend(notFound);
          return;
        }
      }
    }

    // ── GREETING ──────────────────────────────────────────────────────────────
    if (intent === 'GREETING') {
      const reply = await this.botKnowledge.resolveReply(pageId, text, waId);
      if (reply?.reply) {
        await safeSend(reply.reply);
        return;
      }
      const greeting = await this.botKnowledge.resolveSystemReply(pageId, 'greeting');
      if (greeting) {
        await safeSend(greeting);
        return;
      }
      await safeSend('হ্যালো 💖 আমি এখানে আছি। কীভাবে সাহায্য করতে পারি?');
      return;
    }

    // ── CATALOG REQUEST ────────────────────────────────────────────────────────
    if (intent === 'CATALOG_REQUEST' && page.infoModeOn) {
      const catalogUrl = page.websiteUrl || '';
      if (catalogUrl) {
        await safeSend(`আমাদের সব product দেখতে এখানে যান:\n${catalogUrl}`);
      } else {
        const reply = await this.botKnowledge.resolveReply(pageId, text, waId);
        if (reply?.reply) {
          await safeSend(reply.reply);
          return;
        }
        await safeSend('Product code বা screenshot দিন, সাহায্য করব 💖');
      }
      return;
    }

    // ── KEYWORD MATCH (bot knowledge) ─────────────────────────────────────────
    const learned = await this.botKnowledge.resolveReply(pageId, text, waId);
    if (learned?.reply) {
      const reminder = draft ? `\n\n${this.draftHandler.reminder(draft)}` : '';
      await safeSend(learned.reply + reminder);
      return;
    }

    // ── ORDER PROMPT (if order mode on and no intent matched) ─────────────────
    if (page.orderModeOn && !draft && (intent === 'PRODUCT_INFO_REQUEST' || !intent)) {
      const orderPrompt = await this.botKnowledge.resolveSystemReply(pageId, 'order_prompt');
      if (orderPrompt) {
        await safeSend(orderPrompt);
        return;
      }
    }

    this.logger.debug(`[WA] No reply for waId=${waId} text="${text.slice(0, 60)}"`);
  }

  // ── Multi-product preview helpers ────────────────────────────────────────────

  private async sendMultiProductPreview(
    page: any,
    waId: string,
    safeSend: (t: string) => Promise<void>,
    codes: string[],
  ): Promise<void> {
    const products = await this.prisma.product.findMany({
      where: { pageId: page.id, code: { in: codes } },
    });
    if (!products.length) return;

    const sym = (page as any).currencySymbol || '৳';
    const lines = codes
      .map((c) => products.find((p) => p.code === c))
      .filter(Boolean)
      .map(
        (p: any) =>
          `${p.code} — ${p.price}${sym}${p.stockQty <= 0 ? ' ❌ Stock Out' : ''}`,
      );

    await safeSend(
      lines.join('\n') + '\n\nসবগুলো order করতে চান? *confirm* / *cancel* লিখুন 💖',
    );
  }

  private async handleMultiProductPreview(
    page: any,
    waId: string,
    safeSend: (t: string) => Promise<void>,
    text: string,
    intent: string | null,
    draft: any,
  ): Promise<void> {
    const pageId = page.id as number;
    const codes = draft.pendingMultiPreview as string[];

    if (intent === 'CONFIRM' || intent === 'MULTI_CONFIRM') {
      const products = await this.prisma.product.findMany({
        where: { pageId, code: { in: codes } },
      });
      const newDraft = this.draftHandler.startDraftFromCodes(codes, products as any[], [], 'WHATSAPP');
      await this.ctx.saveDraft(pageId, waId, newDraft);
      await safeSend('ঠিক আছে 💖 আপনার নাম দিন।');
    } else if (intent === 'CANCEL') {
      await this.ctx.clearDraft(pageId, waId);
      const msg = await this.botKnowledge.resolveSystemReply(pageId, 'order_cancelled');
      await safeSend(msg || 'ঠিক আছে 💖 কোনো সমস্যা নেই।');
    } else {
      await safeSend(
        'সবগুলো order করতে *confirm* লিখুন, বাতিল করতে *cancel* লিখুন 💖',
      );
    }
  }
}
