import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessengerModule } from '../messenger/messenger.module';
import { CommonModule } from '../common/common.module';
import { BillingModule } from '../billing/billing.module';
import { WalletModule } from '../wallet/wallet.module';
import { WaMessengerModule } from '../whatsapp/wa-messenger.module';
import { IgMessengerModule } from '../instagram/ig-messenger.module';
import { BroadcastService } from './broadcast.service';
export { BroadcastService };
@Module({
  imports: [PrismaModule, MessengerModule, CommonModule, BillingModule, WalletModule, WaMessengerModule, IgMessengerModule],
  providers: [BroadcastService],
  exports: [BroadcastService],
})
export class BroadcastModule {}
