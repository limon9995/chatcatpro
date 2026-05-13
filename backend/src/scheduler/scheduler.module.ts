import { Module } from '@nestjs/common';
import { FollowUpModule } from '../followup/followup.module';
import { BillingModule } from '../billing/billing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminModule } from '../admin/admin.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [FollowUpModule, BillingModule, PrismaModule, AdminModule],
  providers: [SchedulerService],
})
export class V9SchedulerModule {}
