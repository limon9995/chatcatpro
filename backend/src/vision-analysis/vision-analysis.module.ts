import { Module } from '@nestjs/common';
import { VisionAnalysisService } from './vision-analysis.service';
import { MockVisionProvider } from './providers/mock.vision.provider';
import { OpenAIVisionProvider } from './providers/openai.vision.provider';
import { LocalVisionProvider } from './providers/local.vision.provider';

@Module({
  providers: [MockVisionProvider, OpenAIVisionProvider, LocalVisionProvider, VisionAnalysisService],
  exports: [VisionAnalysisService],
})
export class VisionAnalysisModule {}
