import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentVerifyModule } from '../payment-verify/payment-verify.module';
import { CatalogController } from './catalog.controller';

@Module({
  imports: [PrismaModule, ProductsModule, OrdersModule, PaymentVerifyModule],
  controllers: [CatalogController],
})
export class CatalogModule {}
