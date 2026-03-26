import { Injectable, Logger } from '@nestjs/common';
import { VisionAttributes, VisionAnalysisProvider } from './vision-analysis.interface';
import { MockVisionProvider } from './providers/mock.vision.provider';
import { OpenAIVisionProvider } from './providers/openai.vision.provider';

/**
 * V18: VisionAnalysisService
 *
 * Selects the correct provider at startup based on VISION_PROVIDER env var.
 * Falls back to MockVisionProvider if no provider is configured.
 *
 * Supported values for VISION_PROVIDER:
 *   openai   → OpenAIVisionProvider (requires OPENAI_API_KEY)
 *   (empty)  → MockVisionProvider (safe default, no cost)
 *
 * This service is called ONLY when:
 *   1. Customer sends an image
 *   2. OCR finds no product codes (or low confidence)
 *   3. imageRecognitionOn = true for the page
 */
@Injectable()
export class VisionAnalysisService {
  private readonly logger = new Logger(VisionAnalysisService.name);
  private readonly provider: VisionAnalysisProvider;

  constructor(
    private readonly mockProvider: MockVisionProvider,
    private readonly openaiProvider: OpenAIVisionProvider,
  ) {
    const configured = (process.env.VISION_PROVIDER ?? '').toLowerCase().trim();
    if (configured === 'openai') {
      this.provider = this.openaiProvider;
      this.logger.log('[VisionAnalysis] Using OpenAI vision provider');
    } else {
      this.provider = this.mockProvider;
      this.logger.log(
        '[VisionAnalysis] Using mock vision provider (set VISION_PROVIDER=openai to enable real AI)',
      );
    }
  }

  /**
   * Analyze an image URL and return product attributes.
   * Always safe to call — returns confidence=0 on any failure.
   */
  async analyze(imageUrl: string): Promise<VisionAttributes> {
    this.logger.log(`[VisionAnalysis] Analyzing image: ${imageUrl.slice(0, 80)}...`);
    try {
      const result = await this.provider.analyze(imageUrl);
      this.logger.log(
        `[VisionAnalysis] Result: category=${result.category} color=${result.color} ` +
          `pattern=${result.pattern} confidence=${result.confidence.toFixed(2)}`,
      );
      return result;
    } catch (err: any) {
      this.logger.error(`[VisionAnalysis] Provider threw: ${err?.message ?? err}`);
      return {
        category: null,
        color: null,
        pattern: null,
        sleeveType: null,
        gender: null,
        confidence: 0,
        rawDescription: 'Analysis failed',
      };
    }
  }
}
