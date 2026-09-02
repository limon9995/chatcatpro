import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingFields, resolveWholesaleRate } from '../common/pricing-fields';

export type AiStatus = 'ok' | 'no_balance' | 'trial_limit_exceeded' | 'suspended';
const TRIAL_DAILY_AI_LIMIT = 100;

export type UsageType =
  | 'TEXT'
  | 'VOICE'
  | 'IMAGE'
  | 'IMAGE_LOCAL'
  | 'IMAGE_OCR'
  | 'ADMIN_VISION'
  | 'IMAGE_UNIQUENESS'
  | 'AI_GENERATE'
  | 'DUAL_PHOTO_AI'
  | 'SMART_BOT'
  | 'MEMO_PRINT'
  | 'KEYWORD_REPLY'
  | 'COMMENT_REPLY'
  | 'BROADCAST';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluates if a page has enough balance to proceed with an AI operation.
   * Returns false if balance is <= 0 or subscription is SUSPENDED.
   */
  async canProcessAi(pageId: number): Promise<boolean> {
    const status = await this.getAiStatus(pageId);
    return status === 'ok';
  }

  /**
   * Returns detailed AI permission status for a page.
   * 'ok'                  — AI allowed
   * 'trial_limit_exceeded'— Free trial daily limit (100/day) reached — bot silent
   * 'no_balance'          — Paid page with zero balance — send fallback message
   * 'suspended'           — Subscription suspended
   */
  async getAiStatus(pageId: number): Promise<AiStatus> {
    try {
      const page = await this.prisma.page.findUnique({
        where: { id: pageId },
        select: { walletBalanceBdt: true, subscriptionStatus: true, ownerId: true },
      });

      if (!page) return 'suspended';
      if (page.subscriptionStatus !== 'ACTIVE') return 'suspended';

      // Grace period: allow AI even with zero/negative balance
      const isGrace = await this.isGracePeriod(pageId);
      if (isGrace) return 'ok';

      // Free trial check
      if (page.ownerId) {
        const isTrial = await this.isTrialPage(page.ownerId);
        if (isTrial) {
          const todayCount = await this.getTrialDailyAiUsage(pageId);
          if (todayCount >= TRIAL_DAILY_AI_LIMIT) return 'trial_limit_exceeded';
          return 'ok';
        }
      }

      if (page.walletBalanceBdt <= 0) return 'no_balance';
      return 'ok';
    } catch (error) {
      this.logger.error(`Failed to check AI status for page ${pageId}: ${error}`);
      return 'no_balance';
    }
  }

  private async isTrialPage(ownerId: string): Promise<boolean> {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId: ownerId, status: 'trial' },
      select: { id: true },
    });
    return !!sub;
  }

  private async getTrialDailyAiUsage(pageId: number): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.prisma.walletTransaction.count({
      where: {
        pageId,
        type: { startsWith: 'DEDUCT' },
        createdAt: { gte: startOfDay },
      },
    });
  }

  /**
   * Deducts a specific amount from the page's wallet based on the usage type.
   */
  async deductUsage(
    pageId: number,
    type: UsageType,
    options?: { photoCount?: number; memoCount?: number; msgCount?: number; provider?: string },
  ): Promise<boolean> {
    try {
      const page = await this.prisma.page.findUnique({
        where: { id: pageId },
        include: { owner: { select: { resellerId: true } } },
      });
      if (!page) return false;

      let amountToDeduct = 0;
      let description = '';

      switch (type) {
        case 'TEXT':
          amountToDeduct = page.costPerTextMsgBdt;
          description = 'বট টেক্সট রিপ্লাই';
          break;
        case 'VOICE':
          amountToDeduct = page.costPerVoiceMsgBdt;
          description = 'ভয়েস মেসেজ প্রসেস';
          break;
        case 'IMAGE':
          amountToDeduct = page.costPerImageBdt;
          description = 'ছবি থেকে পণ্য শনাক্ত (AI)';
          break;
        case 'IMAGE_LOCAL':
          amountToDeduct = (page as any).costPerImageLocalBdt ?? 0.1;
          description = 'ছবি থেকে পণ্য শনাক্ত';
          break;
        case 'IMAGE_OCR':
          amountToDeduct = page.costPerImageBdt * 0.5;
          description = 'ছবি থেকে অর্ডার কোড পড়া (OCR)';
          break;
        case 'ADMIN_VISION': {
          // photoCount lets a multi-image batch (e.g. restaurant menu scan)
          // deduct in ONE atomic transaction instead of N concurrent calls —
          // N unawaited calls each re-read the balance before any commits,
          // so the "stop once balance hits zero" guard below can't reliably
          // catch the crossing point under concurrency.
          const photoCount = options?.photoCount ?? 1;
          amountToDeduct = page.costPerAnalyzeBdt * photoCount;
          description = photoCount > 1 ? `পণ্য ছবি বিশ্লেষণ (${photoCount}টি)` : 'পণ্য ছবি বিশ্লেষণ';
          break;
        }
        case 'IMAGE_UNIQUENESS':
          amountToDeduct = 0.02;
          description = 'পণ্য যাচাই';
          break;
        case 'AI_GENERATE':
          amountToDeduct = (page as any).costPerAiGenerateBdt ?? 0.1;
          description = 'AI কন্টেন্ট তৈরি';
          break;
        case 'DUAL_PHOTO_AI': {
          const photoCount = options?.photoCount ?? 3;
          amountToDeduct = (page.costPerAnalyzeBdt ?? 0.2) * photoCount;
          description = `ডুয়েল ফটো পণ্য শনাক্ত (${photoCount}টি ছবি)`;
          break;
        }
        case 'SMART_BOT':
          amountToDeduct = (page.costPerTextMsgBdt ?? 0.05) * 2;
          description = 'স্মার্ট বট রিপ্লাই';
          break;
        case 'MEMO_PRINT': {
          const memoCount = options?.memoCount ?? 1;
          amountToDeduct =
            ((page as any).costPerMemoPrintBdt ?? 0.1) * memoCount;
          description = `মেমো প্রিন্ট / ডাউনলোড (${memoCount}টি)`;
          break;
        }
        case 'KEYWORD_REPLY':
          amountToDeduct = (page as any).costPerKeywordReplyBdt ?? 0.02;
          description = 'কীওয়ার্ড বট রিপ্লাই';
          break;
        case 'COMMENT_REPLY':
          amountToDeduct = (page as any).costPerCommentReplyBdt ?? 0.05;
          description = 'কমেন্ট অটো-রিপ্লাই';
          break;
        case 'BROADCAST': {
          const msgCount = options?.msgCount ?? 1;
          amountToDeduct = ((page as any).costPerBroadcastMsgBdt ?? 0.05) * msgCount;
          description = `ব্রডকাস্ট মেসেজ (${msgCount}টি)`;
          break;
        }
      }

      if (amountToDeduct <= 0) return true; // Free setup or overridden to 0

      // Trial pages: log usage for daily count tracking but don't deduct balance
      const pageForTrial = await this.prisma.page.findUnique({ where: { id: pageId }, select: { ownerId: true } });
      if (pageForTrial?.ownerId && await this.isTrialPage(pageForTrial.ownerId)) {
        await this.prisma.walletTransaction.create({
          data: { pageId, type: `DEDUCT_${type}`, amountBdt: 0, description: `[Trial] ${description}`, provider: options?.provider ?? null },
        });
        return true;
      }

      // Transactionally deduct and log.
      // In grace mode: always deduct (balance may go negative — debt is repaid on next recharge).
      // Otherwise: skip if balance is already 0 or below (non-grace pages stop at zero).
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.page.findUnique({
          where: { id: pageId },
          select: { walletBalanceBdt: true, subscriptionStatus: true },
        });
        if (!current) return;

        // Check if subscription is currently in grace period
        const isGrace = await this.isGracePeriod(pageId, tx as any);

        // Non-grace pages: stop deducting once balance hits zero
        if (!isGrace && current.walletBalanceBdt <= 0) return;

        await tx.page.update({
          where: { id: pageId },
          data: { walletBalanceBdt: { decrement: amountToDeduct } },
        });

        await tx.walletTransaction.create({
          data: {
            pageId,
            type: `DEDUCT_${type}`,
            amountBdt: -amountToDeduct,
            description: isGrace ? `[Grace] ${description}` : description,
            provider: options?.provider ?? null,
          },
        });
      });

      // Reseller wholesale ledger — best-effort, separate from the retail
      // deduction above so a ledger hiccup can never block bot replies.
      // No-op (page.owner.resellerId is null) for every non-reseller page,
      // i.e. every page in the system today.
      if (page.owner?.resellerId) {
        await this.recordResellerWholesaleUsage(
          page.owner.resellerId,
          pageId,
          type,
          options,
          description,
        );
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to deduct usage for page ${pageId} (${type}): ${error}`,
      );
      return false;
    }
  }

  /** Mirrors deductUsage's per-type amount logic, but against the reseller's
   * wholesale rate instead of the client Page's retail costPer*Bdt fields. */
  private computeWholesaleAmount(
    type: UsageType,
    options: { photoCount?: number; memoCount?: number; msgCount?: number } | undefined,
    rate: Required<PricingFields>,
  ): number {
    switch (type) {
      case 'TEXT':
        return rate.costPerTextMsgBdt;
      case 'VOICE':
        return rate.costPerVoiceMsgBdt;
      case 'IMAGE':
        return rate.costPerImageBdt;
      case 'IMAGE_LOCAL':
        return rate.costPerImageLocalBdt;
      case 'IMAGE_OCR':
        return rate.costPerImageBdt * 0.5;
      case 'ADMIN_VISION':
        return rate.costPerAnalyzeBdt * (options?.photoCount ?? 1);
      case 'IMAGE_UNIQUENESS':
        return 0.02;
      case 'AI_GENERATE':
        return rate.costPerAiGenerateBdt;
      case 'DUAL_PHOTO_AI':
        return rate.costPerAnalyzeBdt * (options?.photoCount ?? 3);
      case 'SMART_BOT':
        return rate.costPerTextMsgBdt * 2;
      case 'MEMO_PRINT':
        return rate.costPerMemoPrintBdt * (options?.memoCount ?? 1);
      case 'KEYWORD_REPLY':
        return rate.costPerKeywordReplyBdt;
      case 'COMMENT_REPLY':
        return rate.costPerCommentReplyBdt;
      case 'BROADCAST':
        return rate.costPerBroadcastMsgBdt * (options?.msgCount ?? 1);
      default:
        return 0;
    }
  }

  private async recordResellerWholesaleUsage(
    resellerId: string,
    pageId: number,
    type: UsageType,
    options: { photoCount?: number; memoCount?: number; msgCount?: number } | undefined,
    description: string,
  ): Promise<void> {
    try {
      const reseller = await this.prisma.reseller.findUnique({
        where: { id: resellerId },
        select: { wholesaleOverridesJson: true },
      });
      if (!reseller) return;
      const rate = resolveWholesaleRate(reseller.wholesaleOverridesJson);
      const amount = this.computeWholesaleAmount(type, options, rate);
      if (amount <= 0) return;

      await this.prisma.$transaction([
        this.prisma.resellerLedgerEntry.create({
          data: { resellerId, pageId, type: 'WHOLESALE_DEBIT', amountBdt: amount, description },
        }),
        this.prisma.reseller.update({
          where: { id: resellerId },
          data: { walletOwedBdt: { increment: amount } },
        }),
      ]);
    } catch (error) {
      this.logger.error(
        `Failed to record reseller wholesale usage (reseller ${resellerId}, page ${pageId}, type ${type}): ${error}`,
      );
    }
  }

  /**
   * Deducts a fixed BDT amount (e.g. SMS verify 1% fee) and logs it.
   */
  async deductFixed(
    pageId: number,
    amountBdt: number,
    description: string,
    type: string = 'DEDUCT_FIXED',
  ): Promise<boolean> {
    if (amountBdt <= 0) return true;
    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.page.findUnique({
          where: { id: pageId },
          select: { walletBalanceBdt: true },
        });
        if (!current || current.walletBalanceBdt <= 0) return;
        await tx.page.update({
          where: { id: pageId },
          data: { walletBalanceBdt: { decrement: amountBdt } },
        });
        await tx.walletTransaction.create({
          data: { pageId, type, amountBdt: -amountBdt, description },
        });
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to deduct fixed fee for page ${pageId}: ${error}`);
      return false;
    }
  }

  /**
   * Deducts the monthly 699 BDT base platform fee.
   * Suspends the page if balance drops to 0 or below after deduction.
   */
  async deductBaseFee(
    pageId: number,
    feeBdt: number,
  ): Promise<{ suspended: boolean }> {
    try {
      let suspended = false;
      await this.prisma.$transaction(async (tx) => {
        const page = await tx.page.findUnique({
          where: { id: pageId },
          select: { walletBalanceBdt: true, subscriptionStatus: true },
        });
        if (!page || page.subscriptionStatus !== 'ACTIVE') return;

        const newBalance = page.walletBalanceBdt - feeBdt;
        suspended = newBalance <= 0;

        await tx.page.update({
          where: { id: pageId },
          data: {
            walletBalanceBdt: { decrement: feeBdt },
            ...(suspended ? { subscriptionStatus: 'SUSPENDED' } : {}),
          },
        });

        await tx.walletTransaction.create({
          data: {
            pageId,
            type: 'DEDUCT_BASE_FEE',
            amountBdt: -feeBdt,
            description: `Monthly platform maintenance fee`,
          },
        });
      });
      return { suspended };
    } catch (error) {
      this.logger.error(
        `Failed to deduct base fee for page ${pageId}: ${error}`,
      );
      return { suspended: false };
    }
  }

  private async isGracePeriod(pageId: number, tx?: any): Promise<boolean> {
    const db = tx ?? this.prisma;
    const page = await db.page.findUnique({
      where: { id: pageId },
      select: { ownerId: true },
    });
    if (!page?.ownerId) return false;
    const sub = await db.subscription.findFirst({
      where: { userId: page.ownerId, status: 'grace' },
      select: { id: true },
    });
    return !!sub;
  }

  /**
   * Admin / System recharges a wallet.
   */
  async rechargeWallet(
    pageId: number,
    amountBdt: number,
    transactionId: string,
  ): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.page.update({
          where: { id: pageId },
          data: {
            walletBalanceBdt: { increment: amountBdt },
            subscriptionStatus: 'ACTIVE', // Automatically resume if it was suspended
          },
        });

        await tx.walletTransaction.create({
          data: {
            pageId,
            type: 'RECHARGE',
            amountBdt: amountBdt,
            description: `Recharge via Trx: ${transactionId}`,
          },
        });
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to recharge wallet for page ${pageId}: ${error}`,
      );
      return false;
    }
  }
}
