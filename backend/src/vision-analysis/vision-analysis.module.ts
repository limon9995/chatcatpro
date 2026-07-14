import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { VisionAnalysisService } from './vision-analysis.service';
import { MockVisionProvider } from './providers/mock.vision.provider';
import { OpenAIVisionProvider } from './providers/openai.vision.provider';
import { LocalVisionProvider } from './providers/local.vision.provider';
import { OllamaVisionProvider } from './providers/ollama.vision.provider';
import { GeminiVisionProvider } from './providers/gemini.vision.provider';

@Module({
  imports: [CommonModule],
  providers: [
    MockVisionProvider,
    OpenAIVisionProvider,
    LocalVisionProvider,
    OllamaVisionProvider,
    GeminiVisionProvider,
    VisionAnalysisService,
  ],
  exports: [VisionAnalysisService, GeminiVisionProvider],
})
export class VisionAnalysisModule {}
