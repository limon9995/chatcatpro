import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderNotificationService } from './order-notification.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MessengerModule } from '../messenger/messenger.module';
import { BotKnowledgeModule } from '../bot-knowledge/bot-knowledge.module';
import { ConversationContextModule } from '../conversation-context/conversation-context.module';

@Module({
  imports: [PrismaModule, MessengerModule, BotKnowledgeModule, ConversationContextModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderNotificationService],
  exports: [OrdersService, OrderNotificationService],
})
export class OrdersModule {}
