import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../crm/phone.util';
import { parseBusinessHours, isOpenNow } from '../common/restaurant-delivery';

export interface LoyaltyStatus {
  enabled: boolean;
  isLoyal: boolean;
  ordersSoFar: number;
  ordersNeeded: number;
  discountPercent: number;
  message: string;
}

export interface HappyHourStatus {
  active: boolean;
  discountPercent: number;
  label: string;
}

export interface DiscountResult {
  loyaltyDiscount: number;
  loyaltyMessage?: string;
  happyHourDiscount: number;
  happyHourLabel?: string;
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Real-time "how close is this phone number to a loyalty discount" check. */
  async getLoyaltyStatus(pageId: number, phone: string | null | undefined): Promise<LoyaltyStatus> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: { loyaltyEnabled: true, loyaltyThresholdOrders: true, loyaltyDiscountPercent: true },
    });
    const threshold = page?.loyaltyThresholdOrders;
    const percent = page?.loyaltyDiscountPercent;
    if (!page?.loyaltyEnabled || !threshold || !percent) {
      return { enabled: false, isLoyal: false, ordersSoFar: 0, ordersNeeded: 0, discountPercent: 0, message: '' };
    }

    const clean = normalizePhone(phone);
    const ordersSoFar = clean
      ? await this.prisma.order.count({
          where: { pageIdRef: pageId, phone: clean, status: { not: 'CANCELLED' } },
        })
      : 0;
    const isLoyal = ordersSoFar >= threshold;
    const ordersNeeded = Math.max(0, threshold - ordersSoFar);
    const message = isLoyal
      ? `🎉 আপনি Lucky Customer! এই অর্ডারে ${percent}% ছাড় পাচ্ছেন।`
      : `আরও ${ordersNeeded}টা অর্ডার করলে আপনি Lucky Customer হবেন — পরের অর্ডারে ${percent}% ছাড়!`;

    return { enabled: true, isLoyal, ordersSoFar, ordersNeeded, discountPercent: percent, message };
  }

  /** Whether the configured Happy Hour window is active right now (Asia/Dhaka). */
  async getHappyHourStatus(pageId: number, now: Date = new Date()): Promise<HappyHourStatus> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: {
        happyHourEnabled: true,
        happyHourJson: true,
        happyHourDiscountPercent: true,
        happyHourLabel: true,
      },
    });
    if (!page?.happyHourEnabled || !page.happyHourJson || !page.happyHourDiscountPercent) {
      return { active: false, discountPercent: 0, label: '' };
    }
    let windows: unknown;
    try {
      windows = JSON.parse(page.happyHourJson);
    } catch {
      return { active: false, discountPercent: 0, label: '' };
    }
    const active = isOpenNow(parseBusinessHours(windows), now);
    return {
      active,
      discountPercent: page.happyHourDiscountPercent,
      label: page.happyHourLabel || `🎉 Happy Hour চলছে! ${page.happyHourDiscountPercent}% ছাড়`,
    };
  }

  /** Computes both discounts for an order about to be created — called by all order-creation paths. */
  async computeDiscounts(
    pageId: number,
    phone: string | null | undefined,
    subtotal: number,
    now: Date = new Date(),
  ): Promise<DiscountResult> {
    const [loyalty, happyHour] = await Promise.all([
      this.getLoyaltyStatus(pageId, phone),
      this.getHappyHourStatus(pageId, now),
    ]);
    const loyaltyDiscount = loyalty.isLoyal
      ? Math.round(subtotal * loyalty.discountPercent) / 100
      : 0;
    const happyHourDiscount = happyHour.active
      ? Math.round(subtotal * happyHour.discountPercent) / 100
      : 0;
    return {
      loyaltyDiscount,
      loyaltyMessage: loyalty.enabled ? loyalty.message : undefined,
      happyHourDiscount,
      happyHourLabel: happyHour.active ? happyHour.label : undefined,
    };
  }
}
