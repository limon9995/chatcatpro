/**
 * ProfitEngine — Single source of truth for all profit/loss calculations.
 *
 * RULE: This is the ONLY place these formulas are written.
 * AccountingService and AnalyticsService BOTH call these helpers.
 * Never duplicate these formulas elsewhere.
 *
 * Verified formula (V5 BUG-3 fix, kept here permanently):
 *   grossProfit = revenue − COGS − refunds − returnCost − deliveredCourierFees + exchangeAdj
 *   netProfit   = grossProfit − expenses
 *   due         = max(0, revenue − collected)
 *
 * NOTE on courier fees:
 *   - Returned orders: courierFee is already captured inside ReturnEntry.returnCost → counted in totalReturnCost
 *   - Delivered orders: courierFee must be deducted separately → totalDeliveredCourierFees
 */

export interface RawMetrics {
  estimatedRevenue: number;
  estimatedCOGS: number;
  totalCollection: number;
  totalExpenses: number;
  totalRefunds: number;
  totalReturnCost: number;
  totalDeliveredCourierFees: number; // courier fees for delivered shipments only
  netExchangeImpact: number; // extraCharge − refundAdjustment
}

export interface ComputedProfits {
  totalDue: number;
  estimatedGrossProfit: number;
  estimatedNetProfit: number;
}

/** Compute derived fields from raw aggregated metrics. */
export function computeProfits(m: RawMetrics): ComputedProfits {
  const estimatedGrossProfit =
    m.estimatedRevenue -
    m.estimatedCOGS -
    m.totalRefunds -
    m.totalReturnCost -
    m.totalDeliveredCourierFees +
    m.netExchangeImpact;

  return {
    totalDue: Math.max(0, m.estimatedRevenue - m.totalCollection),
    estimatedGrossProfit,
    estimatedNetProfit: estimatedGrossProfit - m.totalExpenses,
  };
}

/** Aggregate raw metrics from Prisma query results.
 *  Pass in the raw arrays; this function sums them. */
export function aggregateMetrics(opts: {
  confirmedOrderItems: {
    unitPrice: number;
    qty: number;
    productCode: string;
  }[];
  costMap: Map<string, number>;
  collections: { amount: number }[];
  expenses: { amount: number }[];
  returnEntries: { refundAmount: number; returnCost: number }[];
  exchangeEntries: { extraCharge: number; refundAdjustment: number }[];
  /** Courier shipments with status='delivered'. Fees for returns are already
   *  captured inside ReturnEntry.returnCost, so pass ONLY delivered ones. */
  deliveredCourierShipments?: { courierFee: number | null }[];
}): RawMetrics {
  let estimatedRevenue = 0;
  let estimatedCOGS = 0;
  for (const item of opts.confirmedOrderItems) {
    estimatedRevenue += item.unitPrice * item.qty;
    estimatedCOGS += (opts.costMap.get(item.productCode) ?? 0) * item.qty;
  }

  return {
    estimatedRevenue,
    estimatedCOGS,
    totalCollection: opts.collections.reduce((s, c) => s + c.amount, 0),
    totalExpenses: opts.expenses.reduce((s, e) => s + e.amount, 0),
    totalRefunds: opts.returnEntries.reduce((s, r) => s + r.refundAmount, 0),
    totalReturnCost: opts.returnEntries.reduce((s, r) => s + r.returnCost, 0),
    totalDeliveredCourierFees: (opts.deliveredCourierShipments ?? []).reduce(
      (s, sh) => s + (sh.courierFee ?? 0),
      0,
    ),
    netExchangeImpact: opts.exchangeEntries.reduce(
      (s, e) => s + e.extraCharge - e.refundAdjustment,
      0,
    ),
  };
}

/** Check whether a page has negotiation analytics enabled.
 *  Returns true ONLY when priceMode is NEGOTIABLE and allowCustomerOffer is on.
 *  Never fakes data — if config missing, returns false. */
export function isNegotiationAnalyticsEligible(pricingPolicy: any): boolean {
  if (!pricingPolicy) return false;
  const mode = String(pricingPolicy.priceMode || 'FIXED').toUpperCase();
  if (mode === 'FIXED') return false;
  // Must be NEGOTIABLE and customer offers must be permitted
  return mode === 'NEGOTIABLE' && Boolean(pricingPolicy.allowCustomerOffer);
}

/** Minimum data threshold to show a chart. */
export const MIN_DATA_POINTS = 3;

/** Returns true if there is enough data to meaningfully display a chart. */
export function hasEnoughData(points: number): boolean {
  return points >= MIN_DATA_POINTS;
}
