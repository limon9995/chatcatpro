import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../crm/phone.util';
import { parseBusinessHours, isOpenNow, isOfferActiveNow } from '../common/restaurant-delivery';

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

export interface MilestoneReward {
  interval: number;
  rewardType: 'FREE_ITEM' | 'FREE_DELIVERY' | 'DISCOUNT_PERCENT';
  productId?: number;
  productCode?: string;
  productName?: string;
  qty: number;
  discountPercent?: number;
}

export interface MilestonePreview {
  enabled: boolean;
  thisOrderNumber: number;
  rewards: MilestoneReward[];
  next: { interval: number; ordersAway: number; rewardType: string; productName?: string; discountPercent?: number } | null;
}

export interface DiscountResult {
  loyaltyDiscount: number;
  loyaltyMessage?: string;
  happyHourDiscount: number;
  happyHourLabel?: string;
}

export interface OfferDiscountItemInput {
  productId: number;
  category: string | null;
  qty: number;
  unitPrice: number;
}

export interface AppliedOfferSnapshot {
  id: number;
  title: string;
  target: string;
  type: string;
  value: number;
}

export interface OfferDiscountResult {
  productDiscountAmount: number;
  productDiscountLabel?: string;
  deliveryDiscountAmount: number;
  deliveryDiscountLabel?: string;
  /** Present only for a FIXED_PRICE delivery offer — caller should SET the
   *  delivery fee to this value rather than subtract deliveryDiscountAmount. */
  deliveryFixedPrice?: number;
  appliedOffers: AppliedOfferSnapshot[];
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * How many non-cancelled orders this phone number has placed at this page
   * so far. `excludeOrderId` lets a caller that already created the order row
   * (before pricing runs, e.g. the manual/quick-order flow) avoid counting
   * that just-created order as one of its own "prior" orders.
   */
  private async countPriorOrders(
    pageId: number,
    phone: string,
    excludeOrderId?: number,
  ): Promise<number> {
    return this.prisma.order.count({
      where: {
        pageIdRef: pageId,
        phone,
        status: { not: 'CANCELLED' },
        ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
      },
    });
  }

  /** Real-time "how close is this phone number to a loyalty discount" check. */
  async getLoyaltyStatus(
    pageId: number,
    phone: string | null | undefined,
    excludeOrderId?: number,
  ): Promise<LoyaltyStatus> {
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
      ? await this.countPriorOrders(pageId, clean, excludeOrderId)
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
    excludeOrderId?: number,
  ): Promise<DiscountResult> {
    const [loyalty, happyHour] = await Promise.all([
      this.getLoyaltyStatus(pageId, phone, excludeOrderId),
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

  /** True if any of these product codes is a COMBO product for this page. */
  async isComboOrder(pageId: number, productCodes: string[]): Promise<boolean> {
    if (!productCodes.length) return false;
    const combo = await this.prisma.product.findFirst({
      where: { pageId, code: { in: productCodes }, productType: 'COMBO' },
      select: { id: true },
    });
    return Boolean(combo);
  }

  /**
   * Order-count-based recurring reward(s) — every Nth order gets a configured
   * free item or free delivery. If an order number satisfies more than one
   * configured interval (e.g. intervals 2 and 3 both hit on order 6), ALL
   * matching rewards apply — not just the first. Combo orders never receive
   * any milestone reward on the order that contains the combo, but they
   * still count toward the running order total.
   */
  async getMilestoneRewards(
    pageId: number,
    phone: string | null | undefined,
    isComboOrder: boolean,
    excludeOrderId?: number,
  ): Promise<{ thisOrderNumber: number; rewards: MilestoneReward[] }> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: { milestoneRewardsEnabled: true },
    });
    if (!page?.milestoneRewardsEnabled) return { thisOrderNumber: 0, rewards: [] };

    const clean = normalizePhone(phone);
    if (!clean) return { thisOrderNumber: 0, rewards: [] };

    const priorCount = await this.countPriorOrders(pageId, clean, excludeOrderId);
    const thisOrderNumber = priorCount + 1;
    if (isComboOrder) return { thisOrderNumber, rewards: [] };

    const milestones = await this.prisma.milestoneReward.findMany({
      where: { pageId, isActive: true },
      include: { product: { select: { id: true, code: true, name: true } } },
    });
    const matches = milestones.filter(
      (m) =>
        m.orderInterval > 0 &&
        thisOrderNumber % m.orderInterval === 0 &&
        !(m.rewardType === 'FREE_ITEM' && !m.product), // skip if reward product was deleted
    );

    return {
      thisOrderNumber,
      rewards: matches.map((m) => ({
        interval: m.orderInterval,
        rewardType: m.rewardType as 'FREE_ITEM' | 'FREE_DELIVERY' | 'DISCOUNT_PERCENT',
        productId: m.product?.id,
        productCode: m.product?.code,
        productName: m.product?.name ?? m.product?.code,
        qty: m.qty,
        discountPercent: m.discountPercent ?? undefined,
      })),
    };
  }

  /**
   * Taka amount for the DISCOUNT_PERCENT reward(s) among a set of matched
   * milestone rewards — percentages are SUMMED when more than one interval
   * hits the same order (same "apply ALL matching rewards" rule as
   * FREE_ITEM), capped at 100% so a stacked combo can never exceed the
   * subtotal itself.
   */
  computeMilestoneDiscountAmount(rewards: MilestoneReward[], subtotal: number): number {
    const percent = rewards
      .filter((r) => r.rewardType === 'DISCOUNT_PERCENT')
      .reduce((sum, r) => sum + (Number(r.discountPercent) || 0), 0);
    if (!percent || subtotal <= 0) return 0;
    return Math.round(subtotal * Math.min(100, percent)) / 100;
  }

  /** Public preview (web checkout / bot phone-capture): what's coming up, without placing an order. */
  async getMilestonePreview(pageId: number, phone: string | null | undefined): Promise<MilestonePreview> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      select: { milestoneRewardsEnabled: true },
    });
    if (!page?.milestoneRewardsEnabled) {
      return { enabled: false, thisOrderNumber: 0, rewards: [], next: null };
    }
    const clean = normalizePhone(phone);
    const priorCount = clean ? await this.countPriorOrders(pageId, clean) : 0;
    const thisOrderNumber = priorCount + 1;

    const milestones = await this.prisma.milestoneReward.findMany({
      where: { pageId, isActive: true },
      include: { product: { select: { id: true, code: true, name: true } } },
    });
    const hits = milestones.filter((m) => m.orderInterval > 0 && thisOrderNumber % m.orderInterval === 0);
    const rewards: MilestoneReward[] = hits.map((hit) => ({
      interval: hit.orderInterval,
      rewardType: hit.rewardType as 'FREE_ITEM' | 'FREE_DELIVERY' | 'DISCOUNT_PERCENT',
      productId: hit.product?.id,
      productCode: hit.product?.code,
      productName: hit.product?.name ?? hit.product?.code,
      qty: hit.qty,
      discountPercent: hit.discountPercent ?? undefined,
    }));

    let next: MilestonePreview['next'] = null;
    if (!rewards.length && milestones.length) {
      let best: { interval: number; ordersAway: number; rewardType: string; productName?: string; discountPercent?: number } | null = null;
      for (const m of milestones) {
        if (m.orderInterval <= 0) continue;
        const upcoming = Math.ceil(thisOrderNumber / m.orderInterval) * m.orderInterval;
        const ordersAway = upcoming - thisOrderNumber + 1;
        if (!best || ordersAway < best.ordersAway) {
          best = {
            interval: m.orderInterval,
            ordersAway,
            rewardType: m.rewardType,
            productName: m.product?.name ?? m.product?.code,
            discountPercent: m.discountPercent ?? undefined,
          };
        }
      }
      next = best;
    }

    return { enabled: true, thisOrderNumber, rewards, next };
  }

  /** Offers that are isActive, within their validity date range, and within
   *  their attached time-of-day schedule (if any) — the shared "is this
   *  offer live right now" filter used by resolveOfferDiscounts and the
   *  checkout live-preview endpoints below. */
  private async getActiveOffers(pageId: number, now: Date) {
    const offers = await this.prisma.offer.findMany({
      where: { pageId, isActive: true },
      include: { products: { select: { productId: true } } },
    });
    return offers.filter((o) => {
      if (!o.isUnlimited) {
        if (o.startDate && o.startDate > now) return false;
        if (o.endDate && o.endDate < now) return false;
      }
      return isOfferActiveNow(o.hoursMode, o.hoursJson, now);
    });
  }

  /**
   * Checkout live-preview helper: the best product-side (SUBTOTAL/CATEGORY/
   * PRODUCTS) offer applicable to ONE specific product, if any — used to show
   * "🎉 20% off" on the product page before the customer has even started
   * checkout. Percent-only for this bucket, so the actual price doesn't
   * affect which offer wins; a nominal qty=1 is enough.
   */
  async getProductOfferPreview(
    pageId: number,
    productId: number,
    category: string | null,
    now: Date = new Date(),
  ): Promise<{ percent: number; label: string; offerId: number } | null> {
    const result = await this.resolveOfferDiscounts(
      pageId,
      [{ productId, category, qty: 1, unitPrice: 100 }], // percent-only bucket — base value is irrelevant to which offer wins
      null,
      now,
    );
    const offer = result.appliedOffers.find((o) => o.target !== 'DELIVERY');
    if (!offer) return null;
    return { percent: offer.value, label: result.productDiscountLabel || offer.title, offerId: offer.id };
  }

  /** Public catalog gallery: every currently-active offer, for a "🎁 Offers" showcase. */
  async listActiveOffersForGallery(pageId: number, now: Date = new Date()) {
    const candidates = await this.getActiveOffers(pageId, now);
    return candidates.map((o) => ({
      id: o.id,
      title: o.title,
      subtitle: o.subtitle,
      description: o.description,
      imageUrl: o.imageUrl,
      discountTarget: o.discountTarget,
      discountType: o.discountType,
      discountValue: o.discountValue,
    }));
  }

  /**
   * Checkout live-preview helper: raw config (not resolved against a fee) for
   * every currently-active DELIVERY-target offer — the restaurant checkout
   * page only learns the actual delivery fee client-side once the customer
   * pins their location, so the "which one wins" comparison happens in that
   * same client-side code, mirroring how the fee itself is already computed
   * there (server always re-validates at order submission).
   */
  async getActiveDeliveryOfferOptions(
    pageId: number,
    now: Date = new Date(),
  ): Promise<{ id: number; title: string; type: string; value: number }[]> {
    const candidates = await this.getActiveOffers(pageId, now);
    return candidates
      .filter((o) => o.discountTarget === 'DELIVERY')
      .map((o) => ({ id: o.id, title: o.title, type: o.discountType, value: o.discountValue }));
  }

  /**
   * Resolve which Offer(s) apply to an order right now, and by how much.
   * "Right now" checks isActive, the validity date range (skipped when
   * isUnlimited), and any attached time-of-day schedule (isOfferActiveNow —
   * NOT parseBusinessHours/isOpenNow, see that function's doc for why).
   *
   * Two independent buckets, each picking a single winner (no stacking,
   * per product decision) — they CAN both apply to the same order since they
   * discount different things:
   *   - product-side: SUBTOTAL / CATEGORY / PRODUCTS targets, all percent-only,
   *     compared by resulting discount taka amount — highest wins.
   *   - delivery-side: DELIVERY target only, compared by resulting FINAL fee
   *     (not raw discount amount, since FIXED_PRICE doesn't reduce to a
   *     comparable "amount" the same way PERCENT/FIXED_OFF do) — lowest final
   *     fee wins, and only applied when it's a genuine improvement.
   */
  async resolveOfferDiscounts(
    pageId: number,
    items: OfferDiscountItemInput[],
    deliveryFee: number | null | undefined,
    now: Date = new Date(),
  ): Promise<OfferDiscountResult> {
    const empty: OfferDiscountResult = {
      productDiscountAmount: 0,
      deliveryDiscountAmount: 0,
      appliedOffers: [],
    };
    if (!items.length) return empty;

    const candidates = await this.getActiveOffers(pageId, now);
    if (!candidates.length) return empty;

    const subtotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    const snapshot = (o: (typeof candidates)[number]): AppliedOfferSnapshot => ({
      id: o.id,
      title: o.title,
      target: o.discountTarget,
      type: o.discountType,
      value: o.discountValue,
    });

    // ── Product-side bucket ──────────────────────────────────────────────────
    let bestProduct: { amount: number; offer: (typeof candidates)[number] } | null = null;
    for (const offer of candidates) {
      if (offer.discountTarget === 'DELIVERY') continue;
      let base = 0;
      if (offer.discountTarget === 'SUBTOTAL') {
        base = subtotal;
      } else if (offer.discountTarget === 'CATEGORY') {
        const wanted = (offer.discountCategory || '').toLowerCase();
        base = items
          .filter((i) => (i.category || '').toLowerCase() === wanted)
          .reduce((s, i) => s + i.unitPrice * i.qty, 0);
      } else if (offer.discountTarget === 'PRODUCTS') {
        const ids = new Set(offer.products.map((p) => p.productId));
        base = items
          .filter((i) => ids.has(i.productId))
          .reduce((s, i) => s + i.unitPrice * i.qty, 0);
      }
      if (base <= 0) continue;
      // discountType is always PERCENT for this bucket (enforced at save time)
      const amount = Math.round(base * offer.discountValue) / 100;
      if (amount > 0 && (!bestProduct || amount > bestProduct.amount)) {
        bestProduct = { amount, offer };
      }
    }

    // ── Delivery-side bucket ─────────────────────────────────────────────────
    let bestDelivery:
      | { amount: number; fixedPrice?: number; offer: (typeof candidates)[number] }
      | null = null;
    if (deliveryFee != null && deliveryFee >= 0) {
      for (const offer of candidates) {
        if (offer.discountTarget !== 'DELIVERY') continue;
        let finalFee: number;
        let fixedPrice: number | undefined;
        if (offer.discountType === 'PERCENT') {
          finalFee = Math.round(deliveryFee * (1 - offer.discountValue / 100) * 100) / 100;
        } else if (offer.discountType === 'FIXED_OFF') {
          finalFee = Math.max(0, deliveryFee - offer.discountValue);
        } else {
          // FIXED_PRICE — override entirely
          finalFee = offer.discountValue;
          fixedPrice = offer.discountValue;
        }
        // Only apply when it's a genuine improvement for the customer —
        // protects against a merchant setting a FIXED_PRICE that's actually
        // higher than the currently-computed fee.
        if (finalFee >= deliveryFee) continue;
        const amount = Math.round((deliveryFee - finalFee) * 100) / 100;
        if (!bestDelivery || finalFee < deliveryFee - bestDelivery.amount) {
          bestDelivery = { amount, fixedPrice, offer };
        }
      }
    }

    const appliedOffers: AppliedOfferSnapshot[] = [];
    if (bestProduct) appliedOffers.push(snapshot(bestProduct.offer));
    if (bestDelivery) appliedOffers.push(snapshot(bestDelivery.offer));

    return {
      productDiscountAmount: bestProduct?.amount ?? 0,
      productDiscountLabel: bestProduct
        ? bestProduct.offer.subtitle || `🎁 ${bestProduct.offer.title}`
        : undefined,
      deliveryDiscountAmount: bestDelivery?.amount ?? 0,
      deliveryDiscountLabel: bestDelivery
        ? bestDelivery.offer.subtitle || `🎁 ${bestDelivery.offer.title}`
        : undefined,
      deliveryFixedPrice: bestDelivery?.fixedPrice,
      appliedOffers,
    };
  }
}
