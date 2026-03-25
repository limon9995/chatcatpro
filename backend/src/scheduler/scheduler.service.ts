import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FollowUpService } from '../followup/followup.service';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly followUp: FollowUpService,
    private readonly billing: BillingService,
  ) {}

  // Every 5 minutes — process follow-ups
  @Cron(CronExpression.EVERY_5_MINUTES)
  async processFollowUps() {
    try {
      const r = await this.followUp.processPending();
      if (r.processed > 0)
        this.logger.log(`[Scheduler] Follow-ups: ${r.processed} sent`);
    } catch (e: any) {
      this.logger.error(`[Scheduler] Follow-up error: ${e.message}`);
    }
  }

  // 1st of every month at 00:05 — reset order usage counters
  @Cron('5 0 1 * *')
  async resetBillingUsage() {
    try {
      const count = await this.billing.resetMonthlyUsage();
      this.logger.log(`[Scheduler] Billing: reset ${count} subscriptions`);
    } catch (e: any) {
      this.logger.error(`[Scheduler] Billing reset error: ${e.message}`);
    }
  }
}
