import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SmsGatewayModule } from '../sms-gateway/sms-gateway.module';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
export { BillingService };
@Module({
  imports: [PrismaModule, AuthModule, SmsGatewayModule],
  providers: [BillingService],
  controllers: [BillingController],
  exports: [BillingService],
})
export class BillingModule {}
