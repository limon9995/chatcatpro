import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessengerModule } from '../messenger/messenger.module';
import { CommonModule } from '../common/common.module';
import { FollowUpService } from './followup.service';
export { FollowUpService };
@Module({
  imports: [PrismaModule, MessengerModule, CommonModule],
  providers: [FollowUpService],
  exports: [FollowUpService],
})
export class FollowUpModule {}
