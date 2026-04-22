import { Global, Module } from '@nestjs/common';
import { WhisperService } from './whisper.service';

@Global()
@Module({
  providers: [WhisperService],
  exports: [WhisperService],
})
export class WhisperModule {}
