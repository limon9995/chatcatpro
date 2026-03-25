import { useCallback, useEffect, useState } from 'react';
import { CardHeader, EmptyState, Spinner } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProfitTrend  { date: string; revenue: number; expenses: number; grossProfit: number; netProfit: number; }
interface ProductPerf  { code: string; name: string | null; qty: number; revenue: number; estimatedProfit: number; }
interface ColMethod    { method: string; amount: number; count: number; }
interface ReturnPoint  { date: string; count: number; refundAmount: number; }
interface NegotiationA {
  eligible: boolean; hasEnoughData: boolean;
  totalAttempts: number; successfulOrders: number; failedOrders: number;
  successRate: number; avgOfferedPrice: number | null;
  avgOriginalPrice: number | null; avgDiscountPct: number | null;
}
interface DataFlags {
  hasTrend: boolean; hasProducts: boolean; hasExpenses: boolean;
  hasCollections: boolean; hasReturns: boolean; hasNegotiationData: boolean;
}
interface AnalyticsSummary {
  period: string; from: string; to: string; currency: string;
  overview: any; profitTrend: ProfitTrend[]; topProducts: ProductPerf[];
  expenseBreakdown: { category: string; amount: number }[];
  collectionMethods: ColMethod[]; orderStatusDist: { status: string; count: number }[];
  returnTrend: ReturnPoint[]; negotiation: NegotiationA; dataFlags: DataFlags;
}

type Period = 'daily' | 'weekly' | 'monthly';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'daily', label: 'Today' }, { key: 'weekly', label: '7 Days' }, { key: 'monthly', label: '30 Days' },
];
const CHART_COLORS = ['#5b63f5','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16'];

// ── SVG Charts ────────────────────────────────────────────────────────────────

function LineChart({ data, keys, colors, height = 130 }: {
  data: Record<string, any>[]; keys: string[]; colors: string[]; height?: number;
}) {
  if (!data.length) return null;
  const W = 540; const maxVal = Math.max(1, ...data.flatMap(d => keys.map(k => Math.abs(Number(d[k]) || 0))));
  const pts = (key: string) => data.map((d, i) => {
    const x = (i / Math.max(1, data.length - 1)) * W;
    const y = height - 20 - (Math.max(0, Number(d[key]) || 0) / maxVal) * (height - 28);
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height, overflow: 'visible' }}>
      {/* Zero line */}
      <line x1={0} y1={height - 20} x2={W} y2={height - 20} stroke="currentColor" strokeOpacity={0.1} />
      {keys.map((k, ki) => (
        <polyline key={k} fill="none" stroke={colors[ki]} strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" points={pts(k)} />
      ))}
      {/* X labels every N */}
      {data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 5)) === 0).map((d, i) => {
        const origI = data.indexOf(d);
        return <text key={i} x={(origI / Math.max(1, data.length - 1)) * W} y={height - 2} fontSize={8} fill="#94a3b8" textAnchor="middle">{String(d['date'] || '').slice(5)}</text>;
      })}
    </svg>
  );
}

function BarChart({ data, valueKey, labelKey, colors, height = 120 }: {
  data: Record<string, any>[]; valueKey: string; labelKey: string; colors: string[]; height?: number;
}) {
  if (!data.length) return null;
  const W = 540; const barW = Math.max(6, (W / data.length) - 4);
  const maxVal = Math.max(1, ...data.map(d => Number(d[valueKey]) || 0));
  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height, overflow: 'visible' }}>
      {data.map((d, i) => {
        const h = ((Number(d[valueKey]) || 0) / maxVal) * (height - 22);
        const x = i * (W / data.length) + 2;
        return (
          <g key={i}>
            <rect x={x} y={height - 22 - h} width={barW} height={h} fill={colors[i % colors.length]} rx={3} opacity={0.85}>
              <title>{`${d[labelKey]}: ${Number(d[valueKey]).toFixed(0)}`}</title>
            </rect>
            <text x={x + barW / 2} y={height - 4} fontSize={8} fill="#94a3b8" textAnchor="middle">
              {String(d[labelKey] || '').slice(0, 8)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function DonutChart({ data, colors, size = 120 }: { data: { label: string; value: number }[]; colors: string[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return null;
  const R = size * 0.38; const CX = size / 2; const CY = size / 2;
  let cumAngle = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const angle = (d.value / total) * 2 * Math.PI;
    const x1 = CX + R * Math.cos(cumAngle); const y1 = CY + R * Math.sin(cumAngle);
    cumAngle += angle;
    const x2 = CX + R * Math.cos(cumAngle); const y2 = CY + R * Math.sin(cumAngle);
    return { path: `M${CX},${CY} L${x1},${y1} A${R},${R} 0 ${angle > Math.PI ? 1 : 0},1 ${x2},${y2} Z`, color: colors[i % colors.length], label: d.label, value: d.value };
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, flexShrink: 0 }}>
        {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} opacity={0.88}><title>{`${s.label}: ${s.value.toFixed(0)}`}</title></path>)}
        <circle cx={CX} cy={CY} r={R * 0.55} fill="white" fillOpacity={0.9} />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
            <div style={{ width: 9, height: 9, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>{s.label}</span>
            <span style={{ fontWeight: 700, marginLeft: 'auto', paddingLeft: 4 }}>{s.value.toFixed(0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── "Not enough data" wrapper ──────────────────────────────────────────────────
function ChartSection({ title, sub, show, children, th }: {
  title: string; sub?: string; show: boolean; children: React.ReactNode; th: Theme;
}) {
  return (
    <div style={th.card}>
      <CardHeader th={th} title={title} sub={sub} />
      {show
        ? children
        : <EmptyState icon="📊" title="Not enough data yet" sub="More activity needed to show this chart" />
      }
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function AnalyticsPage({ th, pageId, onToast }: {
  th: Theme; pageId: number; onToast: (m: string, t?: any) => void;
}) {
  const { request }   = useApi();
  const [period, setPeriod] = useState<Period>('monthly');
  const [data, setData]     = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const BASE = `${API_BASE}/client-dashboard/${pageId}`;
  const cur  = data?.currency || '৳';
  const fmt  = (n: number) => `${cur}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await request<AnalyticsSummary>(`${BASE}/analytics/summary?period=${period}`));
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [pageId, period]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) return (
    <div style={{ ...th.card, display: 'flex', alignItems: 'center', gap: 12, color: th.muted }}>
      <Spinner size={20} /> Loading analytics…
    </div>
  );

  const { overview: ov, dataFlags: flags, negotiation: neg } = data;
  const isProfit = ov.estimatedNetProfit >= 0;

  // Period filter bar
  const PeriodBar = () => (
    <div style={{ display: 'flex', gap: 4, background: th.surface, borderRadius: 12, padding: 3, border: `1px solid ${th.border}`, alignSelf: 'flex-start' }}>
      {PERIODS.map(p => (
        <button key={p.key} onClick={() => setPeriod(p.key)} style={{
          padding: '7px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
          background: period === p.key ? th.accent : 'transparent',
          color: period === p.key ? '#fff' : th.muted, transition: 'all .15s',
        }}>{p.label}</button>
      ))}
      <button onClick={load} style={{ ...th.btnGhost, padding: '7px 10px', fontSize: 14 }} title="Refresh">
        {loading ? <Spinner size={12} /> : '🔄'}
      </button>
    </div>
  );

  // KPI summary row
  const KPIRow = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
      {[
        { icon: '📈', label: 'Revenue',   val: fmt(ov.estimatedRevenue), color: th.accent },
        { icon: '💰', label: 'Collected', val: fmt(ov.totalCollection),  color: '#10b981' },
        { icon: '⏳', label: 'Due',        val: fmt(ov.totalDue),         color: ov.totalDue > 0 ? '#f59e0b' : '#10b981' },
        { icon: '🧾', label: 'Expenses',  val: fmt(ov.totalExpenses),    color: '#f97316' },
        { icon: isProfit ? '🟢' : '🔴', label: isProfit ? 'Net Profit' : 'Net Loss',
          val: fmt(ov.estimatedNetProfit), color: isProfit ? '#16a34a' : '#dc2626' },
      ].map((k, i) => (
        <div key={i} style={{ ...th.card, padding: '14px 16px' }}>
          <div style={{ fontSize: 20, marginBottom: 4 }}>{k.icon}</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: k.color, letterSpacing: '-0.5px' }}>{k.val}</div>
          <div style={{ fontSize: 11, color: th.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{k.label}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', margin: 0 }}>Analytics</h1>
          <div style={{ fontSize: 12.5, color: th.muted, marginTop: 3 }}>{data.from.slice(0,10)} → {data.to.slice(0,10)}</div>
        </div>
        <PeriodBar />
      </div>

      <KPIRow />

      {/* Profit Trend */}
      <ChartSection th={th} title="📈 Profit Trend" sub="Revenue · Expenses · Gross & Net Profit" show={flags.hasTrend}>
        <LineChart data={data.profitTrend as any} keys={['revenue','expenses','grossProfit','netProfit']} colors={[th.accent,'#f97316','#10b981',isProfit ? '#16a34a' : '#dc2626']} />
        <div style={{ display: 'flex', gap: 16, marginTop: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[['Revenue',th.accent],['Expenses','#f97316'],['Gross Profit','#10b981'],['Net Profit',isProfit ? '#16a34a' : '#dc2626']].map(([l,c]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <div style={{ width: 10, height: 3, borderRadius: 2, background: c as string }} />{l}
            </div>
          ))}
        </div>
      </ChartSection>

      {/* 2-column charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Top Products */}
        <ChartSection th={th} title="🏆 Top Products" sub="By revenue" show={flags.hasProducts}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {data.topProducts.slice(0, 6).map((p) => {
              const maxRev = data.topProducts[0]?.revenue || 1;
              const pct2   = (p.revenue / maxRev) * 100;
              const profCol = p.estimatedProfit >= 0 ? '#10b981' : '#ef4444';
              return (
                <div key={p.code} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: th.accent }}>{p.code}</span>
                    <span style={{ color: th.muted }}>×{p.qty} | {fmt(p.revenue)}</span>
                    <span style={{ color: profCol, fontWeight: 700 }}>{p.estimatedProfit >= 0 ? '+' : ''}{fmt(p.estimatedProfit)}</span>
                  </div>
                  <div style={{ height: 6, background: th.border, borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct2}%`, background: th.accent, borderRadius: 999, opacity: 0.7 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </ChartSection>

        {/* Expense Breakdown */}
        <ChartSection th={th} title="🧾 Expense Breakdown" sub="By category" show={flags.hasExpenses}>
          <DonutChart data={data.expenseBreakdown.map(e => ({ label: e.category, value: e.amount }))} colors={CHART_COLORS} />
        </ChartSection>

        {/* Order Status */}
        <ChartSection th={th} title="📦 Order Status" sub="Distribution" show={data.orderStatusDist.length > 0}>
          <DonutChart data={data.orderStatusDist.map(s => ({ label: s.status, value: s.count }))} colors={['#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']} />
        </ChartSection>

        {/* Collection Methods */}
        <ChartSection th={th} title="💳 Collection Methods" sub="By amount" show={flags.hasCollections}>
          <BarChart data={data.collectionMethods as any} valueKey="amount" labelKey="method" colors={CHART_COLORS} height={110} />
        </ChartSection>

        {/* Return Trend */}
        <ChartSection th={th} title="↩️ Return Trend" sub="Returns over time" show={flags.hasReturns}>
          <LineChart data={data.returnTrend as any} keys={['refundAmount']} colors={['#ef4444']} height={100} />
        </ChartSection>

        {/* Collection vs Due */}
        <div style={th.card}>
          <CardHeader th={th} title="💰 Collection vs Due" sub="" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
            {[
              { label: 'Collected', val: ov.totalCollection, color: '#10b981' },
              { label: 'Due',       val: ov.totalDue,        color: '#f59e0b' },
            ].map(row => {
              const base = Math.max(1, ov.estimatedRevenue);
              const p2   = Math.min(100, (row.val / base) * 100);
              return (
                <div key={row.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}>
                    <span style={{ fontWeight: 600 }}>{row.label}</span>
                    <span style={{ color: row.color, fontWeight: 700 }}>{fmt(row.val)} ({p2.toFixed(0)}%)</span>
                  </div>
                  <div style={{ height: 10, background: th.border, borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${p2}%`, background: row.color, borderRadius: 999, transition: 'width .5s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Negotiation Analytics (CONDITIONAL) ──────────────────────────── */}
      {/* Rule: only render if eligible === true (priceMode=NEGOTIABLE && allowCustomerOffer=true) */}
      {neg.eligible && (
        <div style={th.card}>
          <CardHeader th={th} title="🤝 Negotiation Analytics" sub="Only visible because negotiation mode is active for this page" />
          {!neg.hasEnoughData ? (
            <EmptyState icon="🤝" title="Not enough data yet" sub={`Need at least 3 negotiation attempts. Currently: ${neg.totalAttempts}`} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* KPI cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
                {[
                  { label: 'Attempts',  val: String(neg.totalAttempts),        color: th.accent },
                  { label: 'Success',   val: String(neg.successfulOrders),     color: '#10b981' },
                  { label: 'Failed',    val: String(neg.failedOrders),          color: '#ef4444' },
                  { label: 'Rate',      val: `${neg.successRate}%`,             color: neg.successRate >= 50 ? '#16a34a' : '#f59e0b' },
                ].map((k, i) => (
                  <div key={i} style={{ ...th.card2, padding: '12px 14px' }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: k.color }}>{k.val}</div>
                    <div style={{ fontSize: 11, color: th.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* Price details — only if real data exists */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Avg. Offered Price',   val: neg.avgOfferedPrice   != null ? fmt(neg.avgOfferedPrice)   : null },
                  { label: 'Avg. Original Price',  val: neg.avgOriginalPrice  != null ? fmt(neg.avgOriginalPrice)  : null },
                  { label: 'Avg. Discount',         val: neg.avgDiscountPct   != null ? `${neg.avgDiscountPct}%`   : null },
                ].map((k, i) => (
                  <div key={i} style={{ ...th.card2, padding: '12px 14px' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: th.text }}>
                      {k.val ?? <span style={{ color: th.muted, fontSize: 13 }}>No data</span>}
                    </div>
                    <div style={{ fontSize: 11, color: th.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 3 }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* Success rate bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, fontWeight: 600 }}>
                  <span>Negotiation Success Rate</span>
                  <span style={{ color: neg.successRate >= 50 ? '#16a34a' : '#f59e0b' }}>{neg.successRate}%</span>
                </div>
                <div style={{ height: 12, background: th.border, borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${neg.successRate}%`, background: neg.successRate >= 50 ? '#16a34a' : '#f59e0b', borderRadius: 999, transition: 'width .6s' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
