import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MessengerService } from '../../messenger/messenger.service';
import { BotKnowledgeService } from '../../bot-knowledge/bot-knowledge.service';
import { BotIntentService } from '../../bot/bot-intent.service';
import { ConversationContextService } from '../../conversation-context/conversation-context.service';

@Injectable()
export class ProductInfoHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messenger: MessengerService,
    private readonly botKnowledge: BotKnowledgeService,
    private readonly botIntent: BotIntentService,
    private readonly ctx: ConversationContextService,
  ) {}

  async sendProductInfo(page: any, psid: string, code: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { pageId: page.id, code },
    });
    if (!product) {
      const reply = await this.botKnowledge.resolveSystemReply(
        page.id,
        'product_not_found',
        { productCode: code },
      );
      await this.messenger.sendText(page.pageToken, psid, reply);
      return;
    }
    await this.ctx.setLastPresentedProducts(page.id, psid, [product]);

    if (product.stockQty <= 0) {
      const reply = await this.botKnowledge.resolveSystemReply(
        page.id,
        'stock_out',
        { productCode: product.code },
      );
      await this.messenger.sendText(page.pageToken, psid, reply);
      return;
    }

    let msg = await this.botKnowledge.resolveSystemReply(
      page.id,
      'product_info',
      {
        productCode: product.code,
        productPrice: product.price,
        productStock: product.stockQty,
        productInfoNote: product.description || '',
      },
    );
    if (page.orderModeOn) {
      const prompt = await this.botKnowledge.resolveSystemReply(
        page.id,
        'order_prompt',
      );
      if (prompt) msg += `\n\n${prompt}`;
    }
    await this.messenger.sendText(page.pageToken, psid, msg.trim());
  }

  async sendMultiProductPreview(
    page: any,
    psid: string,
    codes: string[],
  ): Promise<void> {
    const products = await this.prisma.product.findMany({
      where: { pageId: page.id, code: { in: codes } },
    });
    if (!products.length) return;

    const sym = page.currencySymbol || '৳';
    await this.ctx.setLastPresentedProducts(page.id, psid, products);

    const lines = codes
      .map((c) => products.find((p) => p.code === c))
      .filter(Boolean)
      .map(
        (p: any) =>
          `${p.code} — ${p.price}${sym}${p.stockQty <= 0 ? ' ❌ Stock Out' : ''}`,
      );

    await this.messenger.sendText(
      page.pageToken,
      psid,
      lines.join('\n') +
        '\n\nসবগুলো order করতে চান? **confirm** / **cancel** লিখুন 💖',
    );
  }

  async getProductsByCodes(pageId: number, codes: string[]) {
    return this.prisma.product.findMany({
      where: { pageId, code: { in: codes } },
    });
  }
}
