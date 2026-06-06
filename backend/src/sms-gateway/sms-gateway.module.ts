import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SmsGatewayController } from './sms-gateway.controller';
import { SmsGatewayService } from './sms-gateway.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SmsGatewayController],
  providers: [SmsGatewayService],
  exports: [SmsGatewayService],
})
export class SmsGatewayModule {}
