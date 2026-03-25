import { useCallback, useEffect, useRef, useState } from 'react';
import { Spinner } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';

// ── Animated counter ──────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 800, key: any) {
  const [val, setVal] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * e));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, key]);
  return val;
}

// ── Stat card with animation ──────────────────────────────────────────────────
function StatCard({ th, icon, label, value, prev, growth, color, currency = '', animKey }: {
  th: Theme; icon: string; label: string; value: number; prev?: number;
  growth?: { pct: number; direction: string }; color: string;
  currency?: string; animKey: any;
}) {
  const animated = useCountUp(Math.round(Number(value) || 0), 800, animKey);
  const up   = growth?.direction === 'up';
  const down = growth?.direction === 'down';

  return (
    <div style={{
      background: th.panel, border: `1px solid ${th.border}`,
      borderRadius: 14, padding: '18px 20px',
      boxShadow: th.shadow, position: 'relative', overflow: 'hidden',
    }}>
      {/* Accent glow */}
      <div style={{ position:'absolute', top:-24, right:-16, width:72, height:72, borderRadius:'50%', background:`${color}20`, pointerEvents:'none' }}/>

      <div style={{ fontSize: 18, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color, letterSpacing:'-0.05em', lineHeight:1 }}>
        {currency}{animated.toLocaleString()}
      </div>
      <div style={{ fontSize: 11, color: th.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', marginTop:5 }}>
        {label}
      </div>

      {growth && (
        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:10 }}>
          <span style={{
            padding:'2px 8px', borderRadius:20, fontSize:11.5, fontWeight:700,
            background: up ? '#dcfce7' : down ? '#fee2e2' : '#f3f4f6',
            color: up ? '#16a34a' : down ? '#ef4444' : '#6b7280',
          }}>
            {up ? '↑' : down ? '↓' : '→'} {Math.abs(Number(growth.pct) || 0)}%
          </span>
          {prev !== undefined && (
            <span style={{ fontSize:11, color:th.muted }}>
              vs {currency}{Math.round(Number(prev) || 0).toLocaleString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Animated bar ──────────────────────────────────────────────────────────────
function Bar({ pct, color, delay = 0 }: { pct: number; color: string; delay?: number }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct), delay + 100); return () => clearTimeout(t); }, [pct, delay]);
  return (
    <div style={{ height:6, background:'rgba(0,0,0,0.06)', borderRadius:999, overflow:'hidden', flex:1 }}>
      <div style={{ height:'100%', width:`${w}%`, background:color, borderRadius:999, transition:'width .7s cubic-bezier(.4,0,.2,1)' }}/>
    </div>
  );
}

// ── Streak dots ───────────────────────────────────────────────────────────────
function StreakCard({ th, streak }: { th: Theme; streak: any }) {
  const { copy } = useLanguage();
  const [pulse, setPulse] = useState(false);
  useEffect(() => { const t = setInterval(() => setPulse(p => !p), 1400); return () => clearInterval(t); }, []);
  const n = streak.currentStreak || 0;
  const streakMessage =
    n >= 7
      ? copy('🔥 অসাধারণ! টানা ৭ দিন অর্ডার এসেছে!', '🔥 Amazing work. Orders have come in for 7 days straight!')
      : n >= 3
        ? copy('✨ দারুণ চলছে, এই ধারাটা ধরে রাখুন!', '✨ Great momentum. Keep the streak going!')
        : n >= 1
          ? copy('💪 ভালো শুরু, আজও অর্ডার আনার চেষ্টা চালান!', '💪 Nice start. Let’s keep the orders coming today as well!')
          : copy('📦 আজ নতুন অর্ডার দিয়ে streak শুরু হোক!', '📦 Let today be the start of a new order streak!');
  const activeDaysLabel = copy(
    `এই মাসে ${streak.totalActiveDays} দিন অর্ডার এসেছে`,
    `${streak.totalActiveDays} active days this month`,
  );

  return (
    <div style={{ background:th.panel, border:`1px solid ${th.border}`, borderRadius:14, padding:'18px 20px', boxShadow:th.shadow }}>
      <div style={{ fontSize:11, fontWeight:700, color:th.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:14 }}>
        {copy('Order Streak', 'Order Streak')}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:16 }}>
        <div style={{
          fontSize:48, fontWeight:900, lineHeight:1,
          color: n >= 7 ? '#ef4444' : n >= 3 ? '#f97316' : th.accent,
          transform: pulse && n > 0 ? 'scale(1.06)' : 'scale(1)',
          transition:'transform .3s',
        }}>{n}</div>
        <div>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:3 }}>{streakMessage}</div>
          <div style={{ fontSize:12, color:th.muted }}>{copy('টানা সক্রিয় দিন', 'consecutive active days')}</div>
          <div style={{ display:'flex', gap:4, marginTop:8 }}>
            {Array.from({length:7}).map((_,i) => (
              <div key={i} style={{
                width:20, height:20, borderRadius:6, fontSize:11,
                display:'flex', alignItems:'center', justifyContent:'center',
                background: i < Math.min(n,7) ? (n>=7?'#fef3c7':n>=3?'#fff7ed':'#eef2ff') : th.surface,
                transition:`all ${0.08+i*0.05}s`,
              }}>
                {i < Math.min(n,7) ? (n>=7?'🔥':n>=3?'✦':'·') : '·'}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ fontSize:11.5, color:th.muted, marginTop:10 }}>
        {activeDaysLabel}
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHead({ label }: { label: string }) {
  return (
    <div style={{ fontSize:10.5, fontWeight:700, color:'rgba(128,128,128,0.6)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10, marginTop:4 }}>
      {label}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function MotivationPage({ th, pageId, onToast, onOpenAgentTasks, onOpenOrders }: {
  th: Theme; pageId: number; onToast: (m: string, t?: any) => void;
  onOpenAgentTasks?: () => void;
  onOpenOrders?: (preset: any) => void;
}) {
  const { copy, language } = useLanguage();
  const { request } = useApi();
  const [data, setData]               = useState<any>(null);
  const [senderCount, setSenderCount] = useState<number | null>(null);
  const [loading, setLoading]         = useState(false);
  const [animKey, setAnimKey]         = useState(0);

  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const [d, sc] = await Promise.all([
        request<any>(`${API_BASE}/client-dashboard/${pageId}/analytics/motivation`),
        request<any>(`${API_BASE}/client-dashboard/${pageId}/sender-count`),
      ]);
      setData(d); setSenderCount(sc?.uniqueSenders ?? null); setAnimKey(k => k + 1);
    } catch (e: any) { setLoadError(e.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, [pageId]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', padding:80 }}>
      <Spinner size={24} color={th.accent}/>
    </div>
  );
  if (!data) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:80, gap:16 }}>
      <div style={{ fontSize:40, opacity:.4 }}>📊</div>
      {loadError && (
        <div style={{ fontSize:12, color:'#ef4444', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'8px 16px', maxWidth:400, textAlign:'center' }}>
          {loadError}
        </div>
      )}
      {!loadError && (
        <div style={{ fontSize:13, color:th.muted, textAlign:'center' }}>
          {copy('এখনো কোনো ডেটা নেই। Facebook Page connect করুন এবং orders আসলে এখানে দেখাবে।', 'No data yet. Connect your Facebook Page and data will appear once orders come in.')}
        </div>
      )}
      <button onClick={load} style={{ padding:'8px 20px', borderRadius:8, border:`1px solid ${th.border}`, background:'transparent', color:th.text, cursor:'pointer', fontSize:13 }}>
        {copy('🔄 Reload', '🔄 Reload')}
      </button>
    </div>
  );

  const { week, month, topBuyers, bestProducts, orderStreak } = data;
  const todayCalls = data.todayCalls || {
    total: 0,
    answered: 0,
    notAnswered: 0,
    failed: 0,
    inProgress: 0,
    avgDurationSeconds: 0,
  };
  const automation = data.automation || {
    totalTracked: 0,
    botHandled: 0,
    needsAgent: 0,
    botHandledPct: 100,
    needsAgentPct: 0,
    workCounts: {
      messagesHandled: 0,
      ordersHandled: 0,
      callsHandled: 0,
      memoReady: 0,
      courierBooked: 0,
      followUpsScheduled: 0,
    },
    taskCounts: {
      notAnswered: 0,
      needsAgent: 0,
      failedCalls: 0,
      paymentApproval: 0,
      pendingProof: 0,
      issueOrders: 0,
      printReady: 0,
      courierBookingPending: 0,
      followUpPending: 0,
      memoTemplateDraft: 0,
      refundPending: 0,
    },
  };
  const cur = '৳';
  const timeLocale = language === 'en' ? 'en-US' : 'bn-BD';
  const numberLocale = language === 'en' ? 'en-US' : 'bn-BD';
  const maxRev   = Math.max(...(bestProducts||[]).map((p:any) => p.revenue), 1);
  const maxSpent = Math.max(...(topBuyers||[]).map((b:any) => b.totalSpent), 1);
  const PROD_COLORS = ['#4f46e5','#0891b2','#7c3aed','#059669','#dc2626'];
  const BUYER_COLORS = ['#f59e0b','#9ca3af','#b45309','#6b7280','#6b7280'];
  const MEDALS = ['🥇','🥈','🥉','④','⑤'];
  const queueItems = [
    {
      value: automation.taskCounts.notAnswered,
      bn: 'কল ধরেনি',
      en: 'Not Answered',
      color: '#6b7280',
      preset: { callFilter: 'NOT_ANSWERED', label: 'Not Answered Calls' },
    },
    {
      value: automation.taskCounts.needsAgent,
      bn: 'Agent চায়',
      en: 'Needs Agent',
      color: '#d97706',
      preset: { callFilter: 'NEEDS_AGENT', label: 'Needs Agent Calls' },
    },
    {
      value: automation.taskCounts.paymentApproval,
      bn: 'Payment approval',
      en: 'Payment Approval',
      color: '#b45309',
      preset: { paymentFilter: 'agent_required', label: 'Payment Approval Pending' },
    },
    {
      value: automation.taskCounts.printReady,
      bn: 'মেমো / প্রিন্ট Ready',
      en: 'Memo / Print Ready',
      color: '#2563eb',
      preset: { status: 'CONFIRMED', label: 'Confirmed Orders Ready for Print' },
    },
    {
      value: automation.taskCounts.courierBookingPending,
      bn: 'Courier booking pending',
      en: 'Courier Booking Pending',
      color: '#ea580c',
      preset: { status: 'CONFIRMED', label: 'Confirmed Orders Pending Courier Booking' },
    },
    {
      value: automation.taskCounts.followUpPending,
      bn: 'Follow-up pending',
      en: 'Follow-up Pending',
      color: '#0f766e',
      preset: { status: 'ALL', label: 'Pending Follow-ups' },
    },
    {
      value: automation.taskCounts.pendingProof,
      bn: 'Payment proof review',
      en: 'Pending Proof Review',
      color: '#7c3aed',
      preset: { paymentFilter: 'pending_proof', label: 'Pending Proof Review' },
    },
    {
      value: automation.taskCounts.issueOrders,
      bn: 'Issue orders',
      en: 'Issue Orders',
      color: '#ef4444',
      preset: { status: 'ISSUE', label: 'Issue Orders' },
    },
    {
      value: automation.taskCounts.refundPending,
      bn: 'Refund pending',
      en: 'Refund Pending',
      color: '#f97316',
      preset: { status: 'ALL', label: 'Pending Refunds' },
    },
  ].filter((item) => item.value > 0);
  const queueTaskTotal = queueItems.reduce((sum, item) => sum + item.value, 0);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

      {/* Page header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:'-0.04em', margin:0 }}>Overview</h1>
          <p style={{ fontSize:13, color:th.muted, margin:'3px 0 0' }}>
            {copy('Business performance at a glance', 'Business performance at a glance')}
          </p>
        </div>
        <button style={{ ...th.btnGhost, display:'flex', alignItems:'center', gap:6 }} onClick={load}>
          {loading ? <Spinner size={13}/> : '↺'} {copy('Refresh', 'Refresh')}
        </button>
      </div>

      {/* ── Unique Senders ───────────────────────────────────────────── */}
      {senderCount !== null && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(168px,1fr))', gap:12 }}>
          <StatCard th={th} icon="👥" label={copy('Unique Messengers', 'Unique Messengers')} value={senderCount}
            color="#0891b2" animKey={animKey}/>
        </div>
      )}

      <div>
        <SectionHead label={copy('আজকের Calling Report', "Today's Calling Report")}/>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(168px,1fr))', gap:12 }}>
          <StatCard
            th={th}
            icon="📞"
            label={copy('আজ মোট Call', 'Calls Today')}
            value={todayCalls.total}
            color="#2563eb"
            animKey={animKey}
          />
          <StatCard
            th={th}
            icon="✅"
            label={copy('Call ধরেছে', 'Answered')}
            value={todayCalls.answered}
            color="#16a34a"
            animKey={animKey}
          />
          <StatCard
            th={th}
            icon="📵"
            label={copy('Call ধরেনি', 'Not Answered')}
            value={todayCalls.notAnswered}
            color="#6b7280"
            animKey={animKey}
          />
          <StatCard
            th={th}
            icon="⏱️"
            label={copy('গড় Call Time (sec)', 'Avg Call Time (sec)')}
            value={todayCalls.avgDurationSeconds}
            color="#7c3aed"
            animKey={animKey}
          />
        </div>
        {(todayCalls.failed > 0 || todayCalls.inProgress > 0) && (
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:10, fontSize:12.5, color:th.muted }}>
            <span>{copy(`Failed: ${todayCalls.failed}`, `Failed: ${todayCalls.failed}`)}</span>
            <span>{copy(`In progress: ${todayCalls.inProgress}`, `In progress: ${todayCalls.inProgress}`)}</span>
          </div>
        )}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1.15fr 1fr', gap:14 }}>
        <div style={{ background:th.panel, border:`1px solid ${th.border}`, borderRadius:14, padding:'18px 20px', boxShadow:th.shadow }}>
          <div style={{ fontSize:11, fontWeight:700, color:th.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:14 }}>
            {copy('Bot vs Agent Workload', 'Bot vs Agent Workload')}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:18, flexWrap:'wrap' }}>
            <div style={{
              width: 108,
              height: 108,
              borderRadius: '50%',
              background: `conic-gradient(#16a34a 0 ${automation.botHandledPct}%, #f59e0b ${automation.botHandledPct}% 100%)`,
              display:'grid',
              placeItems:'center',
              flexShrink: 0,
            }}>
              <div style={{
                width: 76,
                height: 76,
                borderRadius:'50%',
                background: th.panel,
                border:`1px solid ${th.border}`,
                display:'grid',
                placeItems:'center',
              }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:20, fontWeight:900, lineHeight:1 }}>{automation.botHandledPct}%</div>
                  <div style={{ fontSize:10.5, color:th.muted, marginTop:4 }}>{copy('Bot Done', 'Bot Done')}</div>
                </div>
              </div>
            </div>
            <div style={{ flex:1, minWidth: 220 }}>
              <div style={{ fontWeight:800, fontSize:15 }}>
                {copy('Bot already major কাজ handle করছে', 'The bot is already handling the majority of the work')}
              </div>
              <div style={{ fontSize:12.5, color:th.muted, marginTop:6, lineHeight:1.6 }}>
                {copy(
                  `${automation.botHandled}টি order flow bot handle করেছে, আর queue-তে ${queueTaskTotal}টি manual কাজ আছে.`,
                  `The bot handled ${automation.botHandled} order flows, and there are ${queueTaskTotal} manual tasks waiting in the queue.`,
                )}
              </div>
              <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginTop:10, fontSize:12.5 }}>
                <span style={{ color:'#16a34a', fontWeight:700 }}>{copy(`Bot handled: ${automation.botHandled}`, `Bot handled: ${automation.botHandled}`)}</span>
                <span style={{ color:'#f59e0b', fontWeight:700 }}>{copy(`Queue tasks: ${queueTaskTotal}`, `Queue tasks: ${queueTaskTotal}`)}</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:8, marginTop:14 }}>
                {[
                  { label: copy('Messages', 'Messages'), value: automation.workCounts.messagesHandled, color: '#0891b2' },
                  { label: copy('Orders', 'Orders'), value: automation.workCounts.ordersHandled, color: '#2563eb' },
                  { label: copy('Calls', 'Calls'), value: automation.workCounts.callsHandled, color: '#16a34a' },
                  { label: copy('Memo Ready', 'Memo Ready'), value: automation.workCounts.memoReady, color: '#7c3aed' },
                  { label: copy('Courier Booked', 'Courier Booked'), value: automation.workCounts.courierBooked, color: '#ea580c' },
                  { label: copy('Follow-ups', 'Follow-ups'), value: automation.workCounts.followUpsScheduled, color: '#0f766e' },
                ].map(item => (
                  <div key={item.label} style={{ padding:'9px 10px', borderRadius:10, border:`1px solid ${item.color}26`, background:`${item.color}10` }}>
                    <div style={{ fontSize:11, color:th.muted }}>{item.label}</div>
                    <div style={{ fontSize:18, fontWeight:800, color:item.color, marginTop:4 }}>{item.value.toLocaleString(numberLocale)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ background:th.panel, border:`1px solid ${th.border}`, borderRadius:14, padding:'18px 20px', boxShadow:th.shadow }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:th.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>
              {copy('Agent Queue', 'Agent Queue')}
            </div>
            {onOpenAgentTasks && (
              <button style={th.btnGhost} onClick={onOpenAgentTasks}>
                {copy('Open Queue', 'Open Queue')}
              </button>
            )}
          </div>
          <div style={{ display:'grid', gap:10, marginTop:14 }}>
            {queueItems.map(item => (
              <button
                key={item.en}
                onClick={() => onOpenOrders?.(item.preset)}
                style={{
                  background:'transparent',
                  border:`1px solid ${th.border}`,
                  borderRadius:10,
                  padding:'10px 12px',
                  textAlign:'left',
                  cursor:'pointer',
                  display:'flex',
                  alignItems:'center',
                  justifyContent:'space-between',
                  gap:12,
                }}
              >
                <div>
                  <div style={{ fontWeight:700, fontSize:13.5, color:item.color }}>{copy(item.bn, item.en)}</div>
                  <div style={{ fontSize:11.5, color:th.muted, marginTop:3 }}>{copy('Click করলে filtered list খুলবে', 'Click to open the filtered list')}</div>
                </div>
                <div style={{ fontSize:22, fontWeight:900, color:item.color }}>{item.value}</div>
              </button>
            ))}
            {queueItems.length === 0 && (
              <div style={{ fontSize:12.5, color:th.muted }}>
                {copy('এখন কোনো agent queue নেই. Bot smoothভাবে কাজ করছে.', 'There is no active agent queue right now. The bot is handling things smoothly.')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Week ─────────────────────────────────────────────────────── */}
      <div>
        <SectionHead label={copy('This Week vs Last Week', 'This Week vs Last Week')}/>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(168px,1fr))', gap:12 }}>
          <StatCard th={th} icon="💰" label={copy('Net Profit', 'Net Profit')} currency={cur}
            value={week.current.netProfit} prev={week.previous.netProfit}
            growth={week.growth} color={week.growth.direction==='up'?'#16a34a':week.growth.direction==='down'?'#ef4444':th.accent}
            animKey={animKey}/>
          <StatCard th={th} icon="📦" label={copy('Orders', 'Orders')} value={week.current.confirmedOrders}
            prev={week.previous.confirmedOrders} growth={week.ordersGrowth} color="#3b82f6" animKey={animKey}/>
          <StatCard th={th} icon="💳" label={copy('Revenue', 'Revenue')} currency={cur}
            value={week.current.totalRevenue} prev={week.previous.totalRevenue}
            growth={week.revenueGrowth} color="#8b5cf6" animKey={animKey}/>
        </div>
      </div>

      {/* ── Month ────────────────────────────────────────────────────── */}
      <div>
        <SectionHead label={copy('This Month vs Last Month', 'This Month vs Last Month')}/>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(168px,1fr))', gap:12 }}>
          <StatCard th={th} icon="💰" label={copy('Net Profit', 'Net Profit')} currency={cur}
            value={month.current.netProfit} prev={month.previous.netProfit}
            growth={month.growth} color={month.growth.direction==='up'?'#16a34a':month.growth.direction==='down'?'#ef4444':th.accent}
            animKey={animKey}/>
          <StatCard th={th} icon="📦" label={copy('Orders', 'Orders')} value={month.current.confirmedOrders}
            prev={month.previous.confirmedOrders} growth={month.ordersGrowth} color="#3b82f6" animKey={animKey}/>
          <StatCard th={th} icon="💳" label={copy('Revenue', 'Revenue')} currency={cur}
            value={month.current.totalRevenue} prev={month.previous.totalRevenue}
            growth={month.revenueGrowth} color="#8b5cf6" animKey={animKey}/>
          <StatCard th={th} icon="↩️" label={copy('Returns', 'Returns')}
            value={month.current.totalReturns||0} color="#f97316" animKey={animKey}/>
        </div>
      </div>

      {/* ── Streak + Quick win ────────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <StreakCard th={th} streak={orderStreak}/>

        <div style={{ background:th.panel, border:`1px solid ${th.border}`, borderRadius:14, padding:'18px 20px', boxShadow:th.shadow }}>
          <div style={{ fontSize:11, fontWeight:700, color:th.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:14 }}>
            {copy("This Month's Best", "This Month's Best")}
          </div>
          {bestProducts[0] && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, color:th.muted, marginBottom:4 }}>{copy('Top Product', 'Top Product')}</div>
              <div style={{ fontWeight:800, fontSize:15, color:th.accent, letterSpacing:'-0.02em' }}>
                {bestProducts[0].name || bestProducts[0].code}
              </div>
              <div style={{ fontSize:12.5, color:th.muted, marginTop:2 }}>
                {bestProducts[0].qty.toLocaleString(numberLocale)} {copy('টি বিক্রি', 'sold')} · {cur}{Math.round(bestProducts[0].revenue).toLocaleString(numberLocale)}
              </div>
            </div>
          )}
          {topBuyers[0] && (
            <div>
              <div style={{ fontSize:11, color:th.muted, marginBottom:4 }}>{copy('Top Customer', 'Top Customer')}</div>
              <div style={{ fontWeight:800, fontSize:15, color:'#16a34a', letterSpacing:'-0.02em' }}>
                {topBuyers[0].name}
              </div>
              <div style={{ fontSize:12.5, color:th.muted, marginTop:2 }}>
                {topBuyers[0].totalOrders.toLocaleString(numberLocale)} {copy('টি অর্ডার', 'orders')} · {cur}{Math.round(topBuyers[0].totalSpent).toLocaleString(numberLocale)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Best Products ─────────────────────────────────────────────── */}
      {bestProducts.length > 0 && (
        <div style={{ background:th.panel, border:`1px solid ${th.border}`, borderRadius:14, padding:'20px 22px', boxShadow:th.shadow }}>
          <div style={{ fontSize:13, fontWeight:700, letterSpacing:'-0.02em', marginBottom:18 }}>
            {copy('Best Selling Products - This Month', 'Best Selling Products - This Month')}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {bestProducts.map((p:any, i:number) => (
              <div key={p.code} style={{ display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:16, width:22, flexShrink:0 }}>{MEDALS[i]||''}</span>
                <div style={{ width:130, flexShrink:0 }}>
                  <div style={{ fontWeight:700, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {p.name||p.code}
                  </div>
                  <div style={{ fontSize:11, color:th.muted }}>{p.qty.toLocaleString(numberLocale)} {copy('পিস', 'pcs')}</div>
                </div>
                <Bar pct={Math.round((p.revenue/maxRev)*100)} color={PROD_COLORS[i%5]} delay={i*60}/>
                <div style={{ fontSize:13, fontWeight:800, color:PROD_COLORS[i%5], width:80, textAlign:'right', flexShrink:0, fontVariantNumeric:'tabular-nums' }}>
                  {cur}{Math.round(p.revenue).toLocaleString(numberLocale)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Top Buyers ───────────────────────────────────────────────── */}
      {topBuyers.length > 0 && (
        <div style={{ background:th.panel, border:`1px solid ${th.border}`, borderRadius:14, padding:'20px 22px', boxShadow:th.shadow }}>
          <div style={{ fontSize:13, fontWeight:700, letterSpacing:'-0.02em', marginBottom:18 }}>
            {copy('Top Customers - All Time', 'Top Customers - All Time')}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {topBuyers.map((b:any, i:number) => (
              <div key={b.id} style={{ display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:16, width:22, flexShrink:0 }}>{i===0?'👑':MEDALS[i]}</span>
                <div style={{ width:130, flexShrink:0 }}>
                  <div style={{ fontWeight:700, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {b.name}
                  </div>
                  <div style={{ fontSize:11, color:th.muted }}>
                    {b.totalOrders.toLocaleString(numberLocale)} {copy('টি অর্ডার', 'orders')}
                    {b.thisMonthOrders > 0 && <span style={{ color:'#16a34a', marginLeft:5 }}>+{b.thisMonthOrders.toLocaleString(numberLocale)} {copy('এই মাসে', 'this month')}</span>}
                  </div>
                </div>
                <Bar pct={Math.round((b.totalSpent/maxSpent)*100)} color={BUYER_COLORS[i]} delay={i*60}/>
                <div style={{ fontSize:13, fontWeight:800, color:BUYER_COLORS[i], width:90, textAlign:'right', flexShrink:0, fontVariantNumeric:'tabular-nums' }}>
                  {cur}{Math.round(b.totalSpent).toLocaleString(numberLocale)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ textAlign:'center', fontSize:11.5, color:th.muted, paddingBottom:4 }}>
        {copy('Updated', 'Updated')} {new Date(data.generatedAt).toLocaleTimeString(timeLocale)}
      </div>
    </div>
  );
}
