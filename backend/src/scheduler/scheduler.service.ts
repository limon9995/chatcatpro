import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FollowUpService } from '../followup/followup.service';
import { BillingService } from '../billing/billing.service';
import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';

const BASE_FEE_BDT = 500;

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly followUp: FollowUpService,
    private readonly billing: BillingService,
    private readonly wallet: WalletService,
    private readonly prisma: PrismaService,
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

  // 1st of every month at 00:10 — deduct monthly base fee from all active pages
  @Cron('10 0 1 * *')
  async deductMonthlyBaseFee() {
    try {
      const now = new Date();
      const pages = await this.prisma.page.findMany({
        where: { subscriptionStatus: 'ACTIVE' },
        select: { id: true, pageName: true, nextBillingDate: true },
      });

      let deducted = 0;
      let suspended = 0;

      for (const page of pages) {
        // Skip pages whose billing date hasn't arrived yet
        if (page.nextBillingDate && page.nextBillingDate > now) continue;

        const result = await this.wallet.deductBaseFee(page.id, BASE_FEE_BDT);
        deducted++;
        if (result.suspended) suspended++;

        // Advance nextBillingDate by one month
        const nextBilling = new Date(now);
        nextBilling.setMonth(nextBilling.getMonth() + 1);
        await this.prisma.page.update({
          where: { id: page.id },
          data: { nextBillingDate: nextBilling },
        });
      }

      this.logger.log(
        `[Scheduler] Base fee: deducted ${BASE_FEE_BDT} BDT from ${deducted} pages, ${suspended} suspended`,
      );
    } catch (e: any) {
      this.logger.error(`[Scheduler] Base fee error: ${e.message}`);
    }
  }
}
