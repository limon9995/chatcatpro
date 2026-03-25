import { Module } from '@nestjs/common';
import { FollowUpModule } from '../followup/followup.module';
import { BillingModule } from '../billing/billing.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [FollowUpModule, BillingModule],
  providers: [SchedulerService],
})
export class V9SchedulerModule {}
