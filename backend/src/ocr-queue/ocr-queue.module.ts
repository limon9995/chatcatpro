import { Module } from '@nestjs/common';
import { OcrQueueService } from './ocr-queue.service';

@Module({
  providers: [OcrQueueService],
  exports: [OcrQueueService],
})
export class OcrQueueModule {}
