import { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { CardHeader, EmptyState, Field, Spinner } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Overview {
  currency: string;
  estimatedRevenue: number; totalCollection: number; totalDue: number;
  estimatedCOGS: number; totalExpenses: number;
  totalRefunds: number; totalReturnCost: number; netExchangeImpact: number;
  estimatedGrossProfit: number; estimatedNetProfit: number;
  confirmedOrders: number; returnCount: number; exchangeCount: number;
}
interface DayPoint   { date: string; revenue: number; collection: number; expense: number; }
interface CatPoint   { category: string; amount: number; }
interface StatusPoint{ status: string; count: number; }
interface Collection { id: number; orderId: number|null; type: string; method: string; amount: number; note: string|null; collectedAt: string; order?: {customerName: string|null}; }
interface Expense    { id: number; orderId: number|null; category: string; amount: number; note: string|null; spentAt: string; order?: {customerName: string|null}; }
interface OrderItem  { id: number; productCode: string; qty: number; unitPrice: number; }
interface ReturnE    { id: number; orderId: number; returnType: string; refundAmount: number; returnCost: number; refundStatus: string; note: string|null; createdAt: string; order?: { customerName: string|null; items?: OrderItem[]; courierShipment?: { status: string; courierName: string } | null }; }
interface ExchangeE  { id: number; orderId: number; extraCharge: number; refundAdjustment: number; note: string|null; createdAt: string; order?: {customerName: string|null}; }

type AccTab = 'overview' | 'collections' | 'expenses' | 'returns' | 'exchanges' | 'reports' | 'refund_queue';
export interface AccountingPagePreset { tab?: AccTab; label?: string; }

const ACC_TABS: { key: AccTab; label: string; icon: string }[] = [
  { key: 'overview',     label: 'Overview',        icon: '📊' },
  { key: 'collections',  label: 'Collections',     icon: '💰' },
  { key: 'expenses',     label: 'Expenses',        icon: '🧾' },
  { key: 'returns',      label: 'Returns',         icon: '↩️' },
  { key: 'exchanges',    label: 'Exchanges',       icon: '🔄' },
  { key: 'refund_queue', label: 'Advance Refund',  icon: '💸' },
  { key: 'reports',      label: 'Reports',         icon: '📋' },
];

const EXPENSE_CATS = ['courier','packaging','ads','resize','labour','sourcing','misc','other'];
const COLLECTION_TYPES = ['advance','full_payment','partial','cod','other_income'];
const COLLECTION_METHODS = ['cash','bkash','nagad','bank','cod','other'];

// ── Tiny chart helpers ─────────────────────────────────────────────────────────

/** SVG sparkline bar chart */
function BarChart({ data, keys, colors, height = 140 }: {
  data: Record<string, number>[]; keys: string[]; colors: string[]; height?: number;
}) {
  if (!data.length) return <EmptyState icon="📊" title="No data yet" />;
  const W = 560; const barW = Math.max(4, (W / data.length) - 3);
  const maxVal = Math.max(1, ...data.flatMap(d => keys.map(k => d[k] as number)));
  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height, overflow: 'visible' }}>
      {data.map((d, i) => {
        const x0 = i * (W / data.length);
        return keys.map((k, ki) => {
          const val = (d[k] as number) || 0;
          const h   = (val / maxVal) * (height - 20);
          return (
            <g key={`${i}-${ki}`}>
              <rect
                x={x0 + ki * (barW / keys.length + 1)}
                y={height - 20 - h}
                width={barW / keys.length}
                height={h}
                fill={colors[ki]}
                rx={2}
                opacity={0.85}
              >
                <title>{`${k}: ${val.toFixed(0)}`}</title>
              </rect>
            </g>
          );
        });
      })}
      {/* X-axis labels — every 7th */}
      {data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 6)) === 0).map((d, i) => {
        const origI = data.indexOf(d);
        const x = origI * (W / data.length) + barW / 2;
        return (
          <text key={i} x={x} y={height - 2} fontSize={8} fill="#94a3b8" textAnchor="middle">
            {String(d['date'] ?? '').slice(5)}
          </text>
        );
      })}
    </svg>
  );
}

/** SVG donut chart */
function DonutChart({ data, colors }: { data: { label: string; value: number }[]; colors: string[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <EmptyState icon="🍩" title="No data yet" />;
  const R = 60; const CX = 80; const CY = 80;
  let cumAngle = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const angle  = (d.value / total) * 2 * Math.PI;
    const x1     = CX + R * Math.cos(cumAngle);
    const y1     = CY + R * Math.sin(cumAngle);
    cumAngle    += angle;
    const x2     = CX + R * Math.cos(cumAngle);
    const y2     = CY + R * Math.sin(cumAngle);
    const large  = angle > Math.PI ? 1 : 0;
    return { path: `M${CX},${CY} L${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} Z`, color: colors[i % colors.length], label: d.label, value: d.value };
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg viewBox="0 0 160 160" style={{ width: 130, height: 130, flexShrink: 0 }}>
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} opacity={0.88}>
            <title>{`${s.label}: ${s.value.toFixed(0)}`}</title>
          </path>
        ))}
        <circle cx={CX} cy={CY} r={R * 0.55} fill="var(--panel-bg, #fff)" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ color: '#64748b' }}>{s.label}</span>
            <span style={{ fontWeight: 700, marginLeft: 'auto' }}>{s.value.toFixed(0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function AccountingPage({ th, pageId, onToast, preset }: {
  th: Theme; pageId: number; onToast: (m: string, t?: any) => void;
  preset?: AccountingPagePreset | null;
}) {
  const { copy } = useLanguage();
  const { request } = useApi();
  const [tab, setTab]             = useState<AccTab>('overview');
  const [overview, setOverview]   = useState<Overview | null>(null);
  const [trend, setTrend]         = useState<DayPoint[]>([]);
  const [expCats, setExpCats]     = useState<CatPoint[]>([]);
  const [statusDist, setStatusDist] = useState<StatusPoint[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [expenses, setExpenses]   = useState<Expense[]>([]);
  const [returns, setReturns]     = useState<ReturnE[]>([]);
  const [exchanges, setExchanges] = useState<ExchangeE[]>([]);
  const [refundQueue, setRefundQueue]   = useState<any[]>([]);
  const [refundAmounts, setRefundAmounts] = useState<Record<number, string>>({});
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [partialEntry, setPartialEntry] = useState<ReturnE | null>(null);
  const [partialItems, setPartialItems] = useState<{ id: number; selected: boolean; restock: boolean }[]>([]);
  const [partialSaving, setPartialSaving] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [reportDays, setReportDays]   = useState<number | null>(7);   // null = custom
  const [reportFrom, setReportFrom]   = useState('');
  const [reportTo, setReportTo]       = useState('');
  const [reportData, setReportData]   = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const BASE = `${API_BASE}/client-dashboard/${pageId}/accounting`;
  const cur  = overview?.currency || '৳';
  const fmt  = (n: number) => `${cur}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, tr, ec, sd] = await Promise.all([
        request<Overview>(`${BASE}/overview`),
        request<DayPoint[]>(`${BASE}/charts/daily-trend?days=30`),
        request<CatPoint[]>(`${BASE}/charts/expense-breakdown`),
        request<StatusPoint[]>(`${BASE}/charts/order-status`),
      ]);
      setOverview(ov); setTrend(tr); setExpCats(ec); setStatusDist(sd);
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [pageId]);

  const loadTab = useCallback(async (t: AccTab) => {
    try {
      if (t === 'collections')  setCollections(await request<Collection[]>(`${BASE}/collections`));
      if (t === 'expenses')     setExpenses(await request<Expense[]>(`${BASE}/expenses`));
      if (t === 'returns')      setReturns(await request<ReturnE[]>(`${BASE}/returns`));
      if (t === 'exchanges')    setExchanges(await request<ExchangeE[]>(`${BASE}/exchanges`));
      if (t === 'refund_queue') setRefundQueue(await request<any[]>(`${BASE}/refund-queue`));
    } catch (e: any) { onToast(e.message, 'error'); }
  }, [pageId]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (tab !== 'overview' && tab !== 'reports') loadTab(tab); }, [tab, loadTab]);
  useEffect(() => {
    if (!preset?.tab) return;
    setTab(preset.tab);
  }, [preset?.tab, preset?.label]);

  const loadReport = async (days?: number | null, from?: string, to?: string) => {
    const d = days !== undefined ? days : reportDays;
    const f = from !== undefined ? from : reportFrom;
    const t = to   !== undefined ? to   : reportTo;
    let url: string;
    if (d === null) {
      if (!f || !t) return onToast(copy('তারিখ নির্বাচন করুন', 'Select a date range'), 'error');
      url = `${BASE}/report/custom?from=${f}&to=${t}`;
    } else {
      const toDate   = new Date();
      const fromDate = new Date(toDate.getTime() - d * 24 * 60 * 60 * 1000);
      url = `${BASE}/report/custom?from=${fromDate.toISOString().slice(0,10)}&to=${toDate.toISOString().slice(0,10)}`;
    }
    setReportLoading(true);
    try { setReportData(await request(url)); }
    catch (e: any) { onToast(e.message, 'error'); }
    finally { setReportLoading(false); }
  };
  useEffect(() => { if (tab === 'reports') loadReport(); }, [tab]);

  const fmtPlain = (n: number) => Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0 });

  // ── Refund queue actions ───────────────────────────────────────────────────
  const handleConfirmRefund = async (returnId: number) => {
    const amt = Number(refundAmounts[returnId] || 0);
    if (amt < 0) return onToast('Amount must be 0 or more', 'error');
    setConfirmingId(returnId);
    try {
      await request(`${BASE}/refund-queue/${returnId}/confirm`, {
        method: 'PATCH', body: JSON.stringify({ givenAmount: amt }),
      });
      onToast(copy('✅ Refund confirmed', '✅ Refund confirmed'));
      setRefundQueue(q => q.map(r => r.id === returnId ? { ...r, refundStatus: 'given', refundGivenAmount: amt, refundGivenAt: new Date().toISOString() } : r));
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setConfirmingId(null); }
  };

  const openPartialModal = (entry: ReturnE) => {
    setPartialEntry(entry);
    setPartialItems((entry.order?.items || []).map(i => ({ id: i.id, selected: false, restock: true })));
  };

  const resolvePartialItems = async () => {
    if (!partialEntry) return;
    const selected = partialItems.filter(p => p.selected);
    if (!selected.length) return onToast(copy('অন্তত একটি আইটেম সিলেক্ট করুন', 'Select at least one item'), 'error');
    setPartialSaving(true);
    try {
      const items = selected.map(p => {
        const item = partialEntry.order!.items!.find(i => i.id === p.id)!;
        return { orderItemId: p.id, qty: item.qty, unitPrice: item.unitPrice, restock: p.restock };
      });
      await request(`${BASE}/returns/${partialEntry.id}/partial-items`, {
        method: 'PATCH', body: JSON.stringify({ items }),
      });
      onToast(copy('✅ Partial return confirmed', '✅ Partial return confirmed'));
      setPartialEntry(null);
      await Promise.all([loadTab('returns'), loadAll()]);
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setPartialSaving(false); }
  };

  const handleSkipRefund = async (returnId: number) => {
    setConfirmingId(returnId);
    try {
      await request(`${BASE}/refund-queue/${returnId}/skip`, { method: 'PATCH' });
      onToast(copy('Marked as not applicable', 'Marked as not applicable'));
      setRefundQueue(q => q.map(r => r.id === returnId ? { ...r, refundStatus: 'not_applicable' } : r));
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setConfirmingId(null); }
  };

  // ── SheetJS helper ─────────────────────────────────────────────────────────
  const dlXlsx = (sheets: { name: string; data: (string | number)[][] }[], filename: string) => {
    const wb = XLSX.utils.book_new();
    sheets.forEach(({ name, data }) => {
      const ws = XLSX.utils.aoa_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  // ── Individual Excel exports ───────────────────────────────────────────────
  const downloadCollectionsXls = () => {
    if (!collections.length) return onToast('No data', 'error');
    const total = collections.reduce((s, c) => s + c.amount, 0);
    dlXlsx([{
      name: 'Collections',
      data: [
        ['তারিখ', 'ধরন', 'মাধ্যম', `পরিমাণ (${cur})`, 'অর্ডার', 'কাস্টমার', 'নোট'],
        ...collections.map(c => [
          new Date(c.collectedAt).toLocaleDateString('en-BD'),
          c.type, c.method, c.amount,
          c.orderId ? `#${c.orderId}` : '', c.order?.customerName || '', c.note || '',
        ]),
        ['মোট', '', '', total, '', '', ''],
      ],
    }], `collections-${new Date().toISOString().slice(0,10)}`);
    onToast('✅ Excel downloaded');
  };

  const downloadExpensesXls = () => {
    if (!expenses.length) return onToast('No data', 'error');
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    dlXlsx([{
      name: 'Expenses',
      data: [
        ['তারিখ', 'ক্যাটাগরি', `পরিমাণ (${cur})`, 'অর্ডার', 'কাস্টমার', 'নোট'],
        ...expenses.map(e => [
          new Date(e.spentAt).toLocaleDateString('en-BD'),
          e.category, e.amount,
          e.orderId ? `#${e.orderId}` : '', e.order?.customerName || '', e.note || '',
        ]),
        ['মোট খরচ', '', total, '', '', ''],
      ],
    }], `expenses-${new Date().toISOString().slice(0,10)}`);
    onToast('✅ Excel downloaded');
  };

  const downloadReturnsXls = () => {
    if (!returns.length) return onToast('No data', 'error');
    dlXlsx([{
      name: 'Returns',
      data: [
        ['তারিখ', 'অর্ডার', 'কাস্টমার', 'ধরন', `রিফান্ড (${cur})`, `রিটার্ন খরচ (${cur})`, 'নোট'],
        ...returns.map(r => [
          new Date(r.createdAt).toLocaleDateString('en-BD'),
          `#${r.orderId}`, r.order?.customerName || '', r.returnType,
          r.refundAmount, r.returnCost, r.note || '',
        ]),
      ],
    }], `returns-${new Date().toISOString().slice(0,10)}`);
    onToast('✅ Excel downloaded');
  };

  const downloadExchangesXls = () => {
    if (!exchanges.length) return onToast('No data', 'error');
    dlXlsx([{
      name: 'Exchanges',
      data: [
        ['তারিখ', 'অর্ডার', 'কাস্টমার', `এক্সট্রা চার্জ (${cur})`, `রিফান্ড অ্যাডজ. (${cur})`, `নেট (${cur})`, 'নোট'],
        ...exchanges.map(e => [
          new Date(e.createdAt).toLocaleDateString('en-BD'),
          `#${e.orderId}`, e.order?.customerName || '',
          e.extraCharge, e.refundAdjustment,
          e.extraCharge - e.refundAdjustment, e.note || '',
        ]),
      ],
    }], `exchanges-${new Date().toISOString().slice(0,10)}`);
    onToast('✅ Excel downloaded');
  };

  // ── Complete All-in-One Excel export (5 sheets) ────────────────────────────
  const [exporting, setExporting] = useState(false);

  const downloadAllExcel = async () => {
    setExporting(true);
    try {
      const [cols, exps, rets, exchs] = await Promise.all([
        collections.length ? Promise.resolve(collections) : request<Collection[]>(`${BASE}/collections`),
        expenses.length    ? Promise.resolve(expenses)    : request<Expense[]>(`${BASE}/expenses`),
        returns.length     ? Promise.resolve(returns)     : request<ReturnE[]>(`${BASE}/returns`),
        exchanges.length   ? Promise.resolve(exchanges)   : request<ExchangeE[]>(`${BASE}/exchanges`),
      ]);
      if (!collections.length) setCollections(cols);
      if (!expenses.length)    setExpenses(exps);
      if (!returns.length)     setReturns(rets);
      if (!exchanges.length)   setExchanges(exchs);

      dlXlsx([
        {
          name: 'Overview',
          data: [
            ['Accounting Report', new Date().toLocaleDateString('en-BD')],
            [],
            ['মেট্রিক', `পরিমাণ (${cur})`],
            ...(overview ? [
              ['মোট রেভিনিউ (est.)', overview.estimatedRevenue],
              ['মোট কালেকশন', overview.totalCollection],
              ['বকেয়া', overview.totalDue],
              ['মোট খরচ', overview.totalExpenses],
              ['রিফান্ড', overview.totalRefunds],
              ['রিটার্ন খরচ', overview.totalReturnCost],
              ['গ্রস প্রফিট', overview.estimatedGrossProfit],
              ['নেট প্রফিট', overview.estimatedNetProfit],
              ['কনফার্মড অর্ডার', overview.confirmedOrders],
            ] : []),
          ],
        },
        {
          name: 'Collections',
          data: [
            ['তারিখ', 'ধরন', 'মাধ্যম', `পরিমাণ (${cur})`, 'অর্ডার', 'কাস্টমার', 'নোট'],
            ...cols.map(c => [
              new Date(c.collectedAt).toLocaleDateString('en-BD'),
              c.type, c.method, c.amount,
              c.orderId ? `#${c.orderId}` : '', c.order?.customerName || '', c.note || '',
            ]),
            ['মোট', '', '', cols.reduce((s, c) => s + c.amount, 0), '', '', ''],
          ],
        },
        {
          name: 'Expenses',
          data: [
            ['তারিখ', 'ক্যাটাগরি', `পরিমাণ (${cur})`, 'অর্ডার', 'কাস্টমার', 'নোট'],
            ...exps.map(e => [
              new Date(e.spentAt).toLocaleDateString('en-BD'),
              e.category, e.amount,
              e.orderId ? `#${e.orderId}` : '', e.order?.customerName || '', e.note || '',
            ]),
            ['মোট খরচ', '', exps.reduce((s, e) => s + e.amount, 0), '', '', ''],
          ],
        },
        {
          name: 'Returns',
          data: [
            ['তারিখ', 'অর্ডার', 'কাস্টমার', 'ধরন', `রিফান্ড (${cur})`, `খরচ (${cur})`, 'নোট'],
            ...rets.map(r => [
              new Date(r.createdAt).toLocaleDateString('en-BD'),
              `#${r.orderId}`, r.order?.customerName || '', r.returnType,
              r.refundAmount, r.returnCost, r.note || '',
            ]),
          ],
        },
        {
          name: 'Exchanges',
          data: [
            ['তারিখ', 'অর্ডার', 'কাস্টমার', `এক্সট্রা (${cur})`, `রিফান্ড (${cur})`, `নেট (${cur})`, 'নোট'],
            ...exchs.map(e => [
              new Date(e.createdAt).toLocaleDateString('en-BD'),
              `#${e.orderId}`, e.order?.customerName || '',
              e.extraCharge, e.refundAdjustment,
              e.extraCharge - e.refundAdjustment, e.note || '',
            ]),
          ],
        },
      ], `accounting-full-${new Date().toISOString().slice(0,10)}`);
      onToast(copy('✅ সম্পূর্ণ Excel রিপোর্ট ডাউনলোড হয়েছে', '✅ Full Excel report downloaded'));
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setExporting(false); }
  };

  // ── Full PDF print window ──────────────────────────────────────────────────
  const printFullReport = async () => {
    setExporting(true);
    try {
      const [cols, exps, rets, exchs] = await Promise.all([
        collections.length ? Promise.resolve(collections) : request<Collection[]>(`${BASE}/collections`),
        expenses.length    ? Promise.resolve(expenses)    : request<Expense[]>(`${BASE}/expenses`),
        returns.length     ? Promise.resolve(returns)     : request<ReturnE[]>(`${BASE}/returns`),
        exchanges.length   ? Promise.resolve(exchanges)   : request<ExchangeE[]>(`${BASE}/exchanges`),
      ]);
      if (!collections.length) setCollections(cols);
      if (!expenses.length)    setExpenses(exps);
      if (!returns.length)     setReturns(rets);
      if (!exchanges.length)   setExchanges(exchs);

      const date = new Date().toLocaleString('en-BD');
      const ov = overview;
      const section = (icon: string, title: string, color: string) =>
        `<h2 style="color:${color};border-bottom:2px solid ${color};padding-bottom:6px;margin-top:28px">${icon} ${title}</h2>`;
      const tbl = (headers: string[], rows: string[][], accentBg: string) => `
        <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:12px">
          <thead><tr>${headers.map(h=>`<th style="background:${accentBg};padding:7px 10px;text-align:left;border:1px solid #e2e8f0">${h}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r=>`<tr>${r.map(c=>`<td style="padding:6px 10px;border:1px solid #e2e8f0">${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>`;

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <title>Accounting Report</title>
        <style>
          body{font-family:Arial,sans-serif;margin:30px;color:#1e293b;font-size:13px}
          @page{margin:0;size:A4}
          @media print{body{margin:12mm 15mm}.no-print{display:none}}
          table{page-break-inside:avoid}
        </style>
      </head><body>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
          <div>
            <h1 style="margin:0;color:#1e40af;font-size:22px">📊 Accounting Report</h1>
            <div style="color:#64748b;margin-top:4px;font-size:12px">Generated: ${date}</div>
          </div>
          <button class="no-print" onclick="window.print()" style="padding:8px 20px;background:#1e40af;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">🖨️ Print / Save PDF</button>
        </div>

        ${section('📈','Overview / Summary','#1e40af')}
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:12px">
          ${ov ? [
            ['মোট রেভিনিউ',fmtPlain(ov.estimatedRevenue),'#1e40af'],
            ['মোট কালেকশন',fmtPlain(ov.totalCollection),'#059669'],
            ['বকেয়া',fmtPlain(ov.totalDue),'#d97706'],
            ['মোট খরচ',fmtPlain(ov.totalExpenses),'#dc2626'],
            ['গ্রস প্রফিট',fmtPlain(ov.estimatedGrossProfit),ov.estimatedGrossProfit>=0?'#059669':'#dc2626'],
            ['নেট প্রফিট/লস',fmtPlain(ov.estimatedNetProfit),ov.estimatedNetProfit>=0?'#059669':'#dc2626'],
            ['কনফার্মড অর্ডার',String(ov.confirmedOrders),'#7c3aed'],
            ['রিটার্ন',String(ov.returnCount),'#dc2626'],
          ].map(([l,v,c])=>`<div style="border:1.5px solid #e2e8f0;border-radius:8px;padding:12px 14px">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600;margin-bottom:4px">${l}</div>
            <div style="font-size:20px;font-weight:900;color:${c}">${v}</div>
          </div>`).join('') : ''}
        </div>

        ${section('💰','Collections ('+cols.length+')','#059669')}
        ${tbl(['তারিখ','ধরন','মাধ্যম',`পরিমাণ (${cur})`,'অর্ডার','কাস্টমার','নোট'],
          [...cols.map(c=>[new Date(c.collectedAt).toLocaleDateString('en-BD'),c.type,c.method,cur+fmtPlain(c.amount),c.orderId?'#'+c.orderId:'',c.order?.customerName||'',c.note||'']),
           ['','','<strong>মোট</strong>',`<strong style="color:#059669">${cur}${fmtPlain(cols.reduce((s,c)=>s+c.amount,0))}</strong>`,'','','']
          ],'#d1fae5')}

        ${section('🧾','Expenses ('+exps.length+')','#d97706')}
        ${tbl(['তারিখ','ক্যাটাগরি',`পরিমাণ (${cur})`,'অর্ডার','কাস্টমার','নোট'],
          [...exps.map(e=>[new Date(e.spentAt).toLocaleDateString('en-BD'),e.category,cur+fmtPlain(e.amount),e.orderId?'#'+e.orderId:'',e.order?.customerName||'',e.note||'']),
           ['','<strong>মোট</strong>',`<strong style="color:#d97706">${cur}${fmtPlain(exps.reduce((s,e)=>s+e.amount,0))}</strong>`,'','','']
          ],'#fef3c7')}

        ${section('↩️','Returns ('+rets.length+')','#dc2626')}
        ${tbl(['তারিখ','অর্ডার','কাস্টমার','ধরন',`রিফান্ড (${cur})`,`খরচ (${cur})`,'নোট'],
          rets.map(r=>[new Date(r.createdAt).toLocaleDateString('en-BD'),'#'+r.orderId,r.order?.customerName||'',r.returnType,cur+fmtPlain(r.refundAmount),cur+fmtPlain(r.returnCost),r.note||''])
          ,'#fee2e2')}

        ${section('🔄','Exchanges ('+exchs.length+')','#7c3aed')}
        ${tbl(['তারিখ','অর্ডার','কাস্টমার',`এক্সট্রা (${cur})`,`রিফান্ড (${cur})`,`নেট (${cur})`,'নোট'],
          exchs.map(e=>{const net=e.extraCharge-e.refundAdjustment;return[new Date(e.createdAt).toLocaleDateString('en-BD'),'#'+e.orderId,e.order?.customerName||'',cur+fmtPlain(e.extraCharge),cur+fmtPlain(e.refundAdjustment),(net>=0?'+':'-')+cur+fmtPlain(net),e.note||'']})
          ,'#ede9fe')}
      </body></html>`;

      const w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); }
      onToast(copy('✅ PDF window opened — Print করুন বা Save as PDF করুন', '✅ PDF window opened - print it or save as PDF'));
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setExporting(false); }
  };

  // Legacy CSV (kept for compatibility)
  const exportExcel = async (type: string) => {
    try {
      const data: any = await request(`${BASE}/export/data?type=${type}`);
      const rows = data.rows || (data.overview ? [data.overview] : []);
      if (!rows.length) { onToast('No data to export', 'info'); return; }
      const headers = Object.keys(rows[0]).filter(k => k !== 'order');
      const csv = [headers.join(','), ...rows.map((r: any) => headers.map(h => {
        const v = r[h];
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return '';
        return `"${String(v).replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`;
      }).join(','))].join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `${type}-${new Date().toISOString().slice(0,10)}.csv`; a.click();
      onToast('✅ CSV downloaded');
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  // ── Forms ──────────────────────────────────────────────────────────────────
  const [colForm, setColForm] = useState({ orderId: '', type: 'full_payment', method: 'cash', amount: '', note: '', collectedAt: new Date().toISOString().slice(0,10) });
  const [expForm, setExpForm] = useState({ orderId: '', category: 'courier', amount: '', note: '', spentAt: new Date().toISOString().slice(0,10) });
  const [retForm, setRetForm] = useState({ orderId: '', returnType: 'full', refundAmount: '', returnCost: '0', note: '' });
  const [exForm,  setExForm]  = useState({ orderId: '', extraCharge: '0', refundAdjustment: '0', note: '' });

  const saveCollection = async () => {
    if (!colForm.amount) return onToast(copy('Amount দিন', 'Enter an amount'), 'error');
    setSaving(true);
    try {
      await request(`${BASE}/collections`, { method: 'POST', body: JSON.stringify({ ...colForm, amount: Number(colForm.amount), orderId: colForm.orderId ? Number(colForm.orderId) : undefined }) });
      onToast(copy('✅ Collection added', '✅ Collection added'));
      setColForm({ orderId: '', type: 'full_payment', method: 'cash', amount: '', note: '', collectedAt: new Date().toISOString().slice(0,10) });
      await Promise.all([loadTab('collections'), loadAll()]);
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const saveExpense = async () => {
    if (!expForm.amount) return onToast(copy('Amount দিন', 'Enter an amount'), 'error');
    setSaving(true);
    try {
      await request(`${BASE}/expenses`, { method: 'POST', body: JSON.stringify({ ...expForm, amount: Number(expForm.amount), orderId: expForm.orderId ? Number(expForm.orderId) : undefined }) });
      onToast(copy('✅ Expense added', '✅ Expense added'));
      setExpForm({ orderId: '', category: 'courier', amount: '', note: '', spentAt: new Date().toISOString().slice(0,10) });
      await Promise.all([loadTab('expenses'), loadAll()]);
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const saveReturn = async () => {
    if (!retForm.orderId) return onToast(copy('Order ID দিন', 'Enter an Order ID'), 'error');
    setSaving(true);
    try {
      await request(`${BASE}/returns`, { method: 'POST', body: JSON.stringify({ orderId: Number(retForm.orderId), returnType: retForm.returnType, refundAmount: Number(retForm.refundAmount)||0, returnCost: Number(retForm.returnCost)||0, note: retForm.note }) });
      onToast(copy('✅ Return recorded', '✅ Return recorded'));
      setRetForm({ orderId: '', returnType: 'full', refundAmount: '', returnCost: '0', note: '' });
      await Promise.all([loadTab('returns'), loadAll()]);
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const saveExchange = async () => {
    if (!exForm.orderId) return onToast(copy('Order ID দিন', 'Enter an Order ID'), 'error');
    setSaving(true);
    try {
      await request(`${BASE}/exchanges`, { method: 'POST', body: JSON.stringify({ orderId: Number(exForm.orderId), extraCharge: Number(exForm.extraCharge)||0, refundAdjustment: Number(exForm.refundAdjustment)||0, note: exForm.note }) });
      onToast(copy('✅ Exchange recorded', '✅ Exchange recorded'));
      setExForm({ orderId: '', extraCharge: '0', refundAdjustment: '0', note: '' });
      await Promise.all([loadTab('exchanges'), loadAll()]);
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const deleteRow = async (endpoint: string, id: number, reload: AccTab) => {
    try {
      await request(`${BASE}/${endpoint}/${id}`, { method: 'DELETE' });
      onToast(copy('✅ Deleted', '✅ Deleted'));
      await Promise.all([loadTab(reload), loadAll()]);
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  // ── Accent colors ──────────────────────────────────────────────────────────
  const CHART_COLORS = ['#5b63f5','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316'];

  const KPICard = ({ label, value, color, sub, icon }: { label: string; value: string; color: string; sub?: string; icon: string }) => (
    <div style={{
      background: th.panel, border: `1.5px solid ${th.border}`, borderRadius: 16,
      padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 4,
      boxShadow: th.shadow,
    }}>
      <div style={{ fontSize: 22, marginBottom: 2 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color, lineHeight: 1.1, letterSpacing: '-0.5px' }}>{value}</div>
      <div style={{ fontSize: 11.5, color: th.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: th.muted, marginTop: 1 }}>{sub}</div>}
    </div>
  );

  const SaveBtn = ({ onClick, label = copy('➕ Add', '➕ Add') }: { onClick: () => void; label?: string }) => (
    <button style={{ ...th.btnPrimary, marginTop: 4, alignSelf: 'flex-start' }} onClick={onClick} disabled={saving}>
      {saving ? <><Spinner size={13}/> {copy('Saving...', 'Saving...')}</> : label}
    </button>
  );

  const TabBar = () => (
    <div style={{ display: 'flex', gap: 4, background: th.surface, borderRadius: 14, padding: 4, border: `1px solid ${th.border}`, flexWrap: 'wrap' }}>
      {ACC_TABS.map(t => (
        <button key={t.key}
          onClick={() => setTab(t.key)}
          style={{
            padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            background: tab === t.key ? th.accent : 'transparent',
            color: tab === t.key ? '#fff' : th.muted,
            transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <span style={{ fontSize: 14 }}>{t.icon}</span>{t.label}
        </button>
      ))}
    </div>
  );

  // ── OVERVIEW TAB ────────────────────────────────────────────────────────────
  const OverviewTab = () => {
    if (loading || !overview) return <div style={{ textAlign: 'center', padding: 60 }}><Spinner size={28}/></div>;
    const isProfit = overview.estimatedNetProfit >= 0;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Export bar */}
        <div style={{ ...th.card, padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: th.muted, marginRight: 4 }}>📤 {copy('Export:', 'Export:')}</span>
          <button style={{ ...th.btnPrimary, fontSize: 12, padding: '7px 14px', background: '#16a34a' }}
            onClick={downloadAllExcel} disabled={exporting}>
            {exporting ? <><Spinner size={12} color="#fff"/> {copy('Loading...', 'Loading...')}</> : copy('📊 Excel (সব data)', 'Excel (all data)')}
          </button>
          <button style={{ ...th.btnPrimary, fontSize: 12, padding: '7px 14px', background: '#1e40af' }}
            onClick={printFullReport} disabled={exporting}>
            {exporting ? <><Spinner size={12} color="#fff"/> {copy('Loading...', 'Loading...')}</> : copy('🖨️ PDF (সব data)', 'PDF (all data)')}
          </button>
          <span style={{ fontSize: 11, color: th.muted, marginLeft: 4 }}>
            {copy('Collections, Expenses, Returns, Exchanges — সব একসাথে', 'Collections, Expenses, Returns, and Exchanges together')}
          </span>
        </div>

        {/* KPI grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12 }}>
          <KPICard icon="📈" label="Est. Revenue" value={fmt(overview.estimatedRevenue)} color={th.accent} sub={`${overview.confirmedOrders} confirmed orders`} />
          <KPICard icon="💰" label="Collected" value={fmt(overview.totalCollection)} color="#10b981" />
          <KPICard icon="⏳" label="Due" value={fmt(overview.totalDue)} color={overview.totalDue > 0 ? '#f59e0b' : '#10b981'} />
          <KPICard icon="🧾" label="Expenses" value={fmt(overview.totalExpenses)} color="#f97316" />
          <KPICard icon="↩️" label="Refunds" value={fmt(overview.totalRefunds)} color="#ef4444" sub={`${overview.returnCount} returns`} />
          <KPICard icon="🔄" label="Exchange Adj." value={fmt(overview.netExchangeImpact)} color="#8b5cf6" sub={`${overview.exchangeCount} exchanges`} />
          <KPICard icon={isProfit ? '🟢' : '🔴'} label={isProfit ? 'Net Profit' : 'Net Loss'} value={fmt(overview.estimatedNetProfit)} color={isProfit ? '#16a34a' : '#dc2626'} sub="Estimated" />
        </div>

        {/* Profit breakdown card */}
        <div style={{ ...th.card }}>
          <CardHeader th={th} title="📊 Profit Calculation Breakdown" sub="How the estimate is calculated" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { label: 'Gross Revenue (Confirmed Orders)', val: overview.estimatedRevenue, color: '#10b981', sign: '+' },
              { label: 'Cost of Goods Sold (COGS)', val: overview.estimatedCOGS, color: '#ef4444', sign: '−' },
              { label: 'Return Refunds', val: overview.totalRefunds, color: '#ef4444', sign: '−' },
              { label: 'Return Costs', val: overview.totalReturnCost, color: '#ef4444', sign: '−' },
              { label: 'Exchange Net Impact', val: overview.netExchangeImpact, color: overview.netExchangeImpact >= 0 ? '#10b981' : '#ef4444', sign: overview.netExchangeImpact >= 0 ? '+' : '−' },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: `1px solid ${th.border}` }}>
                <span style={{ fontSize: 13.5, color: th.text }}>{row.label}</span>
                <span style={{ fontWeight: 800, fontSize: 14, color: row.color }}>{row.sign} {fmt(Math.abs(row.val))}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 0 6px', borderBottom: `2px solid ${th.border}` }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Gross Profit</span>
              <span style={{ fontWeight: 900, fontSize: 16, color: overview.estimatedGrossProfit >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(overview.estimatedGrossProfit)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: `1px solid ${th.border}` }}>
              <span style={{ fontSize: 13.5, color: th.text }}>Total Expenses</span>
              <span style={{ fontWeight: 800, fontSize: 14, color: '#ef4444' }}>− {fmt(overview.totalExpenses)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0 0', background: isProfit ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.04)', borderRadius: 8, marginTop: 4, paddingLeft: 8, paddingRight: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 800 }}>Estimated Net {isProfit ? 'Profit' : 'Loss'}</span>
              <span style={{ fontWeight: 900, fontSize: 20, color: isProfit ? '#16a34a' : '#dc2626' }}>{fmt(overview.estimatedNetProfit)}</span>
            </div>
          </div>
        </div>

        {/* Charts row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Trend chart */}
          <div style={th.card}>
            <CardHeader th={th} title="📈 30-Day Trend" sub="Revenue · Collected · Expenses" />
            {trend.length === 0 ? <EmptyState icon="📊" title="No trend data yet" /> : (
              <>
                <BarChart data={trend as any} keys={['revenue','collection','expense']} colors={['#5b63f5','#10b981','#f97316']} />
                <div style={{ display: 'flex', gap: 16, marginTop: 10, justifyContent: 'center' }}>
                  {[['Revenue','#5b63f5'],['Collected','#10b981'],['Expenses','#f97316']].map(([l, c]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: c as string }} />{l}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          {/* Expense donut */}
          <div style={th.card}>
            <CardHeader th={th} title="🧾 Expense Breakdown" sub="By category" />
            {expCats.length === 0
              ? <EmptyState icon="🧾" title="No expenses yet" />
              : <DonutChart data={expCats.map(e => ({ label: e.category, value: e.amount }))} colors={CHART_COLORS} />
            }
          </div>
          {/* Order status donut */}
          <div style={th.card}>
            <CardHeader th={th} title="📦 Order Status" sub="Distribution" />
            {statusDist.length === 0
              ? <EmptyState icon="📦" title="No orders yet" />
              : <DonutChart data={statusDist.map(s => ({ label: s.status, value: s.count }))} colors={['#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']} />
            }
          </div>
          {/* Collection vs Due bar */}
          <div style={th.card}>
            <CardHeader th={th} title="💰 Collection vs Due" sub="" />
            {overview && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
                {[
                  { label: 'Collected', val: overview.totalCollection, color: '#10b981', total: overview.estimatedRevenue },
                  { label: 'Due',       val: overview.totalDue,        color: '#f59e0b', total: overview.estimatedRevenue },
                ].map(r => {
                  const pct = overview.estimatedRevenue > 0 ? Math.min(100, (r.val / overview.estimatedRevenue) * 100) : 0;
                  return (
                    <div key={r.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}>
                        <span style={{ fontWeight: 600 }}>{r.label}</span>
                        <span style={{ color: r.color, fontWeight: 700 }}>{fmt(r.val)} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div style={{ height: 10, background: th.border, borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: r.color, borderRadius: 999, transition: 'width .6s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── COLLECTIONS TAB ────────────────────────────────────────────────────────
  const CollectionsTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={th.card}>
        <CardHeader th={th} title="➕ Add Collection" sub="Manually record money received" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10 }}>
          <Field th={th} label="Type">
            <select style={th.input} value={colForm.type} onChange={e => setColForm(f => ({ ...f, type: e.target.value }))}>
              {COLLECTION_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field th={th} label="Method">
            <select style={th.input} value={colForm.method} onChange={e => setColForm(f => ({ ...f, method: e.target.value }))}>
              {COLLECTION_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field th={th} label={`Amount (${cur})`}>
            <input style={th.input} type="number" min={0} placeholder="0" value={colForm.amount} onChange={e => setColForm(f => ({ ...f, amount: e.target.value }))} />
          </Field>
          <Field th={th} label="Date">
            <input style={th.input} type="date" value={colForm.collectedAt} onChange={e => setColForm(f => ({ ...f, collectedAt: e.target.value }))} />
          </Field>
          <Field th={th} label="Order ID (opt)">
            <input style={th.input} type="number" placeholder="Order #" value={colForm.orderId} onChange={e => setColForm(f => ({ ...f, orderId: e.target.value }))} />
          </Field>
          <Field th={th} label="Note">
            <input style={th.input} placeholder="Optional note" value={colForm.note} onChange={e => setColForm(f => ({ ...f, note: e.target.value }))} />
          </Field>
        </div>
        <SaveBtn onClick={saveCollection} />
      </div>
      <div style={th.card}>
        <CardHeader th={th} title="💰 Collections" sub={`${collections.length} entries`}
          action={<div style={{display:'flex',gap:6}}><button style={th.btnGhost} onClick={downloadCollectionsXls}>📊 Excel</button><button style={th.btnGhost} onClick={()=>exportExcel('collections')}>CSV</button></div>} />
        {collections.length === 0 ? <EmptyState icon="💰" title="No collections yet" /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={th.table}>
              <thead><tr>{['Date','Type','Method','Amount','Order','Note',''].map(h => <th key={h} style={th.th}>{h}</th>)}</tr></thead>
              <tbody>
                {collections.map(c => (
                  <tr key={c.id}>
                    <td style={{ ...th.td, fontSize: 12, color: th.muted }}>{new Date(c.collectedAt).toLocaleDateString()}</td>
                    <td style={th.td}><span style={{ ...th.pill, ...th.pillBlue, fontSize: 11 }}>{c.type.replace(/_/g,' ')}</span></td>
                    <td style={{ ...th.td, fontSize: 12 }}>{c.method}</td>
                    <td style={th.td}><span style={{ fontWeight: 700, color: '#10b981' }}>{fmt(c.amount)}</span></td>
                    <td style={{ ...th.td, fontSize: 12, color: th.muted }}>#{c.orderId || '—'}</td>
                    <td style={{ ...th.td, fontSize: 12, color: th.muted, maxWidth: 160 }}>{c.note || '—'}</td>
                    <td style={th.td}><button style={th.btnSmDanger} onClick={() => deleteRow('collections', c.id, 'collections')}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // ── EXPENSES TAB ────────────────────────────────────────────────────────────
  const ExpensesTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={th.card}>
        <CardHeader th={th} title="➕ Add Expense" sub="Record business costs" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10 }}>
          <Field th={th} label="Category">
            <select style={th.input} value={expForm.category} onChange={e => setExpForm(f => ({ ...f, category: e.target.value }))}>
              {EXPENSE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field th={th} label={`Amount (${cur})`}>
            <input style={th.input} type="number" min={0} placeholder="0" value={expForm.amount} onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))} />
          </Field>
          <Field th={th} label="Date">
            <input style={th.input} type="date" value={expForm.spentAt} onChange={e => setExpForm(f => ({ ...f, spentAt: e.target.value }))} />
          </Field>
          <Field th={th} label="Order ID (opt)">
            <input style={th.input} type="number" placeholder="Order #" value={expForm.orderId} onChange={e => setExpForm(f => ({ ...f, orderId: e.target.value }))} />
          </Field>
          <Field th={th} label="Note">
            <input style={th.input} placeholder="Optional note" value={expForm.note} onChange={e => setExpForm(f => ({ ...f, note: e.target.value }))} />
          </Field>
        </div>
        <SaveBtn onClick={saveExpense} />
      </div>
      <div style={th.card}>
        <CardHeader th={th} title="🧾 Expenses" sub={`${expenses.length} entries`}
          action={<div style={{display:'flex',gap:6}}><button style={th.btnGhost} onClick={downloadExpensesXls}>📊 Excel</button><button style={th.btnGhost} onClick={()=>exportExcel('expenses')}>CSV</button></div>} />
        {expenses.length === 0 ? <EmptyState icon="🧾" title="No expenses yet" /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={th.table}>
              <thead><tr>{['Date','Category','Amount','Order','Note',''].map(h => <th key={h} style={th.th}>{h}</th>)}</tr></thead>
              <tbody>
                {expenses.map(e => (
                  <tr key={e.id}>
                    <td style={{ ...th.td, fontSize: 12, color: th.muted }}>{new Date(e.spentAt).toLocaleDateString()}</td>
                    <td style={th.td}><span style={{ ...th.pill, ...th.pillYellow, fontSize: 11 }}>{e.category}</span></td>
                    <td style={th.td}><span style={{ fontWeight: 700, color: '#f97316' }}>{fmt(e.amount)}</span></td>
                    <td style={{ ...th.td, fontSize: 12, color: th.muted }}>#{e.orderId || '—'}</td>
                    <td style={{ ...th.td, fontSize: 12, color: th.muted, maxWidth: 160 }}>{e.note || '—'}</td>
                    <td style={th.td}><button style={th.btnSmDanger} onClick={() => deleteRow('expenses', e.id, 'expenses')}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // ── RETURNS TAB ────────────────────────────────────────────────────────────
  const ReturnsTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={th.card}>
        <CardHeader th={th} title="➕ Record Return" sub="Track returned orders" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10 }}>
          <Field th={th} label="Order ID *">
            <input style={th.input} type="number" placeholder="Order #" value={retForm.orderId} onChange={e => setRetForm(f => ({ ...f, orderId: e.target.value }))} />
          </Field>
          <Field th={th} label="Return Type">
            <select style={th.input} value={retForm.returnType} onChange={e => setRetForm(f => ({ ...f, returnType: e.target.value }))}>
              <option value="full">Full Return</option>
              <option value="partial">Partial Return</option>
            </select>
          </Field>
          <Field th={th} label={`Refund (${cur})`}>
            <input style={th.input} type="number" min={0} placeholder="0" value={retForm.refundAmount} onChange={e => setRetForm(f => ({ ...f, refundAmount: e.target.value }))} />
          </Field>
          <Field th={th} label={`Return Cost (${cur})`}>
            <input style={th.input} type="number" min={0} placeholder="0" value={retForm.returnCost} onChange={e => setRetForm(f => ({ ...f, returnCost: e.target.value }))} />
          </Field>
          <Field th={th} label="Note">
            <input style={th.input} placeholder="Optional note" value={retForm.note} onChange={e => setRetForm(f => ({ ...f, note: e.target.value }))} />
          </Field>
        </div>
        <SaveBtn onClick={saveReturn} />
      </div>
      <div style={th.card}>
        <CardHeader th={th} title="↩️ Returns" sub={`${returns.length} entries`}
          action={<div style={{display:'flex',gap:6}}><button style={th.btnGhost} onClick={downloadReturnsXls}>📊 Excel</button><button style={th.btnGhost} onClick={()=>exportExcel('returns')}>CSV</button></div>} />
        {returns.length === 0 ? <EmptyState icon="↩️" title="No returns yet" /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={th.table}>
              <thead><tr>{['Date','Order','Type','Refund','Return Cost','Note'].map(h => <th key={h} style={th.th}>{h}</th>)}</tr></thead>
              <tbody>
                {returns.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...th.td, fontSize: 12, color: th.muted }}>{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td style={th.td}>#{r.orderId} {r.order?.customerName && <span style={{ fontSize: 11, color: th.muted }}>({r.order.customerName})</span>}</td>
                    <td style={th.td}>
                      <span style={{ ...th.pill, ...th.pillBlue, fontSize: 11 }}>{r.returnType}</span>
                      {r.refundStatus === 'pending_item_selection' && (
                        <button style={{ ...th.btnPrimary, fontSize: 10, padding: '3px 8px', marginLeft: 6, background: '#f97316' }}
                          onClick={() => openPartialModal(r)}>⚠️ Items select করুন</button>
                      )}
                    </td>
                    <td style={th.td}><span style={{ color: '#ef4444', fontWeight: 700 }}>{fmt(r.refundAmount)}</span></td>
                    <td style={th.td}><span style={{ color: '#f97316', fontWeight: 700 }}>{fmt(r.returnCost)}</span></td>
                    <td style={{ ...th.td, fontSize: 12, color: th.muted }}>{r.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // ── EXCHANGES TAB ──────────────────────────────────────────────────────────
  const ExchangesTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={th.card}>
        <CardHeader th={th} title="➕ Record Exchange" sub="Track product exchanges" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10 }}>
          <Field th={th} label="Order ID *">
            <input style={th.input} type="number" placeholder="Order #" value={exForm.orderId} onChange={e => setExForm(f => ({ ...f, orderId: e.target.value }))} />
          </Field>
          <Field th={th} label={`Extra Charge (${cur})`}>
            <input style={th.input} type="number" min={0} placeholder="0" value={exForm.extraCharge} onChange={e => setExForm(f => ({ ...f, extraCharge: e.target.value }))} />
          </Field>
          <Field th={th} label={`Refund Adj. (${cur})`}>
            <input style={th.input} type="number" min={0} placeholder="0" value={exForm.refundAdjustment} onChange={e => setExForm(f => ({ ...f, refundAdjustment: e.target.value }))} />
          </Field>
          <Field th={th} label="Note">
            <input style={th.input} placeholder="Optional note" value={exForm.note} onChange={e => setExForm(f => ({ ...f, note: e.target.value }))} />
          </Field>
        </div>
        <SaveBtn onClick={saveExchange} />
      </div>
      <div style={th.card}>
        <CardHeader th={th} title="🔄 Exchanges" sub={`${exchanges.length} entries`}
          action={<div style={{display:'flex',gap:6}}><button style={th.btnGhost} onClick={downloadExchangesXls}>📊 Excel</button><button style={th.btnGhost} onClick={()=>exportExcel('exchanges')}>CSV</button></div>} />
        {exchanges.length === 0 ? <EmptyState icon="🔄" title="No exchanges yet" /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={th.table}>
              <thead><tr>{['Date','Order','Extra Charge','Refund Adj.','Net Impact','Note'].map(h => <th key={h} style={th.th}>{h}</th>)}</tr></thead>
              <tbody>
                {exchanges.map(e => {
                  const net = e.extraCharge - e.refundAdjustment;
                  return (
                    <tr key={e.id}>
                      <td style={{ ...th.td, fontSize: 12, color: th.muted }}>{new Date(e.createdAt).toLocaleDateString()}</td>
                      <td style={th.td}>#{e.orderId} {e.order?.customerName && <span style={{ fontSize: 11, color: th.muted }}>({e.order.customerName})</span>}</td>
                      <td style={th.td}><span style={{ color: '#10b981', fontWeight: 700 }}>{fmt(e.extraCharge)}</span></td>
                      <td style={th.td}><span style={{ color: '#ef4444', fontWeight: 700 }}>{fmt(e.refundAdjustment)}</span></td>
                      <td style={th.td}><span style={{ color: net >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>{net >= 0 ? '+' : '−'}{fmt(net)}</span></td>
                      <td style={{ ...th.td, fontSize: 12, color: th.muted }}>{e.note || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // ── ADVANCE REFUND QUEUE TAB ────────────────────────────────────────────────
  const pendingRefunds  = refundQueue.filter(r => r.refundStatus === 'pending');
  const givenRefunds    = refundQueue.filter(r => r.refundStatus === 'given');
  const totalGiven      = givenRefunds.reduce((s, r) => s + (r.refundGivenAmount || 0), 0);

  const RefundQueueTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { label: copy('Pending Refund', 'Pending Refund'), value: pendingRefunds.length, color: '#f97316', sub: copy('দেওয়া হয়নি', 'Not paid yet') },
          { label: copy('Refund দেওয়া হয়েছে', 'Refund Paid'), value: givenRefunds.length, color: '#10b981', sub: copy(`মোট ${fmt(totalGiven)}`, `Total ${fmt(totalGiven)}`) },
        ].map(c => (
          <div key={c.label} style={{ ...th.card, flex: 1, minWidth: 140, padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: th.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: c.color, margin: '4px 0 2px' }}>{c.value}</div>
            <div style={{ fontSize: 12, color: th.muted }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Pending list */}
      <div style={th.card}>
        <CardHeader th={th} title={copy('⏳ Pending — Refund দিতে হবে', '⏳ Pending Refunds')} sub={copy(`${pendingRefunds.length}টি কাস্টমার`, `${pendingRefunds.length} customers`)} />
        {pendingRefunds.length === 0
          ? <EmptyState icon="✅" title={copy('সব refund দেওয়া হয়ে গেছে', 'All refunds have been completed')} />
          : pendingRefunds.map(entry => {
              const adv = entry.order?.collections?.reduce((s: number, c: any) => s + c.amount, 0) || 0;
              const defaultAmt = Math.min(adv, entry.refundAmount);
              return (
                <div key={entry.id} style={{ ...th.card2, borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>#{entry.orderId}</span>
                    <span style={{ fontWeight: 700, fontSize: 13, color: th.text }}>{entry.order?.customerName || '—'}</span>
                    {entry.order?.phone && <span style={{ fontSize: 12, color: th.muted }}>📞 {entry.order.phone}</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: th.muted }}>{new Date(entry.createdAt).toLocaleDateString('en-BD')}</span>
                  </div>

                  {/* Items */}
                  {entry.order?.items?.length > 0 && (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                      {entry.order.items.map((it: any) => (
                        <span key={it.productCode} style={{ background: th.accentSoft, color: th.accentText, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                          {it.productCode} ×{it.qty}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Courier info */}
                  {entry.order?.courierShipment && (
                    <div style={{ fontSize: 12, color: th.muted, marginBottom: 8 }}>
                      🚚 {entry.order.courierShipment.courierName} — {entry.order.courierShipment.trackingId}
                      <span style={{ marginLeft: 8, background: '#fee2e2', color: '#dc2626', borderRadius: 4, padding: '1px 7px', fontWeight: 700, fontSize: 11 }}>
                        {entry.order.courierShipment.status}
                      </span>
                    </div>
                  )}

                  {/* Amounts */}
                  <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap', marginBottom: 12 }}>
                    <span>💰 Advance paid: <b style={{ color: '#10b981' }}>{fmt(adv)}</b></span>
                    <span>↩ Refund amount: <b style={{ color: '#f97316' }}>{fmt(entry.refundAmount)}</b></span>
                    {entry.note && <span style={{ color: th.muted, fontSize: 12 }}>📝 {entry.note}</span>}
                  </div>

                  {/* Action row */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 12, color: th.muted }}>{copy('Refund দিন:', 'Refund amount:')}</div>
                    <input type="number" min={0}
                      value={refundAmounts[entry.id] ?? String(defaultAmt)}
                      onChange={e => setRefundAmounts(a => ({ ...a, [entry.id]: e.target.value }))}
                      style={{ ...th.input, width: 110, padding: '5px 10px', fontSize: 13 }}
                      placeholder={String(defaultAmt)} />
                    <span style={{ fontSize: 12, color: th.muted }}>{cur}</span>
                    <button
                      onClick={() => handleConfirmRefund(entry.id)}
                      disabled={confirmingId === entry.id}
                      style={{ ...th.btnPrimary, fontSize: 12, padding: '6px 16px', background: '#10b981' }}>
                      {confirmingId === entry.id ? <Spinner size={12} color="#fff"/> : copy('✅ Confirm Refund', 'Confirm Refund')}
                    </button>
                    <button
                      onClick={() => handleSkipRefund(entry.id)}
                      disabled={confirmingId === entry.id}
                      style={{ ...th.btnGhost, fontSize: 12, padding: '6px 12px', color: th.muted }}>
                      Skip
                    </button>
                  </div>
                </div>
              );
            })
        }
      </div>

      {/* Given refunds history */}
      {givenRefunds.length > 0 && (
        <div style={th.card}>
          <CardHeader th={th} title={copy('✅ দেওয়া হয়েছে', '✅ Paid Refunds')} sub={copy(`মোট: ${fmt(totalGiven)}`, `Total: ${fmt(totalGiven)}`)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {givenRefunds.map(entry => (
              <div key={entry.id} style={{ ...th.card2, borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700 }}>#{entry.orderId}</span>
                <span style={{ color: th.text }}>{entry.order?.customerName || '—'}</span>
                {entry.order?.phone && <span style={{ fontSize: 12, color: th.muted }}>📞 {entry.order.phone}</span>}
                <span style={{ marginLeft: 'auto', background: '#d1fae5', color: '#065f46', borderRadius: 5, padding: '2px 10px', fontWeight: 700, fontSize: 12 }}>
                  {copy(`✅ ${fmt(entry.refundGivenAmount || 0)} দেওয়া হয়েছে`, `✅ ${fmt(entry.refundGivenAmount || 0)} paid`)}
                </span>
                <span style={{ fontSize: 11, color: th.muted }}>
                  {entry.refundGivenAt ? new Date(entry.refundGivenAt).toLocaleDateString('en-BD') : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ── REPORTS TAB ────────────────────────────────────────────────────────────
  const QUICK_PRESETS = [
    { label: copy('আজ', 'Today'),        days: 1  },
    { label: copy('শেষ ২ দিন', 'Last 2 days'), days: 2  },
    { label: copy('শেষ ৩ দিন', 'Last 3 days'), days: 3  },
    { label: copy('শেষ ৫ দিন', 'Last 5 days'), days: 5  },
    { label: copy('শেষ ৭ দিন', 'Last 7 days'), days: 7  },
    { label: copy('শেষ ১৪ দিন', 'Last 14 days'),days: 14 },
    { label: copy('শেষ ৩০ দিন', 'Last 30 days'),days: 30 },
  ];

  const ReportsTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={th.card}>
        <CardHeader th={th} title={copy('📋 Custom Report', '📋 Custom Report')} sub={copy('যেকোনো তারিখ রেঞ্জের রিপোর্ট তৈরি করুন', 'Generate reports for any date range')} />

        {/* Quick presets */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Quick Select</div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {QUICK_PRESETS.map(({ label, days }) => (
              <button key={days} onClick={() => { setReportDays(days); loadReport(days); }}
                style={{ ...th.btn, fontSize: 12, padding: '6px 12px',
                  ...(reportDays === days ? { background: th.accent, color: '#fff', border: 'none' } : {}) }}>
                {label}
              </button>
            ))}
            <button onClick={() => { setReportDays(null); setReportData(null); }}
              style={{ ...th.btn, fontSize: 12, padding: '6px 12px',
                ...(reportDays === null ? { background: '#7c3aed', color: '#fff', border: 'none' } : {}) }}>
              📅 Custom
            </button>
          </div>
        </div>

        {/* Custom date range */}
        {reportDays === null && (
          <div style={{ ...th.card2, padding: '14px 16px', borderRadius: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{copy('তারিখ নির্বাচন করুন', 'Select dates')}</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, color: th.muted, marginBottom: 4 }}>From</div>
                <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)}
                  style={{ ...th.input, fontSize: 13, padding: '6px 10px', width: 150 }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: th.muted, marginBottom: 4 }}>To</div>
                <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)}
                  style={{ ...th.input, fontSize: 13, padding: '6px 10px', width: 150 }} />
              </div>
              <button onClick={() => loadReport(null, reportFrom, reportTo)} disabled={!reportFrom || !reportTo || reportLoading}
                style={{ ...th.btnPrimary, fontSize: 13, padding: '7px 18px', background: '#7c3aed' }}>
                {reportLoading ? <Spinner size={13} color="#fff"/> : copy('🔍 Generate', 'Generate')}
              </button>
            </div>
          </div>
        )}

        {/* Export section */}
        <div style={{ ...th.card2, padding: '12px 14px', borderRadius: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>📤 {copy('Export', 'Export')}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={{ ...th.btnPrimary, fontSize: 12, padding: '7px 14px', background: '#16a34a' }}
              onClick={downloadAllExcel} disabled={exporting}>
              {exporting ? <><Spinner size={12} color="#fff"/> {copy('Loading...', 'Loading...')}</> : copy('📊 Excel (সব data)', 'Excel (all data)')}
            </button>
            <button style={{ ...th.btnPrimary, fontSize: 12, padding: '7px 14px', background: '#1e40af' }}
              onClick={printFullReport} disabled={exporting}>
              {exporting ? <><Spinner size={12} color="#fff"/> {copy('Loading...', 'Loading...')}</> : copy('🖨️ PDF (সব data)', 'PDF (all data)')}
            </button>
            <div style={{ width: 1, background: th.border, margin: '0 4px' }} />
            <button style={{ ...th.btnSmGhost, fontSize: 11.5 }} onClick={downloadCollectionsXls}>📊 Collections</button>
            <button style={{ ...th.btnSmGhost, fontSize: 11.5 }} onClick={downloadExpensesXls}>📊 Expenses</button>
            <button style={{ ...th.btnSmGhost, fontSize: 11.5 }} onClick={downloadReturnsXls}>📊 Returns</button>
            <button style={{ ...th.btnSmGhost, fontSize: 11.5 }} onClick={downloadExchangesXls}>📊 Exchanges</button>
          </div>
        </div>

        {reportLoading ? <div style={{ textAlign: 'center', padding: 40 }}><Spinner size={24}/></div>
        : reportData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ ...th.card2, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div><div style={{ fontSize: 11, color: th.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Period</div><div style={{ fontWeight: 800, marginTop: 3 }}>{reportData.label}</div></div>
              <div><div style={{ fontSize: 11, color: th.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revenue</div><div style={{ fontWeight: 800, color: th.accent, marginTop: 3 }}>{fmt(reportData.overview.estimatedRevenue)}</div></div>
              <div><div style={{ fontSize: 11, color: th.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Collected</div><div style={{ fontWeight: 800, color: '#10b981', marginTop: 3 }}>{fmt(reportData.overview.totalCollection)}</div></div>
              <div><div style={{ fontSize: 11, color: th.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Expenses</div><div style={{ fontWeight: 800, color: '#f97316', marginTop: 3 }}>{fmt(reportData.overview.totalExpenses)}</div></div>
              <div><div style={{ fontSize: 11, color: th.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Profit</div><div style={{ fontWeight: 800, color: reportData.overview.estimatedNetProfit >= 0 ? '#10b981' : '#ef4444', marginTop: 3 }}>{fmt(reportData.overview.estimatedNetProfit)}</div></div>
              <div><div style={{ fontSize: 11, color: th.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Orders</div><div style={{ fontWeight: 800, marginTop: 3 }}>{reportData.overview.confirmedOrders}</div></div>
            </div>
            {reportData.trend?.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: th.muted, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trend</div>
                <BarChart data={reportData.trend as any} keys={['revenue','collection','expense']} colors={['#5b63f5','#10b981','#f97316']} height={110} />
              </div>
            )}
          </div>
        ) : <EmptyState icon="📋" title="Select a period and click Refresh" />}
      </div>
    </div>
  );

  // ── PARTIAL ITEMS MODAL ─────────────────────────────────────────────────────
  const PartialItemsModal = () => {
    if (!partialEntry) return null;
    const items = partialEntry.order?.items || [];
    const refundTotal = partialItems
      .filter(p => p.selected)
      .reduce((s, p) => {
        const item = items.find(i => i.id === p.id);
        return s + (item ? item.unitPrice * item.qty : 0);
      }, 0);

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ background: th.panel, borderRadius: 16, padding: 24, maxWidth: 500, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', border: `1.5px solid ${th.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{copy('⚠️ ফেরত আসা পণ্য নির্বাচন', '⚠️ Select Returned Items')}</div>
              <div style={{ fontSize: 12, color: th.muted, marginTop: 2 }}>Order #{partialEntry.orderId} — {partialEntry.order?.customerName || '—'}</div>
            </div>
            <button style={{ ...th.btnGhost, padding: '4px 10px', fontSize: 18 }} onClick={() => setPartialEntry(null)}>✕</button>
          </div>

          {items.length === 0 ? (
            <div style={{ color: th.muted, textAlign: 'center', padding: 20 }}>{copy('কোনো আইটেম পাওয়া যায়নি', 'No items found')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {items.map(item => {
                const state = partialItems.find(p => p.id === item.id);
                if (!state) return null;
                return (
                  <div key={item.id} style={{ ...th.card2, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', opacity: state.selected ? 1 : 0.6 }}>
                    <input type="checkbox" checked={state.selected} style={{ width: 16, height: 16, cursor: 'pointer' }}
                      onChange={e => setPartialItems(prev => prev.map(p => p.id === item.id ? { ...p, selected: e.target.checked } : p))} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{item.productCode}</div>
                      <div style={{ fontSize: 12, color: th.muted }}>× {item.qty} — {fmt(item.unitPrice * item.qty)}</div>
                    </div>
                    {state.selected && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: th.muted }}>Restock:</span>
                        <button style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: `1px solid ${state.restock ? '#10b981' : th.border}`, cursor: 'pointer', fontFamily: 'inherit',
                          background: state.restock ? '#d1fae5' : 'transparent', color: state.restock ? '#065f46' : th.muted }}
                          onClick={() => setPartialItems(prev => prev.map(p => p.id === item.id ? { ...p, restock: true } : p))}>{copy('✅ হ্যাঁ', '✅ Yes')}</button>
                        <button style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: `1px solid ${!state.restock ? '#ef4444' : th.border}`, cursor: 'pointer', fontFamily: 'inherit',
                          background: !state.restock ? '#fee2e2' : 'transparent', color: !state.restock ? '#991b1b' : th.muted }}
                          onClick={() => setPartialItems(prev => prev.map(p => p.id === item.id ? { ...p, restock: false } : p))}>{copy('❌ না', '❌ No')}</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ ...th.card2, borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: th.muted }}>{copy('মোট রিফান্ড:', 'Total refund:')}</span>
            <span style={{ fontWeight: 800, fontSize: 18, color: '#ef4444' }}>{fmt(refundTotal)}</span>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button style={th.btnGhost} onClick={() => setPartialEntry(null)}>{copy('বাতিল', 'Cancel')}</button>
            <button style={{ ...th.btnPrimary, background: '#f97316' }} onClick={resolvePartialItems} disabled={partialSaving || partialItems.filter(p => p.selected).length === 0}>
              {partialSaving ? <><Spinner size={13} color="#fff"/> {copy('Saving...', 'Saving...')}</> : copy('✅ Confirm করুন', 'Confirm')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {preset?.label && (
        <div style={{ ...th.card, padding: '10px 12px', fontSize: 12.5, color: th.textSub }}>
          {copy('এখন দেখানো হচ্ছে:', 'Now showing:')} <strong style={{ color: th.text }}>{preset.label}</strong>
        </div>
      )}
      <TabBar />
      {tab === 'overview'    && <OverviewTab />}
      {tab === 'collections' && <CollectionsTab />}
      {tab === 'expenses'    && <ExpensesTab />}
      {tab === 'returns'     && <ReturnsTab />}
      {tab === 'exchanges'    && <ExchangesTab />}
      {tab === 'refund_queue' && <RefundQueueTab />}
      {tab === 'reports'      && <ReportsTab />}
      <PartialItemsModal />
    </div>
  );
}
