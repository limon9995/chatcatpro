import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderNotificationService } from './order-notification.service';
import { OrderOwnerMailerService } from './order-owner-mailer.service';
import { OrderActionTokenService } from './order-action-token.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MessengerModule } from '../messenger/messenger.module';
import { BotKnowledgeModule } from '../bot-knowledge/bot-knowledge.module';
import { ConversationContextModule } from '../conversation-context/conversation-context.module';
import { AuthModule } from '../auth/auth.module';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    PrismaModule,
    MessengerModule,
    BotKnowledgeModule,
    ConversationContextModule,
    AuthModule,
    BroadcastModule,
    TelegramModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrderNotificationService,
    OrderOwnerMailerService,
    OrderActionTokenService,
  ],
  exports: [
    OrdersService,
    OrderNotificationService,
    OrderOwnerMailerService,
    OrderActionTokenService,
  ],
})
export class OrdersModule {}
