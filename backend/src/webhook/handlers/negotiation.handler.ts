import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BotKnowledgeService } from '../../bot-knowledge/bot-knowledge.service';
import { BotIntentService } from '../../bot/bot-intent.service';
import {
  ConversationContextService,
  DraftSession,
} from '../../conversation-context/conversation-context.service';

@Injectable()
export class NegotiationHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly botKnowledge: BotKnowledgeService,
    private readonly botIntent: BotIntentService,
    private readonly ctx: ConversationContextService,
  ) {}

  async handle(
    pageId: number,
    psid: string,
    text: string,
    draft: DraftSession | null,
    replyToText?: string,
  ): Promise<string> {
    const cfg = await this.botKnowledge.getConfig(pageId);
    const pricingPolicy = (cfg as any).pricingPolicy || {};
    const offered = this.botIntent.extractOfferedPrice(text);

    // Try to find the product being discussed — in order of confidence:
    // an explicit Messenger reply-quote, an item already in the draft, or
    // (most common when the customer hasn't started an order yet) whatever
    // product was last shown/discussed in this conversation.
    let product: any = null;
    const codeFromReply = replyToText
      ? this.botIntent.extractSingleCode(replyToText)
      : null;
    const codeFromDraft = draft?.items?.[0]?.productCode;
    let code = codeFromReply || codeFromDraft;
    if (!code) {
      const lastPresented = await this.ctx.getLastPresentedProducts(pageId, psid);
      code = lastPresented?.[0]?.code;
    }
    if (code) {
      product = await this.prisma.product.findFirst({
        where: { pageId, code },
      });
    }

    // Save offered price into draft if available
    if (draft && offered) {
      draft.offeredPrice = offered;
      draft.negotiationRequested = true;
      draft.orderNote = text;
      await this.ctx.saveDraft(pageId, psid, draft);
    }

    return this.botKnowledge.buildNegotiationReply(
      pricingPolicy,
      product,
      offered,
    );
  }
}
