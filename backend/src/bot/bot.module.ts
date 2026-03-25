import { Module } from '@nestjs/common';
import { BotIntentService } from './bot-intent.service';
import { ReplyTemplateService } from './reply-template.service';

@Module({
  providers: [BotIntentService, ReplyTemplateService],
  exports: [BotIntentService, ReplyTemplateService],
})
export class BotModule {}
