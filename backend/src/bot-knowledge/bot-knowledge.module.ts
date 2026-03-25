import { Module } from '@nestjs/common';
import { PageModule } from '../page/page.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BotKnowledgeService } from './bot-knowledge.service';

@Module({
  imports: [PageModule, PrismaModule],
  providers: [BotKnowledgeService],
  exports: [BotKnowledgeService],
})
export class BotKnowledgeModule {}
