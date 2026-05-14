import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { join, extname } from 'path';
import { readFile } from 'fs/promises';
import { PrismaService } from '../prisma/prisma.service';
import type { ProductMatchResult } from '../product-match/product-match.service';

const SIMILARITY_THRESHOLD = 0.30;
const EMBED_DIM = 512;

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private processor: any = null;
  private visionModel: any = null;
  private ready = false;
  private loading = false;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    // Non-blocking background preload — startup is never delayed
    setTimeout(() => {
      this.load().catch((e) =>
        this.logger.warn(`[Embedding] Preload error: ${e?.message ?? e}`),
      );
    }, 2_000);
  }

  private async load(): Promise<void> {
    if (this.ready || this.loading) return;
    this.loading = true;
    try {
      this.logger.log(
        '[Embedding] Loading CLIP vision model (Xenova/clip-vit-base-patch32)...',
      );
      const { AutoProcessor, CLIPVisionModelWithProjection } =
        await import('@xenova/transformers');
      this.processor = await AutoProcessor.from_pretrained(
        'Xenova/clip-vit-base-patch32',
      );
      this.visionModel = await CLIPVisionModelWithProjection.from_pretrained(
        'Xenova/clip-vit-base-patch32',
      );
      this.ready = true;
      this.logger.log('[Embedding] CLIP model ready ✓');
    } catch (e: any) {
      this.logger.error(`[Embedding] Model load failed: ${e?.message ?? e}`);
    } finally {
      this.loading = false;
    }
  }

  private async ensureReady(): Promise<boolean> {
    if (this.ready) return true;
    if (!this.loading) await this.load();
    return this.ready;
  }

  private extToMime(ext: string): string {
    const map: Record<string, string> = {
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };
    return map[ext.toLowerCase()] ?? 'image/jpeg';
  }

  private async toDataUrl(imageUrl: string): Promise<string> {
    const storagePath = imageUrl.match(/\/storage\/(.+)$/)?.[1];
    if (storagePath) {
      const abs = join(process.cwd(), 'storage', storagePath);
      try {
        const buf = await readFile(abs);
        const mime = this.extToMime(extname(abs));
        return `data:${mime};base64,${buf.toString('base64')}`;
      } catch {
        // fall through to HTTP fetch
      }
    }
    // External or unresolvable local URL — return as-is for RawImage.fromURL
    return imageUrl;
  }

  /** Generate a 512-dim L2-normalized CLIP embedding. Returns null on failure. */
  async embed(imageUrl: string): Promise<number[] | null> {
    if (!(await this.ensureReady())) return null;

    try {
      const { RawImage } = await import('@xenova/transformers');
      const src = await this.toDataUrl(imageUrl);
      const image = await RawImage.fromURL(src);
      const inputs = await this.processor(image);
      const { image_embeds } = await this.visionModel(inputs);

      // image_embeds.data is a flat Float32Array of length 512 (batch=1)
      const raw = Array.from(image_embeds.data as Float32Array);

      // L2 normalize for cosine similarity via dot product
      const norm = Math.sqrt(raw.reduce((s, v) => s + v * v, 0));
      if (norm === 0) return null;
      return raw.map((v) => v / norm);
    } catch (e: any) {
      this.logger.warn(`[Embedding] embed() failed: ${e?.message ?? e}`);
      return null;
    }
  }

  /** Cosine similarity — both vectors must be L2 normalized (dot product shortcut). */
  cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) dot += a[i] * b[i];
    return Math.max(-1, Math.min(1, dot));
  }

  /** Generate embedding for a product and save to DB. Called by background queue. */
  async indexProduct(productId: number, imageUrl: string): Promise<void> {
    this.logger.log(`[Embedding] Indexing product id=${productId}`);
    const vector = await this.embed(imageUrl);
    if (!vector) {
      this.logger.warn(`[Embedding] No vector generated for product id=${productId}`);
      return;
    }
    await this.prisma.product.update({
      where: { id: productId },
      data: { embedding: JSON.stringify(vector) },
    });
    this.logger.log(`[Embedding] Indexed product id=${productId} ✓`);
  }

  /**
   * Find visually similar products for a customer image.
   * Returns ProductMatchResult[] sorted by cosine similarity desc.
   * Returns [] if model not ready or no products indexed.
   */
  async findSimilar(
    pageId: number,
    imageUrl: string,
    topN = 8,
  ): Promise<ProductMatchResult[]> {
    const customerVec = await this.embed(imageUrl);
    if (!customerVec) return [];

    const products = await this.prisma.product.findMany({
      where: {
        pageId,
        isActive: true,
        visionSearchable: true,
        embedding: { not: null },
      },
      select: {
        code: true,
        name: true,
        price: true,
        imageUrl: true,
        embedding: true,
      },
    });

    if (!products.length) return [];

    const scored: ProductMatchResult[] = [];
    for (const p of products) {
      try {
        const vec = JSON.parse(p.embedding!) as number[];
        if (!Array.isArray(vec) || vec.length !== EMBED_DIM) continue;
        const sim = this.cosineSimilarity(customerVec, vec);
        if (sim < SIMILARITY_THRESHOLD) continue;
        scored.push({
          productCode: p.code,
          productName: p.name,
          price: p.price,
          imageUrl: p.imageUrl,
          matchScore: sim,
          matchReasons: ['visual_similarity'],
        });
      } catch {
        // skip malformed stored embeddings
      }
    }

    return scored
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, topN);
  }

  /**
   * Queue re-indexing for all active products of a page.
   * Pass the EmbeddingQueueService instance to avoid circular injection.
   */
  async reIndexPage(
    pageId: number,
    queue: { add: (job: () => Promise<void>) => Promise<boolean> },
  ): Promise<{ queued: number }> {
    const products = await this.prisma.product.findMany({
      where: { pageId, isActive: true, imageUrl: { not: null } },
      select: { id: true, imageUrl: true },
    });
    let queued = 0;
    for (const p of products) {
      const accepted = await queue.add(() =>
        this.indexProduct(p.id, p.imageUrl!),
      );
      if (accepted) queued++;
    }
    this.logger.log(
      `[Embedding] Re-index queued ${queued}/${products.length} products for page ${pageId}`,
    );
    return { queued };
  }

  isReady(): boolean {
    return this.ready;
  }
}
