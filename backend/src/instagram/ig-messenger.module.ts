import { Module } from '@nestjs/common';
import { IgMessengerService } from './ig-messenger.service';

@Module({
  providers: [IgMessengerService],
  exports: [IgMessengerService],
})
export class IgMessengerModule {}
