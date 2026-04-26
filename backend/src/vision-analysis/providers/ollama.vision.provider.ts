import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { VisionAnalysisProvider, VisionAttributes } from '../vision-analysis.interface';

@Injectable()
export class OllamaVisionProvider implements VisionAnalysisProvider {
  private readonly logger = new Logger(OllamaVisionProvider.name);
  private readonly baseUrl: string;
  private readonly model: string;

  constructor() {
    this.baseUrl = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '');
    this.model = process.env.OLLAMA_VISION_MODEL ?? 'moondream';
  }

  private empty(reason: string): VisionAttributes {
    return { category: null, color: null, pattern: null, sleeveType: null, gender: null, confidence: 0, rawDescription: reason };
  }

  private async toBase64(url: string): Promise<{ data: string; mime: string }> {
    const storagePath = url.match(/\/storage\/(.+)$/)?.[1];
    if (storagePath) {
      try {
        const abs = join(process.cwd(), 'storage', storagePath);
        const buffer = await readFile(abs);
        const ext = extname(abs).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        return { data: buffer.toString('base64'), mime };
      } catch { /* fall through to HTTP */ }
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const buffer = Buffer.from(await res.arrayBuffer());
    const mime = String(res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim();
    return { data: buffer.toString('base64'), mime: mime.startsWith('image/') ? mime : 'image/jpeg' };
  }

  async analyze(imageUrl: string): Promise<VisionAttributes> {
    try {
      const { data } = await this.toBase64(imageUrl);

      const prompt = `You are a fashion product analyzer for a Bangladeshi e-commerce store.
Analyze this clothing image and respond ONLY with a valid JSON object, no markdown.

{
  "category": "<dress|saree|panjabi|shirt|t-shirt|kurti|tops|lehenga|salwar_kameez|other_clothing|non_clothing>",
  "color": "<primary color name>",
  "pattern": "<plain|printed|floral|embroidered|striped|checked|solid>",
  "sleeveType": "<full|half|three_quarter|sleeveless|null>",
  "gender": "<women|men|unisex|null>",
  "confidence": <0.0 to 1.0>,
  "rawDescription": "<one sentence description>"
}

Rules:
- If image is clear and shows clothing, confidence >= 0.6
- Only set confidence < 0.1 for extremely blurry or non-clothing images`;

      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ model: this.model, prompt, images: [data], stream: false }),
        signal: AbortSignal.timeout(90_000),
      });

      if (!res.ok) {
        this.logger.error(`[OllamaVision] API error ${res.status}`);
        return this.empty(`Ollama API error ${res.status}`);
      }

      const result = await res.json() as any;
      const content: string = result?.response ?? '';
      this.logger.log(`[OllamaVision] Response: ${content.slice(0, 200)}`);

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return this.empty(`No JSON in response: ${content.slice(0, 80)}`);

      const parsed = JSON.parse(jsonMatch[0]) as Partial<VisionAttributes>;
      return {
        category: parsed.category ?? null,
        color: parsed.color ?? null,
        pattern: parsed.pattern ?? null,
        sleeveType: parsed.sleeveType ?? null,
        gender: parsed.gender ?? null,
        confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
        rawDescription: parsed.rawDescription ?? content.slice(0, 200),
      };
    } catch (err: any) {
      this.logger.error(`[OllamaVision] Failed: ${err?.message ?? err}`);
      return this.empty(String(err?.message ?? 'unknown'));
    }
  }
}
