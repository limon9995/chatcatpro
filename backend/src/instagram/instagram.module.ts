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
import { IgMessengerModule } from './ig-messenger.module';
import { IgWebhookController } from './ig-webhook.controller';
import { IgWebhookService } from './ig-webhook.service';
import { IgMessengerService } from './ig-messenger.service';
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
    IgMessengerModule,
  ],
  controllers: [IgWebhookController],
  providers: [
    IgWebhookService,
    DraftOrderHandler,
  ],
  exports: [IgMessengerModule],
})
export class InstagramModule {}
