import { Module } from '@nestjs/common';
import { PublicOrderController } from './public-order.controller';
import { PublicOrderService } from './public-order.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramModule } from '../telegram/telegram.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [PrismaModule, TelegramModule, OrdersModule],
  controllers: [PublicOrderController],
  providers: [PublicOrderService],
})
export class PublicOrderModule {}
