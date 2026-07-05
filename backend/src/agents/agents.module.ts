import { forwardRef, Module } from '@nestjs/common';
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
import { EmbeddingModule } from '../embedding/embedding.module';
import { ProductNameMatchModule } from '../product-name-match/product-name-match.module';
import { PaymentVerifyModule } from '../payment-verify/payment-verify.module';
import { SmsGatewayModule } from '../sms-gateway/sms-gateway.module';
import { UniversityModule } from '../university/university.module';
import { CourierModule } from '../courier/courier.module';
import { TelegramModule } from '../telegram/telegram.module';
import { WhisperModule } from '../whisper/whisper.module';
import { WebhookModule } from '../webhook/webhook.module';
import { SmartBotService } from '../bot/smart-bot.service';
import { DraftOrderHandler } from '../webhook/handlers/draft-order.handler';
import { ProductInfoHandler } from '../webhook/handlers/product-info.handler';
import { NegotiationHandler } from '../webhook/handlers/negotiation.handler';
import { ReplyTrackingService } from './reply-tracking.service';
import { DefaultCommerceBotAgent } from './default-commerce/default-commerce.bot-agent';
import { UniversityBotAgent } from './university/university.bot-agent';
import { BotAgentRegistry, BOT_AGENTS } from './bot-agent.registry';

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
    EmbeddingModule,
    ProductNameMatchModule,
    forwardRef(() => PaymentVerifyModule),
    SmsGatewayModule,
    UniversityModule,
    CourierModule,
    TelegramModule,
    WhisperModule,
    forwardRef(() => WebhookModule),
  ],
  providers: [
    SmartBotService,
    DraftOrderHandler,
    ProductInfoHandler,
    NegotiationHandler,
    ReplyTrackingService,
    DefaultCommerceBotAgent,
    UniversityBotAgent,
    {
      provide: BOT_AGENTS,
      useFactory: (
        defaultAgent: DefaultCommerceBotAgent,
        universityAgent: UniversityBotAgent,
      ) => [defaultAgent, universityAgent],
      inject: [DefaultCommerceBotAgent, UniversityBotAgent],
    },
    BotAgentRegistry,
  ],
  exports: [BotAgentRegistry, ReplyTrackingService, DraftOrderHandler],
})
export class AgentsModule {}
