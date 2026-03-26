import { Injectable, Logger } from '@nestjs/common';
import {
  VisionAnalysisProvider,
  VisionAttributes,
} from '../vision-analysis.interface';

/**
 * Mock Vision Provider — default when no real AI provider is configured.
 * Returns a low-confidence result so the system gracefully falls back
 * to asking the customer for more info.
 *
 * To replace: set VISION_PROVIDER=openai (or gemini) and provide the API key.
 * See openai.vision.provider.ts for the real implementation stub.
 */
@Injectable()
export class MockVisionProvider implements VisionAnalysisProvider {
  private readonly logger = new Logger(MockVisionProvider.name);

  async analyze(imageUrl: string): Promise<VisionAttributes> {
    this.logger.log(
      `[MockVision] analyze called — no real provider configured. imageUrl=${imageUrl.slice(0, 60)}...`,
    );
    // Return a zero-confidence result so decision engine falls back gracefully
    return {
      category: null,
      color: null,
      pattern: null,
      sleeveType: null,
      gender: null,
      confidence: 0,
      rawDescription: 'Mock provider — configure VISION_PROVIDER to enable.',
    };
  }
}
