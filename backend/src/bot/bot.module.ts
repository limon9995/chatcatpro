import { Module } from '@nestjs/common';
import { BotIntentService } from './bot-intent.service';
import { ReplyTemplateService } from './reply-template.service';
import { AiIntentService } from './ai-intent.service';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  providers: [BotIntentService, ReplyTemplateService, AiIntentService],
  exports: [BotIntentService, ReplyTemplateService, AiIntentService],
})
export class BotModule {}
