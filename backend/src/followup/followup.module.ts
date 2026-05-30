import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessengerModule } from '../messenger/messenger.module';
import { CommonModule } from '../common/common.module';
import { WaMessengerModule } from '../whatsapp/wa-messenger.module';
import { IgMessengerModule } from '../instagram/ig-messenger.module';
import { FollowUpService } from './followup.service';
export { FollowUpService };
@Module({
  imports: [PrismaModule, MessengerModule, CommonModule, WaMessengerModule, IgMessengerModule],
  providers: [FollowUpService],
  exports: [FollowUpService],
})
export class FollowUpModule {}
