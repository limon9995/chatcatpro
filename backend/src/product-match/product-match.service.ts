import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VisionAttributes } from '../vision-analysis/vision-analysis.interface';
import { ProductsService } from '../products/products.service';

export interface ProductMatchResult {
  productCode: string;
  productName: string | null;
  price: number;
  imageUrl: string | null;
  /** Overall match score 0.0–1.0 */
  matchScore: number;
  /** Human-readable reasons why this product matched */
  matchReasons: string[];
}

type RawProduct = {
  id: number;
  code: string;
  name: string | null;
  price: number;
  imageUrl: string | null;
  description: string | null;
  category: string | null;
  color: string | null;
  tags: string | null;          // JSON array string
  imageKeywords: string | null;
  aiDescription: string | null;
  stockQty: number;
  visionSearchable: boolean;
  productGroup?: string | null;
  variantLabel?: string | null;
};

/**
 * V18: ProductMatchService
 *
 * Matches product catalog items against vision-extracted attributes.
 * Uses a scoring system — no ML required, pure string matching.
 *
 * Score breakdown (max 1.0):
 *   category match  → +0.40
 *   color match     → +0.30
 *   pattern/keyword → +0.20
 *   gender hint     → +0.10
 *
 * Only active products with stockQty > 0 are considered (or all active
 * if includeOutOfStock is set).
 */
@Injectable()
export class ProductMatchService {
  private readonly logger = new Logger(ProductMatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  /**
   * Find top matching products for given vision attributes.
   * @param pageId  DB page ID
   * @param attrs   Attributes from VisionAnalysisService
   * @param topN    Max results to return (default 4)
   */
  async findMatches(
    pageId: number,
    attrs: VisionAttributes,
    topN = 4,
  ): Promise<ProductMatchResult[]> {
    // Load only visionSearchable active products for this page
    const products = (await this.prisma.product.findMany({
      where: { pageId, isActive: true, visionSearchable: true },
      select: {
        id: true,
        code: true,
        name: true,
        price: true,
        imageUrl: true,
        description: true,
        category: true,
        color: true,
        tags: true,
        imageKeywords: true,
        aiDescription: true,
        stockQty: true,
        visionSearchable: true,
      },
    })) as unknown as RawProduct[];

    if (!products.length) {
      this.logger.log(`[ProductMatch] No active products for pageId=${pageId}`);
      return [];
    }

    const enrichedProducts = (await this.products.attachReferenceImagesList(
      pageId,
      products,
    )) as RawProduct[];
    const scored = enrichedProducts.map((p) => this.scoreProduct(p, attrs));

    // Sort by score descending, take top N with score > 0
    const results = scored
      .filter((r) => r.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, topN);

    this.logger.log(
      `[ProductMatch] pageId=${pageId} attrs={cat:${attrs.category},color:${attrs.color}} ` +
        `→ ${results.length} matches (top score: ${results[0]?.matchScore.toFixed(2) ?? 'n/a'})`,
    );

    return results;
  }

  private scoreProduct(
    product: RawProduct,
    attrs: VisionAttributes,
  ): ProductMatchResult {
    let score = 0;
    const reasons: string[] = [];

    // ── Category match (weight: 0.40) ────────────────────────────────────────
    if (attrs.category && attrs.category !== 'non_clothing') {
      const catScore = this.categoryScore(product, attrs.category);
      if (catScore > 0) {
        score += catScore * 0.40;
        reasons.push(`category~${attrs.category}`);
      } else if (product.category && product.category !== attrs.category) {
        score -= 0.08;
      }
    }

    // ── Color match (weight: 0.30) ────────────────────────────────────────────
    if (attrs.color) {
      const colorScore = this.colorScore(product, attrs.color);
      if (colorScore > 0) {
        score += colorScore * 0.30;
        reasons.push(`color~${attrs.color}`);
      } else if (product.color && attrs.color) {
        score -= 0.05;
      }
    }

    // ── Pattern / keyword match (weight: 0.20) ────────────────────────────────
    if (attrs.pattern) {
      const kwScore = this.keywordScore(product, [
        attrs.pattern,
        attrs.sleeveType ?? '',
      ]);
      if (kwScore > 0) {
        score += kwScore * 0.20;
        reasons.push(`pattern~${attrs.pattern}`);
      }
    }

    // ── Gender hint (weight: 0.10) ────────────────────────────────────────────
    if (attrs.gender && attrs.gender !== 'unisex') {
      const genderScore = this.keywordScore(product, [attrs.gender]);
      if (genderScore > 0) {
        score += genderScore * 0.10;
        reasons.push(`gender~${attrs.gender}`);
      } else {
        score -= 0.03;
      }
    }

    if (attrs.rawDescription) {
      const descScore = this.keywordScore(product, attrs.rawDescription.split(/\s+/));
      if (descScore > 0.15) {
        score += Math.min(0.12, descScore * 0.12);
        reasons.push('description_overlap');
      }
    }

    return {
      productCode: product.code,
      productName: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
      matchScore: Math.min(1, Math.max(0, score)),
      matchReasons: reasons,
    };
  }

  private normalizeText(text: string): string {
    const replacements: Array<[RegExp, string]> = [
      [/নীল|blue|navy|sky blue|royal blue/gi, ' blue '],
      [/কালো|black/gi, ' black '],
      [/সাদা|white|off white|cream/gi, ' white '],
      [/লাল|red|maroon|burgundy|wine/gi, ' red '],
      [/সবুজ|green|olive/gi, ' green '],
      [/হলুদ|yellow|golden/gi, ' yellow '],
      [/গোলাপী|pink/gi, ' pink '],
      [/বেগুনী|purple|violet|lavender/gi, ' purple '],
      [/ধূসর|grey|gray|silver/gi, ' grey '],
      [/কুর্তি|kurti/gi, ' kurti '],
      [/থ্রি পিস|3 piece|three piece/gi, ' three_piece '],
      [/সালোয়ার কামিজ|salwar|kameez|shalwar/gi, ' salwar_kameez '],
      [/পাঞ্জাবি|panjabi|punjabi/gi, ' panjabi '],
      [/শাড়ি|saree|sari/gi, ' saree '],
      [/ড্রেস|dress|gown|maxi|frock/gi, ' dress '],
      [/প্রিন্টেড|printed|floral|embroidered|striped|checked/gi, ' printed '],
    ];
    let normalized = ` ${String(text || '').toLowerCase()} `;
    for (const [pattern, value] of replacements) {
      normalized = normalized.replace(pattern, value);
    }
    return normalized.replace(/\s+/g, ' ').trim();
  }

  /** Score 0–1 for category match against product fields */
  private categoryScore(product: RawProduct, targetCategory: string): number {
    const target = targetCategory.toLowerCase().replace(/_/g, ' ');

    // Exact match on category field
    if (product.category) {
      const pc = product.category.toLowerCase();
      if (pc === target || pc.includes(target) || target.includes(pc)) return 1;
    }

    // Check name, description, tags, aiDescription, imageKeywords
    const textCorpus = this.normalizeText([
      product.name,
      product.description,
      product.tags,
      product.aiDescription,
      product.imageKeywords,
      product.productGroup,
      product.variantLabel,
    ]
      .filter(Boolean)
      .join(' '));

    if (textCorpus.includes(target)) return 0.7;

    // Synonym mapping for Bangla e-commerce categories
    const synonyms: Record<string, string[]> = {
      dress: ['গাউন', 'dress', 'frock', 'gown', 'maxi', 'mini dress'],
      saree: ['শাড়ি', 'saree', 'sari'],
      panjabi: ['পাঞ্জাবি', 'panjabi', 'punjabi', 'fatua'],
      shirt: ['শার্ট', 'shirt', 'formal shirt'],
      't-shirt': ['টি-শার্ট', 't-shirt', 'tshirt', 'tee'],
      kurti: ['কুর্তি', 'kurti', 'kurti dress'],
      tops: ['টপস', 'tops', 'top', 'blouse'],
      lehenga: ['লেহেঙ্গা', 'lehenga', 'lehnga'],
      salwar_kameez: ['সালোয়ার কামিজ', 'salwar', 'kameez', 'shalwar'],
      three_piece: ['থ্রি পিস', 'three piece', '3 piece'],
    };

    const targetSynonyms = synonyms[target] ?? [];
    for (const syn of targetSynonyms) {
      if (textCorpus.includes(syn)) return 0.6;
    }

    return 0;
  }

  /** Score 0–1 for color match */
  private colorScore(product: RawProduct, targetColor: string): number {
    const target = targetColor.toLowerCase();

    if (product.color) {
      const pc = product.color.toLowerCase();
      if (pc === target) return 1;
      if (pc.includes(target) || target.includes(pc)) return 0.8;
    }

    const textCorpus = this.normalizeText([
      product.name,
      product.description,
      product.tags,
      product.aiDescription,
      product.imageKeywords,
      product.variantLabel,
    ]
      .filter(Boolean)
      .join(' '));

    if (textCorpus.includes(target)) return 0.6;

    // Bangla color synonyms
    const colorMap: Record<string, string[]> = {
      black: ['কালো', 'black'],
      white: ['সাদা', 'white', 'off white', 'offwhite'],
      red: ['লাল', 'red', 'dark red'],
      blue: ['নীল', 'blue', 'navy', 'sky blue', 'royal blue'],
      green: ['সবুজ', 'green', 'olive', 'dark green'],
      yellow: ['হলুদ', 'yellow', 'golden yellow'],
      pink: ['গোলাপী', 'pink', 'hot pink', 'baby pink'],
      purple: ['বেগুনী', 'purple', 'violet', 'lavender'],
      maroon: ['মেরুন', 'maroon', 'wine', 'burgundy'],
      grey: ['ধূসর', 'grey', 'gray', 'silver grey'],
      multicolor: ['মাল্টিকালার', 'multicolor', 'multi', 'colorful'],
      beige: ['বেজ', 'beige', 'cream', 'off-white'],
    };

    const syns = colorMap[target] ?? [];
    for (const syn of syns) {
      if (textCorpus.includes(syn)) return 0.5;
    }

    return 0;
  }

  /** Score 0–1 for keyword list against product text */
  private keywordScore(product: RawProduct, keywords: string[]): number {
    const textCorpus = this.normalizeText([
      product.name,
      product.description,
      product.tags,
      product.aiDescription,
      product.imageKeywords,
      product.category,
      product.productGroup,
      product.variantLabel,
    ]
      .filter(Boolean)
      .join(' '));

    let hits = 0;
    for (const kw of keywords) {
      if (kw && textCorpus.includes(kw.toLowerCase())) hits++;
    }
    return keywords.length > 0 ? hits / keywords.length : 0;
  }

  /**
   * Check how unique a new product is compared to the existing catalog.
   * Returns uniqueness % (0–100), top similar products, and a recommendation.
   * Excludes `excludeCode` (the product being edited, to avoid self-match).
   */
  async checkUniqueness(
    pageId: number,
    attrs: VisionAttributes,
    excludeCode?: string,
  ): Promise<{
    uniquenessPercent: number;
    topSimilar: { code: string; name: string | null; similarity: number; imageUrl: string | null }[];
    recommendation: 'AI_VISION' | 'OCR';
    reason: string;
    totalProductsChecked: number;
  }> {
    const allProducts = (await this.prisma.product.findMany({
      where: { pageId, isActive: true },
      select: {
        id: true, code: true, name: true, price: true, imageUrl: true,
        description: true, category: true, color: true, tags: true,
        imageKeywords: true, aiDescription: true, stockQty: true,
        visionSearchable: true,
      },
    })) as unknown as RawProduct[];

    const candidates = allProducts.filter((p) => p.code !== excludeCode);

    if (!candidates.length) {
      return {
        uniquenessPercent: 100,
        topSimilar: [],
        recommendation: 'AI_VISION',
        reason: 'Store-এ আর কোনো product নেই — AI Detection ভালো কাজ করবে।',
        totalProductsChecked: 0,
      };
    }

    const scored = candidates
      .map((p) => ({ ...this.scoreProduct(p, attrs), product: p }))
      .sort((a, b) => b.matchScore - a.matchScore);

    const topScore = scored[0]?.matchScore ?? 0;
    // Uniqueness = inverse of top similarity, scaled 0–100
    const uniquenessPercent = Math.round(Math.max(0, (1 - topScore) * 100));

    const topSimilar = scored
      .filter((s) => s.matchScore > 0.25)
      .slice(0, 4)
      .map((s) => ({
        code: s.productCode,
        name: s.productName,
        similarity: Math.round(s.matchScore * 100),
        imageUrl: s.imageUrl,
      }));

    let recommendation: 'AI_VISION' | 'OCR';
    let reason: string;

    if (uniquenessPercent >= 70) {
      recommendation = 'AI_VISION';
      reason = `এই product টা ${uniquenessPercent}% unique — AI Detection ভালোভাবে চিনতে পারবে।`;
    } else if (uniquenessPercent >= 45) {
      recommendation = 'AI_VISION';
      reason = `${uniquenessPercent}% unique — AI চিনতে পারবে, তবে similar product থাকায় মাঝে মাঝে ভুল হতে পারে। Product code যোগ করলে accuracy বাড়বে।`;
    } else {
      recommendation = 'OCR';
      reason = `মাত্র ${uniquenessPercent}% unique — store-এ অনেক similar product আছে। OCR mode use করলে product code দিয়ে নিখুঁতভাবে চেনা যাবে।`;
    }

    this.logger.log(
      `[Uniqueness] pageId=${pageId} checked=${candidates.length} topScore=${topScore.toFixed(2)} unique=${uniquenessPercent}% → ${recommendation}`,
    );

    return { uniquenessPercent, topSimilar, recommendation, reason, totalProductsChecked: candidates.length };
  }
}
