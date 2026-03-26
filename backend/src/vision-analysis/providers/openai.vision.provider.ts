import { Injectable, Logger } from '@nestjs/common';
import {
  VisionAnalysisProvider,
  VisionAttributes,
} from '../vision-analysis.interface';

/**
 * OpenAI Vision Provider — uses GPT-4o vision to analyze product images.
 *
 * SETUP:
 *   1. Set VISION_PROVIDER=openai in .env
 *   2. Set OPENAI_API_KEY=sk-... in .env
 *   3. Optionally set VISION_MODEL=gpt-4o (default)
 *
 * The prompt is tuned for Bangladeshi fashion/e-commerce products.
 * You can swap the provider by implementing VisionAnalysisProvider with
 * any other API (Gemini, Claude, etc.) and updating VisionAnalysisModule.
 */
@Injectable()
export class OpenAIVisionProvider implements VisionAnalysisProvider {
  private readonly logger = new Logger(OpenAIVisionProvider.name);
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY ?? '';
    this.model = process.env.VISION_MODEL ?? 'gpt-4o';
  }

  async analyze(imageUrl: string): Promise<VisionAttributes> {
    if (!this.apiKey) {
      this.logger.warn('[OpenAIVision] OPENAI_API_KEY not set — returning zero confidence');
      return this.emptyResult('OPENAI_API_KEY not configured');
    }

    const prompt = `You are an expert fashion product analyzer for a Bangladeshi e-commerce store.
Analyze this product image and respond ONLY with a valid JSON object (no markdown, no explanation).

Required JSON format:
{
  "category": "<one of: dress, saree, panjabi, shirt, t-shirt, kurti, tops, lehenga, salwar_kameez, three_piece, other_clothing, non_clothing>",
  "color": "<primary color: black, white, red, blue, green, yellow, orange, pink, purple, maroon, navy, grey, multicolor, beige, cream, golden, silver>",
  "pattern": "<one of: plain, printed, floral, embroidered, striped, checked, geometric, abstract, solid>",
  "sleeveType": "<one of: full, half, three_quarter, sleeveless, null if not visible>",
  "gender": "<one of: women, men, unisex, null if uncertain>",
  "confidence": <number 0.0 to 1.0 — your overall certainty>,
  "rawDescription": "<one sentence natural description in English>"
}

Rules:
- If the image is blurry, unclear, or not a clothing/fashion product, set confidence <= 0.2
- Do NOT guess gender unless clearly evident from the product style
- Be honest about uncertainty — low confidence is better than wrong answer
- category "non_clothing" means the image is not a clothing product`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 300,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(20_000), // 20 second timeout
      });

      if (!response.ok) {
        const err = await response.text();
        this.logger.error(`[OpenAIVision] API error ${response.status}: ${err.slice(0, 200)}`);
        return this.emptyResult(`API error ${response.status}`);
      }

      const data = await response.json() as any;
      const content: string = data?.choices?.[0]?.message?.content ?? '';
      this.logger.log(`[OpenAIVision] Raw response: ${content.slice(0, 300)}`);

      const parsed = JSON.parse(content) as Partial<VisionAttributes>;
      return {
        category: parsed.category ?? null,
        color: parsed.color ?? null,
        pattern: parsed.pattern ?? null,
        sleeveType: parsed.sleeveType ?? null,
        gender: parsed.gender ?? null,
        confidence: typeof parsed.confidence === 'number'
          ? Math.min(1, Math.max(0, parsed.confidence))
          : 0,
        rawDescription: parsed.rawDescription ?? content,
      };
    } catch (err: any) {
      this.logger.error(`[OpenAIVision] Failed: ${err?.message ?? err}`);
      return this.emptyResult(String(err?.message ?? 'unknown error'));
    }
  }

  private emptyResult(reason: string): VisionAttributes {
    return {
      category: null,
      color: null,
      pattern: null,
      sleeveType: null,
      gender: null,
      confidence: 0,
      rawDescription: reason,
    };
  }
}
