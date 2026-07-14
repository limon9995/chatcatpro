import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { PageService } from '../page/page.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { EmbeddingQueueService } from '../embedding/embedding-queue.service';

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
    .replace(/\s+/g, '-');
  if (!raw) throw new BadRequestException('Product code is required');

  // Shop owners can use any code scheme they like (barcodes, SKUs, plain
  // numbers, PREFIX-0001, etc) — just normalize to letters/digits/-/_ and
  // cap the length. If it happens to match the classic PREFIX+DIGITS shape,
  // pad the digits to 4 for a tidy, consistent look; otherwise use as-is.
  const cleaned = raw.replace(/[^A-Z0-9_-]/g, '');
  if (!cleaned)
    throw new BadRequestException('Product code must contain letters or numbers');
  if (cleaned.length > 30)
    throw new BadRequestException('Product code is too long (max 30 characters)');

  const classic = cleaned.match(/^([A-Z]{2,6})[-_]?(\d{1,8})$/);
  if (classic) return `${classic[1]}-${classic[2].padStart(4, '0')}`;
  return cleaned;
}

function normalizeDeliveryCharge(input?: string | null): 'FREE' | 'PAID' {
  return String(input || '').trim().toUpperCase() === 'FREE' ? 'FREE' : 'PAID';
}

function normalizeReferenceImagesJson(input?: string | null): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const normalized = parsed
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .filter((value, index, all) => all.indexOf(value) === index);
      return normalized.length ? JSON.stringify(normalized) : null;
    }
  } catch {
    // Allow one-URL-per-line textarea input.
  }

  const normalized = raw
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index);

  return normalized.length ? JSON.stringify(normalized) : null;
}

type ProductSidecarMeta = {
  referenceImagesJson?: string | null;
  productGroup?: string | null;
  variantLabel?: string | null;
};

@Injectable()
export class ProductsService {
  private readonly referenceImagesFile = join(
    process.cwd(),
    'data',
    'product-sidecar-meta.json',
  );
  // Mutex: prevents concurrent read-write races on the sidecar JSON file
  private sidecarLock: Promise<void> = Promise.resolve();

  constructor(
    private prisma: PrismaService,
    private pageService: PageService,
    private embeddingService: EmbeddingService,
    private embeddingQueue: EmbeddingQueueService,
  ) {}

  /** Returns masterPageId if this page is linked, otherwise own id. */
  async getEffectivePageId(pageId: number): Promise<number> {
    return this.pageService.getEffectivePageId(pageId);
  }

  private effectiveId(pageId: number): Promise<number> {
    return this.getEffectivePageId(pageId);
  }

  private productRefKey(pageId: number, code: string): string {
    return `${pageId}:${code}`;
  }

  private normalizeSidecarValue(value: unknown): ProductSidecarMeta {
    if (!value) return {};
    if (typeof value === 'string') {
      return { referenceImagesJson: value };
    }
    if (typeof value === 'object') {
      const raw = value as Record<string, unknown>;
      return {
        referenceImagesJson: normalizeReferenceImagesJson(
          raw.referenceImagesJson as string | null | undefined,
        ),
        productGroup: String(raw.productGroup || '').trim() || null,
        variantLabel: String(raw.variantLabel || '').trim() || null,
      };
    }
    return {};
  }

  private async loadReferenceImagesMap(): Promise<
    Record<string, ProductSidecarMeta>
  > {
    try {
      const raw = await fs.readFile(this.referenceImagesFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [
          key,
          this.normalizeSidecarValue(value),
        ]),
      );
    } catch (error: any) {
      if (error?.code === 'ENOENT') return {};
      throw error;
    }
  }

  private async saveReferenceImagesMap(
    data: Record<string, ProductSidecarMeta>,
  ): Promise<void> {
    await fs.mkdir(join(process.cwd(), 'data'), { recursive: true });
    await fs.writeFile(
      this.referenceImagesFile,
      JSON.stringify(data, null, 2),
      'utf8',
    );
  }

  private withSidecarLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.sidecarLock.then(fn);
    this.sidecarLock = next.then(
      () => {},
      () => {},
    );
    return next;
  }

  private async setSidecarMetaForProduct(
    pageId: number,
    code: string,
    meta: ProductSidecarMeta,
  ): Promise<void> {
    return this.withSidecarLock(async () => {
      const all = await this.loadReferenceImagesMap();
      const key = this.productRefKey(pageId, code);
      const nextValue: ProductSidecarMeta = {
        referenceImagesJson: normalizeReferenceImagesJson(
          meta.referenceImagesJson,
        ),
        productGroup: String(meta.productGroup || '').trim() || null,
        variantLabel: String(meta.variantLabel || '').trim() || null,
      };
      if (
        !nextValue.referenceImagesJson &&
        !nextValue.productGroup &&
        !nextValue.variantLabel
      ) {
        delete all[key];
      } else {
        all[key] = nextValue;
      }
      await this.saveReferenceImagesMap(all);
    });
  }

  private async removeSidecarMetaForProduct(
    pageId: number,
    code: string,
  ): Promise<void> {
    return this.withSidecarLock(async () => {
      const all = await this.loadReferenceImagesMap();
      delete all[this.productRefKey(pageId, code)];
      await this.saveReferenceImagesMap(all);
    });
  }

  async attachReferenceImages<T extends { code: string }>(
    pageId: number,
    product: T,
  ): Promise<
    T & {
      referenceImagesJson: string | null;
      productGroup: string | null;
      variantLabel: string | null;
    }
  > {
    const all = await this.loadReferenceImagesMap();
    const meta = this.normalizeSidecarValue(
      all[this.productRefKey(pageId, product.code)],
    );
    return {
      ...product,
      referenceImagesJson: meta.referenceImagesJson || null,
      productGroup: meta.productGroup || null,
      variantLabel: meta.variantLabel || null,
    };
  }

  async attachReferenceImagesList<T extends { code: string }>(
    pageId: number,
    products: T[],
  ): Promise<
    Array<
      T & {
        referenceImagesJson: string | null;
        productGroup: string | null;
        variantLabel: string | null;
      }
    >
  > {
    const all = await this.loadReferenceImagesMap();
    return products.map((product) => ({
      ...product,
      referenceImagesJson:
        this.normalizeSidecarValue(
          all[this.productRefKey(pageId, product.code)],
        ).referenceImagesJson || null,
      productGroup:
        this.normalizeSidecarValue(
          all[this.productRefKey(pageId, product.code)],
        ).productGroup || null,
      variantLabel:
        this.normalizeSidecarValue(
          all[this.productRefKey(pageId, product.code)],
        ).variantLabel || null,
    }));
  }

  private extractFbPostId(url: string): string | null {
    if (!url) return null;
    try {
      const u = new URL(url.trim());
      const match = u.pathname.match(/\/(posts|videos|photos)\/(\d+)/);
      if (match) return match[2];
      const storyId = u.searchParams.get('story_fbid');
      if (storyId) return storyId;
      const fbid = u.searchParams.get('fbid');
      if (fbid) return fbid;
    } catch {}
    return null;
  }

  async create(data: {
    pageId: number;
    code?: string;
    price: number;
    costPrice?: number;
    stockQty?: number;
    name?: string;
    description?: string;
    imageUrl?: string;
    referenceImagesJson?: string | null;
    productGroup?: string | null;
    variantLabel?: string | null;
    postCaption?: string;
    videoUrl?: string;
    fbPostUrl?: string;
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
    // V22: Simple products
    productType?: string;
    unit?: string | null;
    orderEnabled?: boolean;
    // V23: Per-product delivery charge — "FREE" | "PAID"
    deliveryCharge?: string;
    // V24: discount (only shown when > price) and per-product policy override
    originalPrice?: number | null;
    pricingPolicyOverride?: string | null;
    // V25: Restaurant food — size/portion pricing + BOM stock mode
    priceVariantsJson?: string | null;
    trackStock?: boolean;
  }) {
    const eid = await this.effectiveId(data.pageId);
    const isSimple = data.productType === 'SIMPLE';
    const code = isSimple
      ? `SP-${Date.now().toString().slice(-8)}`
      : normalizeProductCode(data.code ?? '');
    const existing = await this.prisma.product.findUnique({
      where: { pageId_code: { pageId: eid, code } },
    });
    if (existing)
      throw new BadRequestException(
        `Product ${code} already exists for this page`,
      );
    const created = await this.prisma.product.create({
      data: {
        pageId: eid,
        code,
        price: data.price,
        costPrice: data.costPrice ?? 0,
        stockQty: data.stockQty ?? 0,
        name: data.name ?? null,
        description: data.description ?? null,
        imageUrl: data.imageUrl ?? null,
        postCaption: data.postCaption ?? null,
        videoUrl: data.videoUrl ?? null,
        fbPostUrl: data.fbPostUrl ?? null,
        fbPostId: data.fbPostUrl ? this.extractFbPostId(data.fbPostUrl) : null,
        catalogVisible: data.catalogVisible ?? true,
        catalogSortOrder: data.catalogSortOrder ?? 0,
        variantOptions: data.variantOptions ?? null,
        category: data.category ?? null,
        color: data.color ?? null,
        tags: data.tags ?? null,
        imageKeywords: data.imageKeywords ?? null,
        aiDescription: data.aiDescription ?? null,
        visionSearchable: data.visionSearchable ?? false,
        productType: data.productType ?? 'CODED',
        unit: data.unit ?? null,
        orderEnabled: data.orderEnabled !== false,
        deliveryCharge: normalizeDeliveryCharge(data.deliveryCharge),
        originalPrice: data.originalPrice ?? null,
        pricingPolicyOverride: data.pricingPolicyOverride ?? null,
        priceVariantsJson: data.priceVariantsJson ?? null,
        trackStock: data.trackStock ?? true,
      },
    });
    await this.setSidecarMetaForProduct(eid, created.code, {
      referenceImagesJson: data.referenceImagesJson,
      productGroup: data.productGroup,
      variantLabel: data.variantLabel,
    });
    // V20: Background embedding — fire-and-forget, never blocks response
    if (created.imageUrl) {
      void this.embeddingQueue.add(() =>
        this.embeddingService.indexProduct(created.id, created.imageUrl!),
      );
    }
    return this.attachReferenceImages(eid, created);
  }

  async listByPage(pageId: number, query?: string) {
    const eid = await this.effectiveId(pageId);
    const where: any = { pageId: eid };
    if (query) where.code = { contains: query.toUpperCase() };
    const products = await this.prisma.product.findMany({
      where,
      orderBy: { id: 'desc' },
      take: 500,
    });
    return this.attachReferenceImagesList(eid, products);
  }

  async findByCode(pageId: number, codeRaw: string) {
    const eid = await this.effectiveId(pageId);
    const code = codeRaw.startsWith('SP-') ? codeRaw : normalizeProductCode(codeRaw);
    const p = await this.prisma.product.findUnique({
      where: { pageId_code: { pageId: eid, code } },
    });
    if (!p) throw new NotFoundException('Product not found');
    return this.attachReferenceImages(eid, p);
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
      referenceImagesJson?: string | null;
      productGroup?: string | null;
      variantLabel?: string | null;
      isActive?: boolean;
      postCaption?: string;
      videoUrl?: string;
      fbPostUrl?: string;
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
      // V22: Simple products
      unit?: string | null;
      orderEnabled?: boolean;
      // V23: Per-product delivery charge — "FREE" | "PAID"
      deliveryCharge?: string;
      // V24: discount (only shown when > price) and per-product policy override
      originalPrice?: number | null;
      pricingPolicyOverride?: string | null;
      // V25: Restaurant food — size/portion pricing + BOM stock mode
      priceVariantsJson?: string | null;
      trackStock?: boolean;
    },
  ) {
    const code = codeRaw.startsWith('SP-') ? codeRaw : normalizeProductCode(codeRaw);
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
    if (typeof data.fbPostUrl === 'string') {
      payload.fbPostUrl = data.fbPostUrl || null;
      payload.fbPostId = data.fbPostUrl ? this.extractFbPostId(data.fbPostUrl) : null;
    }
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
    if (data.imageKeywords !== undefined)
      payload.imageKeywords = data.imageKeywords || null;
    if (data.aiDescription !== undefined)
      payload.aiDescription = data.aiDescription || null;
    if (typeof data.visionSearchable === 'boolean')
      payload.visionSearchable = data.visionSearchable;
    if (data.unit !== undefined) payload.unit = data.unit || null;
    if (typeof data.orderEnabled === 'boolean')
      payload.orderEnabled = data.orderEnabled;
    if (data.deliveryCharge !== undefined)
      payload.deliveryCharge = normalizeDeliveryCharge(data.deliveryCharge);
    if (data.originalPrice !== undefined)
      payload.originalPrice = data.originalPrice;
    if (data.pricingPolicyOverride !== undefined)
      payload.pricingPolicyOverride = data.pricingPolicyOverride || null;
    if (data.priceVariantsJson !== undefined)
      payload.priceVariantsJson = data.priceVariantsJson || null;
    if (typeof data.trackStock === 'boolean')
      payload.trackStock = data.trackStock;
    const eid = await this.effectiveId(pageId);
    const sidecarOnlyUpdate =
      data.referenceImagesJson !== undefined ||
      data.productGroup !== undefined ||
      data.variantLabel !== undefined;
    if (Object.keys(payload).length === 0 && !sidecarOnlyUpdate)
      return this.findByCode(pageId, codeRaw);
    const updated =
      Object.keys(payload).length === 0
        ? await this.prisma.product.findUniqueOrThrow({
            where: { pageId_code: { pageId: eid, code } },
          })
        : await this.prisma.product.update({
            where: { pageId_code: { pageId: eid, code } },
            data: payload,
          });
    if (
      data.referenceImagesJson !== undefined ||
      data.productGroup !== undefined ||
      data.variantLabel !== undefined
    ) {
      await this.setSidecarMetaForProduct(eid, updated.code, {
        referenceImagesJson: data.referenceImagesJson,
        productGroup: data.productGroup,
        variantLabel: data.variantLabel,
      });
    }
    // V20: Re-embed when imageUrl is explicitly updated
    if (typeof data.imageUrl === 'string' && updated.imageUrl) {
      void this.embeddingQueue.add(() =>
        this.embeddingService.indexProduct(updated.id, updated.imageUrl!),
      );
    }
    return this.attachReferenceImages(eid, updated);
  }
  async updateStock(pageId: number, codeRaw: string, delta: number) {
    const eid = await this.effectiveId(pageId);
    const p = await this.findByCode(pageId, codeRaw);
    return this.prisma.product.update({
      where: { pageId_code: { pageId: eid, code: p.code } },
      data: { stockQty: p.stockQty + delta },
    });
  }

  async updatePrice(pageId: number, codeRaw: string, price: number) {
    const eid = await this.effectiveId(pageId);
    const p = await this.findByCode(pageId, codeRaw);
    return this.prisma.product.update({
      where: { pageId_code: { pageId: eid, code: p.code } },
      data: { price },
    });
  }

  async deleteOne(pageId: number, codeRaw: string) {
    const eid = await this.effectiveId(pageId);
    const code = codeRaw.startsWith('SP-') ? codeRaw : normalizeProductCode(codeRaw);
    await this.prisma.product.delete({
      where: { pageId_code: { pageId: eid, code } },
    });
    await this.removeSidecarMetaForProduct(eid, code);
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
    const eid = await this.effectiveId(pageId);
    for (const item of items) {
      try {
        const code = item.productCode.startsWith('SP-') ? item.productCode : normalizeProductCode(item.productCode);
        const product = await this.prisma.product.findUnique({
          where: { pageId_code: { pageId: eid, code } },
        });
        if (!product) continue;
        const newQty = Math.max(0, product.stockQty - item.qty);
        await this.prisma.product.update({
          where: { pageId_code: { pageId: eid, code } },
          data: { stockQty: newQty },
        });
      } catch {}
    }
  }
}
