import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  VisionAnalysisProvider,
  VisionAttributes,
} from '../vision-analysis.interface';

@Injectable()
export class OpenAIVisionProvider implements VisionAnalysisProvider {
  private readonly logger = new Logger(OpenAIVisionProvider.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly confidenceThreshold: number;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY ?? '';
    this.model = process.env.VISION_MODEL ?? 'gpt-4o';
    this.confidenceThreshold = Number(process.env.VISION_CONFIDENCE_THRESHOLD ?? 0.15);
  }

  private buildPrompt(multi: boolean): string {
    return `You are an expert fashion product analyzer for a Bangladeshi e-commerce store.
${multi
  ? 'You are given multiple photos of the SAME product from different angles. Analyze ALL images together and provide a comprehensive description that captures every visible detail.'
  : 'Analyze this product image.'
}
Respond ONLY with a valid JSON object (no markdown, no explanation).

Required JSON format:
{
  "category": "<one of: dress, saree, panjabi, shirt, t-shirt, kurti, tops, lehenga, salwar_kameez, three_piece, other_clothing, non_clothing>",
  "color": "<primary color: black, white, red, blue, green, yellow, orange, pink, purple, maroon, navy, grey, multicolor, beige, cream, golden, silver>",
  "pattern": "<one of: plain, printed, floral, embroidered, striped, checked, geometric, abstract, solid>",
  "sleeveType": "<one of: full, half, three_quarter, sleeveless, null if not visible>",
  "gender": "<one of: women, men, unisex, null if uncertain>",
  "confidence": <number 0.0 to 1.0 — your overall certainty>,
  "rawDescription": "<${multi
    ? 'comprehensive 2-3 sentence description covering all visible angles, fabric texture, design details, embellishments, and distinctive visual features that would help identify this product in customer photos'
    : 'one sentence natural description'
  } in English>"
}

Rules:
- If images are clearly visible and recognizable, confidence should be >= 0.6
- Only set confidence <= 0.1 for extremely blurry images where you cannot make out the subject at all
- For full-body model shots, focus on the clothing details and maintain high confidence if product is clear
- For non-clothing items (bags, shoes, accessories), still analyze and set confidence based on image clarity, not on whether it is clothing
- Do NOT guess gender unless clearly evident from the product style
- Be honest about uncertainty but do NOT penalize clear images with low confidence
- category "non_clothing" means the image is definitely not a clothing product`;
  }

  private extractJson(content: string): string {
    const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) return fenceMatch[1].trim();
    const objMatch = content.match(/\{[\s\S]*\}/);
    if (objMatch) return objMatch[0];
    return content.trim();
  }

  private parseResponse(content: string): VisionAttributes {
    const json = this.extractJson(content);
    const parsed = JSON.parse(json) as Partial<VisionAttributes>;
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
  }

  // Download the image and return a base64 data URL so OpenAI never needs
  // to reach our server directly (avoids firewall / accessibility issues).
  private async toBase64DataUrl(url: string): Promise<string> {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 15_000,
    });
    const mimeRaw = String(response.headers['content-type'] ?? 'image/jpeg').split(';')[0].trim();
    const mime = mimeRaw.startsWith('image/') ? mimeRaw : 'image/jpeg';
    const b64 = Buffer.from(response.data).toString('base64');
    return `data:${mime};base64,${b64}`;
  }

  private async callAPI(imageUrls: string[]): Promise<VisionAttributes> {
    const isMulti = imageUrls.length > 1;

    // Convert all URLs to base64 data URLs in parallel
    const dataUrls = await Promise.all(imageUrls.map((u) => this.toBase64DataUrl(u)));

    const imageContent = dataUrls.map((dataUrl) => ({
      type: 'image_url' as const,
      image_url: { url: dataUrl, detail: 'auto' as const },
    }));

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: isMulti ? 500 : 300,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: this.buildPrompt(isMulti) },
              ...imageContent,
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`[OpenAIVision] API error ${response.status}: ${err.slice(0, 200)}`);
      return this.emptyResult(`API error ${response.status}`);
    }

    const data = await response.json() as any;
    const content: string = data?.choices?.[0]?.message?.content ?? '';
    this.logger.log(`[OpenAIVision] Response (${imageUrls.length} imgs): ${content.slice(0, 300)}`);
    return this.parseResponse(content);
  }

  /** Analyze a single image */
  async analyze(imageUrl: string): Promise<VisionAttributes> {
    if (!this.apiKey) {
      this.logger.warn('[OpenAIVision] OPENAI_API_KEY not set — returning zero confidence');
      return this.emptyResult('OPENAI_API_KEY not configured');
    }
    try {
      return await this.callAPI([imageUrl]);
    } catch (err: any) {
      this.logger.error(`[OpenAIVision] analyze failed: ${err?.message ?? err}`);
      return this.emptyResult(String(err?.message ?? 'unknown error'));
    }
  }

  /** Analyze 2-5 angles of the SAME product in a single API call for richer description */
  async analyzeMultiple(imageUrls: string[]): Promise<VisionAttributes> {
    if (!this.apiKey) {
      this.logger.warn('[OpenAIVision] OPENAI_API_KEY not set — returning zero confidence');
      return this.emptyResult('OPENAI_API_KEY not configured');
    }
    if (!imageUrls.length) return this.emptyResult('No images provided');
    if (imageUrls.length === 1) return this.analyze(imageUrls[0]);

    const urls = imageUrls.slice(0, 5);
    this.logger.log(`[OpenAIVision] Multi-angle: ${urls.length} images`);
    try {
      return await this.callAPI(urls);
    } catch (err: any) {
      this.logger.error(`[OpenAIVision] analyzeMultiple failed: ${err?.message ?? err}`);
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
