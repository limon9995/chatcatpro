import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { WalletService } from '../wallet/wallet.service';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { VisionAnalysisService } from '../vision-analysis/vision-analysis.service';
import { ProductMatchService } from '../product-match/product-match.service';
import type { VisionAttributes } from '../vision-analysis/vision-analysis.interface';
import type { ProductMatchResult } from '../product-match/product-match.service';

type VisionEventType =
  | 'high_confidence'
  | 'medium_confidence'
  | 'low_confidence'
  | 'selection_confirmed'
  | 'selection_retry'
  | 'human_handoff'
  | 'product_analyze';

type ReviewStatus =
  | 'pending_customer_selection'
  | 'needs_review'
  | 'resolved'
  | 'dismissed';

interface VisionEvent {
  id: string;
  pageId: number;
  psid?: string | null;
  type: VisionEventType;
  createdAt: string;
  imageUrl?: string | null;
  note?: string | null;
  confidence?: number | null;
  attrs?: VisionAttributes | null;
  topMatch?: ProductMatchResult | null;
  matches?: ProductMatchResult[];
  selectedCode?: string | null;
}

interface VisionReviewQueueItem {
  id: string;
  pageId: number;
  psid?: string | null;
  imageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  status: ReviewStatus;
  note?: string | null;
  attrs?: VisionAttributes | null;
  matches?: ProductMatchResult[];
  selectedCode?: string | null;
}

@Injectable()
export class VisionOpsService {
  private readonly logger = new Logger(VisionOpsService.name);
  private readonly baseDir = join(process.cwd(), 'storage', 'vision-ops');
  private readonly uploadsDir = join(process.cwd(), 'storage', 'products');

  constructor(
    private readonly visionAnalysis: VisionAnalysisService,
    private readonly walletService: WalletService,
    private readonly productMatch: ProductMatchService,
  ) {}

  private eventsFile(pageId: number) {
    return join(this.baseDir, `page-${pageId}-events.json`);
  }

  private reviewFile(pageId: number) {
    return join(this.baseDir, `page-${pageId}-review.json`);
  }

  private async ensureDir(dir: string) {
    await fs.mkdir(dir, { recursive: true });
  }

  private async readJsonArray<T>(file: string): Promise<T[]> {
    try {
      const raw = await fs.readFile(file, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error: any) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }

  private async writeJsonArray(file: string, rows: any[]) {
    await this.ensureDir(this.baseDir);
    await fs.writeFile(file, JSON.stringify(rows, null, 2), 'utf8');
  }

  private normalizeMatches(matches?: ProductMatchResult[] | null) {
    return (matches || []).slice(0, 5);
  }

  async logVisionAttempt(params: {
    pageId: number;
    psid?: string | null;
    imageUrl?: string | null;
    type: VisionEventType;
    confidence?: number | null;
    note?: string | null;
    attrs?: VisionAttributes | null;
    matches?: ProductMatchResult[] | null;
    topMatch?: ProductMatchResult | null;
  }) {
    const event: VisionEvent = {
      id: randomUUID(),
      pageId: params.pageId,
      psid: params.psid ?? null,
      type: params.type,
      createdAt: new Date().toISOString(),
      imageUrl: params.imageUrl ?? null,
      note: params.note ?? null,
      confidence: params.confidence ?? null,
      attrs: params.attrs ?? null,
      matches: this.normalizeMatches(params.matches),
      topMatch: params.topMatch ?? params.matches?.[0] ?? null,
    };

    const events = await this.readJsonArray<VisionEvent>(
      this.eventsFile(params.pageId),
    );
    events.unshift(event);
    await this.writeJsonArray(this.eventsFile(params.pageId), events.slice(0, 500));

    if (params.type === 'medium_confidence' || params.type === 'low_confidence') {
      const reviewItems = await this.readJsonArray<VisionReviewQueueItem>(
        this.reviewFile(params.pageId),
      );
      reviewItems.unshift({
        id: event.id,
        pageId: params.pageId,
        psid: params.psid ?? null,
        imageUrl: params.imageUrl ?? null,
        createdAt: event.createdAt,
        updatedAt: event.createdAt,
        status:
          params.type === 'medium_confidence'
            ? 'pending_customer_selection'
            : 'needs_review',
        note: params.note ?? null,
        attrs: params.attrs ?? null,
        matches: this.normalizeMatches(params.matches),
      });
      await this.writeJsonArray(this.reviewFile(params.pageId), reviewItems.slice(0, 300));
    }

    return event.id;
  }

  async markSelection(
    pageId: number,
    psid: string,
    selectedCode: string,
    note?: string,
  ) {
    const now = new Date().toISOString();
    const events = await this.readJsonArray<VisionEvent>(this.eventsFile(pageId));
    events.unshift({
      id: randomUUID(),
      pageId,
      psid,
      type: 'selection_confirmed',
      createdAt: now,
      selectedCode,
      note: note ?? 'Customer confirmed shortlist selection',
    });
    await this.writeJsonArray(this.eventsFile(pageId), events.slice(0, 500));

    const queue = await this.readJsonArray<VisionReviewQueueItem>(
      this.reviewFile(pageId),
    );
    const latest = queue.find(
      (item) =>
        item.psid === psid &&
        item.status !== 'resolved' &&
        item.status !== 'dismissed',
    );
    if (latest) {
      latest.status = 'resolved';
      latest.selectedCode = selectedCode;
      latest.updatedAt = now;
      latest.note = note || latest.note || null;
      await this.writeJsonArray(this.reviewFile(pageId), queue);
    }
  }

  async logSelectionRetry(pageId: number, psid: string, note: string) {
    const events = await this.readJsonArray<VisionEvent>(this.eventsFile(pageId));
    events.unshift({
      id: randomUUID(),
      pageId,
      psid,
      type: 'selection_retry',
      createdAt: new Date().toISOString(),
      note,
    });
    await this.writeJsonArray(this.eventsFile(pageId), events.slice(0, 500));
  }

  async logHumanHandoff(pageId: number, psid: string, note: string) {
    const now = new Date().toISOString();
    const events = await this.readJsonArray<VisionEvent>(this.eventsFile(pageId));
    events.unshift({
      id: randomUUID(),
      pageId,
      psid,
      type: 'human_handoff',
      createdAt: now,
      note,
    });
    await this.writeJsonArray(this.eventsFile(pageId), events.slice(0, 500));

    const queue = await this.readJsonArray<VisionReviewQueueItem>(
      this.reviewFile(pageId),
    );
    const latest = queue.find(
      (item) =>
        item.psid === psid &&
        item.status !== 'resolved' &&
        item.status !== 'dismissed',
    );
    if (latest) {
      latest.status = 'needs_review';
      latest.updatedAt = now;
      latest.note = note;
      await this.writeJsonArray(this.reviewFile(pageId), queue);
    }
  }

  async getReviewQueue(pageId: number) {
    return this.readJsonArray<VisionReviewQueueItem>(this.reviewFile(pageId));
  }

  async updateReviewQueueItem(
    pageId: number,
    itemId: string,
    status: ReviewStatus,
    note?: string,
  ) {
    const queue = await this.readJsonArray<VisionReviewQueueItem>(
      this.reviewFile(pageId),
    );
    const item = queue.find((entry) => entry.id === itemId);
    if (!item) return { success: false };
    item.status = status;
    item.updatedAt = new Date().toISOString();
    if (note !== undefined) item.note = note || null;
    await this.writeJsonArray(this.reviewFile(pageId), queue);
    return { success: true };
  }

  async getSummary(pageId: number, days = 30) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const events = (await this.readJsonArray<VisionEvent>(this.eventsFile(pageId))).filter(
      (event) => new Date(event.createdAt).getTime() >= cutoff,
    );
    const queue = (await this.readJsonArray<VisionReviewQueueItem>(
      this.reviewFile(pageId),
    )).filter((item) => new Date(item.createdAt).getTime() >= cutoff);

    const attempts = events.filter((event) =>
      ['high_confidence', 'medium_confidence', 'low_confidence'].includes(
        event.type,
      ),
    );
    const topConfusions = new Map<string, number>();
    for (const item of queue) {
      const codes = (item.matches || []).slice(0, 3).map((m) => m.productCode);
      if (!codes.length) continue;
      const key = codes.join(' / ');
      topConfusions.set(key, (topConfusions.get(key) || 0) + 1);
    }

    return {
      days,
      totals: {
        imageInquiries: attempts.length,
        highConfidence: attempts.filter((e) => e.type === 'high_confidence').length,
        shortlistShown: attempts.filter((e) => e.type === 'medium_confidence').length,
        lowConfidence: attempts.filter((e) => e.type === 'low_confidence').length,
        selectionsConfirmed: events.filter((e) => e.type === 'selection_confirmed').length,
        selectionRetries: events.filter((e) => e.type === 'selection_retry').length,
        humanHandoffs: events.filter((e) => e.type === 'human_handoff').length,
        unresolvedQueue: queue.filter((item) => item.status !== 'resolved' && item.status !== 'dismissed').length,
      },
      reviewQueue: queue.slice(0, 12),
      recentEvents: events.slice(0, 18),
      topConfusions: Array.from(topConfusions.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([label, count]) => ({ label, count })),
    };
  }

  async uploadProductAsset(pageId: number, file: any) {
    if (!file?.buffer) {
      throw new Error('Image file required');
    }
    const mime = String(file.mimetype || '').toLowerCase();
    if (!mime.startsWith('image/')) {
      throw new Error('Only image uploads are supported');
    }

    const ext = extname(String(file.originalname || '')).toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    const dir = join(this.uploadsDir, String(pageId));
    await this.ensureDir(dir);
    const filename = `${Date.now()}-${randomUUID().slice(0, 8)}${safeExt}`;
    const abs = join(dir, filename);
    await fs.writeFile(abs, file.buffer);
    return {
      success: true,
      url: `/storage/products/${pageId}/${filename}`,
    };
  }

  private buildSuggested(attrs: any) {
    const tokens = [
      attrs.color,
      attrs.pattern && attrs.pattern !== 'plain' ? attrs.pattern : null,
      attrs.category,
      attrs.sleeveType,
      attrs.gender,
    ]
      .filter(Boolean)
      .map((value: any) => String(value).trim().toLowerCase());
    const uniqTokens = tokens.filter(
      (value: string, index: number, all: string[]) => all.indexOf(value) === index,
    );
    return {
      category: attrs.category || '',
      color: attrs.color || '',
      imageKeywords: uniqTokens.join(' '),
      aiDescription: attrs.rawDescription || '',
      tags: JSON.stringify(uniqTokens.filter((t: string) => t && t !== 'null')),
      visionSearchable: attrs.confidence >= 0.35 && !!attrs.category,
    };
  }

  async analyzeProductImage(pageId: number, imageUrl: string, excludeCode?: string) {
    if (!(await this.walletService.canProcessAi(pageId))) {
      throw new HttpException('Insufficient wallet balance to analyze image', HttpStatus.PAYMENT_REQUIRED);
    }

    const attrs = await this.visionAnalysis.analyze(imageUrl);

    if (attrs.confidence < 0.05) {
      throw new HttpException(
        'AI ছবিটা analyze করতে পারেনি। ছবিটা আবার upload করুন বা অন্য একটা ছবি try করুন।',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (attrs.fromCache) {
      this.logger.log(`[VisionOps] Cache hit — skipping wallet deduction for pageId=${pageId}`);
    } else {
      await this.walletService.deductUsage(pageId, 'ADMIN_VISION');
    }

    const uniqueness = await this.productMatch.checkUniqueness(pageId, attrs, excludeCode);

    if (!attrs.fromCache) {
      await this.walletService.deductUsage(pageId, 'IMAGE_UNIQUENESS');
    }

    return { attrs, suggested: this.buildSuggested(attrs), uniqueness, fromCache: attrs.fromCache ?? false };
  }

  /** Analyze 2-5 reference images of the same product in one AI call for richer description */
  async batchAnalyzeReferenceImages(pageId: number, imageUrls: string[], excludeCode?: string) {
    if (!imageUrls.length) throw new HttpException('No image URLs provided', HttpStatus.BAD_REQUEST);

    if (!(await this.walletService.canProcessAi(pageId))) {
      throw new HttpException('Insufficient wallet balance', HttpStatus.PAYMENT_REQUIRED);
    }

    const urls = imageUrls.slice(0, 5);
    const attrs = await this.visionAnalysis.analyzeMultiple(urls);

    if (attrs.confidence < 0.05) {
      throw new HttpException(
        'AI ছবিগুলো analyze করতে পারেনি। ছবিগুলো আবার upload করুন বা অন্য ছবি try করুন।',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (attrs.fromCache) {
      this.logger.log(`[VisionOps] Batch cache hit — skipping wallet deduction for pageId=${pageId}`);
    } else {
      await this.walletService.deductUsage(pageId, 'ADMIN_VISION');
    }

    const uniqueness = await this.productMatch.checkUniqueness(pageId, attrs, excludeCode);

    if (!attrs.fromCache) {
      await this.walletService.deductUsage(pageId, 'IMAGE_UNIQUENESS');
    }

    return { attrs, imageCount: urls.length, suggested: this.buildSuggested(attrs), uniqueness, fromCache: attrs.fromCache ?? false };
  }

  async buildVideoCaptureGuide(videoUrl: string, existingImages = 0) {
    const normalized = String(videoUrl || '').trim();
    const sourceLabel = normalized.includes('youtube')
      ? 'YouTube video'
      : normalized.includes('facebook.com') || normalized.includes('fb.watch')
        ? 'Facebook video'
        : normalized
          ? 'video link'
          : 'video';

    return {
      sourceLabel,
      canAutoExtract: false,
      reason:
        'Auto frame extraction is not available on this server yet, so use manual screenshots for best accuracy.',
      checklist: [
        'Front full view screenshot নিন',
        'Side angle screenshot নিন',
        'Back view screenshot নিন',
        'Print / texture close-up নিন',
        'Natural light বা clear paused frame use করুন',
        'একবারে একই product-এর 4-6টা screenshot রাখুন',
      ],
      suggestedNextCount: Math.max(4, 6 - Number(existingImages || 0)),
    };
  }
}
