import { Global, Module } from '@nestjs/common';
import { WalletService } from './wallet.service';

@Global()
@Module({
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
