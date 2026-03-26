import { Module } from '@nestjs/common';
import { ConversationContextModule } from '../conversation-context/conversation-context.module';
import { PageModule } from '../page/page.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BotKnowledgeService } from './bot-knowledge.service';

@Module({
  imports: [PageModule, PrismaModule, ConversationContextModule],
  providers: [BotKnowledgeService],
  exports: [BotKnowledgeService],
})
export class BotKnowledgeModule {}
