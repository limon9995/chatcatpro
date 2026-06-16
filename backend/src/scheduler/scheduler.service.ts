import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FollowUpService } from '../followup/followup.service';
import { BillingService } from '../billing/billing.service';
import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from '../admin/admin.service';
import { AutoPostService } from '../auto-post/auto-post.service';
import { SmsGatewayService } from '../sms-gateway/sms-gateway.service';
import { UniversityScraperService } from '../university/university-scraper.service';
import { UniversityPosterService } from '../university/university-poster.service';
import { UniversityCrawlerService } from '../university/university-crawler.service';
import { MessengerService } from '../messenger/messenger.service';
import { TelegramNotificationService } from '../telegram/telegram-notification.service';

const BASE_FEE_BDT = 500;
const LOW_BALANCE_THRESHOLD_BDT = 100;
const SUB_EXPIRY_WARNING_DAYS = 3;

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly followUp: FollowUpService,
    private readonly billing: BillingService,
    private readonly wallet: WalletService,
    private readonly prisma: PrismaService,
    private readonly admin: AdminService,
    private readonly autoPost: AutoPostService,
    private readonly smsGateway: SmsGatewayService,
    private readonly universityScraper: UniversityScraperService,
    private readonly universityPoster: UniversityPosterService,
    private readonly universityCrawler: UniversityCrawlerService,
    private readonly messenger: MessengerService,
    private readonly telegram: TelegramNotificationService,
  ) {}

  // Every 30 minutes — scrape notice page and auto-post new notices
  @Cron('0 */30 * * * *')
  async runUniversityScraper() {
    try {
      const configs = await this.prisma.universityConfig.findMany({
        where: { scrapeEnabled: true, page: { universityModeOn: true } },
        select: { pageId: true, scrapeInterval: true, lastScrapedAt: true },
      });
      for (const cfg of configs) {
        const intervalMs = cfg.scrapeInterval * 60 * 1000;
        const lastScrape = cfg.lastScrapedAt?.getTime() ?? 0;
        if (Date.now() - lastScrape < intervalMs) continue;
        const { newNotices } = await this.universityScraper.runScrapeForPage(
          cfg.pageId,
        );
        await this.universityPoster.postNewNotices(cfg.pageId, newNotices);
      }
    } catch (e: any) {
      this.logger.error(`[Scheduler] University scraper error: ${e.message}`);
    }
  }

  // Every 6 hours — full site crawl to keep knowledge base updated
  @Cron('0 0 */6 * * *')
  async runUniversityFullCrawl() {
    try {
      const configs = await this.prisma.universityConfig.findMany({
        where: { page: { universityModeOn: true } },
        select: { pageId: true, crawlBaseUrl: true, scrapeUrl: true },
      });
      for (const cfg of configs) {
        if (!cfg.crawlBaseUrl && !cfg.scrapeUrl) continue;
        await this.universityCrawler
          .runFullCrawlForPage(cfg.pageId)
          .catch((e: any) =>
            this.logger.error(
              `[Scheduler] Full crawl error pageId=${cfg.pageId}: ${e.message}`,
            ),
          );
        // 5 second gap between universities to avoid hammering servers
        await new Promise((r) => setTimeout(r, 5000));
      }
    } catch (e: any) {
      this.logger.error(
        `[Scheduler] University full crawl error: ${e.message}`,
      );
    }
  }

  // Every 15 minutes — disable SMS gateway for pages with no active device
  @Cron('0 */15 * * * *')
  async checkSmsGatewayDevices() {
    try {
      await this.smsGateway.autoDisableStaleGateways();
    } catch (e: any) {
      this.logger.error(`[Scheduler] SmsGateway check error: ${e.message}`);
    }
  }

  // Every 5 minutes — process scheduled auto posts
  @Cron(CronExpression.EVERY_5_MINUTES)
  async processScheduledAutoPosts() {
    try {
      const count = await this.autoPost.processScheduledPosts();
      if (count > 0)
        this.logger.log(`[Scheduler] AutoPost: ${count} posts published`);
    } catch (e: any) {
      this.logger.error(`[Scheduler] AutoPost error: ${e.message}`);
    }
  }

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
          data: { nextBillingDate: nextBilling, subExpiryNotifiedAt: null },
        });
      }

      this.logger.log(
        `[Scheduler] Base fee: deducted ${BASE_FEE_BDT} BDT from ${deducted} pages, ${suspended} suspended`,
      );
    } catch (e: any) {
      this.logger.error(`[Scheduler] Base fee error: ${e.message}`);
    }
  }

  @Cron('30 0 * * *')
  async syncDailyRegistry() {
    try {
      await this.admin.appendDailyRegistry();
      this.logger.log('[Scheduler] Registry sync done');
    } catch (e: any) {
      this.logger.error(`[Scheduler] Registry sync error: ${e.message}`);
    }
  }

  // Every 30 minutes — find stale drafts and send abandoned-cart reminders
  @Cron(CronExpression.EVERY_30_MINUTES)
  async processAbandonedDrafts() {
    try {
      const pages = await this.prisma.page.findMany({
        where: { subscriptionStatus: 'ACTIVE' },
        select: { id: true, pageToken: true },
      });

      let sent = 0;
      for (const page of pages) {
        const settings = await this.followUp.getSettings(page.id);
        if (!settings.abandonedCartEnabled) continue;

        const cutoff = new Date(
          Date.now() - settings.abandonedCartDelay * 60 * 60 * 1000,
        );
        const stale = await this.prisma.conversationSession.findMany({
          where: {
            pageIdRef: page.id,
            activeDraftJson: { not: null },
            updatedAt: { lt: cutoff },
            abandonedCartNotifiedAt: null,
          },
          select: { id: true, customerPsid: true },
        });

        for (const session of stale) {
          await this.messenger
            .sendText(
              page.pageToken,
              session.customerPsid,
              settings.abandonedCartMsg,
            )
            .catch(() => {});
          await this.prisma.conversationSession.update({
            where: { id: session.id },
            data: { abandonedCartNotifiedAt: new Date() },
          });
          sent++;
        }
      }
      if (sent > 0)
        this.logger.log(`[Scheduler] Abandoned cart: ${sent} reminders sent`);
    } catch (e: any) {
      this.logger.error(`[Scheduler] Abandoned cart error: ${e.message}`);
    }
  }

  // Every 30 minutes — alert merchants whose wallet balance is low
  @Cron(CronExpression.EVERY_30_MINUTES)
  async notifyLowBalancePages() {
    try {
      const lowPages = await this.prisma.page.findMany({
        where: {
          subscriptionStatus: 'ACTIVE',
          walletBalanceBdt: { lt: LOW_BALANCE_THRESHOLD_BDT },
          lowBalanceNotifiedAt: null,
        },
        select: { id: true, walletBalanceBdt: true },
      });
      for (const page of lowPages) {
        await this.telegram
          .notify(
            page.id,
            `⚠️ <b>Low wallet balance</b>: ৳${page.walletBalanceBdt.toFixed(2)} remaining. Please top up to avoid service interruption.`,
          )
          .catch(() => {});
        await this.prisma.page.update({
          where: { id: page.id },
          data: { lowBalanceNotifiedAt: new Date() },
        });
      }

      // Clear the debounce flag for pages whose balance has recovered
      await this.prisma.page.updateMany({
        where: {
          walletBalanceBdt: { gte: LOW_BALANCE_THRESHOLD_BDT },
          lowBalanceNotifiedAt: { not: null },
        },
        data: { lowBalanceNotifiedAt: null },
      });
    } catch (e: any) {
      this.logger.error(`[Scheduler] Low balance notify error: ${e.message}`);
    }
  }

  // Daily at 09:00 — alert merchants whose subscription is expiring soon
  @Cron('0 9 * * *')
  async notifyExpiringSubscriptions() {
    try {
      const cutoff = new Date(
        Date.now() + SUB_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000,
      );
      const expiring = await this.prisma.page.findMany({
        where: {
          subscriptionStatus: 'ACTIVE',
          nextBillingDate: { lte: cutoff, gte: new Date() },
          subExpiryNotifiedAt: null,
        },
        select: { id: true, nextBillingDate: true },
      });
      for (const page of expiring) {
        const dateStr =
          page.nextBillingDate?.toLocaleDateString('en-GB') ?? '-';
        await this.telegram
          .notify(
            page.id,
            `⏳ <b>Subscription renewing soon</b> on ${dateStr}. Make sure your wallet balance covers the ৳${BASE_FEE_BDT} base fee.`,
          )
          .catch(() => {});
        await this.prisma.page.update({
          where: { id: page.id },
          data: { subExpiryNotifiedAt: new Date() },
        });
      }
    } catch (e: any) {
      this.logger.error(
        `[Scheduler] Subscription expiry notify error: ${e.message}`,
      );
    }
  }
}
