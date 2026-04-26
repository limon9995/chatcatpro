import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BotKnowledgeService } from '../bot-knowledge/bot-knowledge.service';

export interface BusinessProduct {
  code: string;
  name: string;
  price: number;
  stockQty: number;
  category: string | null;
}

export interface BusinessContext {
  businessName: string | null;
  deliveryInsideFee: number;
  deliveryOutsideFee: number;
  deliveryTime: string;
  products: BusinessProduct[];
  paymentRules: Record<string, any>;
  pricingPolicy: Record<string, any>;
  knowledgeText: string;
}

@Injectable()
export class BotContextService {
  private readonly logger = new Logger(BotContextService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly botKnowledge: BotKnowledgeService,
  ) {}

  async buildBusinessContext(pageId: number): Promise<BusinessContext> {
    const [page, products, knowledgeConfig] = await Promise.all([
      this.prisma.page.findUnique({
        where: { id: pageId },
        select: {
          businessName: true,
          deliveryFeeInsideDhaka: true,
          deliveryFeeOutsideDhaka: true,
          deliveryTimeText: true,
          knowledgeText: true,
        },
      }),
      this.prisma.product.findMany({
        where: { pageId, isActive: true },
        select: { code: true, name: true, price: true, stockQty: true, category: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.botKnowledge.getConfig(pageId).catch(() => null),
    ]);

    return {
      businessName: page?.businessName ?? null,
      deliveryInsideFee: (page as any)?.deliveryFeeInsideDhaka ?? 80,
      deliveryOutsideFee: (page as any)?.deliveryFeeOutsideDhaka ?? 130,
      deliveryTime: (page as any)?.deliveryTimeText ?? '২-৩ কার্যদিবস',
      products: products as BusinessProduct[],
      paymentRules: (knowledgeConfig as any)?.paymentRules ?? {},
      pricingPolicy: (knowledgeConfig as any)?.pricingPolicy ?? {},
      knowledgeText: (page as any)?.knowledgeText ?? '',
    };
  }
}
