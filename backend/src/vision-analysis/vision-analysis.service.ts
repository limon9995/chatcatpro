import { Injectable, Logger } from '@nestjs/common';
import { VisionAttributes, VisionAnalysisProvider } from './vision-analysis.interface';
import { MockVisionProvider } from './providers/mock.vision.provider';
import { OpenAIVisionProvider } from './providers/openai.vision.provider';
import { LocalVisionProvider } from './providers/local.vision.provider';
import { OllamaVisionProvider } from './providers/ollama.vision.provider';

type VisionMode = 'openai' | 'local' | 'local-with-fallback' | 'ollama' | 'ollama-with-fallback' | 'mock';

@Injectable()
export class VisionAnalysisService {
  private readonly logger = new Logger(VisionAnalysisService.name);
  private readonly mode: VisionMode;
  private readonly confidenceThreshold: number;
  private readonly provider: VisionAnalysisProvider;

  constructor(
    private readonly mockProvider: MockVisionProvider,
    private readonly openaiProvider: OpenAIVisionProvider,
    private readonly localProvider: LocalVisionProvider,
    private readonly ollamaProvider: OllamaVisionProvider,
  ) {
    const raw = (process.env.VISION_PROVIDER ?? '').toLowerCase().trim();
    this.confidenceThreshold = Number(process.env.VISION_CONFIDENCE_THRESHOLD ?? 0.15);

    if (raw === 'openai') this.mode = 'openai';
    else if (raw === 'local') this.mode = 'local';
    else if (raw === 'local-with-fallback') this.mode = 'local-with-fallback';
    else if (raw === 'ollama') this.mode = 'ollama';
    else if (raw === 'ollama-with-fallback') this.mode = 'ollama-with-fallback';
    else if (process.env.OLLAMA_BASE_URL) this.mode = 'ollama-with-fallback'; // auto-detect Ollama
    else if (process.env.OPENAI_API_KEY) this.mode = 'openai'; // auto-detect OpenAI
    else this.mode = 'mock';

    if (this.mode === 'openai') this.provider = this.openaiProvider;
    else if (this.mode === 'local') this.provider = this.localProvider;
    else if (this.mode === 'ollama') this.provider = this.ollamaProvider;
    else this.provider = this.mockProvider;

    this.logger.log(`[VisionAnalysis] Mode: ${this.mode} | threshold: ${this.confidenceThreshold}`);
  }

  /** Whether admin product analysis should skip the ADMIN_VISION wallet charge */
  get isLocalMode(): boolean {
    return this.mode === 'local' || this.mode === 'local-with-fallback';
  }

  private fallback(): VisionAttributes {
    return { category: null, color: null, pattern: null, sleeveType: null, gender: null, confidence: 0, rawDescription: 'Analysis failed' };
  }

  async analyze(imageUrl: string): Promise<VisionAttributes> {
    this.logger.log(`[VisionAnalysis] analyze: ${imageUrl.slice(0, 80)}`);
    try {
      if (this.mode === 'local-with-fallback') {
        const local = await this.localProvider.analyze(imageUrl);
        if (local.confidence >= this.confidenceThreshold) {
          this.logger.log(`[VisionAnalysis] Local OK — cat=${local.category} conf=${local.confidence.toFixed(2)}`);
          return { ...local, usedApi: false };
        }
        this.logger.log(`[VisionAnalysis] Local conf=${local.confidence.toFixed(2)} < ${this.confidenceThreshold} → OpenAI fallback`);
        const result = await this.openaiProvider.analyze(imageUrl);
        return { ...result, usedApi: true };
      }

      if (this.mode === 'ollama-with-fallback') {
        try {
          const ollama = await this.ollamaProvider.analyze(imageUrl);
          if (ollama.confidence >= this.confidenceThreshold) {
            this.logger.log(`[VisionAnalysis] Ollama OK — cat=${ollama.category} conf=${ollama.confidence.toFixed(2)}`);
            return { ...ollama, usedApi: false };
          }
          this.logger.log(`[VisionAnalysis] Ollama conf=${ollama.confidence.toFixed(2)} → OpenAI fallback`);
        } catch (ollamaErr: any) {
          this.logger.warn(`[VisionAnalysis] Ollama unavailable (${ollamaErr?.message}) → OpenAI fallback`);
        }
        const result = await this.openaiProvider.analyze(imageUrl);
        return { ...result, usedApi: true };
      }

      const result = await this.provider.analyze(imageUrl);
      return { ...result, usedApi: this.mode === 'openai' };
    } catch (err: any) {
      this.logger.error(`[VisionAnalysis] Failed: ${err?.message ?? err}`);
      return this.fallback();
    }
  }

  async analyzeMultiple(imageUrls: string[]): Promise<VisionAttributes> {
    this.logger.log(`[VisionAnalysis] analyzeMultiple: ${imageUrls.length} images`);
    try {
      if (this.mode === 'local-with-fallback') {
        const local = await this.localProvider.analyzeMultiple(imageUrls);
        if (local.confidence >= this.confidenceThreshold) return { ...local, usedApi: false };
        this.logger.log(`[VisionAnalysis] Multi local low conf → OpenAI fallback`);
        let apiResult: VisionAttributes;
        if (typeof (this.openaiProvider as any).analyzeMultiple === 'function') {
          apiResult = await (this.openaiProvider as any).analyzeMultiple(imageUrls);
        } else {
          apiResult = await this.openaiProvider.analyze(imageUrls[0]);
        }
        return { ...apiResult, usedApi: true };
      }

      let result: VisionAttributes;
      if ('analyzeMultiple' in this.provider && typeof (this.provider as any).analyzeMultiple === 'function') {
        result = await (this.provider as any).analyzeMultiple(imageUrls);
      } else {
        result = await this.analyze(imageUrls[0]);
      }
      return { ...result, usedApi: this.mode === 'openai' };
    } catch (err: any) {
      this.logger.error(`[VisionAnalysis] Multi-analyze failed: ${err?.message ?? err}`);
      return this.fallback();
    }
  }
}
