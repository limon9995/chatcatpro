import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessengerModule } from '../messenger/messenger.module';
import { BotModule } from '../bot/bot.module';
import { ConversationContextModule } from '../conversation-context/conversation-context.module';
import { CrmModule } from '../crm/crm.module';
import { MessageQueueModule } from '../message-queue/message-queue.module';
import { AgentsModule } from '../agents/agents.module';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import {
  MessageWorker,
  WEBHOOK_SERVICE_TOKEN,
} from '../message-queue/message.worker';

@Module({
  imports: [
    PrismaModule,
    MessengerModule,
    BotModule,
    ConversationContextModule,
    CrmModule,
    MessageQueueModule,
    forwardRef(() => AgentsModule),
  ],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    // Provide WebhookService under the worker token to break circular import
    // (consumed by MessageWorker, and by DefaultCommerceBotAgent to re-enter
    // the full pipeline for synthetic messages e.g. transcribed voice text)
    {
      provide: WEBHOOK_SERVICE_TOKEN,
      useExisting: WebhookService,
    },
    MessageWorker,
  ],
  exports: [WEBHOOK_SERVICE_TOKEN],
})
export class WebhookModule {}
