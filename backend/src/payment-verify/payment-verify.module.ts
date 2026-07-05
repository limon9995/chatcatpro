import { forwardRef, Module } from '@nestjs/common';
import { PaymentVerifyService } from './payment-verify.service';
import { PaymentCredentialsController } from './payment-credentials.controller';
import { PaymentVerifyController } from './payment-verify.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';
import { MessengerModule } from '../messenger/messenger.module';
import { WebhookModule } from '../webhook/webhook.module';

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    AuthModule,
    MessengerModule,
    forwardRef(() => WebhookModule),
  ],
  controllers: [PaymentCredentialsController, PaymentVerifyController],
  providers: [PaymentVerifyService],
  exports: [PaymentVerifyService],
})
export class PaymentVerifyModule {}
