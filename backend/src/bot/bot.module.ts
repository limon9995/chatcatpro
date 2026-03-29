import { Module } from '@nestjs/common';
import { BotIntentService } from './bot-intent.service';
import { ReplyTemplateService } from './reply-template.service';
import { AiIntentService } from './ai-intent.service';

@Module({
  providers: [BotIntentService, ReplyTemplateService, AiIntentService],
  exports: [BotIntentService, ReplyTemplateService, AiIntentService],
})
export class BotModule {}
