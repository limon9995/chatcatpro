import { Module } from '@nestjs/common';
import { BotIntentService } from './bot-intent.service';
import { ReplyTemplateService } from './reply-template.service';
import { AiIntentService } from './ai-intent.service';
import { BotContextService } from './bot-context.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BotKnowledgeModule } from '../bot-knowledge/bot-knowledge.module';

@Module({
  imports: [PrismaModule, BotKnowledgeModule],
  providers: [BotIntentService, ReplyTemplateService, AiIntentService, BotContextService],
  exports: [BotIntentService, ReplyTemplateService, AiIntentService, BotContextService],
})
export class BotModule {}
