import { Module } from '@nestjs/common';
import { WaMessengerService } from './wa-messenger.service';

@Module({
  providers: [WaMessengerService],
  exports: [WaMessengerService],
})
export class WaMessengerModule {}
