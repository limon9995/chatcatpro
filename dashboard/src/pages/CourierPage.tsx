import { useCallback, useEffect, useState } from 'react';
import { CardHeader, EmptyState, FieldWithInfo, Spinner } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';

type CourierName = 'pathao' | 'steadfast' | 'redx' | 'paperfly' | 'manual';

const COURIERS: { key: CourierName; label: string; color: string; icon: string }[] = [
  { key: 'pathao',    label: 'Pathao',    color: '#e11d48', icon: '🚴' },
  { key: 'steadfast', label: 'Steadfast', color: '#0369a1', icon: '📦' },
  { key: 'redx',      label: 'RedX',      color: '#dc2626', icon: '🔴' },
  { key: 'paperfly',  label: 'Paperfly',  color: '#7c3aed', icon: '✈️' },
  { key: 'manual',    label: 'Manual',    color: '#6b7280', icon: '📝' },
];

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b', booked: '#3b82f6', picked: '#8b5cf6',
  in_transit: '#0891b2', delivered: '#16a34a',
  returned: '#ef4444', cancelled: '#9ca3af', exchanged: '#f97316',
};

const STATUS_OPTS = ['booked','picked','in_transit','delivered','returned','cancelled','exchanged'];

function extractYouTubeId(url: string): string | null {
  const m = url?.match(
    /(?:youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  );
  return m?.[1] ?? null;
}

function getLocalTimeValue(date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function CourierPage({ th, pageId, onToast }: {
  th: Theme; pageId: number; onToast: (m: string, t?: any) => void;
}) {
  const { request } = useApi();
  const { copy } = useLanguage();
  const [tab, setTab]             = useState<'shipments' | 'settings'>('shipments');
  const [shipments, setShipments] = useState<any[]>([]);
  const [orders, setOrders]       = useState<any[]>([]);
  const [settings, setSettings]   = useState<any>({ defaultCourier: 'manual', autoBookOnConfirm: false });
  const [tutorials, setTutorials] = useState<Record<string, string>>({});
  const [summary, setSummary]     = useState<any>(null);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [selected, setSelected]   = useState<Set<number>>(new Set());
  const [bookModal, setBookModal] = useState<any>(null);
  const [statusModal, setStatusModal] = useState<any>(null);
  const [manualModal, setManualModal] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [statusForm, setStatusForm] = useState({ status: '', note: '', exchangeOriginalAmount: 0, exchangeNewAmount: 0 });
  const [manualForm, setManualForm] = useState({
    courierName: 'manual',
    trackingId: '',
    trackingUrl: '',
    courierFee: '',
    codAmount: '',
    weight: '',
    bookedAt: '',
    bookedTime: '',
  });

  const BASE = `${API_BASE}/client-dashboard/${pageId}`;

  const loadShipments = useCallback(async () => {
    setLoading(true);
    try {
      const [s, o, sm] = await Promise.all([
        request<any[]>(`${BASE}/courier/shipments${filterStatus ? `?status=${filterStatus}` : ''}`),
        request<any[]>(`${BASE}/orders?status=CONFIRMED`),
        request<any>(`${BASE}/courier/accounting-summary`),
      ]);
      setShipments(s); setOrders(o); setSummary(sm);
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [pageId, filterStatus]);

  const loadSettings = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        request(`${BASE}/courier/settings`),
        request<Record<string,string>>(`${BASE}/courier/tutorials`),
      ]);
      setSettings(s); setTutorials(t);
    } catch {}
  }, [pageId]);

  useEffect(() => { if (tab === 'shipments') loadShipments(); else loadSettings(); }, [tab, loadShipments, loadSettings]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await request(`${BASE}/courier/settings`, { method: 'PATCH', body: JSON.stringify(settings) });
      onToast(copy('✅ Settings saved', '✅ সেটিংস সেভ হয়েছে'));
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const bookOrder = async (orderId: number, courier: CourierName) => {
    const o = orders.find(x => x.id === orderId);
    if (!o) return;
    const subtotal = (o.items || []).reduce((s: number, i: any) => s + i.unitPrice * i.qty, 0);
    try {
      await request(`${BASE}/courier/book`, {
        method: 'POST',
        body: JSON.stringify({
          orderId, courier,
          recipientName: o.customerName || 'Customer',
          recipientPhone: o.phone || '',
          recipientAddress: o.address || '',
          codAmount: subtotal, weight: 0.5,
        }),
      });
      onToast(copy(`✅ Booked via ${courier}`, `✅ ${courier} দিয়ে বুকড হয়েছে`)); setBookModal(null); await loadShipments();
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  const bulkBook = async () => {
    if (!selected.size) return onToast(copy('Select at least one order', 'কোনো order select করুন'), 'error');
    setSaving(true);
    try {
      const r = await request<any>(`${BASE}/courier/bulk-book`, {
        method: 'POST',
        body: JSON.stringify({ orderIds: [...selected], courier: settings.defaultCourier }),
      });
      onToast(copy(`✅ ${r.success} booked, ${r.failed} failed`, `✅ ${r.success} টি booked, ${r.failed} টি failed`));
      setSelected(new Set()); await loadShipments();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const openManualModal = (target: any, fromShipment = false) => {
    const orderId = fromShipment ? (target.order?.id || target.orderId) : target.id;
    const subtotal = fromShipment
      ? (target.codAmount || 0)
      : (target.items || []).reduce((s: number, i: any) => s + i.unitPrice * i.qty, 0);
    const existingWeight =
      target.weight != null && Number(target.weight) !== 0.5
        ? String(target.weight)
        : '';
    setManualModal({ orderId, fromShipment });
    const bookedDate = target.bookedAt ? new Date(target.bookedAt) : null;
    setManualForm({
      courierName: target.courierName || 'manual',
      trackingId: target.trackingId || '',
      trackingUrl: target.trackingUrl || '',
      courierFee: target.courierFee != null ? String(target.courierFee) : '',
      codAmount: String(subtotal || ''),
      weight: existingWeight,
      bookedAt: bookedDate ? bookedDate.toISOString().slice(0, 10) : '',
      bookedTime: bookedDate ? getLocalTimeValue(bookedDate) : getLocalTimeValue(),
    });
  };

  const saveManualInfo = async () => {
    if (!manualModal?.orderId) return;
    setSaving(true);
    try {
      await request(`${BASE}/courier/manual/${manualModal.orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          courierName: manualForm.courierName,
          trackingId: manualForm.trackingId,
          trackingUrl: manualForm.trackingUrl,
          courierFee: manualForm.courierFee === '' ? null : Number(manualForm.courierFee),
          codAmount: Number(manualForm.codAmount) || 0,
          weight: manualForm.weight === '' ? undefined : Number(manualForm.weight),
          bookedAt: manualForm.bookedAt
            ? `${manualForm.bookedAt}T${manualForm.bookedTime || getLocalTimeValue()}`
            : null,
        }),
      });
      onToast(copy('✅ Manual courier info saved', '✅ Manual courier info সেভ হয়েছে'));
      setManualModal(null);
      setBookModal(null);
      await loadShipments();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const updateStatus = async () => {
    if (!statusModal || !statusForm.status) return;
    try {
      await request(`${BASE}/courier/status/${statusModal.order?.id || statusModal.orderId}`, {
        method: 'POST',
        body: JSON.stringify({
          status: statusForm.status,
          note: statusForm.note,
          ...(statusForm.status === 'exchanged' ? {
            exchangeOriginalAmount: statusForm.exchangeOriginalAmount,
            exchangeNewAmount: statusForm.exchangeNewAmount,
          } : {}),
        }),
      });

      const msg = {
        delivered: copy('✅ Delivered — Order confirmed and accounting updated', '✅ Delivered — Order confirmed হয়েছে এবং accounting update হয়েছে'),
        returned:  copy('↩️ Returned — Return entry created in accounting', '↩️ Returned — Accounting এ return entry তৈরি হয়েছে'),
        exchanged: copy('🔄 Exchange recorded in accounting', '🔄 Exchange accounting এ record হয়েছে'),
      }[statusForm.status] || copy('✅ Status updated', '✅ Status update হয়েছে');

      onToast(msg); setStatusModal(null); await loadShipments();
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  const bookedOrderIds = new Set(shipments.map(s => s.order?.id || s.orderId));
  const unbookedOrders = orders.filter(o => !bookedOrderIds.has(o.id));

  // ── Accounting impact explainer ───────────────────────────────────────────
  const StatusImpactNote = ({ status }: { status: string }) => {
    const notes: Record<string, { icon: string; text: string; color: string }> = {
      delivered: { icon: '✅', color: '#16a34a', text: copy('This order will be confirmed and counted as revenue in accounting.', 'Order টা Confirmed হবে। Accounting এ revenue count হবে।') },
      returned:  { icon: '↩️', color: '#ef4444', text: copy('A return entry will be created in accounting. Refund amount and courier fee will be deducted automatically.', 'Accounting এ Return Entry তৈরি হবে। Refund amount ও courier fee automatically deduct হবে।') },
      exchanged: { icon: '🔄', color: '#f97316', text: copy('An exchange entry will be created in accounting. The price difference will be calculated automatically.', 'Accounting এ Exchange Entry তৈরি হবে। Price difference automatically calculate হবে।') },
      in_transit:{ icon: '🚚', color: '#0891b2', text: copy('Status only update. No accounting change will happen.', 'Status update — accounting এ কোনো পরিবর্তন নেই।') },
      picked:    { icon: '📦', color: '#8b5cf6', text: copy('Status only update. No accounting change will happen.', 'Status update — accounting এ কোনো পরিবর্তন নেই।') },
      cancelled: { icon: '✕',  color: '#9ca3af', text: copy('Shipment will be cancelled. No accounting change will happen.', 'Shipment cancelled — accounting এ কোনো পরিবর্তন নেই।') },
    };
    const n = notes[status];
    if (!n) return null;
    return (
      <div style={{ padding: '10px 14px', borderRadius: 10, background: `${n.color}15`, border: `1px solid ${n.color}33`, fontSize: 12.5, color: n.color, fontWeight: 600, marginTop: 8 }}>
        {n.icon} {n.text}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', margin: 0 }}>Courier</h1>
        <p style={{ fontSize: 13, color: th.muted, margin: '3px 0 0' }}>{copy('Pathao, Steadfast, RedX, and Paperfly in one place', 'Pathao, Steadfast, RedX, Paperfly — সব একজায়গায়')}</p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, background: th.surface, borderRadius: 10, padding: 3, border: `1px solid ${th.border}`, alignSelf: 'flex-start' }}>
        {[
          ['shipments', copy('📦 Shipments', '📦 Shipments')],
          ['settings', copy('⚙️ Settings', '⚙️ Settings')],
        ].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k as any)} style={{
            padding: '8px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            background: tab === k ? th.accent : 'transparent',
            color: tab === k ? '#fff' : th.muted,
          }}>{l}</button>
        ))}
      </div>

      {/* ── SHIPMENTS TAB ─────────────────────────────────────────────────── */}
      {tab === 'shipments' && (
        <>
          {/* Accounting summary */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
              {[
                { label: copy('Delivered', 'Delivered'),    val: summary.totalDelivered,  color: '#16a34a', icon: '✅' },
                { label: copy('Returned', 'Returned'),     val: summary.totalReturned,   color: '#ef4444', icon: '↩️' },
                { label: copy('Return Loss', 'Return Loss'),  val: `৳${Math.round(summary.totalReturnLoss).toLocaleString()}`, color: '#ef4444', icon: '💸' },
                { label: copy('Exchange Adjustment', 'Exchange Adj'), val: `৳${Math.round(summary.totalExchangeAdj).toLocaleString()}`, color: '#f97316', icon: '🔄' },
                { label: copy('Return Rate', 'Return Rate'),  val: `${summary.returnRate}%`, color: summary.returnRate > 15 ? '#ef4444' : '#16a34a', icon: '📊' },
              ].map(k => (
                <div key={k.label} style={{ ...th.card, padding: '12px 14px' }}>
                  <div style={{ fontSize: 16 }}>{k.icon}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: k.color, marginTop: 4 }}>{k.val}</div>
                  <div style={{ fontSize: 10.5, color: th.muted, fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>{k.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Unbooked orders */}
          {unbookedOrders.length > 0 && (
            <div style={th.card}>
              <CardHeader th={th} title={copy(`📬 Ready to Book (${unbookedOrders.length})`, `📬 Book করুন (${unbookedOrders.length})`)}
                action={
                  <div style={{ display: 'flex', gap: 8 }}>
                    {selected.size > 0 && (
                      <button style={th.btnPrimary} onClick={bulkBook} disabled={saving}>
                        {saving ? <Spinner size={13}/> : copy(`🚚 Bulk Book (${selected.size})`, `🚚 Bulk Book (${selected.size})`)}
                      </button>
                    )}
                    <button style={th.btnSmGhost} onClick={() => setSelected(new Set(unbookedOrders.map(o => o.id)))}>{copy('All', 'All')}</button>
                    <button style={th.btnSmGhost} onClick={() => setSelected(new Set())}>{copy('Clear', 'Clear')}</button>
                  </div>
                }
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 260, overflowY: 'auto' }}>
                {unbookedOrders.map(o => {
                  const subtotal = (o.items||[]).reduce((s:number,i:any) => s + i.unitPrice * i.qty, 0);
                  const isSel = selected.has(o.id);
                  return (
                    <div key={o.id} onClick={() => setSelected(s => { const n = new Set(s); n.has(o.id) ? n.delete(o.id) : n.add(o.id); return n; })}
                      style={{ ...th.card2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                        border: `1.5px solid ${isSel ? th.accent : th.border}`,
                        background: isSel ? th.accentSoft : undefined }}>
                      <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                        border: `2px solid ${isSel ? th.accent : th.border}`,
                        background: isSel ? th.accent : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11 }}>
                        {isSel ? '✓' : ''}
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700 }}>#{o.id}</span>
                        <span style={{ fontSize: 12, color: th.muted, marginLeft: 8 }}>{o.customerName}</span>
                        <span style={{ fontSize: 12, color: th.muted, marginLeft: 8 }}>{o.phone}</span>
                      </div>
                      <span style={{ fontWeight: 700, color: th.accent }}>৳{subtotal}</span>
                      <button style={th.btnSmAccent} onClick={e => { e.stopPropagation(); setBookModal(o); }}>{copy('🚚 Book', '🚚 Book')}</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Book modal */}
          {bookModal && (
            <div style={{ ...th.card, border: `2px solid ${th.accent}` }}>
              <CardHeader th={th} title={copy(`Book Order #${bookModal.id}`, `Book — Order #${bookModal.id}`)}
                action={<button style={th.btnGhost} onClick={() => setBookModal(null)}>✕</button>} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10 }}>
                {COURIERS.map(c => (
                  <button key={c.key} onClick={() => c.key === 'manual' ? openManualModal(bookModal) : bookOrder(bookModal.id, c.key)}
                    style={{ padding: '14px', borderRadius: 12, border: `1.5px solid ${c.color}33`,
                      background: `${c.color}11`, cursor: 'pointer', fontFamily: 'inherit',
                      fontWeight: 700, fontSize: 13, color: c.color, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 22 }}>{c.icon}</span>{c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {manualModal && (
            <div style={{ ...th.card, border: `2px solid #6b7280` }}>
              <CardHeader th={th} title={copy(`Manual Courier Info for Order #${manualModal.orderId}`, `Manual Courier Info — Order #${manualModal.orderId}`)}
                sub={copy('If the courier API does not return tracking, fee, URL, or booking date, enter them here manually.', 'API থেকে না এলে tracking, fee, URL, booked date এখানে নিজে দিন')}
                action={<button style={th.btnGhost} onClick={() => setManualModal(null)}>✕</button>} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <FieldWithInfo th={th} label="Courier">
                  <select style={th.input} value={manualForm.courierName} onChange={e => setManualForm(f => ({ ...f, courierName: e.target.value }))}>
                    {COURIERS.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                  </select>
                </FieldWithInfo>
                <FieldWithInfo th={th} label="Tracking ID">
                  <input style={th.input} value={manualForm.trackingId} onChange={e => setManualForm(f => ({ ...f, trackingId: e.target.value }))} />
                </FieldWithInfo>
                <FieldWithInfo th={th} label="Tracking URL">
                  <input style={th.input} value={manualForm.trackingUrl} onChange={e => setManualForm(f => ({ ...f, trackingUrl: e.target.value }))} />
                </FieldWithInfo>
                <FieldWithInfo th={th} label="Courier Fee">
                  <input style={th.input} type="number" min={0} value={manualForm.courierFee} onChange={e => setManualForm(f => ({ ...f, courierFee: e.target.value }))} />
                </FieldWithInfo>
                <FieldWithInfo th={th} label="COD Amount">
                  <input style={th.input} type="number" min={0} value={manualForm.codAmount} onChange={e => setManualForm(f => ({ ...f, codAmount: e.target.value }))} />
                </FieldWithInfo>
                <FieldWithInfo th={th} label="Weight (kg) (optional)">
                  <input style={th.input} type="number" min={0} step="0.1" value={manualForm.weight} onChange={e => setManualForm(f => ({ ...f, weight: e.target.value }))} />
                </FieldWithInfo>
                <FieldWithInfo th={th} label={copy('Booked Date', 'Booked Date')}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input style={th.input} type="date" value={manualForm.bookedAt} onChange={e => setManualForm(f => ({ ...f, bookedAt: e.target.value, bookedTime: f.bookedTime || getLocalTimeValue() }))} />
                    <div style={{ fontSize: 12, color: th.muted }}>
                      {manualForm.bookedAt
                        ? copy(`Time used automatically: ${manualForm.bookedTime || getLocalTimeValue()}`, `Time automatically used: ${manualForm.bookedTime || getLocalTimeValue()}`)
                        : copy('Once you set a date, the current time will be saved automatically.', 'Date দিলেই current time automatically save হবে।')}
                    </div>
                  </div>
                </FieldWithInfo>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <button style={th.btnPrimary} onClick={saveManualInfo} disabled={saving}>
                  {saving ? <Spinner size={13}/> : copy('💾 Save Manual Info', '💾 Save Manual Info')}
                </button>
              </div>
            </div>
          )}

          {/* Status update modal */}
          {statusModal && (
            <div style={{ ...th.card, border: `2px solid #f97316` }}>
              <CardHeader th={th}
                title={copy(`Update Status for Order #${statusModal.order?.id || statusModal.orderId}`, `Status Update — Order #${statusModal.order?.id || statusModal.orderId}`)}
                sub={copy(`Current status: ${statusModal.status}`, `Current: ${statusModal.status}`)}
                action={<button style={th.btnGhost} onClick={() => setStatusModal(null)}>✕</button>}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <FieldWithInfo th={th} label={copy('New Status', 'New Status')} helpText={copy('Selecting Delivered or Returned will update accounting automatically.', 'Delivered এবং Returned নির্বাচন করলে accounting automatically update হবে।')}>
                  <select style={th.input} value={statusForm.status}
                    onChange={e => setStatusForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="">{copy('Select status...', 'Select status...')}</option>
                    {STATUS_OPTS.map(s => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </FieldWithInfo>

                {statusForm.status && <StatusImpactNote status={statusForm.status} />}

                {statusForm.status === 'exchanged' && (
                  <>
                    <FieldWithInfo th={th} label={copy('Original Order Amount (৳)', 'Original Order Amount (৳)')} helpText={copy('Total amount of the original order.', 'পুরনো order এর মোট দাম।')}>
                      <input style={th.input} type="number" min={0}
                        value={statusForm.exchangeOriginalAmount || ''}
                        onChange={e => setStatusForm(f => ({ ...f, exchangeOriginalAmount: Number(e.target.value) }))} />
                    </FieldWithInfo>
                    <FieldWithInfo th={th} label={copy('New Product Amount (৳)', 'New Product Amount (৳)')} helpText={copy('Price of the replacement product. If higher, the customer pays extra. If lower, they receive a refund.', 'Exchange এর পর নতুন product এর দাম। বেশি হলে customer extra দেবে, কম হলে refund।')}>
                      <input style={th.input} type="number" min={0}
                        value={statusForm.exchangeNewAmount || ''}
                        onChange={e => setStatusForm(f => ({ ...f, exchangeNewAmount: Number(e.target.value) }))} />
                    </FieldWithInfo>
                    {statusForm.exchangeOriginalAmount > 0 && statusForm.exchangeNewAmount > 0 && (
                      <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fff7ed', border: '1px solid #f97316', fontSize: 12.5, color: '#92400e' }}>
                        {statusForm.exchangeNewAmount > statusForm.exchangeOriginalAmount
                          ? copy(`Customer needs to pay extra: ৳${statusForm.exchangeNewAmount - statusForm.exchangeOriginalAmount}`, `Customer extra দেবে: ৳${statusForm.exchangeNewAmount - statusForm.exchangeOriginalAmount}`)
                          : statusForm.exchangeNewAmount < statusForm.exchangeOriginalAmount
                          ? copy(`Customer will receive a refund: ৳${statusForm.exchangeOriginalAmount - statusForm.exchangeNewAmount}`, `Customer refund পাবে: ৳${statusForm.exchangeOriginalAmount - statusForm.exchangeNewAmount}`)
                          : copy('Same price, so no extra charge or refund.', 'Same price — কোনো extra charge/refund নেই')}
                      </div>
                    )}
                  </>
                )}

                <FieldWithInfo th={th} label={copy('Note (optional)', 'Note (optional)')} helpText={copy('Internal note. This will be included in the accounting entry.', 'Internal note — accounting entry তে যাবে।')}>
                  <input style={th.input} placeholder={copy('e.g. Customer requested return', 'e.g. Customer requested return')}
                    value={statusForm.note}
                    onChange={e => setStatusForm(f => ({ ...f, note: e.target.value }))} />
                </FieldWithInfo>

                <button style={th.btnPrimary} onClick={updateStatus} disabled={!statusForm.status}>
                  {copy('✅ Update Status', '✅ Update Status')}
                </button>
              </div>
            </div>
          )}

          {/* Shipments list */}
          <div style={th.card}>
            <CardHeader th={th} title={copy('All Shipments', 'All Shipments')}
              action={
                <div style={{ display: 'flex', gap: 8 }}>
                  <select style={{ ...th.input, width: 130, padding: '6px 10px', fontSize: 12 }}
                    value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="">{copy('All Status', 'All Status')}</option>
                    {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button style={th.btnGhost} onClick={loadShipments}>{loading ? <Spinner size={13}/> : '🔄'}</button>
                </div>
              }
            />
            {loading && !shipments.length
              ? <div style={{ textAlign: 'center', padding: 30 }}><Spinner size={20}/></div>
              : shipments.length === 0
              ? <EmptyState icon="🚚" title={copy('No shipments found', 'কোনো shipment নেই')} />
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {shipments.map(s => (
                    <div key={s.id} style={{ ...th.card2, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700 }}>Order #{s.order?.id || s.orderId}</span>
                          <span style={{ ...th.pill, background: `${STATUS_COLORS[s.status]||'#9ca3af'}22`, color: STATUS_COLORS[s.status]||'#9ca3af', border: `1px solid ${STATUS_COLORS[s.status]||'#9ca3af'}44`, fontSize: 10.5 }}>{s.status}</span>
                          <span style={{ ...th.pill, ...th.pillGray, fontSize: 10 }}>
                            {COURIERS.find(c => c.key === s.courierName)?.icon} {s.courierName}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: th.muted }}>
                          {s.order?.customerName} · {s.order?.phone}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 6, marginTop: 10 }}>
                          <div style={{ fontSize: 11.5, color: th.muted }}>
                            <span style={{ color: th.text, fontWeight: 700 }}>COD:</span> ৳{Number(s.codAmount || 0).toLocaleString()}
                          </div>
                          <div style={{ fontSize: 11.5, color: th.muted }}>
                            <span style={{ color: th.text, fontWeight: 700 }}>{copy('Booked:', 'Booked:')}</span> {s.bookedAt ? new Date(s.bookedAt).toLocaleString() : copy('Not set', 'Not set')}
                          </div>
                          <div style={{ fontSize: 11.5, color: th.muted }}>
                            <span style={{ color: th.text, fontWeight: 700 }}>{copy('Fee:', 'Fee:')}</span> {s.courierFee != null ? `৳${Number(s.courierFee).toLocaleString()}` : copy('Not set', 'Not set')}
                          </div>
                          <div style={{ fontSize: 11.5, color: th.muted }}>
                            <span style={{ color: th.text, fontWeight: 700 }}>{copy('Weight:', 'Weight:')}</span> {s.weight != null && Number(s.weight) !== 0.5 ? `${s.weight} kg` : copy('Not set', 'Not set')}
                          </div>
                          <div style={{ fontSize: 11.5, color: th.muted }}>
                            <span style={{ color: th.text, fontWeight: 700 }}>{copy('Tracking ID:', 'Tracking ID:')}</span> {s.trackingId || copy('Not set', 'Not set')}
                          </div>
                          <div style={{ fontSize: 11.5, color: th.muted }}>
                            <span style={{ color: th.text, fontWeight: 700 }}>{copy('Tracking URL:', 'Tracking URL:')}</span>{' '}
                            {s.trackingUrl ? (
                              <a href={s.trackingUrl} target="_blank" rel="noreferrer" style={{ color: th.accent, textDecoration: 'none' }}>
                                {copy('Open link', 'Open link')}
                              </a>
                            ) : copy('Not set', 'Not set')}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginLeft: 8, alignSelf: 'center' }}>
                      <button style={{ ...th.btnSmGhost, fontSize: 11, whiteSpace: 'nowrap' }}
                        onClick={() => openManualModal(s, true)}>
                        {copy('✏️ Manual', '✏️ Manual')}
                      </button>
                      <button style={{ ...th.btnSmGhost, fontSize: 11, whiteSpace: 'nowrap' }}
                        onClick={() => { setStatusModal(s); setStatusForm({ status: '', note: '', exchangeOriginalAmount: 0, exchangeNewAmount: 0 }); }}>
                        {copy('📝 Update', '📝 Update')}
                      </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </>
      )}

      {/* ── SETTINGS TAB ──────────────────────────────────────────────────── */}
      {tab === 'settings' && (
        <div style={th.card}>
          <CardHeader th={th} title={copy('⚙️ Courier Settings', '⚙️ Courier Settings')} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <FieldWithInfo th={th} label={copy('Default Courier', 'Default Courier')} helpText={copy('This courier will be used for bulk booking.', 'Bulk booking এ এই courier ব্যবহার হবে।')}>
              <select style={th.input} value={settings.defaultCourier || 'manual'}
                onChange={e => setSettings((s: any) => ({ ...s, defaultCourier: e.target.value }))}>
                {COURIERS.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
              </select>
            </FieldWithInfo>

            {/* Per-courier API key sections with tutorial video */}
            {[
              {
                key: 'pathao',
                label: 'Pathao',
                icon: '🚴',
                color: '#e11d48',
                fields: [['apiKey','Client ID'],['secretKey','Client Secret'],['storeId','Store ID (optional)']],
                guidance: copy('Log in to your Pathao Merchant account, then ask Pathao support or your account manager for the Client ID, Client Secret, and Store ID needed to connect your system via API.', 'আপনি Pathao Merchant account এ login করুন। তারপর Pathao support বা আপনার account manager-কে বলুন: "আমার system-এর সাথে Pathao API connect করতে হবে, Client ID, Client Secret, আর Store ID দিন।"'),
              },
              { key: 'steadfast', label: 'Steadfast', icon: '📦', color: '#0369a1', fields: [['apiKey','API Key'],['secretKey','Secret Key']] },
              {
                key: 'redx',
                label: 'RedX',
                icon: '🔴',
                color: '#dc2626',
                fields: [['apiKey','API Token']],
                guidance: copy('Log in to your RedX merchant panel. If you do not see an API Token option, contact RedX support and ask for the API Token required to connect your system.', 'আপনি আগে RedX merchant panel এ login করুন। যদি API Token option দেখতে না পান, তাহলে RedX support-এ বলুন: "আমার system-এর সাথে RedX API connect করতে হবে, API Token দিন।"'),
              },
              {
                key: 'paperfly',
                label: 'Paperfly',
                icon: '✈️',
                color: '#7c3aed',
                fields: [['apiKey','API Key'],['apiPassword','API Password']],
                guidance: copy('If you use a Paperfly merchant account, ask the support team or your account manager for the API Key and API Password needed for system integration. These are separate from your normal login password.', 'আপনি Paperfly merchant account ব্যবহার করলে support team বা account manager-কে বলুন: "আমার system-এর সাথে Paperfly API connect করতে হবে, API Key আর API Password দিন।" মনে রাখবেন, normal login password না, API credential আলাদা লাগবে।'),
              },
            ].map(courier => {
              const tutUrl = tutorials[courier.key] || '';
              const ytId   = extractYouTubeId(tutUrl);
              const hasKey = settings[courier.key]?.apiKey;
              return (
                <div key={courier.key} style={{ ...th.card2, borderRadius: 14, border: `1.5px solid ${hasKey ? '#16a34a33' : th.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <span style={{ fontSize: 22 }}>{courier.icon}</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: courier.color }}>{courier.label}</div>
                      {hasKey
                        ? <div style={{ fontSize: 11.5, color: '#16a34a', fontWeight: 600 }}>{copy('✅ API key configured', '✅ API key set')}</div>
                        : <div style={{ fontSize: 11.5, color: th.muted }}>{copy('Enter the API key below', 'API key দিন')}</div>}
                    </div>
                  </div>

                  {courier.guidance && (
                    <div style={{
                      marginBottom: 14,
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: `${courier.color}10`,
                      border: `1px solid ${courier.color}22`,
                      fontSize: 12,
                      lineHeight: 1.65,
                      color: th.text,
                    }}>
                      <b style={{ color: courier.color }}>{copy('How to get it:', 'কীভাবে পাবেন:')}</b> {courier.guidance}
                    </div>
                  )}

                  {/* Tutorial video */}
                  {ytId && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: th.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        📺 Setup Tutorial
                      </div>
                      <div style={{ borderRadius: 10, overflow: 'hidden', aspectRatio: '16/9', maxWidth: 360, background: '#000' }}>
                        <iframe
                          src={`https://www.youtube.com/embed/${ytId}`}
                          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen title={`${courier.label} setup`}
                        />
                      </div>
                      <div style={{ fontSize: 11.5, color: th.muted, marginTop: 6 }}>
                        {copy('Use this tutorial to find your API credentials, then enter them below.', '👆 Video দেখে API key কোথায় পাবেন বুঝুন, তারপর নিচে দিন।')}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {courier.fields.map(([field, lbl]) => (
                      <FieldWithInfo key={field} th={th} label={lbl} helpText={copy(`Get this value from the ${courier.label} dashboard.`, `${courier.label} dashboard থেকে এই key নিন।`)}>
                        <input style={th.input} type="password" placeholder="••••••••"
                          value={settings[courier.key]?.[field] || ''}
                          onChange={e => setSettings((s: any) => ({
                            ...s, [courier.key]: { ...(s[courier.key] || {}), [field]: e.target.value },
                          }))} />
                      </FieldWithInfo>
                    ))}
                  </div>
                </div>
              );
            })}

            <button style={th.btnPrimary} onClick={saveSettings} disabled={saving}>
              {saving ? <Spinner size={13}/> : copy('💾 Save Settings', '💾 Save Settings')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
