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
      const codes = this.botIntent.extractAllCodes(text);
      if (codes.length > 0) {
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

            // Start order draft for this product
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
            );
            await this.ctx.saveDraft(pageId, waId, newDraft);
          }

          await safeSend(infoMsg.trim());
          return;
        } else if (product === null) {
          // Product code matched but out of stock or not found
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

    // ── Fallback — no reply found ──────────────────────────────────────────────
    // Silently skip (don't spam customer with "I don't understand")
    this.logger.debug(`[WA] No reply for waId=${waId} text="${text.slice(0, 60)}"`);
  }
}
