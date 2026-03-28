import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * V8: Flexible product code normalization.
 * Supports custom prefix (e.g. SK, FZ, BD) set per page in settings.
 * Falls back to DF if no custom prefix.
 *
 * Valid formats:  DF-0001  SK-0001  FZ0001  BD-100
 * Always stored as: PREFIX-XXXX (padded to 4 digits min)
 */
export function normalizeProductCode(input: string, prefix = 'DF'): string {
  const raw = String(input || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!raw) throw new BadRequestException('Product code is required');

  // Accept any PREFIX-DIGITS or PREFIX_DIGITS or PREFIXDIGITS
  // where PREFIX is 2-6 letters and DIGITS is 1-8 numbers
  const re = new RegExp(`^([A-Z]{2,6})[-_]?(\\d{1,8})$`);
  const m = raw.match(re);
  if (!m)
    throw new BadRequestException(
      `Invalid code format. Use ${prefix}-0001 style`,
    );

  const codePrefix = m[1]; // use whatever prefix was typed
  const digits = m[2].padStart(4, '0');
  return `${codePrefix}-${digits}`;
}

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    pageId: number;
    code: string;
    price: number;
    costPrice?: number;
    stockQty?: number;
    name?: string;
    description?: string;
    imageUrl?: string;
    postCaption?: string;
    videoUrl?: string;
    catalogVisible?: boolean;
    catalogSortOrder?: number;
    variantOptions?: string | null;
    // V18: Image recognition metadata
    category?: string | null;
    color?: string | null;
    tags?: string | null;
    imageKeywords?: string | null;
    aiDescription?: string | null;
    visionSearchable?: boolean;
  }) {
    const code = normalizeProductCode(data.code);
    const existing = await this.prisma.product.findUnique({
      where: { pageId_code: { pageId: data.pageId, code } },
    });
    if (existing)
      throw new BadRequestException(
        `Product ${code} already exists for this page`,
      );
    return this.prisma.product.create({
      data: {
        pageId: data.pageId,
        code,
        price: data.price,
        costPrice: data.costPrice ?? 0,
        stockQty: data.stockQty ?? 0,
        name: data.name ?? null,
        description: data.description ?? null,
        imageUrl: data.imageUrl ?? null,
        postCaption: data.postCaption ?? null,
        videoUrl: data.videoUrl ?? null,
        catalogVisible: data.catalogVisible ?? true,
        catalogSortOrder: data.catalogSortOrder ?? 0,
        variantOptions: data.variantOptions ?? null,
        category: data.category ?? null,
        color: data.color ?? null,
        tags: data.tags ?? null,
        imageKeywords: data.imageKeywords ?? null,
        aiDescription: data.aiDescription ?? null,
        visionSearchable: data.visionSearchable ?? false,
      },
    });
  }

  async listByPage(pageId: number, query?: string) {
    const where: any = { pageId };
    if (query) where.code = { contains: query.toUpperCase() };
    return this.prisma.product.findMany({
      where,
      orderBy: { id: 'desc' },
      take: 500,
    });
  }

  async findByCode(pageId: number, codeRaw: string) {
    const code = normalizeProductCode(codeRaw);
    const p = await this.prisma.product.findUnique({
      where: { pageId_code: { pageId, code } },
    });
    if (!p) throw new NotFoundException('Product not found');
    return p;
  }

  async updateOne(
    pageId: number,
    codeRaw: string,
    data: {
      stockQty?: number;
      price?: number;
      costPrice?: number;
      name?: string;
      description?: string;
      imageUrl?: string;
      isActive?: boolean;
      postCaption?: string;
      videoUrl?: string;
      catalogVisible?: boolean;
      catalogSortOrder?: number;
      variantOptions?: string | null;
      // V18: Image recognition metadata
      category?: string | null;
      color?: string | null;
      tags?: string | null;
      imageKeywords?: string | null;
      aiDescription?: string | null;
      visionSearchable?: boolean;
    },
  ) {
    const code = normalizeProductCode(codeRaw);
    const payload: any = {};
    if (typeof data.stockQty === 'number') {
      if (data.stockQty < 0)
        throw new BadRequestException('Stock cannot be negative');
      payload.stockQty = data.stockQty;
    }
    if (typeof data.price === 'number') payload.price = data.price;
    if (typeof data.costPrice === 'number') payload.costPrice = data.costPrice;
    if (typeof data.name === 'string') payload.name = data.name;
    if (typeof data.description === 'string')
      payload.description = data.description;
    if (typeof data.imageUrl === 'string') payload.imageUrl = data.imageUrl;
    if (typeof data.isActive === 'boolean') payload.isActive = data.isActive;
    if (typeof data.postCaption === 'string')
      payload.postCaption = data.postCaption || null;
    if (typeof data.videoUrl === 'string')
      payload.videoUrl = data.videoUrl || null;
    if (typeof data.catalogVisible === 'boolean')
      payload.catalogVisible = data.catalogVisible;
    if (typeof data.catalogSortOrder === 'number')
      payload.catalogSortOrder = data.catalogSortOrder;
    if (data.variantOptions !== undefined)
      payload.variantOptions = data.variantOptions;
    // V18: image recognition metadata fields
    if (data.category !== undefined) payload.category = data.category || null;
    if (data.color !== undefined) payload.color = data.color || null;
    if (data.tags !== undefined) payload.tags = data.tags || null;
    if (data.imageKeywords !== undefined) payload.imageKeywords = data.imageKeywords || null;
    if (data.aiDescription !== undefined) payload.aiDescription = data.aiDescription || null;
    if (typeof data.visionSearchable === 'boolean') payload.visionSearchable = data.visionSearchable;
    if (Object.keys(payload).length === 0)
      return this.findByCode(pageId, codeRaw);
    return this.prisma.product.update({
      where: { pageId_code: { pageId, code } },
      data: payload,
    });
  }
  async updateStock(pageId: number, codeRaw: string, delta: number) {
    const p = await this.findByCode(pageId, codeRaw);
    return this.prisma.product.update({
      where: { pageId_code: { pageId, code: p.code } },
      data: { stockQty: p.stockQty + delta },
    });
  }

  async updatePrice(pageId: number, codeRaw: string, price: number) {
    const p = await this.findByCode(pageId, codeRaw);
    return this.prisma.product.update({
      where: { pageId_code: { pageId, code: p.code } },
      data: { price },
    });
  }

  async deleteOne(pageId: number, codeRaw: string) {
    const code = normalizeProductCode(codeRaw);
    await this.prisma.product.delete({
      where: { pageId_code: { pageId, code } },
    });
    return { success: true };
  }

  /**
   * V8: Decrement stock after order confirmed.
   * Called from DraftOrderHandler.finalizeDraftOrder
   */
  async decrementStock(
    pageId: number,
    items: { productCode: string; qty: number }[],
  ) {
    for (const item of items) {
      try {
        const code = normalizeProductCode(item.productCode);
        const product = await this.prisma.product.findUnique({
          where: { pageId_code: { pageId, code } },
        });
        if (!product) continue;
        const newQty = Math.max(0, product.stockQty - item.qty);
        await this.prisma.product.update({
          where: { pageId_code: { pageId, code } },
          data: { stockQty: newQty },
        });
      } catch {}
    }
  }
}
