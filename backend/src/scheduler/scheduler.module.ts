import { Module } from '@nestjs/common';
import { FollowUpModule } from '../followup/followup.module';
import { BillingModule } from '../billing/billing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminModule } from '../admin/admin.module';
import { AutoPostModule } from '../auto-post/auto-post.module';
import { SmsGatewayModule } from '../sms-gateway/sms-gateway.module';
import { UniversityModule } from '../university/university.module';
import { MessengerModule } from '../messenger/messenger.module';
import { TelegramModule } from '../telegram/telegram.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [
    FollowUpModule,
    BillingModule,
    PrismaModule,
    AdminModule,
    AutoPostModule,
    SmsGatewayModule,
    UniversityModule,
    MessengerModule,
    TelegramModule,
  ],
  providers: [SchedulerService],
})
export class V9SchedulerModule {}
