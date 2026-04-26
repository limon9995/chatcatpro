import { Module } from '@nestjs/common';
import { BotIntentService } from './bot-intent.service';
import { ReplyTemplateService } from './reply-template.service';
import { AiIntentService } from './ai-intent.service';
import { BotContextService } from './bot-context.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BotKnowledgeModule } from '../bot-knowledge/bot-knowledge.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [PrismaModule, BotKnowledgeModule, CommonModule],
  providers: [BotIntentService, ReplyTemplateService, AiIntentService, BotContextService],
  exports: [BotIntentService, ReplyTemplateService, AiIntentService, BotContextService],
})
export class BotModule {}
