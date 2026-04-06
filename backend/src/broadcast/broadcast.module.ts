import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessengerModule } from '../messenger/messenger.module';
import { CommonModule } from '../common/common.module';
import { BillingModule } from '../billing/billing.module';
import { BroadcastService } from './broadcast.service';
export { BroadcastService };
@Module({
  imports: [PrismaModule, MessengerModule, CommonModule, BillingModule],
  providers: [BroadcastService],
  exports: [BroadcastService],
})
export class BroadcastModule {}
