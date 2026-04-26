import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluates if a page has enough balance to proceed with an AI operation.
   * Returns false if balance is <= 0 or subscription is SUSPENDED.
   */
  async canProcessAi(pageId: number): Promise<boolean> {
    try {
      const page = await this.prisma.page.findUnique({
        where: { id: pageId },
        select: { walletBalanceBdt: true, subscriptionStatus: true },
      });

      if (!page) return false;
      if (page.subscriptionStatus !== 'ACTIVE') return false;
      if (page.walletBalanceBdt <= 0) return false;

      return true;
    } catch (error) {
      this.logger.error(`Failed to check wallet balance for page ${pageId}: ${error}`);
      return false;
    }
  }

  /**
   * Deducts a specific amount from the page's wallet based on the usage type.
   */
  async deductUsage(pageId: number, type: 'TEXT' | 'VOICE' | 'IMAGE' | 'IMAGE_LOCAL' | 'IMAGE_OCR' | 'ADMIN_VISION' | 'IMAGE_UNIQUENESS'): Promise<boolean> {
    try {
      const page = await this.prisma.page.findUnique({ where: { id: pageId } });
      if (!page) return false;

      let amountToDeduct = 0;
      let description = '';

      switch (type) {
        case 'TEXT':
          amountToDeduct = page.costPerTextMsgBdt;
          description = 'AI Text Message deduction';
          break;
        case 'VOICE':
          amountToDeduct = page.costPerVoiceMsgBdt;
          description = 'AI Voice Message STT Processed';
          break;
        case 'IMAGE':
          amountToDeduct = page.costPerImageBdt;
          description = 'AI Customer Image (Vision API) Processed';
          break;
        case 'IMAGE_LOCAL':
          amountToDeduct = (page as any).costPerImageLocalBdt ?? 1.20;
          description = 'AI Customer Image (Local CLIP) Processed';
          break;
        case 'IMAGE_OCR':
          // OCR mode — 50% of full image cost, no Vision API call
          amountToDeduct = page.costPerImageBdt * 0.5;
          description = 'Customer Image (OCR mode) Processed';
          break;
        case 'ADMIN_VISION':
          amountToDeduct = page.costPerAnalyzeBdt;
          description = 'Admin Product Vision Analyze';
          break;
        case 'IMAGE_UNIQUENESS':
          amountToDeduct = 0.02;
          description = 'Product Uniqueness Check';
          break;
      }

      if (amountToDeduct <= 0) return true; // Free setup or overridden to 0

      // Transactionally deduct and log
      await this.prisma.$transaction(async (tx) => {
        await tx.page.update({
          where: { id: pageId },
          data: {
            walletBalanceBdt: {
              decrement: amountToDeduct,
            },
          },
        });

        await tx.walletTransaction.create({
          data: {
            pageId,
            type: `DEDUCT_${type}`,
            amountBdt: -amountToDeduct,
            description,
          },
        });
      });

      return true;
    } catch (error) {
      this.logger.error(`Failed to deduct usage for page ${pageId} (${type}): ${error}`);
      return false;
    }
  }

  /**
   * Deducts the monthly 500 BDT base platform fee.
   * Suspends the page if balance drops to 0 or below after deduction.
   */
  async deductBaseFee(pageId: number, feeBdt: number): Promise<{ suspended: boolean }> {
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
      this.logger.error(`Failed to deduct base fee for page ${pageId}: ${error}`);
      return { suspended: false };
    }
  }

  /**
   * Admin / System recharges a wallet.
   */
  async rechargeWallet(pageId: number, amountBdt: number, transactionId: string): Promise<boolean> {
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
      this.logger.error(`Failed to recharge wallet for page ${pageId}: ${error}`);
      return false;
    }
  }
}
