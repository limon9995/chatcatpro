import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderNotificationService } from './order-notification.service';
import { ConversationContextService } from '../conversation-context/conversation-context.service';

export type OrderStatus =
  | 'RECEIVED'
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'ISSUE';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: OrderNotificationService,
    private readonly ctx: ConversationContextService,
  ) {}

  // ── List / Summary ─────────────────────────────────────────────────────────
  async listOrders(pageId?: number, status?: string) {
    const where: any = {};
    if (pageId) where.pageIdRef = pageId;
    if (status && status !== 'ALL') where.status = status.toUpperCase();
    return this.prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: { id: 'desc' },
      take: 500,
    });
  }

  async getSummary(pageId?: number) {
    const where: any = pageId ? { pageIdRef: pageId } : {};
    const orders = await this.prisma.order.findMany({
      where,
      select: { status: true, callStatus: true, negotiationRequested: true },
    });
    return {
      total: orders.length,
      received: orders.filter((o) => ['RECEIVED', 'PENDING'].includes(o.status))
        .length,
      confirmed: orders.filter((o) => o.status === 'CONFIRMED').length,
      cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
      issue: orders.filter((o) => o.status === 'ISSUE').length,
      pendingCalls: orders.filter((o) => o.callStatus === 'PENDING_CALL')
        .length,
      confirmedByCalls: orders.filter(
        (o) => o.callStatus === 'CONFIRMED_BY_CALL',
      ).length,
      negotiated: orders.filter((o) => o.negotiationRequested).length,
    };
  }

  // ── Create ─────────────────────────────────────────────────────────────────
  async createReceivedOrder(data: {
    pageIdRef: number;
    customerPsid: string;
    customerName?: string;
    phone?: string;
    address?: string;
    negotiationRequested?: boolean;
    customerOfferedPrice?: number | null;
    orderNote?: string | null;
    items?: {
      productCode: string;
      qty: number;
      unitPrice: number;
      productName?: string;
    }[];
  }) {
    return this.prisma.order.create({
      data: {
        pageIdRef: data.pageIdRef,
        customerPsid: data.customerPsid,
        customerName: data.customerName || null,
        phone: data.phone || null,
        address: data.address || null,
        status: 'RECEIVED',
        negotiationRequested: data.negotiationRequested || false,
        customerOfferedPrice: data.customerOfferedPrice ?? null,
        orderNote: data.orderNote ?? null,
        items: {
          create: (data.items || []).map((it) => ({
            productCode: it.productCode,
            qty: it.qty,
            unitPrice: it.unitPrice,
            productName: it.productName,
          })),
        },
      },
      include: { items: true },
    });
  }

  // ── Update info ────────────────────────────────────────────────────────────
  async updateOrderInfo(
    id: number,
    body: {
      customerName?: string;
      phone?: string;
      address?: string;
      orderNote?: string;
      status?: string;
    },
  ) {
    const order = await this.findOrFail(id);
    const patch: any = {};
    if (body.customerName !== undefined) patch.customerName = body.customerName;
    if (body.phone !== undefined) patch.phone = body.phone;
    if (body.address !== undefined) patch.address = body.address;
    if (body.orderNote !== undefined) patch.orderNote = body.orderNote;
    if (Object.keys(patch).length === 0) return order;
    return this.prisma.order.update({
      where: { id },
      data: patch,
      include: { items: true },
    });
  }

  // ── Confirm (page-scoped, with stock deduction) ────────────────────────────
  async confirmByAgent(id: number, pageId?: number) {
    const order = await this.findOrFail(id, pageId);
    if (order.status === 'CANCELLED')
      throw new BadRequestException('Cancelled order cannot be confirmed');
    if (order.status === 'CONFIRMED')
      return this.prisma.order.findUnique({
        where: { id },
        include: { items: true },
      });

    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items || []) {
        // Page-scoped product lookup
        const product = await tx.product.findFirst({
          where: { pageId: order.pageIdRef, code: item.productCode },
        });
        if (!product)
          throw new BadRequestException(
            `Product not found: ${item.productCode}`,
          );
        if (product.stockQty < item.qty) {
          throw new BadRequestException(
            `Not enough stock for ${item.productCode}. Available: ${product.stockQty}`,
          );
        }
        await tx.product.update({
          where: { id: product.id },
          data: { stockQty: { decrement: item.qty } },
        });
      }
      await tx.order.update({
        where: { id },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });
    });

    // Fire-and-forget: notify customer via Messenger
    void this.notification.notifyConfirmed(order.pageIdRef, id);

    return this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
  }

  async cancelOrder(id: number, pageId?: number) {
    await this.findOrFail(id, pageId);
    return this.prisma.order.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async markIssue(id: number, pageId?: number) {
    await this.findOrFail(id, pageId);
    return this.prisma.order.update({
      where: { id },
      data: { status: 'ISSUE' },
    });
  }

  // ── Agent Issues ───────────────────────────────────────────────────────────

  async getAgentIssues(pageId?: number) {
    // Type 1: Payment-issue orders (agent_required)
    const orderWhere: any = { paymentStatus: 'agent_required' };
    if (pageId) orderWhere.pageIdRef = pageId;
    const orders = await this.prisma.order.findMany({
      where: orderWhere,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const orderIssues = await Promise.all(
      orders.map(async (o) => {
        const botMuted = o.customerPsid
          ? await this.ctx.isAgentHandling(o.pageIdRef, o.customerPsid)
          : false;
        return { ...o, botMuted, issueType: 'payment' as const };
      }),
    );

    // Type 2: Unmatched-message customers (agentHandling=true, no payment-issue order)
    const sessionWhere: any = { agentHandling: true };
    if (pageId) sessionWhere.pageIdRef = pageId;
    const flaggedSessions = await this.prisma.conversationSession.findMany({
      where: sessionWhere,
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    // Filter out PSIDs already covered by payment-issue orders
    const paymentPsids = new Set(orders.map((o) => o.customerPsid));
    const unmatchedSessions = flaggedSessions.filter(
      (s) => !paymentPsids.has(s.customerPsid),
    );

    // Enrich with CRM data
    const unmatchedIssues = await Promise.all(
      unmatchedSessions.map(async (s) => {
        const crm = pageId
          ? await this.prisma.customer.findUnique({
              where: { pageId_psid: { pageId, psid: s.customerPsid } },
              select: { name: true, phone: true },
            })
          : null;
        return {
          id: null as number | null,
          pageIdRef: s.pageIdRef,
          customerPsid: s.customerPsid,
          customerName: crm?.name ?? null,
          phone: crm?.phone ?? null,
          address: null,
          status: 'RECEIVED',
          orderNote: '🤖 Bot বুঝতে পারেনি — agent review দরকার',
          paymentStatus: 'unmatched',
          createdAt: s.updatedAt.toISOString(),
          items: [],
          botMuted: true,
          issueType: 'unmatched' as const,
        };
      }),
    );

    return [...orderIssues, ...unmatchedIssues];
  }

  async toggleBotForCustomer(orderId: number, pageId?: number) {
    const order = await this.findOrFail(orderId, pageId);
    if (!order.customerPsid) return { botMuted: false };
    const current = await this.ctx.isAgentHandling(
      order.pageIdRef,
      order.customerPsid,
    );
    await this.ctx.setAgentHandling(order.pageIdRef, order.customerPsid, !current);
    return { botMuted: !current };
  }

  async toggleBotByPsid(pageId: number, psid: string, mute: boolean) {
    await this.ctx.setAgentHandling(pageId, psid, mute);
    return { botMuted: mute };
  }

  /**
   * Dismiss an agent issue — removes it from the issues list.
   * payment type: resets paymentStatus to 'not_required' (agent handled manually)
   * unmatched type: clears agentHandling=false so bot can resume
   */
  async dismissAgentIssue(
    pageId: number,
    body: { issueType: 'payment' | 'unmatched'; orderId?: number; psid?: string },
  ) {
    if (body.issueType === 'payment' && body.orderId) {
      const order = await this.findOrFail(body.orderId, pageId);
      await this.prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'not_required' },
      });
      // Also clear agentHandling if set
      if (order.customerPsid) {
        await this.ctx.setAgentHandling(pageId, order.customerPsid, false);
      }
      return { dismissed: true };
    }

    if (body.issueType === 'unmatched' && body.psid) {
      await this.ctx.setAgentHandling(pageId, body.psid, false);
      return { dismissed: true };
    }

    return { dismissed: false };
  }

  // ── Payment Proof Review ────────────────────────────────────────────────────

  async getPaymentProofs(pageId?: number) {
    const where: any = {
      paymentStatus: 'advance_paid',
    };
    if (pageId) where.pageIdRef = pageId;
    return this.prisma.order.findMany({
      where,
      select: {
        id: true,
        pageIdRef: true,
        customerName: true,
        phone: true,
        address: true,
        paymentStatus: true,
        paymentVerifyStatus: true,
        transactionId: true,
        paymentScreenshotUrl: true,
        orderNote: true,
        createdAt: true,
        items: { select: { productCode: true, qty: true, unitPrice: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async verifyPayment(
    id: number,
    status: 'verified' | 'verify_failed',
    pageId?: number,
  ) {
    const order = await this.findOrFail(id, pageId);
    if (order.paymentStatus !== 'advance_paid') {
      throw new BadRequestException('Order has no advance payment proof');
    }
    return this.prisma.order.update({
      where: { id },
      data: { paymentVerifyStatus: status },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  async findOrFail(id: number, pageId?: number) {
    const order: any = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (pageId && order.pageIdRef !== pageId)
      throw new NotFoundException('Order not found');
    return order;
  }
}
