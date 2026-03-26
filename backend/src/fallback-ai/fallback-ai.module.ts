import { Module } from '@nestjs/common';
import { FallbackAiService } from './fallback-ai.service';
import { MockFallbackProvider } from './providers/mock.fallback.provider';
import { OpenAIFallbackProvider } from './providers/openai.fallback.provider';

@Module({
  providers: [MockFallbackProvider, OpenAIFallbackProvider, FallbackAiService],
  exports: [FallbackAiService],
})
export class FallbackAiModule {}
