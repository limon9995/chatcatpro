import { Module } from '@nestjs/common';
import { VisionAnalysisService } from './vision-analysis.service';
import { MockVisionProvider } from './providers/mock.vision.provider';
import { OpenAIVisionProvider } from './providers/openai.vision.provider';

@Module({
  providers: [MockVisionProvider, OpenAIVisionProvider, VisionAnalysisService],
  exports: [VisionAnalysisService],
})
export class VisionAnalysisModule {}
