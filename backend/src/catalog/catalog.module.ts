import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentVerifyModule } from '../payment-verify/payment-verify.module';
import { SmsGatewayModule } from '../sms-gateway/sms-gateway.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { PricingModule } from '../pricing/pricing.module';
import { CatalogController } from './catalog.controller';

@Module({
  imports: [PrismaModule, ProductsModule, OrdersModule, PaymentVerifyModule, SmsGatewayModule, TelegramModule, ReviewsModule, PricingModule],
  controllers: [CatalogController],
})
export class CatalogModule {}
