import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { MessengerService } from './messenger.service';

@Module({
  imports: [CommonModule],
  providers: [MessengerService],
  exports: [MessengerService],
})
export class MessengerModule {}
