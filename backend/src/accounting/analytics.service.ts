import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BotKnowledgeService } from '../bot-knowledge/bot-knowledge.service';
import { AccountingService } from './accounting.service';
import {
  aggregateMetrics,
  computeProfits,
  isNegotiationAnalyticsEligible,
  hasEnoughData,
  MIN_DATA_POINTS,
} from './profit-engine';

// ── Analytics Types ───────────────────────────────────────────────────────────

export interface ProfitTrendPoint {
  date: string;
  revenue: number;
  expenses: number;
  grossProfit: number;
  netProfit: number;
}

export interface ProductPerformance {
  code: string;
  name: string | null;
  qty: number;
  revenue: number;
  estimatedProfit: number; // revenue - COGS only; expenses not allocated per-product
  hasEnoughData: boolean;
}

export interface CollectionMethodBreakdown {
  method: string;
  amount: number;
  count: number;
}

export interface NegotiationAnalytics {
  eligible: boolean; // false = hide entire section
  reason?: string; // why ineligible (for internal debug, not shown in UI)
  totalAttempts: number;
  successfulOrders: number;
  failedOrders: number;
  successRate: number; // 0–100
  avgOfferedPrice: number | null;
  avgOriginalPrice: number | null;
  avgDiscountPct: number | null;
  hasEnoughData: boolean;
}

export interface AdvancedAnalyticsSummary {
  period: string;
  from: string;
  to: string;
  currency: string;
  // These all come from ProfitEngine via AccountingService — no duplication
  overview: ReturnType<AccountingService['getOverview']> extends Promise<
    infer T
  >
    ? T
    : never;
  profitTrend: ProfitTrendPoint[];
  topProducts: ProductPerformance[];
  expenseBreakdown: { category: string; amount: number }[];
  collectionMethods: CollectionMethodBreakdown[];
  orderStatusDist: { status: string; count: number }[];
  returnTrend: { date: string; count: number; refundAmount: number }[];
  negotiation: NegotiationAnalytics;
  // Data sufficiency flags — UI uses these to show/hide charts
  dataFlags: {
    hasTrend: boolean;
    hasProducts: boolean;
    hasExpenses: boolean;
    hasCollections: boolean;
    hasReturns: boolean;
    hasNegotiationData: boolean;
  };
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly botKnowledge: BotKnowledgeService,
  ) {}

  // ── Main analytics summary ────────────────────────────────────────────────

  async getAdvancedAnalytics(
    pageId: number,
    period: 'daily' | 'weekly' | 'monthly' = 'monthly',
  ): Promise<AdvancedAnalyticsSummary> {
    const { from, to, label } = this.accounting.periodRange(period);
    const page = await this.prisma.page.findUnique({ where: { id: pageId } });

    const [
      overview,
      profitTrend,
      topProds,
      expBreakdown,
      collMethods,
      statusDist,
      returnTrend,
      negotiation,
    ] = await Promise.all([
      // Uses AccountingService.getOverviewForRange — which uses ProfitEngine
      this.accounting.getOverviewForRange(pageId, from, to),
      this.getProfitTrend(pageId, period),
      this.getProductPerformance(pageId, from, to),
      this.accounting.getExpenseBreakdown(pageId),
      this.getCollectionMethodBreakdown(pageId, from, to),
      this.accounting.getOrderStatusDist(pageId),
      this.getReturnTrend(pageId, period),
      this.getNegotiationAnalytics(pageId, from, to),
    ]);

    return {
      period,
      from: from.toISOString(),
      to: to.toISOString(),
      currency: page?.currencySymbol || '৳',
      overview,
      profitTrend,
      topProducts: topProds,
      expenseBreakdown: expBreakdown,
      collectionMethods: collMethods,
      orderStatusDist: statusDist,
      returnTrend,
      negotiation,
      dataFlags: {
        hasTrend: hasEnoughData(
          profitTrend.filter((p) => p.revenue > 0 || p.expenses > 0).length,
        ),
        hasProducts: topProds.length > 0,
        hasExpenses: expBreakdown.length > 0,
        hasCollections: collMethods.length > 0,
        hasReturns: hasEnoughData(
          returnTrend.filter((p) => p.count > 0).length,
        ),
        hasNegotiationData:
          negotiation.eligible && hasEnoughData(negotiation.totalAttempts),
      },
    };
  }

  // ── Profit trend ──────────────────────────────────────────────────────────
  // Uses ProfitEngine via aggregateMetrics + computeProfits — no formula duplication

  async getProfitTrend(
    pageId: number,
    period: 'daily' | 'weekly' | 'monthly',
  ): Promise<ProfitTrendPoint[]> {
    const days = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [orders, expenses, collections, returnEntries, exchangeEntries, deliveredShipments] =
      await Promise.all([
        this.prisma.order.findMany({
          where: {
            pageIdRef: pageId,
            status: 'CONFIRMED',
            confirmedAt: { gte: since },
          },
          include: { items: true },
        }),
        this.prisma.expense.findMany({
          where: { pageId, spentAt: { gte: since } },
        }),
        this.prisma.collection.findMany({
          where: { pageId, collectedAt: { gte: since } },
        }),
        this.prisma.returnEntry.findMany({
          where: { pageId, createdAt: { gte: since } },
        }),
        this.prisma.exchangeEntry.findMany({
          where: { pageId, createdAt: { gte: since } },
        }),
        this.prisma.courierShipment.findMany({
          where: {
            order: { pageIdRef: pageId },
            status: 'delivered',
            deliveredAt: { gte: since },
          },
          select: { courierFee: true, deliveredAt: true },
        }),
      ]);

    const costMap = await this.accounting.buildCostMap(pageId);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const map = new Map<
      string,
      {
        items: (typeof orders)[0]['items'];
        expenses: number;
        collections: number;
        returns: typeof returnEntries;
        exchanges: typeof exchangeEntries;
        courierFees: { courierFee: number | null }[];
      }
    >();

    // Fill day skeleton
    for (let i = 0; i <= days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      map.set(fmt(d), {
        items: [],
        expenses: 0,
        collections: 0,
        returns: [],
        exchanges: [],
        courierFees: [],
      });
    }
    for (const o of orders) {
      const k = fmt(new Date(o.confirmedAt ?? o.createdAt));
      const p = map.get(k);
      if (p) p.items.push(...o.items);
    }
    for (const e of expenses) {
      const p = map.get(fmt(new Date(e.spentAt)));
      if (p) p.expenses += e.amount;
    }
    for (const c of collections) {
      const p = map.get(fmt(new Date(c.collectedAt)));
      if (p) p.collections += c.amount;
    }
    for (const r of returnEntries) {
      const p = map.get(fmt(new Date(r.createdAt)));
      if (p) p.returns.push(r);
    }
    for (const ex of exchangeEntries) {
      const p = map.get(fmt(new Date(ex.createdAt)));
      if (p) p.exchanges.push(ex);
    }
    for (const sh of deliveredShipments) {
      const k = fmt(new Date(sh.deliveredAt ?? since));
      const p = map.get(k);
      if (p) p.courierFees.push({ courierFee: sh.courierFee });
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => {
        // ── Uses ProfitEngine — no duplicate formula ──────────────────────
        const raw = aggregateMetrics({
          confirmedOrderItems: data.items,
          costMap,
          collections: [{ amount: data.collections }],
          expenses: [{ amount: data.expenses }],
          returnEntries: data.returns,
          exchangeEntries: data.exchanges,
          deliveredCourierShipments: data.courierFees,
        });
        const derived = computeProfits(raw);
        return {
          date,
          revenue: raw.estimatedRevenue,
          expenses: raw.totalExpenses,
          grossProfit: derived.estimatedGrossProfit,
          netProfit: derived.estimatedNetProfit,
        };
      });
  }

  // ── Product performance ────────────────────────────────────────────────────

  async getProductPerformance(
    pageId: number,
    from: Date,
    to: Date,
  ): Promise<ProductPerformance[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        pageIdRef: pageId,
        status: 'CONFIRMED',
        confirmedAt: { gte: from, lte: to },
      },
      include: { items: true },
    });
    const costMap = await this.accounting.buildCostMap(pageId);
    const prodInfo = await this.prisma.product.findMany({
      where: { pageId },
      select: { code: true, name: true, costPrice: true },
    });
    const nameMap = new Map(prodInfo.map((p) => [p.code, p.name]));

    const map = new Map<
      string,
      { qty: number; revenue: number; cogs: number }
    >();
    for (const o of orders) {
      for (const i of o.items) {
        const cur = map.get(i.productCode) ?? { qty: 0, revenue: 0, cogs: 0 };
        cur.qty += i.qty;
        cur.revenue += i.unitPrice * i.qty;
        cur.cogs += (costMap.get(i.productCode) ?? 0) * i.qty;
        map.set(i.productCode, cur);
      }
    }

    return Array.from(map.entries())
      .map(([code, d]) => ({
        code,
        name: nameMap.get(code) ?? null,
        qty: d.qty,
        revenue: d.revenue,
        estimatedProfit: d.revenue - d.cogs,
        hasEnoughData: d.qty >= 1,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }

  // ── Collection method breakdown ────────────────────────────────────────────

  async getCollectionMethodBreakdown(
    pageId: number,
    from: Date,
    to: Date,
  ): Promise<CollectionMethodBreakdown[]> {
    const cols = await this.prisma.collection.findMany({
      where: { pageId, collectedAt: { gte: from, lte: to } },
    });
    const map = new Map<string, { amount: number; count: number }>();
    for (const c of cols) {
      const cur = map.get(c.method) ?? { amount: 0, count: 0 };
      cur.amount += c.amount;
      cur.count++;
      map.set(c.method, cur);
    }
    return Array.from(map.entries())
      .map(([method, d]) => ({ method, amount: d.amount, count: d.count }))
      .sort((a, b) => b.amount - a.amount);
  }

  // ── Return trend ──────────────────────────────────────────────────────────

  async getReturnTrend(
    pageId: number,
    period: 'daily' | 'weekly' | 'monthly',
  ): Promise<{ date: string; count: number; refundAmount: number }[]> {
    const days = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const returns = await this.prisma.returnEntry.findMany({
      where: { pageId, createdAt: { gte: since } },
    });
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const map = new Map<string, { count: number; refundAmount: number }>();
    for (let i = 0; i <= days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      map.set(fmt(d), { count: 0, refundAmount: 0 });
    }
    for (const r of returns) {
      const k = fmt(new Date(r.createdAt));
      const p = map.get(k);
      if (p) {
        p.count++;
        p.refundAmount += r.refundAmount;
      }
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, ...d }));
  }

  // ── Negotiation analytics ─────────────────────────────────────────────────
  // RULE: Only shown when pricingPolicy.priceMode === 'NEGOTIABLE' && allowCustomerOffer === true
  // No fake data. If data is real, show it. If not enough, set hasEnoughData = false.

  async getNegotiationAnalytics(
    pageId: number,
    from: Date,
    to: Date,
  ): Promise<NegotiationAnalytics> {
    // Load pricing policy from bot-knowledge config
    const cfg = await this.botKnowledge.getConfig(pageId);
    const pricingPolicy = cfg?.pricingPolicy;

    // ── Eligibility gate (from ProfitEngine) ──────────────────────────────
    if (!isNegotiationAnalyticsEligible(pricingPolicy)) {
      return {
        eligible: false,
        reason: `priceMode=${pricingPolicy?.priceMode ?? 'unknown'} or allowCustomerOffer=false`,
        totalAttempts: 0,
        successfulOrders: 0,
        failedOrders: 0,
        successRate: 0,
        avgOfferedPrice: null,
        avgOriginalPrice: null,
        avgDiscountPct: null,
        hasEnoughData: false,
      };
    }

    // Real data only — from existing Order fields
    const negotiations = await this.prisma.order.findMany({
      where: {
        pageIdRef: pageId,
        negotiationRequested: true,
        createdAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        status: true,
        customerOfferedPrice: true,
        items: { select: { unitPrice: true, qty: true } },
      },
    });

    const totalAttempts = negotiations.length;
    const successfulOrders = negotiations.filter(
      (o) => o.status === 'CONFIRMED',
    ).length;
    const failedOrders = negotiations.filter(
      (o) => o.status === 'CANCELLED',
    ).length;
    const successRate =
      totalAttempts > 0
        ? Math.round((successfulOrders / totalAttempts) * 100)
        : 0;

    // Average offered price — only from orders that actually have it
    const withOffer = negotiations.filter(
      (o) => o.customerOfferedPrice != null && o.customerOfferedPrice > 0,
    );
    const avgOfferedPrice =
      withOffer.length > 0
        ? withOffer.reduce((s, o) => s + o.customerOfferedPrice!, 0) /
          withOffer.length
        : null;

    // Average original price (sum of items / total qty for negotiation orders)
    const withItems = negotiations.filter((o) => o.items.length > 0);
    const avgOriginalPrice =
      withItems.length > 0
        ? withItems.reduce((s, o) => {
            const totalVal = o.items.reduce(
              (ss, i) => ss + i.unitPrice * i.qty,
              0,
            );
            const totalQty = o.items.reduce((ss, i) => ss + i.qty, 0);
            return s + (totalQty > 0 ? totalVal / totalQty : 0);
          }, 0) / withItems.length
        : null;

    const avgDiscountPct =
      avgOriginalPrice && avgOfferedPrice && avgOriginalPrice > 0
        ? Math.round(
            ((avgOriginalPrice - avgOfferedPrice) / avgOriginalPrice) * 100,
          )
        : null;

    return {
      eligible: true,
      totalAttempts,
      successfulOrders,
      failedOrders,
      successRate,
      avgOfferedPrice,
      avgOriginalPrice,
      avgDiscountPct,
      hasEnoughData: hasEnoughData(totalAttempts),
    };
  }
  // ── V11: Motivation Dashboard ─────────────────────────────────────────────
  /**
   * Returns growth comparison, top buyers, best products, and motivational
   * metrics. All page-scoped — multiple pages never mix data.
   */
  async getMotivationDashboard(pageId: number): Promise<MotivationDashboard> {
    const now = new Date();

    // Current week: Mon–Sun
    const startOfThisWeek = new Date(now);
    startOfThisWeek.setDate(
      now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1),
    );
    startOfThisWeek.setHours(0, 0, 0, 0);

    // Last week
    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
    const endOfLastWeek = new Date(startOfThisWeek);
    endOfLastWeek.setMilliseconds(-1);

    // Current month
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Last month
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    );

    const [
      thisWeekData,
      lastWeekData,
      thisMonthData,
      lastMonthData,
      topBuyers,
      bestProducts,
      orderStreak,
      todayCalls,
      automation,
    ] = await Promise.all([
      this.accounting.getOverviewForRange(pageId, startOfThisWeek, now),
      this.accounting.getOverviewForRange(
        pageId,
        startOfLastWeek,
        endOfLastWeek,
      ),
      this.accounting.getOverviewForRange(pageId, startOfThisMonth, now),
      this.accounting.getOverviewForRange(
        pageId,
        startOfLastMonth,
        endOfLastMonth,
      ),
      this.getTopBuyers(pageId),
      this.getProductPerformance(pageId, startOfThisMonth, now),
      this.getOrderStreak(pageId),
      this.getTodayCallStats(pageId, now),
      this.getAutomationSnapshot(pageId),
    ]);

    return {
      week: {
        current: thisWeekData,
        previous: lastWeekData,
        growth: this.calcGrowth(
          thisWeekData.estimatedNetProfit,
          lastWeekData.estimatedNetProfit,
        ),
        revenueGrowth: this.calcGrowth(
          thisWeekData.estimatedRevenue,
          lastWeekData.estimatedRevenue,
        ),
        ordersGrowth: this.calcGrowth(
          thisWeekData.confirmedOrders,
          lastWeekData.confirmedOrders,
        ),
      },
      month: {
        current: thisMonthData,
        previous: lastMonthData,
        growth: this.calcGrowth(
          thisMonthData.estimatedNetProfit,
          lastMonthData.estimatedNetProfit,
        ),
        revenueGrowth: this.calcGrowth(
          thisMonthData.estimatedRevenue,
          lastMonthData.estimatedRevenue,
        ),
        ordersGrowth: this.calcGrowth(
          thisMonthData.confirmedOrders,
          lastMonthData.confirmedOrders,
        ),
      },
      topBuyers,
      bestProducts: bestProducts.slice(0, 5),
      orderStreak,
      todayCalls,
      automation,
      generatedAt: now.toISOString(),
    };
  }

  private calcGrowth(current: number, previous: number): GrowthMetric {
    if (previous === 0 && current === 0)
      return { value: 0, direction: 'flat', pct: 0 };
    if (previous === 0) return { value: current, direction: 'up', pct: 100 };
    const pct = ((current - previous) / Math.abs(previous)) * 100;
    return {
      value: current - previous,
      direction: pct > 2 ? 'up' : pct < -2 ? 'down' : 'flat',
      pct: Math.round(pct * 10) / 10,
    };
  }

  private async getTopBuyers(pageId: number): Promise<TopBuyer[]> {
    // Top 5 customers by orders count this month + all-time spent
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const customers = await this.prisma.customer.findMany({
      where: { pageId, isBlocked: false },
      orderBy: { totalSpent: 'desc' },
      take: 5,
      select: {
        id: true,
        name: true,
        psid: true,
        phone: true,
        totalOrders: true,
        totalSpent: true,
        lastOrderAt: true,
      },
    });

    // Get this-month order count per customer
    const monthOrders = await this.prisma.order.groupBy({
      by: ['customerPsid'],
      where: {
        pageIdRef: pageId,
        status: 'CONFIRMED',
        confirmedAt: { gte: startOfMonth },
      },
      _count: { id: true },
    });
    const monthCountMap = new Map(
      monthOrders.map((o) => [o.customerPsid, o._count.id]),
    );

    return customers.map((c) => ({
      id: c.id,
      name: c.name || 'Unknown',
      phone: c.phone || '',
      totalOrders: c.totalOrders,
      totalSpent: c.totalSpent,
      thisMonthOrders: monthCountMap.get(c.psid) ?? 0,
      lastOrderAt: c.lastOrderAt?.toISOString() ?? null,
    }));
  }

  private async getOrderStreak(pageId: number): Promise<OrderStreak> {
    // Count how many consecutive days had at least one confirmed order (up to today)
    const days: Date[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      days.push(d);
    }

    const orders = await this.prisma.order.findMany({
      where: {
        pageIdRef: pageId,
        status: 'CONFIRMED',
        confirmedAt: { gte: days[days.length - 1] },
      },
      select: { confirmedAt: true },
    });

    const activeDays = new Set(
      orders
        .map((o) => o.confirmedAt?.toISOString().slice(0, 10) ?? '')
        .filter(Boolean),
    );

    let streak = 0;
    for (const d of days) {
      if (activeDays.has(d.toISOString().slice(0, 10))) streak++;
      else break;
    }

    return {
      currentStreak: streak,
      totalActiveDays: activeDays.size,
      message:
        streak >= 7
          ? '🔥 দারুণ! টানা ৭ দিন order!'
          : streak >= 3
            ? '✨ ভালো চলছে!'
            : streak >= 1
              ? '💪 চালিয়ে যান!'
              : '📦 আজকে order আসুক!',
    };
  }

  private async getTodayCallStats(
    pageId: number,
    now: Date,
  ): Promise<TodayCallStats> {
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const attempts = await this.prisma.callAttempt.findMany({
      where: {
        pageId,
        createdAt: { gte: startOfToday, lte: now },
      },
      select: {
        status: true,
        durationSeconds: true,
      },
    });

    const total = attempts.length;
    const answered = attempts.filter((a) => a.status === 'ANSWERED').length;
    const notAnswered = attempts.filter((a) => a.status === 'NOT_ANSWERED').length;
    const failed = attempts.filter((a) => a.status === 'FAILED').length;
    const inProgress = attempts.filter((a) =>
      ['INITIATED', 'PENDING', 'CALLING'].includes(a.status),
    ).length;
    const totalDurationSeconds = attempts.reduce(
      (sum, attempt) => sum + (attempt.durationSeconds || 0),
      0,
    );

    return {
      total,
      answered,
      notAnswered,
      failed,
      inProgress,
      avgDurationSeconds:
        answered > 0 ? Math.round(totalDurationSeconds / answered) : 0,
    };
  }

  private async getAutomationSnapshot(
    pageId: number,
  ): Promise<AutomationSnapshot> {
    const [page, orders, messageHandled, callHandled, courierBooked, followUpPending, memoTemplate, refundPending] =
      await Promise.all([
        this.prisma.page.findUnique({
          where: { id: pageId },
          select: {
            printModeOn: true,
            memoSaveModeOn: true,
            memoTemplateModeOn: true,
          },
        }),
        this.prisma.order.findMany({
          where: { pageIdRef: pageId },
          select: {
            status: true,
            callStatus: true,
            paymentStatus: true,
            courierShipment: { select: { id: true } },
          },
        }),
        this.prisma.conversationSession.count({
          where: { pageIdRef: pageId },
        }),
        this.prisma.callAttempt.count({
          where: { pageId },
        }),
        this.prisma.courierShipment.count({
          where: { pageId },
        }),
        this.prisma.followUp.count({
          where: { pageId, status: 'pending' },
        }),
        this.prisma.memoTemplate.findUnique({
          where: { pageIdRef: pageId },
          select: { status: true },
        }),
        this.prisma.returnEntry.count({
          where: { pageId, refundStatus: 'pending' },
        }),
      ]);
    const printWorkflowEnabled = Boolean(
      page?.printModeOn || page?.memoSaveModeOn || page?.memoTemplateModeOn,
    );
    const printReadyRows = printWorkflowEnabled
      ? await this.prisma.$queryRawUnsafe<{ count: bigint | number }[]>(
          `SELECT COUNT(*) as count FROM "Order" WHERE "pageIdRef" = ? AND status = 'CONFIRMED' AND "printedAt" IS NULL`,
          pageId,
        )
      : [];
    const printReadyCount = printWorkflowEnabled
      ? Number(printReadyRows[0]?.count || 0)
      : 0;

    const taskCounts = {
      notAnswered: 0,
      needsAgent: 0,
      failedCalls: 0,
      paymentApproval: 0,
      pendingProof: 0,
      issueOrders: 0,
      printReady: 0,
      courierBookingPending: 0,
      followUpPending: followUpPending,
      memoTemplateDraft: memoTemplate?.status === 'draft' ? 1 : 0,
      refundPending: refundPending,
    };

    const needsAgentSet = new Set<number>();

    orders.forEach((order, index) => {
      let blocked = false;
      if (order.callStatus === 'NOT_ANSWERED') {
        taskCounts.notAnswered++;
        blocked = true;
      }
      if (order.callStatus === 'NEEDS_AGENT') {
        taskCounts.needsAgent++;
        blocked = true;
      }
      if (order.callStatus === 'CALL_FAILED') {
        taskCounts.failedCalls++;
        blocked = true;
      }
      if (order.paymentStatus === 'agent_required') {
        taskCounts.paymentApproval++;
        blocked = true;
      }
      if (order.paymentStatus === 'pending_proof') {
        taskCounts.pendingProof++;
        blocked = true;
      }
      if (order.status === 'ISSUE') {
        taskCounts.issueOrders++;
        blocked = true;
      }
      if (order.status === 'CONFIRMED' && !order.courierShipment) {
        taskCounts.courierBookingPending++;
        blocked = true;
      }
      if (blocked) needsAgentSet.add(index);
    });

    const totalTracked = orders.length;
    const needsAgent = needsAgentSet.size;
    const botHandled = Math.max(totalTracked - needsAgent, 0);
    const botHandledPct = totalTracked
      ? Math.round((botHandled / totalTracked) * 100)
      : 100;
    const needsAgentPct = totalTracked ? 100 - botHandledPct : 0;

    return {
      totalTracked,
      botHandled,
      needsAgent,
      botHandledPct,
      needsAgentPct,
      workCounts: {
        messagesHandled: messageHandled,
        ordersHandled: orders.length,
        callsHandled: callHandled,
        memoReady: printReadyCount,
        courierBooked,
        followUpsScheduled: followUpPending,
      },
      taskCounts: {
        ...taskCounts,
        printReady: printReadyCount,
      },
    };
  }
}

// ── V11 types ─────────────────────────────────────────────────────────────────

export interface GrowthMetric {
  value: number;
  direction: 'up' | 'down' | 'flat';
  pct: number;
}

export interface TopBuyer {
  id: number;
  name: string;
  phone: string;
  totalOrders: number;
  totalSpent: number;
  thisMonthOrders: number;
  lastOrderAt: string | null;
}

export interface OrderStreak {
  currentStreak: number;
  totalActiveDays: number;
  message: string;
}

export interface MotivationDashboard {
  week: {
    current: any;
    previous: any;
    growth: GrowthMetric;
    revenueGrowth: GrowthMetric;
    ordersGrowth: GrowthMetric;
  };
  month: {
    current: any;
    previous: any;
    growth: GrowthMetric;
    revenueGrowth: GrowthMetric;
    ordersGrowth: GrowthMetric;
  };
  topBuyers: TopBuyer[];
  bestProducts: any[];
  orderStreak: OrderStreak;
  todayCalls: TodayCallStats;
  automation: AutomationSnapshot;
  generatedAt: string;
}

export interface TodayCallStats {
  total: number;
  answered: number;
  notAnswered: number;
  failed: number;
  inProgress: number;
  avgDurationSeconds: number;
}

export interface AutomationSnapshot {
  totalTracked: number;
  botHandled: number;
  needsAgent: number;
  botHandledPct: number;
  needsAgentPct: number;
  workCounts: {
    messagesHandled: number;
    ordersHandled: number;
    callsHandled: number;
    memoReady: number;
    courierBooked: number;
    followUpsScheduled: number;
  };
  taskCounts: {
    notAnswered: number;
    needsAgent: number;
    failedCalls: number;
    paymentApproval: number;
    pendingProof: number;
    issueOrders: number;
    printReady: number;
    courierBookingPending: number;
    followUpPending: number;
    memoTemplateDraft: number;
    refundPending: number;
  };
}
