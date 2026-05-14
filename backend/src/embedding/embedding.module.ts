import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmbeddingService } from './embedding.service';
import { EmbeddingQueueService } from './embedding-queue.service';

@Module({
  imports: [PrismaModule],
  providers: [EmbeddingService, EmbeddingQueueService],
  exports: [EmbeddingService, EmbeddingQueueService],
})
export class EmbeddingModule {}
