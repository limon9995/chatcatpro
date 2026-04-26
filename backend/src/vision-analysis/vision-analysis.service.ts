import { Injectable, Logger } from '@nestjs/common';
import { VisionAttributes, VisionAnalysisProvider } from './vision-analysis.interface';
import { MockVisionProvider } from './providers/mock.vision.provider';
import { OpenAIVisionProvider } from './providers/openai.vision.provider';
import { LocalVisionProvider } from './providers/local.vision.provider';
import { OllamaVisionProvider } from './providers/ollama.vision.provider';
import { GlobalSettingsService } from '../common/global-settings.service';

type VisionMode = 'openai' | 'local' | 'local-with-fallback' | 'ollama' | 'ollama-with-fallback' | 'mock';

@Injectable()
export class VisionAnalysisService {
  private readonly logger = new Logger(VisionAnalysisService.name);
  private readonly mode: VisionMode;
  private readonly confidenceThreshold: number;
  private readonly provider: VisionAnalysisProvider;
  /** In-memory cache: normalized image URL → VisionAttributes. Cleared on restart. */
  private readonly urlCache = new Map<string, VisionAttributes>();

  constructor(
    private readonly mockProvider: MockVisionProvider,
    private readonly openaiProvider: OpenAIVisionProvider,
    private readonly localProvider: LocalVisionProvider,
    private readonly ollamaProvider: OllamaVisionProvider,
    private readonly globalSettings: GlobalSettingsService,
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
    return (
      this.mode === 'local' ||
      this.mode === 'local-with-fallback' ||
      this.mode === 'ollama' ||
      this.mode === 'ollama-with-fallback'
    );
  }

  private fallback(): VisionAttributes {
    return { category: null, color: null, pattern: null, sleeveType: null, gender: null, confidence: 0, rawDescription: 'Analysis failed' };
  }

  private cacheKey(url: string): string {
    return url.trim().replace(/[?&]t=\d+/g, ''); // strip cache-busting query params
  }

  async analyze(imageUrl: string): Promise<VisionAttributes> {
    const key = this.cacheKey(imageUrl);
    const cached = this.urlCache.get(key);
    if (cached) {
      this.logger.log(`[VisionAnalysis] Cache HIT: ${key.slice(0, 80)}`);
      return { ...cached, fromCache: true };
    }

    this.logger.log(`[VisionAnalysis] analyze: ${imageUrl.slice(0, 80)}`);
    try {
      let result: VisionAttributes;

      if (this.mode === 'local-with-fallback') {
        const local = await this.localProvider.analyze(imageUrl);
        if (local.confidence >= this.confidenceThreshold) {
          this.logger.log(`[VisionAnalysis] Local OK — cat=${local.category} conf=${local.confidence.toFixed(2)}`);
          result = { ...local, usedApi: false };
        } else {
          this.logger.log(`[VisionAnalysis] Local conf=${local.confidence.toFixed(2)} < ${this.confidenceThreshold} → OpenAI fallback`);
          result = { ...(await this.openaiProvider.analyze(imageUrl)), usedApi: true };
        }
      } else if (this.mode === 'ollama-with-fallback') {
        const { localAiEnabled } = await this.globalSettings.get();
        if (localAiEnabled) {
          try {
            const ollama = await this.ollamaProvider.analyze(imageUrl);
            if (ollama.confidence >= this.confidenceThreshold) {
              this.logger.log(`[VisionAnalysis] Ollama OK — cat=${ollama.category} conf=${ollama.confidence.toFixed(2)}`);
              result = { ...ollama, usedApi: false };
            } else {
              this.logger.log(`[VisionAnalysis] Ollama conf=${ollama.confidence.toFixed(2)} → OpenAI fallback`);
              result = { ...(await this.openaiProvider.analyze(imageUrl)), usedApi: true };
            }
          } catch (ollamaErr: any) {
            this.logger.warn(`[VisionAnalysis] Ollama unavailable (${ollamaErr?.message}) → OpenAI fallback`);
            result = { ...(await this.openaiProvider.analyze(imageUrl)), usedApi: true };
          }
        } else {
          this.logger.log(`[VisionAnalysis] Laptop AI OFF (admin toggle) → OpenAI directly`);
          result = { ...(await this.openaiProvider.analyze(imageUrl)), usedApi: true };
        }
      } else {
        result = { ...(await this.provider.analyze(imageUrl)), usedApi: this.mode === 'openai' };
      }

      // Store in cache only when confidence is meaningful (avoid caching failed analyses)
      if (result.confidence >= 0.05) {
        this.urlCache.set(key, result);
        this.logger.log(`[VisionAnalysis] Cached result for: ${key.slice(0, 80)}`);
      }

      return result;
    } catch (err: any) {
      this.logger.error(`[VisionAnalysis] Failed: ${err?.message ?? err}`);
      return this.fallback();
    }
  }

  async analyzeMultiple(imageUrls: string[]): Promise<VisionAttributes> {
    const multiKey = imageUrls.map((u) => this.cacheKey(u)).sort().join('|');
    const cached = this.urlCache.get(multiKey);
    if (cached) {
      this.logger.log(`[VisionAnalysis] Cache HIT (multi): ${imageUrls.length} images`);
      return { ...cached, fromCache: true };
    }

    this.logger.log(`[VisionAnalysis] analyzeMultiple: ${imageUrls.length} images`);
    try {
      let multiResult: VisionAttributes;

      if (this.mode === 'local-with-fallback') {
        const local = await this.localProvider.analyzeMultiple(imageUrls);
        if (local.confidence >= this.confidenceThreshold) {
          multiResult = { ...local, usedApi: false };
        } else {
          this.logger.log(`[VisionAnalysis] Multi local low conf → OpenAI fallback`);
          let apiResult: VisionAttributes;
          if (typeof (this.openaiProvider as any).analyzeMultiple === 'function') {
            apiResult = await (this.openaiProvider as any).analyzeMultiple(imageUrls);
          } else {
            apiResult = await this.openaiProvider.analyze(imageUrls[0]);
          }
          multiResult = { ...apiResult, usedApi: true };
        }
      } else if (this.mode === 'ollama-with-fallback') {
        const { localAiEnabled } = await this.globalSettings.get();
        let gotResult = false;
        if (localAiEnabled) {
          try {
            const ollama = await this.ollamaProvider.analyze(imageUrls[0]);
            if (ollama.confidence >= this.confidenceThreshold) {
              multiResult = { ...ollama, usedApi: false };
              gotResult = true;
            }
          } catch { /* fall through to OpenAI */ }
        }
        if (!gotResult) {
          let apiResult: VisionAttributes;
          if (typeof (this.openaiProvider as any).analyzeMultiple === 'function') {
            apiResult = await (this.openaiProvider as any).analyzeMultiple(imageUrls);
          } else {
            apiResult = await this.openaiProvider.analyze(imageUrls[0]);
          }
          multiResult = { ...apiResult, usedApi: true };
        }
      } else {
        let raw: VisionAttributes;
        if ('analyzeMultiple' in this.provider && typeof (this.provider as any).analyzeMultiple === 'function') {
          raw = await (this.provider as any).analyzeMultiple(imageUrls);
        } else {
          raw = await this.analyze(imageUrls[0]);
        }
        multiResult = { ...raw, usedApi: this.mode === 'openai' };
      }

      if (multiResult!.confidence >= 0.05) {
        this.urlCache.set(multiKey, multiResult!);
      }
      return multiResult!;
    } catch (err: any) {
      this.logger.error(`[VisionAnalysis] Multi-analyze failed: ${err?.message ?? err}`);
      return this.fallback();
    }
  }
}
