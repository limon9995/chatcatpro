import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MessengerService } from '../../messenger/messenger.service';
import { BotKnowledgeService } from '../../bot-knowledge/bot-knowledge.service';
import { BotIntentService } from '../../bot/bot-intent.service';
import { ConversationContextService } from '../../conversation-context/conversation-context.service';

function getFullImageUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = process.env.API_BASE_URL || 'https://api.chatcat.pro';
  return `${base.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
}

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

    // Send generic template card
    const imageUrl = getFullImageUrl(product.imageUrl);
    const catalogBase = (page.catalogBaseUrl || '').replace(/\/$/, '') ||
      `https://api.chatcat.pro/catalog/${page.id}`;
    const productUrl = `${catalogBase}/product/${product.code}`;
    const sym = page.currencySymbol || '৳';

    await this.messenger.sendGenericTemplate(page.pageToken, psid, [
      {
        title: product.name || product.code,
        image_url: imageUrl,
        subtitle: `${sym}${Number(product.price).toLocaleString()} · Code: ${product.code}`,
        buttons: [
          {
            type: 'web_url' as const,
            url: productUrl,
            title: '🛍 Details দেখুন',
          },
        ],
      },
    ]);

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
    // Append catalog link as plain text (visible on Facebook Lite too)
    msg += `\n\n🔗 ${productUrl}`;
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

    // Send generic template carousel
    const elements = products.map((p: any) => {
      const imageUrl = getFullImageUrl(p.imageUrl);
      const productUrl = `https://api.chatcat.pro/catalog/${page.id}/product/${p.code}`;
      return {
        title: p.name || p.code,
        image_url: imageUrl,
        subtitle: `${sym}${Number(p.price).toLocaleString()} · Code: ${p.code}${p.stockQty <= 0 ? ' (Stock Out)' : ''}`,
        buttons: [
          {
            type: 'web_url' as const,
            url: productUrl,
            title: 'View product',
          },
        ],
      };
    });

    await this.messenger.sendGenericTemplate(page.pageToken, psid, elements);

    await this.messenger.sendText(
      page.pageToken,
      psid,
      'সবগুলো order করতে চান? **confirm** / **cancel** লিখুন 💖',
    );
  }

  async getProductsByCodes(pageId: number, codes: string[]) {
    return this.prisma.product.findMany({
      where: { pageId, code: { in: codes } },
    });
  }
}
