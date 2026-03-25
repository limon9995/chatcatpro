import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersModule } from '../orders/orders.module';
import { CourierService } from './courier.service';
import { CourierAccountingService } from './courier-accounting.service';
export { CourierService, CourierAccountingService };

@Module({
  imports: [PrismaModule, OrdersModule],
  providers: [CourierService, CourierAccountingService],
  exports: [CourierService, CourierAccountingService],
})
export class CourierModule {}
