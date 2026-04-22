import { Module } from '@nestjs/common';
import { FollowUpModule } from '../followup/followup.module';
import { BillingModule } from '../billing/billing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [FollowUpModule, BillingModule, PrismaModule],
  providers: [SchedulerService],
})
export class V9SchedulerModule {}
