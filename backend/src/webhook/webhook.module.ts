import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessengerModule } from '../messenger/messenger.module';
import { BotKnowledgeModule } from '../bot-knowledge/bot-knowledge.module';
import { OcrModule } from '../ocr/ocr.module';
import { OcrQueueModule } from '../ocr-queue/ocr-queue.module';
import { BotModule } from '../bot/bot.module';
import { ConversationContextModule } from '../conversation-context/conversation-context.module';
import { CallModule } from '../call/call.module';
import { ProductsModule } from '../products/products.module';
import { CrmModule } from '../crm/crm.module';
import { FollowUpModule } from '../followup/followup.module';
import { BillingModule } from '../billing/billing.module';
import { VisionAnalysisModule } from '../vision-analysis/vision-analysis.module';
import { ProductMatchModule } from '../product-match/product-match.module';
import { FallbackAiModule } from '../fallback-ai/fallback-ai.module';
import { VisionOpsModule } from '../vision-ops/vision-ops.module';
import { SpamCheckerModule } from '../spam-checker/spam-checker.module';
import { MessageQueueModule } from '../message-queue/message-queue.module';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { SmartBotService } from '../bot/smart-bot.service';
import { DraftOrderHandler } from './handlers/draft-order.handler';
import { ProductInfoHandler } from './handlers/product-info.handler';
import { NegotiationHandler } from './handlers/negotiation.handler';
import { MessageWorker, WEBHOOK_SERVICE_TOKEN } from '../message-queue/message.worker';

@Module({
  imports: [
    PrismaModule,
    MessengerModule,
    BotKnowledgeModule,
    OcrModule,
    OcrQueueModule,
    BotModule,
    ConversationContextModule,
    CallModule,
    ProductsModule,
    CrmModule,
    FollowUpModule,
    BillingModule,
    VisionAnalysisModule,
    ProductMatchModule,
    FallbackAiModule,
    VisionOpsModule,
    SpamCheckerModule,
    MessageQueueModule,
  ],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    SmartBotService,
    DraftOrderHandler,
    ProductInfoHandler,
    NegotiationHandler,
    // Provide WebhookService under the worker token to break circular import
    {
      provide: WEBHOOK_SERVICE_TOKEN,
      useExisting: WebhookService,
    },
    MessageWorker,
  ],
})
export class WebhookModule {}
