import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * V10: Courier → Accounting integration.
 *
 * When courier status changes, this service automatically:
 *
 * DELIVERED:
 *   → Order status → CONFIRMED (if not already)
 *   → No accounting entry needed (revenue already counted at CONFIRMED)
 *
 * RETURNED:
 *   → Order status → RECEIVED (or keep as is, mark return)
 *   → ReturnEntry created automatically:
 *       refundAmount = order subtotal (full return)
 *       returnCost   = courier fee (if known)
 *
 * EXCHANGE (manual trigger from dashboard):
 *   → ExchangeEntry created:
 *       extraCharge      = new product price diff (if higher)
 *       refundAdjustment = old product price diff (if lower)
 *
 * This keeps accounting in sync with real courier events without manual entry.
 */
@Injectable()
export class CourierAccountingService {
  private readonly logger = new Logger(CourierAccountingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Called when courier reports DELIVERED.
   * Confirms the order if not already confirmed.
   */
  async onDelivered(pageId: number, orderId: number): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order || order.pageIdRef !== pageId) return;
    if (order.status === 'CONFIRMED') return; // already done

    this.logger.log(
      `[CourierAccounting] Delivered → confirming order #${orderId}`,
    );

    // Confirm the order
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
  }

  /**
   * Called when courier reports RETURNED.
   * Creates a ReturnEntry in accounting automatically.
   *
   * Cost logic:
   *   refundAmount = full order subtotal (money going back to customer)
   *   returnCost   = courier fee (courierFee from shipment, default 0)
   *
   * This appears in:
   *   - Accounting → Returns tab
   *   - Profit calculation: revenue - refunds - returnCost
   */
  async onReturned(pageId: number, orderId: number): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, courierShipment: true },
    });
    if (!order || order.pageIdRef !== pageId) return;

    const subtotal = (order.items || []).reduce(
      (s, i) => s + i.unitPrice * i.qty,
      0,
    );
    const courierFee = (order as any).courierShipment?.courierFee ?? 0;

    // Check if a return entry already exists for this order
    const existing = await this.prisma.returnEntry.findFirst({
      where: { pageId, orderId },
    });
    if (existing) {
      this.logger.log(
        `[CourierAccounting] ReturnEntry already exists for order #${orderId}`,
      );
      return;
    }

    this.logger.log(
      `[CourierAccounting] Returned → creating ReturnEntry for order #${orderId} refund=${subtotal} returnCost=${courierFee}`,
    );

    await this.prisma.returnEntry.create({
      data: {
        pageId,
        orderId,
        returnType: 'full',
        refundAmount: subtotal,
        returnCost: courierFee,
        note: `Auto-created: courier returned order #${orderId}`,
      },
    });

    // Update order status
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    });
  }

  /**
   * Called when courier reports PARTIAL DELIVERY.
   * Some items delivered, some returned.
   * Order stays CONFIRMED. ReturnEntry created with refundAmount=0 pending agent item selection.
   */
  async onPartialDelivery(pageId: number, orderId: number): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { courierShipment: true },
    });
    if (!order || order.pageIdRef !== pageId) return;

    // Idempotent: skip if partial ReturnEntry already exists
    const existing = await this.prisma.returnEntry.findFirst({
      where: { pageId, orderId, returnType: 'partial' },
    });
    if (existing) {
      this.logger.log(
        `[CourierAccounting] Partial ReturnEntry already exists for order #${orderId}`,
      );
      return;
    }

    const courierFee = (order as any).courierShipment?.courierFee ?? 0;

    this.logger.log(
      `[CourierAccounting] Partial delivery → creating partial ReturnEntry for order #${orderId}`,
    );

    await this.prisma.returnEntry.create({
      data: {
        pageId,
        orderId,
        returnType: 'partial',
        refundAmount: 0,
        returnCost: courierFee,
        refundStatus: 'pending_item_selection',
        note: `Auto-created: partial delivery for order #${orderId} — returned items pending selection`,
      },
    });

    // Order stays CONFIRMED — partial delivery means some items were delivered
    if (order.status !== 'CONFIRMED') {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });
    }
  }

  /**
   * Called when agent manually marks an order as exchange.
   * Creates an ExchangeEntry in accounting.
   *
   * Exchange cost logic:
   *   If new product costs MORE  → extraCharge      = price difference
   *   If new product costs LESS  → refundAdjustment = price difference
   *   If same price              → both = 0 (just a swap, no money movement)
   *
   * This appears in:
   *   - Accounting → Exchanges tab
   *   - Profit calculation: + extraCharge - refundAdjustment
   */
  async onExchanged(
    pageId: number,
    orderId: number,
    opts: {
      originalAmount: number;
      newAmount: number;
      note?: string;
    },
  ): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order || order.pageIdRef !== pageId) return;

    const diff = opts.newAmount - opts.originalAmount;
    const extraCharge = diff > 0 ? diff : 0; // customer pays more
    const refundAdjustment = diff < 0 ? -diff : 0; // customer gets back

    // Check if exchange entry already exists
    const existing = await this.prisma.exchangeEntry.findFirst({
      where: { pageId, orderId },
    });
    if (existing) {
      this.logger.log(
        `[CourierAccounting] ExchangeEntry already exists for order #${orderId}`,
      );
      return;
    }

    this.logger.log(
      `[CourierAccounting] Exchange → order #${orderId} ` +
        `original=${opts.originalAmount} new=${opts.newAmount} ` +
        `extraCharge=${extraCharge} refundAdj=${refundAdjustment}`,
    );

    await this.prisma.exchangeEntry.create({
      data: {
        pageId,
        orderId,
        extraCharge,
        refundAdjustment,
        note: opts.note ?? `Auto-created: exchange for order #${orderId}`,
      },
    });
  }

  /**
   * Update courier shipment status and trigger accounting side-effects.
   * This is the main entry point called from the dashboard.
   */
  async updateShipmentStatus(
    pageId: number,
    orderId: number,
    newStatus: string,
    extra?: {
      exchangeOriginalAmount?: number;
      exchangeNewAmount?: number;
      note?: string;
    },
  ): Promise<void> {
    const shipment = await this.prisma.courierShipment.findUnique({
      where: { orderId },
    });
    if (!shipment || shipment.pageId !== pageId) return;

    // Normalize courier-specific partial statuses → internal 'partial_delivery'
    const partialAliases = [
      'partial_delivered',
      'partial_delivery',
      'partially_delivered',
      'partial',
    ];
    if (partialAliases.includes(newStatus.toLowerCase())) {
      newStatus = 'partial_delivery';
    }

    // Update shipment status
    const statusData: any = { status: newStatus, updatedAt: new Date() };
    if (newStatus === 'delivered') statusData.deliveredAt = new Date();
    if (newStatus === 'returned') statusData.returnedAt = new Date();
    if (newStatus === 'partial_delivery') statusData.deliveredAt = new Date();

    await this.prisma.courierShipment.update({
      where: { orderId },
      data: statusData,
    });

    // Trigger accounting side-effects
    if (newStatus === 'delivered') {
      await this.onDelivered(pageId, orderId);
    } else if (newStatus === 'returned') {
      await this.onReturned(pageId, orderId);
    } else if (newStatus === 'partial_delivery') {
      await this.onPartialDelivery(pageId, orderId);
    } else if (
      newStatus === 'exchanged' &&
      extra?.exchangeOriginalAmount !== undefined &&
      extra?.exchangeNewAmount !== undefined
    ) {
      await this.onExchanged(pageId, orderId, {
        originalAmount: extra.exchangeOriginalAmount,
        newAmount: extra.exchangeNewAmount,
        note: extra.note,
      });
    }
  }

  /**
   * Summary of courier-linked accounting for a page.
   * Shows how much returned/exchanged costs came from courier events.
   */
  async getCourierAccountingSummary(pageId: number) {
    const [returns, exchanges, shipments] = await Promise.all([
      this.prisma.returnEntry.findMany({
        where: { pageId, note: { contains: 'Auto-created: courier' } },
      }),
      this.prisma.exchangeEntry.findMany({
        where: { pageId, note: { contains: 'Auto-created: exchange' } },
      }),
      this.prisma.courierShipment.findMany({
        where: { pageId },
        select: { status: true, courierFee: true, codAmount: true },
      }),
    ]);

    const totalReturned = shipments.filter(
      (s) => s.status === 'returned',
    ).length;
    const totalDelivered = shipments.filter(
      (s) => s.status === 'delivered',
    ).length;
    const totalReturnLoss = returns.reduce(
      (s, r) => s + r.refundAmount + r.returnCost,
      0,
    );
    const totalExchangeAdj = exchanges.reduce(
      (s, e) => s + e.extraCharge - e.refundAdjustment,
      0,
    );
    const totalCourierFees = shipments.reduce(
      (s, sh) => s + (sh.courierFee ?? 0),
      0,
    );

    return {
      totalDelivered,
      totalReturned,
      totalReturnLoss,
      totalExchangeAdj,
      totalCourierFees,
      returnRate:
        shipments.length > 0
          ? Math.round((totalReturned / shipments.length) * 100)
          : 0,
    };
  }
}
