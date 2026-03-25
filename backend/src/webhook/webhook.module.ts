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
