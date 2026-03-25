import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CallService } from './call.service';
import { TtsService } from './tts.service';
import { CallController } from './call.controller';

@Module({
  imports: [PrismaModule],
  providers: [CallService, TtsService],
  controllers: [CallController],
  exports: [CallService, TtsService],
})
export class CallModule {}
