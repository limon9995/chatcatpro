import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption.service';
import { IgMessengerService } from './ig-messenger.service';
import { BotKnowledgeService } from '../bot-knowledge/bot-knowledge.service';
import { BotIntentService } from '../bot/bot-intent.service';
import { ConversationContextService } from '../conversation-context/conversation-context.service';
import { DraftOrderHandler } from '../webhook/handlers/draft-order.handler';
import { CrmService } from '../crm/crm.service';

@Injectable()
export class IgWebhookService {
  private readonly logger = new Logger(IgWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly igMessenger: IgMessengerService,
    private readonly botKnowledge: BotKnowledgeService,
    private readonly botIntent: BotIntentService,
    private readonly ctx: ConversationContextService,
    private readonly draftHandler: DraftOrderHandler,
    private readonly crm: CrmService,
  ) {}

  // ── Entry point ─────────────────────────────────────────────────────────────

  async handle(body: any): Promise<void> {
    if (!body || body.object !== 'instagram') return;

    for (const entry of body.entry ?? []) {
      const igAccountId: string = entry.id;
      if (!igAccountId) continue;

      const page = await this.prisma.page.findFirst({
        where: { igBusinessAccountId: igAccountId, igEnabled: true, isActive: true },
      });

      if (!page) {
        this.logger.warn(`[IG] No active page for igBusinessAccountId=${igAccountId}`);
        continue;
      }

      if (!page.igToken) {
        this.logger.warn(`[IG] Page id=${page.id} has no igToken`);
        continue;
      }

      if (page.subscriptionStatus === 'SUSPENDED') {
        this.logger.log(`[IG] Page id=${page.id} SUSPENDED — skipping`);
        continue;
      }
      if (page.nextBillingDate && new Date(page.nextBillingDate) < new Date()) {
        await this.prisma.page.update({
          where: { id: page.id },
          data: { subscriptionStatus: 'SUSPENDED' },
        });
        continue;
      }

      // ── DM messages ────────────────────────────────────────────────────────
      for (const msgEvent of entry.messaging ?? []) {
        const senderId: string = msgEvent.sender?.id;
        if (!senderId || senderId === igAccountId) continue; // skip own messages

        this.processDm(page, senderId, msgEvent).catch((err) =>
          this.logger.error(`[IG] processDm error senderId=${senderId}: ${err}`),
        );
      }

      // ── Post comments ──────────────────────────────────────────────────────
      for (const change of entry.changes ?? []) {
        if (change.field !== 'comments') continue;

        const value = change.value;
        const commentId: string = value?.id;
        const commentText: string = value?.text || '';
        const commenterId: string = value?.from?.id;

        if (!commentId || !commentText || !commenterId) continue;
        if (commenterId === igAccountId) continue; // skip own comments

        this.processComment(page, commentId, commenterId, commentText).catch((err) =>
          this.logger.error(`[IG] processComment error commentId=${commentId}: ${err}`),
        );
      }
    }
  }

  // ── DM processor ────────────────────────────────────────────────────────────

  async processDm(page: any, senderId: string, event: any): Promise<void> {
    const pageId = page.id as number;
    const rawToken = this.encryption.decrypt(page.igToken as string);

    const safeSend = async (text: string) => {
      if (!text) return;
      try {
        await this.igMessenger.sendText(rawToken, senderId, text);
      } catch (err) {
        this.logger.error(`[IG] safeSend senderId=${senderId}: ${err}`);
      }
    };

    const isBlocked = await this.crm.isBlocked(pageId, senderId);
    if (isBlocked) return;

    const agentHandling = await this.ctx.isAgentHandling(pageId, senderId);
    if (agentHandling) return;

    const msg = event.message;
    if (!msg) return;

    // Image attachment
    if (msg.attachments?.some((a: any) => a.type === 'image')) {
      if (!page.automationOn) return;
      await safeSend('📸 ছবি পেয়েছি! Product code দিলে আরও দ্রুত সাহায্য করতে পারব 💖');
      return;
    }

    const text = (msg.text || '').trim();
    if (!text) return;
    if (!page.automationOn) return;

    let draft = await this.ctx.getActiveDraft(pageId, senderId);
    if (draft) {
      const session = await this.ctx.getSession(pageId, senderId);
      const hoursSince = session
        ? (Date.now() - new Date(session.updatedAt).getTime()) / 3_600_000
        : 0;
      if (hoursSince > 24) {
        await this.ctx.clearDraft(pageId, senderId);
        draft = null;
      }
    }

    const awaitingConfirm =
      draft?.currentStep === 'confirm' ||
      (draft?.pendingMultiPreview?.length ?? 0) > 0;

    const intent = this.botIntent.detectIntent(text, awaitingConfirm);

    if (intent === 'CANCEL' && draft) {
      await this.ctx.clearDraft(pageId, senderId);
      const msg2 = await this.botKnowledge.resolveSystemReply(pageId, 'order_cancelled');
      await safeSend(msg2 || 'ঠিক আছে 💖 কোনো সমস্যা নেই।');
      return;
    }

    if (draft && page.orderModeOn) {
      const result = await this.draftHandler.captureField(pageId, senderId, text, draft, page);

      if (result === null) {
        const stillExists = await this.ctx.getActiveDraft(pageId, senderId);
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

    if (page.infoModeOn) {
      const codes = this.botIntent.extractAllCodes(text);
      if (codes.length > 0) {
        const code = codes[0];
        const product = await this.prisma.product.findFirst({
          where: { pageId, code, stockQty: { gt: 0 } },
        });

        if (product) {
          let infoMsg = await this.botKnowledge.resolveSystemReply(pageId, 'product_info', {
            productCode: product.code,
            productPrice: product.price,
            productStock: product.stockQty,
            productInfoNote: product.description || '',
          });

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
            const newDraft = this.draftHandler.startDraftFromCodes([code], [product as any], variantOptions);
            await this.ctx.saveDraft(pageId, senderId, newDraft);
          }

          await safeSend(infoMsg.trim());
          return;
        } else if (product === null) {
          const notFound = await this.botKnowledge.resolveSystemReply(pageId, 'product_not_found', {
            productCode: code,
          });
          await safeSend(notFound);
          return;
        }
      }
    }

    if (intent === 'GREETING') {
      const reply = await this.botKnowledge.resolveReply(pageId, text, senderId);
      if (reply?.reply) { await safeSend(reply.reply); return; }
      const greeting = await this.botKnowledge.resolveSystemReply(pageId, 'greeting');
      if (greeting) { await safeSend(greeting); return; }
      await safeSend('হ্যালো 💖 আমি এখানে আছি। কীভাবে সাহায্য করতে পারি?');
      return;
    }

    if (intent === 'CATALOG_REQUEST' && page.infoModeOn) {
      const catalogUrl = page.websiteUrl || '';
      if (catalogUrl) {
        await safeSend(`আমাদের সব product দেখতে এখানে যান:\n${catalogUrl}`);
      } else {
        const reply = await this.botKnowledge.resolveReply(pageId, text, senderId);
        if (reply?.reply) { await safeSend(reply.reply); return; }
        await safeSend('Product code বা screenshot দিন, সাহায্য করব 💖');
      }
      return;
    }

    const learned = await this.botKnowledge.resolveReply(pageId, text, senderId);
    if (learned?.reply) {
      const reminder = draft ? `\n\n${this.draftHandler.reminder(draft)}` : '';
      await safeSend(learned.reply + reminder);
      return;
    }

    this.logger.debug(`[IG] No DM reply for senderId=${senderId} text="${text.slice(0, 60)}"`);
  }

  // ── Comment processor ────────────────────────────────────────────────────────

  async processComment(page: any, commentId: string, commenterId: string, text: string): Promise<void> {
    const pageId = page.id as number;
    const rawToken = this.encryption.decrypt(page.igToken as string);

    if (!page.automationOn) return;

    const isBlocked = await this.crm.isBlocked(pageId, commenterId);
    if (isBlocked) return;

    const safeSendComment = async (msg: string) => {
      if (!msg) return;
      try {
        await this.igMessenger.sendCommentReply(rawToken, commentId, msg);
      } catch (err) {
        this.logger.error(`[IG] comment reply commentId=${commentId}: ${err}`);
      }
    };

    // Product code in comment → reply with product info
    if (page.infoModeOn) {
      const codes = this.botIntent.extractAllCodes(text);
      if (codes.length > 0) {
        const code = codes[0];
        const product = await this.prisma.product.findFirst({
          where: { pageId, code, stockQty: { gt: 0 } },
        });

        if (product) {
          const infoMsg = await this.botKnowledge.resolveSystemReply(pageId, 'product_info', {
            productCode: product.code,
            productPrice: product.price,
            productStock: product.stockQty,
            productInfoNote: product.description || '',
          });
          await safeSendComment(infoMsg.trim());
          return;
        }
      }
    }

    // Keyword match from bot knowledge
    const learned = await this.botKnowledge.resolveReply(pageId, text, commenterId);
    if (learned?.reply) {
      await safeSendComment(learned.reply);
      return;
    }

    this.logger.debug(`[IG] No comment reply for commentId=${commentId} text="${text.slice(0, 60)}"`);
  }
}
