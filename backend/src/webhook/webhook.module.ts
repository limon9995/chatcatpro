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
// V18: Image recognition modules
import { VisionAnalysisModule } from '../vision-analysis/vision-analysis.module';
import { ProductMatchModule } from '../product-match/product-match.module';
import { FallbackAiModule } from '../fallback-ai/fallback-ai.module';
import { VisionOpsModule } from '../vision-ops/vision-ops.module';
import { SpamCheckerModule } from '../spam-checker/spam-checker.module';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { DraftOrderHandler } from './handlers/draft-order.handler';
import { ProductInfoHandler } from './handlers/product-info.handler';
import { NegotiationHandler } from './handlers/negotiation.handler';

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
    // V18
    VisionAnalysisModule,
    ProductMatchModule,
    FallbackAiModule,
    VisionOpsModule,
    SpamCheckerModule,
  ],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    DraftOrderHandler,
    ProductInfoHandler,
    NegotiationHandler,
  ],
})
export class WebhookModule {}
