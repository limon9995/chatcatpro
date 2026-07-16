import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { WalletService } from '../wallet/wallet.service';
import { AiUsageService } from '../common/ai-usage.service';
import { GeminiVisionProvider } from '../vision-analysis/providers/gemini.vision.provider';
import {
  MAX_PRICE_VARIANTS,
  parsePriceVariants,
  PriceVariant,
} from '../common/restaurant-delivery';

const VALID_UNITS = ['gm', 'kg', 'pcs', 'ml', 'liter'];

export interface MenuDish {
  name: string;
  category: string | null;
  description: string | null;
  variants: { label: string; price: number; pieces: number | null }[];
}

@Injectable()
export class RestaurantService {
  private readonly logger = new Logger(RestaurantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
    private readonly walletService: WalletService,
    private readonly aiUsage: AiUsageService,
    private readonly geminiVision: GeminiVisionProvider,
  ) {}

  // ── Ingredients ─────────────────────────────────────────────────────────────

  async listIngredients(pageId: number) {
    const items = await this.prisma.ingredient.findMany({
      where: { pageId },
      orderBy: { name: 'asc' },
    });
    return items.map((i) => ({ ...i, low: i.stockQty <= i.minStock }));
  }

  private sanitizeIngredient(body: any) {
    const out: any = {};
    if ('name' in body) {
      const name = String(body.name ?? '').trim();
      if (!name) throw new BadRequestException('Ingredient-এর নাম দিন');
      out.name = name.slice(0, 80);
    }
    if ('unit' in body) {
      const unit = String(body.unit ?? 'pcs').trim().toLowerCase();
      if (!VALID_UNITS.includes(unit))
        throw new BadRequestException(`Unit হতে হবে: ${VALID_UNITS.join(', ')}`);
      out.unit = unit;
    }
    if ('stockQty' in body) {
      const v = Number(body.stockQty);
      if (!Number.isFinite(v)) throw new BadRequestException('Stock সংখ্যা দিন');
      out.stockQty = v;
    }
    if ('minStock' in body) {
      const v = Number(body.minStock);
      if (!Number.isFinite(v) || v < 0)
        throw new BadRequestException('Minimum stock সঠিক নয়');
      out.minStock = v;
    }
    if ('costPerUnit' in body) {
      const v = Number(body.costPerUnit);
      if (!Number.isFinite(v) || v < 0)
        throw new BadRequestException('Cost per unit সঠিক নয়');
      out.costPerUnit = v;
    }
    if ('isActive' in body) out.isActive = Boolean(body.isActive);
    return out;
  }

  async createIngredient(pageId: number, body: any) {
    const data = this.sanitizeIngredient(body);
    if (!data.name) throw new BadRequestException('Ingredient-এর নাম দিন');
    try {
      return await this.prisma.ingredient.create({
        data: { pageId, unit: 'pcs', ...data },
      });
    } catch (err: any) {
      if (err?.code === 'P2002')
        throw new BadRequestException('এই নামে ingredient আগে থেকেই আছে');
      throw err;
    }
  }

  private async ensureIngredient(pageId: number, id: number) {
    const ing = await this.prisma.ingredient.findFirst({
      where: { id, pageId },
    });
    if (!ing) throw new NotFoundException('Ingredient not found');
    return ing;
  }

  async updateIngredient(pageId: number, id: number, body: any) {
    await this.ensureIngredient(pageId, id);
    const data = this.sanitizeIngredient(body);
    try {
      return await this.prisma.ingredient.update({ where: { id }, data });
    } catch (err: any) {
      if (err?.code === 'P2002')
        throw new BadRequestException('এই নামে ingredient আগে থেকেই আছে');
      throw err;
    }
  }

  async adjustIngredientStock(pageId: number, id: number, delta: number) {
    if (!Number.isFinite(delta) || delta === 0)
      throw new BadRequestException('Delta সংখ্যা দিন');
    await this.ensureIngredient(pageId, id);
    return this.prisma.ingredient.update({
      where: { id },
      data: { stockQty: { increment: delta } },
    });
  }

  async deleteIngredient(pageId: number, id: number) {
    await this.ensureIngredient(pageId, id);
    await this.prisma.ingredient.delete({ where: { id } }); // RecipeItems cascade
    return { ok: true };
  }

  // ── Recipes ─────────────────────────────────────────────────────────────────

  private async findProduct(pageId: number, code: string) {
    // findByCode resolves linked pages to their master (effectiveId) and
    // throws NotFoundException itself when the code doesn't exist.
    return this.productsService.findByCode(pageId, code) as Promise<any>;
  }

  async getRecipe(pageId: number, code: string) {
    const product = await this.findProduct(pageId, code);
    const items = await this.prisma.recipeItem.findMany({
      where: { productId: product.id },
      include: { ingredient: { select: { id: true, name: true, unit: true } } },
      orderBy: { id: 'asc' },
    });
    return { productCode: product.code, items };
  }

  /** Replace-all recipe rows for a product. */
  async setRecipe(
    pageId: number,
    code: string,
    rows: { ingredientId: number; qty: number; per?: string; variantLabel?: string | null }[],
  ) {
    const product = await this.findProduct(pageId, code);
    if (!Array.isArray(rows)) throw new BadRequestException('rows must be an array');
    if (rows.length > 40) throw new BadRequestException('সর্বোচ্চ ৪০টা recipe row');

    const variantLabels = new Set(
      parsePriceVariants(product.priceVariantsJson).map((v) => v.label),
    );
    const ingredientIds = [...new Set(rows.map((r) => Number(r.ingredientId)))];
    const owned = await this.prisma.ingredient.findMany({
      where: { id: { in: ingredientIds }, pageId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((i) => i.id));

    const clean = rows.map((r) => {
      const ingredientId = Number(r.ingredientId);
      const qty = Number(r.qty);
      const per = r.per === 'piece' ? 'piece' : 'item';
      const variantLabel = r.variantLabel ? String(r.variantLabel).trim() : null;
      if (!ownedIds.has(ingredientId))
        throw new BadRequestException('Invalid ingredient in recipe');
      if (!Number.isFinite(qty) || qty <= 0)
        throw new BadRequestException('Recipe-র পরিমাণ ০-এর বেশি হতে হবে');
      if (variantLabel && !variantLabels.has(variantLabel))
        throw new BadRequestException(
          `Variant "${variantLabel}" এই product-এ নেই`,
        );
      return { productId: product.id, ingredientId, qty, per, variantLabel };
    });

    await this.prisma.$transaction([
      this.prisma.recipeItem.deleteMany({ where: { productId: product.id } }),
      ...(clean.length
        ? [this.prisma.recipeItem.createMany({ data: clean })]
        : []),
    ]);
    return this.getRecipe(pageId, code);
  }

  // ── Per-order packaging ─────────────────────────────────────────────────────

  async getPackaging(pageId: number) {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: { orderPackagingJson: true },
    });
    let rows: { ingredientId: number; qty: number }[] = [];
    try {
      const raw = JSON.parse(page?.orderPackagingJson || '[]');
      if (Array.isArray(raw))
        rows = raw
          .map((r: any) => ({ ingredientId: Number(r?.ingredientId), qty: Number(r?.qty) }))
          .filter((r) => Number.isFinite(r.ingredientId) && Number.isFinite(r.qty) && r.qty > 0);
    } catch {
      rows = [];
    }
    // attach names for the UI
    const ings = rows.length
      ? await this.prisma.ingredient.findMany({
          where: { id: { in: rows.map((r) => r.ingredientId) }, pageId },
          select: { id: true, name: true, unit: true },
        })
      : [];
    const byId = new Map(ings.map((i) => [i.id, i]));
    return rows
      .filter((r) => byId.has(r.ingredientId))
      .map((r) => ({ ...r, ingredient: byId.get(r.ingredientId) }));
  }

  async setPackaging(
    pageId: number,
    rows: { ingredientId: number; qty: number }[],
  ) {
    if (!Array.isArray(rows)) throw new BadRequestException('rows must be an array');
    if (rows.length > 10) throw new BadRequestException('সর্বোচ্চ ১০টা packaging row');
    const ids = [...new Set(rows.map((r) => Number(r.ingredientId)))];
    const owned = await this.prisma.ingredient.findMany({
      where: { id: { in: ids }, pageId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((i) => i.id));
    const clean = rows.map((r) => {
      const ingredientId = Number(r.ingredientId);
      const qty = Number(r.qty);
      if (!ownedIds.has(ingredientId))
        throw new BadRequestException('Invalid ingredient in packaging');
      if (!Number.isFinite(qty) || qty <= 0)
        throw new BadRequestException('Packaging-এর পরিমাণ ০-এর বেশি হতে হবে');
      return { ingredientId, qty };
    });
    await this.prisma.page.update({
      where: { id: pageId },
      data: { orderPackagingJson: clean.length ? JSON.stringify(clean) : null },
    });
    return this.getPackaging(pageId);
  }

  // ── Menu photo AI import ────────────────────────────────────────────────────

  async scanMenu(pageId: number, imageUrls: string[]): Promise<{ dishes: MenuDish[] }> {
    if (!Array.isArray(imageUrls) || imageUrls.length === 0)
      throw new BadRequestException('Menu-র ছবি দিন');
    if (imageUrls.length > 5)
      throw new BadRequestException('একবারে সর্বোচ্চ ৫টা ছবি scan করা যাবে');
    // Only our own /storage/ uploads — never fetch arbitrary URLs on behalf of a client
    for (const u of imageUrls) {
      if (!/^(https?:\/\/[^/]+)?\/storage\/products\//.test(String(u)))
        throw new BadRequestException('Invalid image URL — আগে ছবি upload করুন');
    }

    const canProcess = await this.walletService.canProcessAi(pageId);
    if (!canProcess)
      throw new BadRequestException(
        'Wallet balance নেই — menu scan করতে balance যোগ করুন',
      );

    const { dishes, usage } = await this.geminiVision.extractMenuItems(imageUrls);

    // Keep the menu photos on the page — the bot sends them to customers who
    // ask what's available (latest scan wins).
    const relative = imageUrls.map((u) =>
      String(u).replace(/^https?:\/\/[^/]+/, ''),
    );
    void this.prisma.page
      .update({
        where: { id: pageId },
        data: { menuImagesJson: JSON.stringify(relative.slice(0, 5)) },
      })
      .catch(() => {});

    // Meter: one ADMIN_VISION deduction per image + token-level cost record
    for (let i = 0; i < imageUrls.length; i++) {
      void this.walletService.deductUsage(pageId, 'ADMIN_VISION', {
        provider: 'gemini',
      });
    }
    void this.aiUsage.record({
      pageId,
      provider: 'gemini',
      model: usage.model,
      usageType: 'MENU_IMPORT',
      promptTokens: usage.promptTokens,
      outputTokens: usage.outputTokens,
    });

    this.logger.log(
      `[Restaurant] Menu scan page=${pageId} imgs=${imageUrls.length} dishes=${dishes.length}`,
    );
    return { dishes };
  }

  // ── Menu photos shown/sent to customers ─────────────────────────────────────

  async getMenuImages(pageId: number): Promise<string[]> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: { menuImagesJson: true },
    });
    try {
      const raw = JSON.parse(page?.menuImagesJson || '[]');
      return Array.isArray(raw) ? raw.filter((u) => typeof u === 'string') : [];
    } catch {
      return [];
    }
  }

  async setMenuImages(pageId: number, urls: string[]) {
    if (!Array.isArray(urls)) throw new BadRequestException('urls must be an array');
    const clean = urls
      .map((u) => String(u).replace(/^https?:\/\/[^/]+/, ''))
      .filter((u) => /^\/storage\/products\//.test(u))
      .slice(0, 5);
    await this.prisma.page.update({
      where: { id: pageId },
      data: { menuImagesJson: clean.length ? JSON.stringify(clean) : null },
    });
    return clean;
  }

  // ── Bulk create from reviewed dishes ────────────────────────────────────────

  private validateVariants(raw: any): PriceVariant[] {
    const variants = (Array.isArray(raw) ? raw : [])
      .map((v: any) => {
        const pieces = Number(v?.pieces);
        return {
          label: String(v?.label ?? '').trim(),
          price: Number(v?.price),
          ...(Number.isFinite(pieces) && pieces > 0
            ? { pieces: Math.round(pieces) }
            : {}),
        };
      })
      .filter((v) => v.label && Number.isFinite(v.price) && v.price >= 0);
    if (!variants.length)
      throw new BadRequestException('প্রতিটা item-এ অন্তত একটা price দিন');
    if (variants.length > MAX_PRICE_VARIANTS)
      throw new BadRequestException(`সর্বোচ্চ ${MAX_PRICE_VARIANTS}টা size/price`);
    const labels = new Set(variants.map((v) => v.label));
    if (labels.size !== variants.length)
      throw new BadRequestException('একই label-এর দুটো size দেওয়া যাবে না');
    return variants;
  }

  async bulkCreateProducts(pageId: number, dishes: any[]) {
    if (!Array.isArray(dishes) || dishes.length === 0)
      throw new BadRequestException('কোনো item নেই');
    if (dishes.length > 100)
      throw new BadRequestException('একবারে সর্বোচ্চ ১০০টা item');

    const created: string[] = [];
    const failed: { name: string; reason: string }[] = [];
    for (const d of dishes) {
      const name = String(d?.name ?? '').trim();
      try {
        if (!name) throw new BadRequestException('নাম নেই');
        const variants = this.validateVariants(d?.variants);
        const minPrice = Math.min(...variants.map((v) => v.price));
        // Single "Regular" variant with no pieces = plain single-price dish —
        // no need to force a size selection at checkout.
        const isSinglePlain =
          variants.length === 1 && !variants[0].pieces;
        // Optional per-dish photo uploaded during review — only our own
        // /storage/products/ uploads are accepted
        const rawImg = String(d?.imageUrl ?? '').trim();
        const imageUrl =
          rawImg && /^(https?:\/\/[^/]+)?\/storage\/products\//.test(rawImg)
            ? rawImg
            : undefined;
        await this.productsService.create({
          pageId,
          productType: 'SIMPLE',
          name,
          price: minPrice,
          description: d?.description ? String(d.description).trim() : undefined,
          category: d?.category ? String(d.category).trim() : null,
          unit: 'piece',
          imageUrl,
          priceVariantsJson: isSinglePlain ? null : JSON.stringify(variants),
          trackStock: false,
          catalogVisible: true,
        });
        created.push(name);
        // SIMPLE auto-codes use a ms timestamp suffix — space out so two
        // dishes created in the same millisecond can't collide.
        await new Promise((r) => setTimeout(r, 2));
      } catch (err: any) {
        failed.push({ name: name || '(নামহীন)', reason: err?.message || 'error' });
      }
    }
    return { createdCount: created.length, created, failed };
  }

  // ── Food product update (panel edit form) ───────────────────────────────────

  async updateFoodProduct(pageId: number, code: string, body: any) {
    const patch: any = {};
    if ('name' in body) patch.name = String(body.name ?? '').trim();
    if ('description' in body) patch.description = String(body.description ?? '');
    if ('category' in body)
      patch.category = body.category ? String(body.category).trim() : null;
    if ('imageUrl' in body) patch.imageUrl = String(body.imageUrl ?? '');
    if ('isActive' in body) patch.isActive = Boolean(body.isActive);
    if ('catalogVisible' in body) patch.catalogVisible = Boolean(body.catalogVisible);
    if ('trackStock' in body) patch.trackStock = Boolean(body.trackStock);
    if ('price' in body) {
      const p = Number(body.price);
      if (!Number.isFinite(p) || p < 0) throw new BadRequestException('দাম সঠিক নয়');
      patch.price = p;
    }
    if ('priceVariants' in body) {
      if (body.priceVariants === null || (Array.isArray(body.priceVariants) && body.priceVariants.length === 0)) {
        patch.priceVariantsJson = null;
      } else {
        const variants = this.validateVariants(body.priceVariants);
        patch.priceVariantsJson = JSON.stringify(variants);
        // keep base price = min variant price so sorting/fallback stays sane
        patch.price = Math.min(...variants.map((v) => v.price));
      }
    }
    return this.productsService.updateOne(pageId, code, patch);
  }

  /** Distinct category values for the panel's category picker. */
  async listCategories(pageId: number) {
    const rows = await this.prisma.product.findMany({
      where: { pageId, isActive: true, category: { not: null } },
      select: { category: true },
      distinct: ['category'],
    });
    return rows.map((r) => r.category).filter(Boolean);
  }
}
