import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import sharp from 'sharp';
import type { VisionAttributes, VisionAnalysisProvider } from '../vision-analysis.interface';

const ZERO: VisionAttributes = {
  category: null, color: null, pattern: null, sleeveType: null,
  gender: null, confidence: 0,
  rawDescription: 'Local vision: low confidence or non-clothing image',
};

const CATEGORY_LABELS = [
  'dress', 'saree', 'panjabi', 'shirt', 't-shirt', 'kurti', 'tops',
  'lehenga', 'salwar kameez', 'non clothing item',
];

const PATTERN_LABELS = [
  'plain solid color fabric',
  'printed pattern fabric',
  'floral design fabric',
  'embroidered fabric',
  'striped or checked fabric',
];

const SLEEVE_LABELS = [
  'full sleeve clothing',
  'half sleeve clothing',
  'sleeveless clothing',
  'three quarter sleeve clothing',
];

const PATTERN_NORM: Record<string, string> = {
  'plain solid color fabric': 'plain',
  'printed pattern fabric': 'printed',
  'floral design fabric': 'floral',
  'embroidered fabric': 'embroidered',
  'striped or checked fabric': 'striped',
};

const SLEEVE_NORM: Record<string, string> = {
  'full sleeve clothing': 'full',
  'half sleeve clothing': 'half',
  'sleeveless clothing': 'sleeveless',
  'three quarter sleeve clothing': '3-quarter',
};

const GENDER_MAP: Record<string, string> = {
  saree: 'women', kurti: 'women', lehenga: 'women',
  'salwar kameez': 'women', tops: 'women', dress: 'women',
  panjabi: 'men',
};

@Injectable()
export class LocalVisionProvider implements VisionAnalysisProvider, OnModuleInit {
  private readonly logger = new Logger(LocalVisionProvider.name);
  private classifier: any = null;

  async onModuleInit(): Promise<void> {
    const mode = (process.env.VISION_PROVIDER ?? '').toLowerCase().trim();
    if (!mode.includes('local')) return; // don't load model if not in use

    try {
      this.logger.log('[LocalVision] Loading CLIP model (first run downloads ~87MB)...');
      const { pipeline } = await import('@xenova/transformers');
      this.classifier = await pipeline(
        'zero-shot-image-classification',
        'Xenova/clip-vit-base-patch32',
        {} as any, // quantized options passed via env if needed
      );
      this.logger.log('[LocalVision] CLIP model ready ✓');
    } catch (err: any) {
      this.logger.error(`[LocalVision] CLIP model failed to load: ${err?.message ?? err}`);
    }
  }

  async analyze(imageUrl: string): Promise<VisionAttributes> {
    if (!this.classifier) return ZERO;

    try {
      // Fetch image buffer for color extraction
      const res = await axios.get<ArrayBuffer>(imageUrl, { responseType: 'arraybuffer', timeout: 15_000 });
      const buffer = Buffer.from(res.data);

      // Run color (Sharp) and CLIP classifications in parallel
      const [color, catResult, patResult, slvResult] = await Promise.all([
        this.extractDominantColor(buffer),
        this.clipClassify(imageUrl, CATEGORY_LABELS),
        this.clipClassify(imageUrl, PATTERN_LABELS),
        this.clipClassify(imageUrl, SLEEVE_LABELS),
      ]);

      const topCat = catResult[0];

      // Definitely non-clothing → return zero confidence
      if (topCat.label === 'non clothing item' && topCat.score > 0.60) {
        return {
          ...ZERO,
          rawDescription: `Local CLIP: non-clothing (score=${topCat.score.toFixed(2)})`,
        };
      }

      // Very low score → return low but non-zero so OpenAI fallback can still try
      if (topCat.score < 0.15) {
        return {
          ...ZERO,
          confidence: 0.05,
          rawDescription: `Local CLIP: low score (score=${topCat.score.toFixed(2)})`,
        };
      }

      const topPat = patResult[0];
      const topSlv = slvResult[0];

      const pattern = topPat.score > 0.30 ? (PATTERN_NORM[topPat.label] ?? null) : null;
      const sleeveType = topSlv.score > 0.35 ? (SLEEVE_NORM[topSlv.label] ?? null) : null;
      const gender = GENDER_MAP[topCat.label] ?? null;

      // confidence: scaled by CLIP score
      const confidence = topCat.score >= 0.55 ? topCat.score : topCat.score >= 0.30 ? 0.35 : 0.20;

      return {
        category: topCat.label,
        color,
        pattern,
        sleeveType,
        gender,
        confidence,
        rawDescription: `Local CLIP: ${topCat.label} (${(topCat.score * 100).toFixed(0)}%), color=${color ?? '?'}, pattern=${pattern ?? '?'}`,
      };
    } catch (err: any) {
      this.logger.error(`[LocalVision] analyze() error: ${err?.message ?? err}`);
      return ZERO;
    }
  }

  async analyzeMultiple(imageUrls: string[]): Promise<VisionAttributes> {
    if (!imageUrls.length || !this.classifier) return ZERO;

    // Analyze all angles in parallel, pick the best result
    const results = await Promise.all(imageUrls.map((url) => this.analyze(url)));
    const best = results.reduce((a, b) => (a.confidence >= b.confidence ? a : b), results[0]);

    if (best.confidence <= 0) return ZERO;

    // Merge: fill in any null fields from other results
    const merged: VisionAttributes = { ...best };
    for (const r of results) {
      if (r.confidence > 0) {
        if (!merged.color && r.color) merged.color = r.color;
        if (!merged.pattern && r.pattern) merged.pattern = r.pattern;
        if (!merged.sleeveType && r.sleeveType) merged.sleeveType = r.sleeveType;
      }
    }
    merged.rawDescription = `Multi-angle local CLIP (${imageUrls.length} images): ${merged.rawDescription}`;
    return merged;
  }

  private async clipClassify(imageUrl: string, labels: string[]): Promise<{ label: string; score: number }[]> {
    return (await this.classifier(imageUrl, labels)) as { label: string; score: number }[];
  }

  private async extractDominantColor(buffer: Buffer): Promise<string | null> {
    try {
      const { data: pixels, info } = await sharp(buffer)
        .resize(100, 100, { fit: 'cover' })
        .raw()
        .toBuffer({ resolveWithObject: true });

      const ch = info.channels; // 3=RGB, 4=RGBA
      const buckets: Record<string, number> = {};
      const step = ch * 5; // sample every 5th pixel

      for (let i = 0; i < pixels.length; i += step) {
        const name = this.rgbToColorName(pixels[i], pixels[i + 1], pixels[i + 2]);
        buckets[name] = (buckets[name] ?? 0) + 1;
      }

      const sorted = Object.entries(buckets).sort((a, b) => b[1] - a[1]);
      const total = Object.values(buckets).reduce((s, n) => s + n, 0);

      // Multicolor: top 2 both > 20% and neither is a neutral
      if (sorted.length >= 2) {
        const neutrals = new Set(['black', 'white', 'grey']);
        const t1 = sorted[0][1] / total;
        const t2 = sorted[1][1] / total;
        if (t1 < 0.50 && t2 > 0.20 && sorted[0][0] !== sorted[1][0]) {
          if (!neutrals.has(sorted[0][0]) || !neutrals.has(sorted[1][0])) {
            return 'multicolor';
          }
        }
      }

      return sorted[0]?.[0] ?? null;
    } catch {
      return null;
    }
  }

  private rgbToColorName(r: number, g: number, b: number): string {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    const v = max;
    const s = max === 0 ? 0 : delta / max;

    if (v < 0.15) return 'black';
    if (v > 0.85 && s < 0.15) return 'white';
    if (s < 0.15) return 'grey';

    let h = 0;
    if (delta > 0) {
      if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
      else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
      else h = 60 * ((rn - gn) / delta + 4);
      if (h < 0) h += 360;
    }

    if (h < 15 || h >= 345) return v < 0.40 ? 'maroon' : 'red';
    if (h < 45) return 'orange';
    if (h < 65) return v < 0.55 ? 'golden' : 'yellow';
    if (h < 80) return s < 0.35 ? 'cream' : 'yellow';
    if (h < 165) return 'green';
    if (h < 200) return 'green';
    if (h < 255) return v < 0.35 ? 'navy' : 'blue';
    if (h < 290) return 'purple';
    if (h < 345) return v < 0.50 ? 'maroon' : 'pink';
    return 'grey';
  }
}
