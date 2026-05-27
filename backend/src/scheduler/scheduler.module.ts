import { Module } from '@nestjs/common';
import { FollowUpModule } from '../followup/followup.module';
import { BillingModule } from '../billing/billing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminModule } from '../admin/admin.module';
import { AutoPostModule } from '../auto-post/auto-post.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [FollowUpModule, BillingModule, PrismaModule, AdminModule, AutoPostModule],
  providers: [SchedulerService],
})
export class V9SchedulerModule {}
