import { useCallback, useEffect, useState } from 'react';
import { CardHeader, EmptyState, Field, Spinner, StatusBadge } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';

interface OrderItem { productCode: string; qty: number; unitPrice: number; }
interface Order {
  id: number; customerName: string | null; phone: string | null;
  address: string | null; status: string; source: string; callStatus: string;
  negotiationRequested: boolean; customerOfferedPrice: number | null;
  orderNote: string | null; confirmedAt: string | null; createdAt: string;
  paymentStatus: string; transactionId: string | null; paymentScreenshotUrl: string | null;
  items: OrderItem[];
  courierShipment?: { status: string; courierName: string | null } | null;
}

export interface OrdersPagePreset {
  status?: string;
  source?: string;
  paymentFilter?: string;
  callFilter?: string;
  search?: string;
  label?: string;
}

const STATUS_OPTIONS = ['ALL','RECEIVED','CONFIRMED','CANCELLED','ISSUE'];

const PAYMENT_FILTERS: { key: string; label: string; color: string }[] = [
  { key: 'ALL',           label: 'সব Payment',      color: '#6366f1' },
  { key: 'not_required',  label: 'COD',              color: '#6b7280' },
  { key: 'advance_paid',  label: 'Advance Paid ✅',  color: '#16a34a' },
  { key: 'agent_required',label: 'Agent Required ⚠️', color: '#b45309' },
  { key: 'pending_proof', label: 'Pending Proof',    color: '#7c3aed' },
];

const CALL_FILTERS: { key: string; bn: string; en: string; color: string }[] = [
  { key: 'ALL', bn: 'সব Call', en: 'All Calls', color: '#6366f1' },
  { key: 'NOT_ANSWERED', bn: 'Not Answered', en: 'Not Answered', color: '#6b7280' },
  { key: 'NEEDS_AGENT', bn: 'Agent লাগবে', en: 'Needs Agent', color: '#d97706' },
  { key: 'PENDING_CALL', bn: 'Queued', en: 'Queued', color: '#ca8a04' },
  { key: 'CALL_FAILED', bn: 'Failed', en: 'Failed', color: '#dc2626' },
  { key: 'CONFIRMED_BY_CALL', bn: 'Call Confirmed', en: 'Call Confirmed', color: '#16a34a' },
];

function PaymentBadge({ paymentStatus }: { paymentStatus: string }) {
  const cfg: Record<string, { label: string; color: string }> = {
    not_required:   { label: 'COD',             color: '#6b7280' },
    advance_paid:   { label: '✅ Advance Paid',  color: '#16a34a' },
    agent_required: { label: '⚠️ Agent Confirm', color: '#b45309' },
    pending_proof:  { label: '⏳ Pending Proof', color: '#7c3aed' },
  };
  const c = cfg[paymentStatus] || cfg['not_required'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
      background: c.color + '18', color: c.color, border: `1px solid ${c.color}30`,
    }}>
      {c.label}
    </span>
  );
}

const SOURCES: { key: string; label: string; icon: string; color: string }[] = [
  { key: 'ALL',       label: 'সব',        icon: '📋', color: '#6366f1' },
  { key: 'FACEBOOK',  label: 'Facebook',  icon: '📘', color: '#1877f2' },
  { key: 'WHATSAPP',  label: 'WhatsApp',  icon: '💬', color: '#25d366' },
  { key: 'INSTAGRAM', label: 'Instagram', icon: '📸', color: '#e1306c' },
  { key: 'PHONE',     label: 'Phone',     icon: '📞', color: '#f59e0b' },
  { key: 'MANUAL',    label: 'Manual',    icon: '✏️',  color: '#8b5cf6' },
];

function SourceBadge({ source }: { source: string }) {
  const s = SOURCES.find(x => x.key === (source || 'FACEBOOK').toUpperCase()) || SOURCES[1];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
      background: s.color + '18', color: s.color, border: `1px solid ${s.color}30`,
    }}>
      {s.icon} {s.label}
    </span>
  );
}

// ── Manual Order Modal ────────────────────────────────────────────────────────
interface ManualOrderForm {
  customerName: string; phone: string; address: string;
  orderNote: string; source: string;
  items: { productCode: string; qty: number; unitPrice: number }[];
}
const EMPTY_FORM: ManualOrderForm = {
  customerName: '', phone: '', address: '', orderNote: '', source: 'WHATSAPP',
  items: [{ productCode: '', qty: 1, unitPrice: 0 }],
};

function ManualOrderModal({ th, onClose, onSave, saving }: {
  th: Theme; onClose: () => void;
  onSave: (form: ManualOrderForm) => void; saving: boolean;
}) {
  const { copy } = useLanguage();
  const [form, setForm] = useState<ManualOrderForm>(EMPTY_FORM);
  const set = (k: keyof ManualOrderForm, v: any) => setForm(f => ({ ...f, [k]: v }));
  const setItem = (i: number, k: string, v: any) => setForm(f => ({
    ...f, items: f.items.map((item, idx) => idx === i ? { ...item, [k]: v } : item),
  }));
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { productCode: '', qty: 1, unitPrice: 0 }] }));
  const removeItem = (i: number) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const total = form.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ ...th.card, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', border: `1.5px solid ${th.border}` }}>
        <CardHeader th={th} title={copy('✏️ নতুন Order যোগ করুন', '✏️ Add New Order')} sub={copy('WhatsApp, Instagram, Phone বা যেকোনো জায়গার order', 'Orders from WhatsApp, Instagram, Phone, or anywhere else')} />

        {/* Source selector */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{copy('Order এর Source', 'Order Source')}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SOURCES.filter(s => s.key !== 'ALL').map(s => (
              <button key={s.key}
                onClick={() => set('source', s.key)}
                style={{
                  padding: '7px 14px', borderRadius: 8, border: `1.5px solid ${form.source === s.key ? s.color : th.border}`,
                  background: form.source === s.key ? s.color + '18' : 'transparent',
                  color: form.source === s.key ? s.color : th.muted,
                  fontWeight: 700, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                }}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Customer info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <Field th={th} label="Customer Name">
            <input style={th.input} placeholder={copy('নাম', 'Name')} value={form.customerName} onChange={e => set('customerName', e.target.value)} />
          </Field>
          <Field th={th} label="Phone">
            <input style={th.input} placeholder="01XXXXXXXXX" value={form.phone} onChange={e => set('phone', e.target.value)} />
          </Field>
        </div>
        <Field th={th} label="Address">
          <input style={th.input} placeholder={copy('ঠিকানা', 'Address')} value={form.address} onChange={e => set('address', e.target.value)} />
        </Field>
        <div style={{ marginTop: 10 }}>
          <Field th={th} label="Note (optional)">
            <input style={th.input} placeholder={copy('কোনো বিশেষ নোট...', 'Any special note...')} value={form.orderNote} onChange={e => set('orderNote', e.target.value)} />
          </Field>
        </div>

        {/* Items */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Products</div>
          {form.items.map((item, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px 32px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <input style={{ ...th.input, padding: '8px 10px' }} placeholder="Product Code" value={item.productCode}
                onChange={e => setItem(i, 'productCode', e.target.value)} />
              <input style={{ ...th.input, padding: '8px 10px' }} type="number" min={1} placeholder="Qty" value={item.qty}
                onChange={e => setItem(i, 'qty', e.target.value)} />
              <input style={{ ...th.input, padding: '8px 10px' }} type="number" min={0} placeholder="Price" value={item.unitPrice}
                onChange={e => setItem(i, 'unitPrice', e.target.value)} />
              {form.items.length > 1
                ? <button style={{ ...th.btnSmDanger, padding: '6px 8px' }} onClick={() => removeItem(i)}>✕</button>
                : <div />
              }
            </div>
          ))}
          <button style={{ ...th.btnGhost, fontSize: 12, marginTop: 4 }} onClick={addItem}>{copy('+ Product যোগ করুন', '+ Add Product')}</button>
        </div>

        {/* Total */}
        <div style={{ marginTop: 12, padding: '10px 14px', background: th.accentSoft, borderRadius: 10, display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: th.accentText }}>
          <span>Total</span>
          <span>৳{total.toLocaleString()}</span>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button style={th.btnPrimary} onClick={() => onSave(form)} disabled={saving}>
            {saving ? <><Spinner size={13}/> {copy('Saving...', 'Saving...')}</> : copy('✓ Order Create করুন', 'Create Order')}
          </button>
          <button style={th.btnGhost} onClick={onClose}>{copy('Cancel', 'Cancel')}</button>
        </div>
      </div>
    </div>
  );
}

// ── Memo Modal ────────────────────────────────────────────────────────────────
function MemoModal({ th, orderId, pageId, onClose }: {
  th: Theme; orderId: number; pageId: number; onClose: () => void;
}) {
  const url = `${API_BASE}/memo/html?ids=${orderId}&pageId=${pageId}`;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 820, height: '85vh', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>📋 Memo Preview — Order #{orderId}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={url} target="_blank" rel="noreferrer"
              style={{ ...th.btnPrimary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              🖨️ Print / Download
            </a>
            <button style={th.btnGhost} onClick={onClose}>✕ Close</button>
          </div>
        </div>
        <iframe src={url} style={{ flex: 1, border: 'none', borderRadius: 12, background: '#fff' }} title="memo-preview" />
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function OrdersPage({ th, pageId, onToast, preset }: {
  th: Theme; pageId: number; onToast: (m: string, t?: any) => void;
  preset?: OrdersPagePreset | null;
}) {
  const { copy } = useLanguage();
  const { request } = useApi();
  const [orders, setOrders]     = useState<Order[]>([]);
  const [loading, setLoading]   = useState(false);
  const [status, setStatus]           = useState('ALL');
  const [source, setSource]           = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [callFilter, setCallFilter]   = useState('ALL');
  const [search, setSearch]           = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busy, setBusy]         = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating]     = useState(false);
  const [memoOrderId, setMemoOrderId] = useState<number | null>(null);
  const [agentIssues, setAgentIssues] = useState<(Order & { botMuted: boolean; issueType?: string; customerPsid?: string })[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [togglingBot, setTogglingBot] = useState<number | null>(null);

  interface PaymentProof {
    id: number; customerName: string | null; phone: string | null; address: string | null;
    paymentStatus: string; paymentVerifyStatus: string;
    transactionId: string | null; paymentScreenshotUrl: string | null;
    orderNote: string | null; createdAt: string;
    items: OrderItem[];
  }
  const [paymentProofs, setPaymentProofs] = useState<PaymentProof[]>([]);
  const [proofsLoading, setProofsLoading] = useState(false);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);

  interface CallQueueOrder {
    id: number; customerName: string | null; phone: string | null;
    address: string | null; status: string; callStatus: string;
    callRetryCount: number; lastCallAt: string | null; createdAt: string;
    items: OrderItem[];
  }
  const [callQueue, setCallQueue] = useState<CallQueueOrder[]>([]);
  const [callQueueLoading, setCallQueueLoading] = useState(false);
  const [loggingCallId, setLoggingCallId] = useState<number | null>(null);

  const BASE = `${API_BASE}/client-dashboard/${pageId}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${BASE}/orders?status=${status}`;
      if (source !== 'ALL') url += `&source=${source}`;
      if (paymentFilter !== 'ALL') url += `&paymentStatus=${paymentFilter}`;
      const data = await request<Order[]>(url);
      setOrders(data); setSelected(new Set());
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [pageId, status, source, paymentFilter]);

  useEffect(() => { load(); }, [load]);

  const loadAgentIssues = useCallback(async () => {
    setIssuesLoading(true);
    try {
      const data = await request<(Order & { botMuted: boolean })[]>(`${BASE}/orders/agent-issues`);
      setAgentIssues(data);
    } catch { /* silent */ }
    finally { setIssuesLoading(false); }
  }, [pageId]);

  useEffect(() => { loadAgentIssues(); }, [loadAgentIssues]);

  const loadPaymentProofs = useCallback(async () => {
    setProofsLoading(true);
    try {
      const data = await request<PaymentProof[]>(`${API_BASE}/orders/payment-proofs?pageId=${pageId}`);
      setPaymentProofs(data);
    } catch { /* silent */ }
    finally { setProofsLoading(false); }
  }, [pageId]);

  useEffect(() => { loadPaymentProofs(); }, [loadPaymentProofs]);

  const loadCallQueue = useCallback(async () => {
    setCallQueueLoading(true);
    try {
      const data = await request<CallQueueOrder[]>(`${BASE}/orders/call-queue`);
      setCallQueue(data);
    } catch { /* silent */ }
    finally { setCallQueueLoading(false); }
  }, [pageId]);

  useEffect(() => { loadCallQueue(); }, [loadCallQueue]);

  const logManualCall = async (orderId: number, result: 'CONFIRMED' | 'CANCELLED' | 'NOT_ANSWERED' | 'CALLBACK_LATER') => {
    setLoggingCallId(orderId);
    try {
      await request(`${BASE}/orders/${orderId}/manual-call-log`, {
        method: 'POST',
        body: JSON.stringify({ result }),
      });
      const labels: Record<string, string> = {
        CONFIRMED: '✅ Confirmed! Order confirmed করা হয়েছে',
        CANCELLED: '❌ Cancelled! Order cancel করা হয়েছে',
        NOT_ANSWERED: '📵 Not Answered — পরে আবার call করুন',
        CALLBACK_LATER: '🔁 Callback Later — queue-এ রাখা হয়েছে',
      };
      onToast(labels[result] || '✓ Done', result === 'CONFIRMED' ? 'success' : result === 'CANCELLED' ? 'error' : 'success');
      loadCallQueue();
      load();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setLoggingCallId(null); }
  };

  const verifyPayment = async (id: number, status: 'verified' | 'verify_failed') => {
    setVerifyingId(id);
    try {
      await request(`${API_BASE}/orders/${id}/verify-payment?pageId=${pageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setPaymentProofs(prev => prev.map(p => p.id === id ? { ...p, paymentVerifyStatus: status } : p));
      onToast(status === 'verified' ? '✅ Payment verified!' : '❌ Payment rejected', status === 'verified' ? 'success' : 'error');
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setVerifyingId(null); }
  };

  const toggleBot = async (issue: { id: number | null; customerPsid?: string; botMuted: boolean }) => {
    const key = issue.id ?? -1;
    setTogglingBot(key);
    try {
      let res: { botMuted: boolean };
      if (issue.id) {
        res = await request<{ botMuted: boolean }>(`${BASE}/orders/${issue.id}/toggle-bot`, { method: 'POST' });
      } else {
        // unmatched issue — toggle by psid
        res = await request<{ botMuted: boolean }>(`${BASE}/orders/toggle-bot-psid`, {
          method: 'POST',
          body: JSON.stringify({ psid: issue.customerPsid, mute: !issue.botMuted }),
        });
      }
      setAgentIssues(prev => prev.map(o =>
        (issue.id ? o.id === issue.id : o.customerPsid === issue.customerPsid)
          ? { ...o, botMuted: res.botMuted } : o
      ));
      onToast(res.botMuted ? '🤫 Bot মিউট — আপনি handle করুন' : '🤖 Bot চালু হয়েছে', 'success');
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setTogglingBot(null); }
  };

  const dismissIssue = async (o: (typeof agentIssues)[0]) => {
    try {
      await request(`${BASE}/orders/agent-issues/dismiss`, {
        method: 'POST',
        body: JSON.stringify({
          issueType: o.issueType ?? (o.id ? 'payment' : 'unmatched'),
          orderId: o.id ?? undefined,
          psid: o.customerPsid ?? undefined,
        }),
      });
      setAgentIssues(prev => prev.filter(x =>
        o.id ? x.id !== o.id : x.customerPsid !== o.customerPsid
      ));
      onToast('✓ Issue সরানো হয়েছে', 'success');
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  useEffect(() => {
    if (!preset) return;
    setStatus(preset.status || 'ALL');
    setSource(preset.source || 'ALL');
    setPaymentFilter(preset.paymentFilter || 'ALL');
    setCallFilter(preset.callFilter || 'ALL');
    setSearch(preset.search || '');
  }, [
    preset?.status,
    preset?.source,
    preset?.paymentFilter,
    preset?.callFilter,
    preset?.search,
    preset?.label,
  ]);

  const action = async (ids: number[], act: string) => {
    setBusy(true);
    try {
      if (ids.length === 1) {
        await request(`${BASE}/orders/${ids[0]}/action`, { method: 'POST', body: JSON.stringify({ action: act }) });
      } else {
        await request(`${BASE}/orders/bulk-action`, { method: 'POST', body: JSON.stringify({ ids, action: act }) });
      }
      onToast(copy(`✓ ${act} — ${ids.length} order`, `✓ ${act} - ${ids.length} order(s)`)); setSelected(new Set()); load();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const callAction = async (orderId: number, act: 'send' | 'retry' | 'confirm' | 'cancel') => {
    setBusy(true);
    try {
      const endpoint =
        act === 'send'
          ? 'send-call'
          : act === 'retry'
            ? 'resend-call'
            : act === 'confirm'
              ? 'confirm-by-call'
              : 'cancel-by-call';
      const res: any = await request(`${BASE}/orders/${orderId}/${endpoint}`, { method: 'POST' });
      onToast(
        res?.message ||
          (act === 'send'
            ? copy('✅ Call queued', '✅ Call queued')
            : act === 'retry'
              ? copy('✅ Call retried', '✅ Call retried')
              : act === 'confirm'
                ? copy('✅ Call confirm হয়েছে', '✅ Confirmed by call')
                : copy('✅ Call cancel হয়েছে', '✅ Cancelled by call')),
        'success',
      );
      await load();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const createManualOrder = async (form: ManualOrderForm) => {
    setCreating(true);
    try {
      await request(`${BASE}/orders/manual`, { method: 'POST', body: JSON.stringify(form) });
      onToast(copy('✅ Order created!', '✅ Order created!'), 'success');
      setShowCreate(false); load();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setCreating(false); }
  };

  const copyPhone = async (phone: string | null) => {
    if (!phone) return onToast(copy('ফোন নম্বর নেই', 'No phone number'), 'error');
    try {
      await navigator.clipboard.writeText(phone);
      onToast(copy('✅ নম্বর কপি হয়েছে', '✅ Number copied'), 'success');
    } catch {
      onToast(copy('নম্বর কপি করা যায়নি', 'Could not copy the number'), 'error');
    }
  };

  const dialPhone = (phone: string | null) => {
    if (!phone) return onToast(copy('ফোন নম্বর নেই', 'No phone number'), 'error');
    const tel = `tel:${phone.replace(/[^\d+]/g, '')}`;
    window.location.href = tel;
  };

  const filtered = orders.filter(o => {
    if (callFilter !== 'ALL' && (o.callStatus || 'NONE') !== callFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (o.customerName || '').toLowerCase().includes(s) ||
           (o.phone || '').includes(s) || String(o.id).includes(s);
  });

  const allSelected = filtered.length > 0 && filtered.every(o => selected.has(o.id));
  const toggleAll   = () => setSelected(allSelected ? new Set() : new Set(filtered.map(o => o.id)));
  const subtotal    = (o: Order) => o.items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const isPresetView = Boolean(preset?.label);

  const STATUS_COLORS: Record<string, string> = {
    ALL: th.accent, RECEIVED: '#b45309', CONFIRMED: '#16a34a', CANCELLED: '#dc2626', ISSUE: '#ea580c',
  };

  // Source counts
  const sourceCounts: Record<string, number> = {};
  orders.forEach(o => { const k = (o.source || 'FACEBOOK').toUpperCase(); sourceCounts[k] = (sourceCounts[k] || 0) + 1; });
  const callCounts: Record<string, number> = {};
  orders.forEach(o => {
    const k = (o.callStatus || 'NONE').toUpperCase();
    callCounts[k] = (callCounts[k] || 0) + 1;
  });
  const notAnsweredCount = callCounts.NOT_ANSWERED || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Modals */}
      {showCreate && <ManualOrderModal th={th} onClose={() => setShowCreate(false)} onSave={createManualOrder} saving={creating} />}
      {memoOrderId && <MemoModal th={th} orderId={memoOrderId} pageId={pageId} onClose={() => setMemoOrderId(null)} />}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', margin: 0 }}>Orders</h1>
          <p style={{ fontSize: 13, color: th.muted, margin: '3px 0 0' }}>
            {orders.length} টি order — {orders.filter(o => o.status === 'RECEIVED').length} pending
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isPresetView && (
            <button style={{ ...th.btnPrimary, display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => setShowCreate(true)}>
              ✏️ নতুন Order
            </button>
          )}
          <button style={th.btnGhost} onClick={load}>
            {loading ? <Spinner size={13}/> : '↺'} Refresh
          </button>
        </div>
      </div>

      {/* ── Agent Issues Panel ──────────────────────────────────────────── */}
      {agentIssues.length > 0 && (
        <div style={{ ...th.card, border: `1.5px solid #b4530930`, background: '#b4530908' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#b45309', display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚠️ Agent Issues <span style={{ background: '#b45309', color: '#fff', fontSize: 10, borderRadius: 10, padding: '2px 7px', fontWeight: 700 }}>{agentIssues.length}</span>
              </div>
              <div style={{ fontSize: 11, color: th.muted, marginTop: 2 }}>Payment সমস্যা বা bot বুঝতে পারেনি — manually handle করুন</div>
            </div>
            <button style={{ ...th.btnGhost, fontSize: 12 }} onClick={loadAgentIssues}>
              {issuesLoading ? <Spinner size={12} /> : '↺'} Refresh
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {agentIssues.map((o, idx) => {
              const isUnmatched = o.issueType === 'unmatched';
              const issueText = isUnmatched
                ? '🤖 Bot বুঝতে পারেনি'
                : (o.orderNote?.split('⚠️ Payment Issue:')[1]?.split('|')[0]?.trim() || 'Payment সমস্যা');
              const rowKey = o.id ?? `psid-${o.customerPsid ?? idx}`;
              const isBusy = togglingBot === (o.id ?? -1);
              return (
                <div key={rowKey} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
                  padding: '10px 14px', borderRadius: 10,
                  background: o.botMuted ? '#b4530914' : th.bg,
                  border: `1px solid ${o.botMuted ? '#b45309' : th.border}`,
                }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {o.customerName || 'Customer'}
                      {o.id && <span style={{ fontSize: 10, color: th.muted, fontWeight: 400 }}>#{o.id}</span>}
                      {isUnmatched && <span style={{ fontSize: 10, background: '#7c3aed', color: '#fff', padding: '1px 6px', borderRadius: 5, fontWeight: 700 }}>অজানা Message</span>}
                      {o.botMuted && <span style={{ fontSize: 10, background: '#b45309', color: '#fff', padding: '1px 6px', borderRadius: 5, fontWeight: 700 }}>BOT OFF</span>}
                    </div>
                    <div style={{ fontSize: 11, color: th.muted, marginTop: 2 }}>
                      {o.phone && <span style={{ marginRight: 10 }}>📞 {o.phone}</span>}
                      <span style={{ color: isUnmatched ? '#7c3aed' : '#b45309' }}>💬 {issueText.slice(0, 80)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: th.muted }}>{new Date(o.createdAt).toLocaleDateString('bn-BD')}</span>
                    <button
                      onClick={() => toggleBot({ id: o.id, customerPsid: o.customerPsid, botMuted: o.botMuted })}
                      disabled={isBusy}
                      style={{
                        padding: '6px 14px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer',
                        border: `1.5px solid ${o.botMuted ? '#16a34a' : '#b45309'}`,
                        background: o.botMuted ? '#16a34a18' : '#b4530918',
                        color: o.botMuted ? '#16a34a' : '#b45309',
                      }}>
                      {togglingBot === o.id ? <Spinner size={11} /> : o.botMuted ? '🤖 Bot চালু করুন' : '🤫 Bot বন্ধ করুন'}
                    </button>
                    <button
                      onClick={() => dismissIssue(o)}
                      title="Issue সরিয়ে দিন"
                      style={{
                        padding: '6px 10px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        border: `1.5px solid ${th.border}`,
                        background: th.surface, color: th.muted,
                        lineHeight: 1,
                      }}>
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Payment Proof Review Panel ──────────────────────────────────────── */}
      {paymentProofs.length > 0 && (
        <div style={{ ...th.card, border: `1.5px solid #16a34a30`, background: '#16a34a06' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 6 }}>
                💳 Payment Proof Review
                <span style={{ background: '#16a34a', color: '#fff', fontSize: 10, borderRadius: 10, padding: '2px 7px', fontWeight: 700 }}>
                  {paymentProofs.filter(p => p.paymentVerifyStatus === 'pending_review').length} pending
                </span>
              </div>
              <div style={{ fontSize: 11, color: th.muted, marginTop: 2 }}>Advance payment proof গুলো review করুন</div>
            </div>
            <button style={{ ...th.btnGhost, fontSize: 12 }} onClick={loadPaymentProofs}>
              {proofsLoading ? <Spinner size={12} /> : '↺'} Refresh
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {paymentProofs.map(p => {
              const verifyStatus = p.paymentVerifyStatus || 'pending_review';
              const statusColor = verifyStatus === 'verified' ? '#16a34a' : verifyStatus === 'verify_failed' ? '#dc2626' : '#ca8a04';
              const statusLabel = verifyStatus === 'verified' ? '✅ Verified' : verifyStatus === 'verify_failed' ? '❌ Rejected' : '⏳ Pending';
              const isBusy = verifyingId === p.id;
              const subtotal = p.items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
              return (
                <div key={p.id} style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: th.bg,
                  border: `1px solid ${statusColor}40`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {p.customerName || 'Customer'}
                        <span style={{ fontSize: 10, color: th.muted, fontWeight: 400 }}>#{p.id}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 5, background: statusColor + '18', color: statusColor, border: `1px solid ${statusColor}30` }}>
                          {statusLabel}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: th.muted, marginTop: 3, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {p.phone && <span>📞 {p.phone}</span>}
                        <span>💰 ৳{subtotal}</span>
                        {p.transactionId && <span>🔑 TxID: <b style={{ color: th.text }}>{p.transactionId}</b></span>}
                        <span>{new Date(p.createdAt).toLocaleDateString('bn-BD')}</span>
                      </div>
                      {p.paymentScreenshotUrl && (
                        <div style={{ marginTop: 8 }}>
                          <a href={p.paymentScreenshotUrl} target="_blank" rel="noopener noreferrer">
                            <img src={p.paymentScreenshotUrl} alt="payment screenshot"
                              style={{ maxHeight: 120, maxWidth: 200, borderRadius: 8, border: `1px solid ${th.border}`, objectFit: 'cover', cursor: 'pointer' }} />
                          </a>
                        </div>
                      )}
                    </div>
                    {verifyStatus === 'pending_review' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
                        <button
                          disabled={isBusy}
                          onClick={() => verifyPayment(p.id, 'verified')}
                          style={{ padding: '7px 16px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer', border: '1.5px solid #16a34a', background: '#16a34a18', color: '#16a34a' }}>
                          {isBusy ? <Spinner size={11} /> : '✅ Verify করুন'}
                        </button>
                        <button
                          disabled={isBusy}
                          onClick={() => verifyPayment(p.id, 'verify_failed')}
                          style={{ padding: '7px 16px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer', border: '1.5px solid #dc2626', background: '#dc262618', color: '#dc2626' }}>
                          {isBusy ? <Spinner size={11} /> : '❌ Reject করুন'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Manual Call Queue Panel ──────────────────────────────────────── */}
      {callQueue.length > 0 && (
        <div style={{ ...th.card, border: `1.5px solid #2563eb30`, background: '#2563eb05' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 6 }}>
                📞 Manual Call Queue
                <span style={{ background: '#2563eb', color: '#fff', fontSize: 10, borderRadius: 10, padding: '2px 7px', fontWeight: 700 }}>{callQueue.length}</span>
              </div>
              <div style={{ fontSize: 11, color: th.muted, marginTop: 2 }}>নিচের orders গুলোতে manually call করে status update করুন</div>
            </div>
            <button style={{ ...th.btnGhost, fontSize: 12 }} onClick={loadCallQueue}>
              {callQueueLoading ? <Spinner size={12} /> : '↺'} Refresh
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {callQueue.map(o => {
              const total = o.items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
              const isBusy = loggingCallId === o.id;
              const cleanPhone = (o.phone || '').replace(/[^\d+]/g, '');
              return (
                <div key={o.id} style={{
                  padding: '14px 16px', borderRadius: 12,
                  background: th.bg, border: `1px solid ${th.border}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
                    {/* Left: customer info */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {o.customerName || 'Customer'}
                        <span style={{ fontSize: 10, color: th.muted, fontWeight: 400 }}>#{o.id}</span>
                        <StatusBadge th={th} status={o.status} />
                        {o.callRetryCount > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: '#b4530918', color: '#b45309', border: '1px solid #b4530930' }}>
                            {o.callRetryCount}x called
                          </span>
                        )}
                      </div>
                      {/* Items */}
                      <div style={{ fontSize: 12, color: th.muted, marginTop: 5, lineHeight: 1.6 }}>
                        {o.items.map((i, idx) => (
                          <span key={idx} style={{ marginRight: 10 }}>{i.productCode} ×{i.qty} (৳{(i.unitPrice * i.qty).toLocaleString()})</span>
                        ))}
                      </div>
                      <div style={{ fontSize: 12, color: th.muted, marginTop: 3, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: th.text }}>💰 ৳{total.toLocaleString()}</span>
                        <span>📅 {new Date(o.createdAt).toLocaleDateString('bn-BD')}</span>
                        {o.address && <span>📍 {o.address}</span>}
                        {o.lastCallAt && <span>🕐 Last: {new Date(o.lastCallAt).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })}</span>}
                      </div>
                    </div>
                    {/* Right: call button + status actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                      {/* The main call button — opens mobile dialer */}
                      {o.phone ? (
                        <a
                          href={`tel:${cleanPhone}`}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 7,
                            padding: '10px 20px', borderRadius: 10, fontWeight: 800, fontSize: 14,
                            background: '#2563eb', color: '#fff', textDecoration: 'none',
                            border: '2px solid #1d4ed8', boxShadow: '0 2px 8px #2563eb30',
                            letterSpacing: '-0.01em',
                          }}
                        >
                          📞 {o.phone}
                        </a>
                      ) : (
                        <span style={{ fontSize: 12, color: th.muted, padding: '10px 14px' }}>ফোন নম্বর নেই</span>
                      )}
                      {/* Status update buttons */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          disabled={isBusy} onClick={() => logManualCall(o.id, 'CONFIRMED')}
                          style={{ padding: '6px 12px', borderRadius: 8, fontWeight: 700, fontSize: 11.5, cursor: 'pointer', border: '1.5px solid #16a34a', background: '#16a34a18', color: '#16a34a' }}>
                          {isBusy ? <Spinner size={10} /> : '✅ Confirmed'}
                        </button>
                        <button
                          disabled={isBusy} onClick={() => logManualCall(o.id, 'NOT_ANSWERED')}
                          style={{ padding: '6px 12px', borderRadius: 8, fontWeight: 700, fontSize: 11.5, cursor: 'pointer', border: `1.5px solid ${th.border}`, background: 'transparent', color: th.muted }}>
                          📵 Not Answered
                        </button>
                        <button
                          disabled={isBusy} onClick={() => logManualCall(o.id, 'CALLBACK_LATER')}
                          style={{ padding: '6px 12px', borderRadius: 8, fontWeight: 700, fontSize: 11.5, cursor: 'pointer', border: '1.5px solid #ca8a04', background: '#ca8a0418', color: '#ca8a04' }}>
                          🔁 Callback Later
                        </button>
                        <button
                          disabled={isBusy} onClick={() => logManualCall(o.id, 'CANCELLED')}
                          style={{ padding: '6px 12px', borderRadius: 8, fontWeight: 700, fontSize: 11.5, cursor: 'pointer', border: '1.5px solid #dc2626', background: '#dc262618', color: '#dc2626' }}>
                          ❌ Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Source filter */}
      {!isPresetView && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SOURCES.map(s => {
          const count = s.key === 'ALL' ? orders.length : (sourceCounts[s.key] || 0);
          const isActive = source === s.key;
          return (
            <button key={s.key} onClick={() => setSource(s.key)} style={{
              padding: '6px 12px', borderRadius: 20, border: `1.5px solid ${isActive ? s.color : th.border}`,
              background: isActive ? s.color + '18' : 'transparent',
              color: isActive ? s.color : th.muted,
              fontWeight: 700, fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5, transition: 'all .12s',
            }}>
              {s.icon} {s.label}
              {count > 0 && <span style={{ background: isActive ? s.color : th.border, color: isActive ? '#fff' : th.muted, fontSize: 10, borderRadius: 10, padding: '1px 6px' }}>{count}</span>}
            </button>
          );
        })}
      </div>}

      {/* Payment filter */}
      {!isPresetView && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {PAYMENT_FILTERS.map(f => {
          const isActive = paymentFilter === f.key;
          return (
            <button key={f.key} onClick={() => setPaymentFilter(f.key)} style={{
              padding: '5px 11px', borderRadius: 20, border: `1.5px solid ${isActive ? f.color : th.border}`,
              background: isActive ? f.color + '18' : 'transparent',
              color: isActive ? f.color : th.muted,
              fontWeight: 700, fontSize: 11.5, cursor: 'pointer', transition: 'all .12s',
            }}>
              {f.label}
            </button>
          );
        })}
      </div>}

      {!isPresetView && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {CALL_FILTERS.map(f => {
          const isActive = callFilter === f.key;
          const count = f.key === 'ALL'
            ? orders.filter(o => (o.callStatus || 'NONE') !== 'NONE').length
            : (callCounts[f.key] || 0);
          return (
            <button key={f.key} onClick={() => setCallFilter(f.key)} style={{
              padding: '5px 11px', borderRadius: 20, border: `1.5px solid ${isActive ? f.color : th.border}`,
              background: isActive ? `${f.color}18` : 'transparent',
              color: isActive ? f.color : th.muted,
              fontWeight: 700, fontSize: 11.5, cursor: 'pointer', transition: 'all .12s',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <span>{copy(f.bn, f.en)}</span>
              {count > 0 && <span style={{ background: isActive ? f.color : th.border, color: isActive ? '#fff' : th.muted, fontSize: 10, borderRadius: 10, padding: '1px 6px' }}>{count}</span>}
            </button>
          );
        })}
      </div>}

      {!isPresetView && notAnsweredCount > 0 && (
        <div style={{
          ...th.card,
          padding: '12px 14px',
          border: `1px solid ${th.border}`,
          background: th.surface,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13.5, color: th.text }}>📞 {copy('Not Answered Follow-up লাগবে', 'Not Answered Customers Need Agent Follow-up')}</div>
            <div style={{ fontSize: 12.5, color: th.muted, marginTop: 3 }}>
              {copy(`${notAnsweredCount} জন customer call receive করে key press করেনি বা answer দেয়নি. Agent manually follow-up করুন.`, `${notAnsweredCount} customers did not answer or did not press any key. Please follow up manually.`)}
            </div>
          </div>
          <button
            style={th.btnGhost}
            onClick={() => setCallFilter('NOT_ANSWERED')}
          >
            {copy('শুধু Not Answered দেখুন', 'View Not Answered')}
          </button>
        </div>
      )}

      {/* Status + Search + Bulk */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {!isPresetView && <div style={{ display: 'flex', background: th.surface, borderRadius: 10, padding: 3, border: `1px solid ${th.border}`, gap: 2 }}>
          {STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => setStatus(s)} style={{
              padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
              background: status === s ? th.panel : 'transparent',
              color: status === s ? STATUS_COLORS[s] || th.accent : th.muted,
              boxShadow: status === s ? th.shadow : 'none', transition: 'all .12s',
            }}>
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>}

        <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: th.muted, fontSize: 13 }}>⌕</span>
          <input style={{ ...th.input, paddingLeft: 30 }}
            placeholder="নাম, ফোন বা Order ID..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {!isPresetView && selected.size > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 12px', background: th.accentSoft, borderRadius: 8, border: `1px solid ${th.accent}33` }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: th.accentText }}>{selected.size} selected</span>
            <button style={th.btnSmSuccess} onClick={() => action([...selected], 'confirm')} disabled={busy}>✓ Confirm</button>
            <button style={th.btnSmDanger} onClick={() => action([...selected], 'cancel')} disabled={busy}>✕ Cancel</button>
            <button style={th.btnSmGhost} onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}
      </div>

      {preset?.label && (
        <div style={{ ...th.card, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, color: th.textSub }}>
            {copy('এখন দেখানো হচ্ছে:', 'Now showing:')} <strong style={{ color: th.text }}>{preset.label}</strong>
          </div>
          <button
            style={th.btnGhost}
            onClick={() => {
              setStatus('ALL');
              setSource('ALL');
              setPaymentFilter('ALL');
              setCallFilter('ALL');
              setSearch('');
            }}
          >
            {copy('সব দেখুন', 'Show all')}
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ ...th.card, padding: 0, overflow: 'hidden' }}>
        {loading && !orders.length ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size={22} color={th.accent}/></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="📦" title="No orders found" sub="Filter বদলান বা নতুন order যোগ করুন" />
        ) : (
          <table style={th.table}>
            <thead>
              <tr>
                {!isPresetView && (
                  <th style={{ ...th.th, width: 40, paddingLeft: 20 }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: 'pointer', accentColor: th.accent }} />
                  </th>
                )}
                <th style={th.th}>#</th>
                <th style={th.th}>Customer</th>
                <th style={th.th}>Source</th>
                <th style={th.th}>Items</th>
                <th style={th.th}>Amount</th>
                <th style={th.th}>Status</th>
                <th style={th.th}>{copy('Call', 'Call')}</th>
                <th style={th.th}>Date</th>
                <th style={th.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => {
                const isSel  = selected.has(o.id);
                const isOpen = expanded === o.id;
                const total  = subtotal(o);
                const date   = new Date(o.createdAt);
                const canTriggerCall = o.status === 'RECEIVED' || ['PENDING_CALL', 'CALL_FAILED', 'NOT_ANSWERED'].includes(o.callStatus);
                const canManualResolve = ['CALLING','PENDING_CALL','CALL_FAILED','NEEDS_AGENT','NOT_ANSWERED'].includes(o.callStatus);

                return (
                  <>
                    <tr key={o.id}
                      style={{
                        background: isSel ? th.accentSoft : isOpen ? th.surface : 'transparent',
                        transition: 'background .1s', cursor: 'pointer',
                      }}
                      onClick={() => setExpanded(isOpen ? null : o.id)}
                    >
                      {!isPresetView && (
                        <td style={{ ...th.td, paddingLeft: 20 }} onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={isSel}
                            onChange={() => setSelected(s => { const n = new Set(s); n.has(o.id) ? n.delete(o.id) : n.add(o.id); return n; })}
                            style={{ cursor: 'pointer', accentColor: th.accent }} />
                        </td>
                      )}
                      <td style={{ ...th.td, fontWeight: 700, color: th.accentText, fontSize: 13 }}>#{o.id}</td>
                      <td style={th.td}>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{o.customerName || '—'}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                          <span style={{ fontSize: 12, color: th.muted }}>{o.phone || '—'}</span>
                          {o.phone && (
                            <>
                              <button
                                style={{ ...th.btnSmGhost, padding: '3px 7px', fontSize: 10.5 }}
                                onClick={(e) => { e.stopPropagation(); copyPhone(o.phone); }}
                                title={copy('নম্বর কপি করুন', 'Copy number')}
                              >
                                {copy('Copy', 'Copy')}
                              </button>
                              <button
                                style={{ ...th.btnSmAccent, padding: '3px 7px', fontSize: 10.5 }}
                                onClick={(e) => { e.stopPropagation(); dialPhone(o.phone); }}
                                title={copy('Agent এর ফোন app-এ call করুন', 'Call from the agent phone')}
                              >
                                {copy('Call', 'Call')}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                      <td style={th.td}><SourceBadge source={o.source || 'FACEBOOK'} /></td>
                      <td style={{ ...th.td, color: th.muted, fontSize: 12.5 }}>
                        {o.items.length} item{o.items.length !== 1 ? 's' : ''}
                        {o.negotiationRequested && <span style={{ marginLeft: 6, ...th.pill, ...th.pillYellow, fontSize: 10 }}>Negotiated</span>}
                      </td>
                      <td style={{ ...th.td, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>৳{total.toLocaleString()}</td>
                      <td style={th.td}>
                        <StatusBadge th={th} status={o.status} />
                        {o.courierShipment?.status === 'partial_delivery' && (
                          <div style={{ marginTop: 3 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: '#f9731618', color: '#f97316', border: '1px solid #f9731630' }}>⚠️ আংশিক</span>
                          </div>
                        )}
                        {o.paymentStatus !== 'not_required' && (
                          <div style={{ marginTop: 3 }}><PaymentBadge paymentStatus={o.paymentStatus} /></div>
                        )}
                        {o.paymentStatus === 'agent_required' && o.orderNote?.includes('⚠️ Payment Issue:') && (
                          <div style={{ marginTop: 3, fontSize: 10.5, fontWeight: 700, color: '#b45309', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 5, padding: '2px 6px', display: 'inline-block' }}>
                            💬 সমস্যা আছে
                          </div>
                        )}
                      </td>
                      <td style={th.td}>
                        {o.callStatus
                          ? <StatusBadge th={th} status={o.callStatus} />
                          : <span style={{ fontSize: 12, color: th.muted }}>{copy('Not used', 'Not used')}</span>}
                      </td>
                      <td style={{ ...th.td, fontSize: 12, color: th.muted }}>
                        {date.toLocaleDateString('bn-BD', { day: '2-digit', month: 'short' })}
                      </td>
                      <td style={th.td} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button style={{ ...th.btnSmGhost, fontSize: 11 }} onClick={() => setMemoOrderId(o.id)} title="Memo">📋</button>
                          {canTriggerCall && (
                            <button
                              style={['CALL_FAILED', 'NOT_ANSWERED'].includes(o.callStatus) ? th.btnSmGhost : th.btnSmAccent}
                              onClick={() => callAction(o.id, ['CALL_FAILED', 'NOT_ANSWERED'].includes(o.callStatus) ? 'retry' : 'send')}
                              disabled={busy}
                              title={['CALL_FAILED', 'NOT_ANSWERED'].includes(o.callStatus) ? 'Retry call' : 'Send call'}
                            >
                              {['CALL_FAILED', 'NOT_ANSWERED'].includes(o.callStatus) ? '↺' : '📞'}
                            </button>
                          )}
                          {o.status === 'RECEIVED' && (
                            <button style={th.btnSmSuccess} onClick={() => action([o.id], 'confirm')} disabled={busy}>✓</button>
                          )}
                          {!['CANCELLED','CONFIRMED'].includes(o.status) && (
                            <button style={th.btnSmDanger} onClick={() => action([o.id], 'cancel')} disabled={busy}>✕</button>
                          )}
                          <button style={th.btnSmGhost} onClick={() => setExpanded(isOpen ? null : o.id)}>{isOpen ? '▲' : '▼'}</button>
                        </div>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr key={`${o.id}-detail`}>
                        <td colSpan={isPresetView ? 9 : 10} style={{ ...th.td, padding: 0, background: th.surface, borderBottom: `1px solid ${th.border}` }}>
                          <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Items</div>
                              {o.items.map((i, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                                  <span>{i.productCode} ×{i.qty}</span>
                                  <span style={{ fontWeight: 600 }}>৳{(i.unitPrice * i.qty).toLocaleString()}</span>
                                </div>
                              ))}
                              <div style={{ borderTop: `1px solid ${th.border}`, paddingTop: 6, marginTop: 6, fontWeight: 700, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                <span>Total</span><span>৳{total.toLocaleString()}</span>
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Delivery</div>
                                <div style={{ fontSize: 13, color: th.textSub, lineHeight: 1.7 }}>
                                📍 {o.address || '—'}<br/>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <span>📞 {o.phone || '—'}</span>
                                  {o.phone && (
                                    <>
                                      <button
                                        style={{ ...th.btnSmGhost, padding: '3px 8px', fontSize: 10.5 }}
                                        onClick={() => copyPhone(o.phone)}
                                      >
                                        {copy('Copy Number', 'Copy Number')}
                                      </button>
                                      <a
                                        href={`tel:${o.phone.replace(/[^\d+]/g, '')}`}
                                        onClick={(e) => e.stopPropagation()}
                                        style={{ ...th.btnSmAccent, padding: '3px 8px', fontSize: 10.5, textDecoration: 'none' }}
                                      >
                                        {copy('📞 Agent Call', '📞 Agent Call')}
                                      </a>
                                    </>
                                  )}
                                </span>
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Info</div>
                              <div style={{ fontSize: 13, color: th.textSub }}>
                                <SourceBadge source={o.source || 'FACEBOOK'} />
                                <div style={{ marginTop: 6 }}><PaymentBadge paymentStatus={o.paymentStatus || 'not_required'} /></div>
                                <div style={{ marginTop: 6 }}>
                                  <span style={{ fontSize: 11, color: th.muted, marginRight: 6 }}>{copy('Call:', 'Call:')}</span>
                                  {o.callStatus
                                    ? <StatusBadge th={th} status={o.callStatus} />
                                    : <span style={{ fontSize: 12, color: th.muted }}>{copy('Not used', 'Not used')}</span>}
                                </div>
                                {o.callStatus === 'NOT_ANSWERED' && (
                                  <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: '#6b728012', border: '1px solid #6b72802a', fontSize: 12, color: th.muted }}>
                                    {copy('Customer call receive করেনি বা key press করেনি. Agent manually follow-up করুন.', 'The customer did not answer or did not press any key. Please follow up manually.')}
                                  </div>
                                )}
                                {o.transactionId && <div style={{ marginTop: 4, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>💳 Txn: {o.transactionId}</div>}
                                {o.paymentScreenshotUrl && (
                                  <a href={o.paymentScreenshotUrl} target="_blank" rel="noreferrer"
                                    style={{ display: 'inline-block', marginTop: 4, fontSize: 11, color: th.accent }}>
                                    📷 Screenshot দেখুন
                                  </a>
                                )}
                                {o.orderNote && (
                                  o.orderNote.includes('⚠️ Payment Issue:')
                                    ? <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: '#fef3c7', border: '1px solid #fcd34d', fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
                                        {o.orderNote}
                                      </div>
                                    : <div style={{ marginTop: 6, fontSize: 12, color: th.muted }}>{o.orderNote}</div>
                                )}
                                {o.customerOfferedPrice && <div style={{ marginTop: 6, color: '#b45309' }}>Offered: ৳{o.customerOfferedPrice}</div>}
                              </div>
                              <button style={{ ...th.btnSmGhost, marginTop: 10, fontSize: 12 }} onClick={() => setMemoOrderId(o.id)}>
                                📋 Memo দেখুন
                              </button>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                                {canTriggerCall && (
                                  <button
                                    style={['CALL_FAILED', 'NOT_ANSWERED'].includes(o.callStatus) ? th.btnSmGhost : th.btnSmAccent}
                                    onClick={() => callAction(o.id, ['CALL_FAILED', 'NOT_ANSWERED'].includes(o.callStatus) ? 'retry' : 'send')}
                                    disabled={busy}
                                  >
                                    {['CALL_FAILED', 'NOT_ANSWERED'].includes(o.callStatus)
                                      ? copy('↺ Retry Call', '↺ Retry Call')
                                      : copy('📞 Send Call', '📞 Send Call')}
                                  </button>
                                )}
                                {canManualResolve && (
                                  <>
                                    <button style={th.btnSmSuccess} onClick={() => callAction(o.id, 'confirm')} disabled={busy}>
                                      {copy('✅ Call Confirm', '✅ Call Confirm')}
                                    </button>
                                    <button style={th.btnSmDanger} onClick={() => callAction(o.id, 'cancel')} disabled={busy}>
                                      {copy('✕ Call Cancel', '✕ Call Cancel')}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
