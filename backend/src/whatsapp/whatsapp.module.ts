import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { BotModule } from '../bot/bot.module';
import { BotKnowledgeModule } from '../bot-knowledge/bot-knowledge.module';
import { ConversationContextModule } from '../conversation-context/conversation-context.module';
import { CrmModule } from '../crm/crm.module';
import { CallModule } from '../call/call.module';
import { ProductsModule } from '../products/products.module';
import { FollowUpModule } from '../followup/followup.module';
import { BillingModule } from '../billing/billing.module';
import { SpamCheckerModule } from '../spam-checker/spam-checker.module';
import { WaMessengerModule } from './wa-messenger.module';
import { WaWebhookController } from './wa-webhook.controller';
import { WaWebhookService } from './wa-webhook.service';
import { WaMessengerService } from './wa-messenger.service';
import { DraftOrderHandler } from '../webhook/handlers/draft-order.handler';

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    BotModule,
    BotKnowledgeModule,
    ConversationContextModule,
    CrmModule,
    CallModule,
    ProductsModule,
    FollowUpModule,
    BillingModule,
    SpamCheckerModule,
    WaMessengerModule,
  ],
  controllers: [WaWebhookController],
  providers: [
    WaWebhookService,
    DraftOrderHandler,
  ],
  exports: [WaMessengerModule],
})
export class WhatsappModule {}
