import { useCallback, useEffect, useState } from 'react';
import { CardHeader, Spinner } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildWaUrl(raw?: string | null) {
  const d = String(raw || '').replace(/[^\d]/g, '');
  if (!d) return '';
  if (d.startsWith('880')) return `https://wa.me/${d}`;
  if (d.startsWith('0')) return `https://wa.me/88${d}`;
  return `https://wa.me/${d}`;
}

const METHOD_LABELS: Record<string, string> = {
  bkash: 'bKash', nagad: 'Nagad', bank: 'Bank Transfer', manual: 'Manual',
};

const TYPE_LABELS: Record<string, string> = {
  RECHARGE: '+ Recharge',
  DEDUCT_TEXT: '− Text AI',
  DEDUCT_VOICE: '− Voice AI',
  DEDUCT_IMAGE: '− Image AI',
  DEDUCT_ADMIN_VISION: '− Product Analyze',
  DEDUCT_BASE_FEE: '− Monthly Fee',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b', approved: '#16a34a', rejected: '#ef4444',
};

// ── WalletPage ────────────────────────────────────────────────────────────────

export default function WalletPage({
  th, pageId, onToast,
}: { th: Theme; pageId: number; onToast: (m: string, t?: any) => void }) {
  const { request } = useApi();

  const [wallet, setWallet]       = useState<any>(null);
  const [txns, setTxns]           = useState<any[]>([]);
  const [requests, setRequests]   = useState<any[]>([]);
  const [adminContact, setAdminContact] = useState<any>(null);
  const [loading, setLoading]     = useState(true);

  // Recharge form
  const [form, setForm] = useState({
    amountBdt: '', method: 'bkash', transactionId: '', note: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab]   = useState<'recharge' | 'history' | 'requests'>('recharge');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, t, r, billing] = await Promise.all([
        request<any>(`${API_BASE}/client-dashboard/${pageId}/wallet`),
        request<any[]>(`${API_BASE}/client-dashboard/${pageId}/wallet/transactions`),
        request<any[]>(`${API_BASE}/client-dashboard/${pageId}/wallet/recharge-requests`),
        request<any>(`${API_BASE}/billing/status`).catch(() => null),
      ]);
      setWallet(w);
      setTxns(t || []);
      setRequests(r || []);
      if (billing?.adminContact) setAdminContact(billing.adminContact);
    } catch {
      onToast('Wallet data লোড হয়নি', 'error');
    } finally {
      setLoading(false);
    }
  }, [pageId, request, onToast]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.amountBdt || Number(form.amountBdt) <= 0) {
      onToast('সঠিক amount দিন', 'error'); return;
    }
    if (!form.transactionId.trim()) {
      onToast('Transaction ID দিন', 'error'); return;
    }
    setSubmitting(true);
    try {
      await request(`${API_BASE}/client-dashboard/${pageId}/wallet/recharge-request`, {
        method: 'POST',
        body: JSON.stringify({
          amountBdt: Number(form.amountBdt),
          method: form.method,
          transactionId: form.transactionId.trim(),
          note: form.note.trim() || undefined,
        }),
      });
      onToast('✅ Recharge request জমা হয়েছে! Admin approve করলে balance যোগ হবে।', 'success');
      setForm({ amountBdt: '', method: 'bkash', transactionId: '', note: '' });
      setActiveTab('requests');
      load();
    } catch (e: any) {
      onToast(e.message || 'Request জমা হয়নি', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>;

  const isSuspended = wallet?.subscriptionStatus === 'SUSPENDED';
  const balance = wallet?.walletBalanceBdt ?? 0;
  const waUrl = adminContact?.whatsappUrl || buildWaUrl(adminContact?.phone);
  const pendingCount = requests.filter((r: any) => r.status === 'pending').length;

  const inp: React.CSSProperties = { ...th.input, width: '100%', boxSizing: 'border-box' };
  const card: React.CSSProperties = { ...th.card, borderRadius: 14, padding: 20, marginBottom: 16 };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '16px 12px 40px' }}>
      {/* ── Balance Card ────────────────────────────────────────────────── */}
      <div style={{
        ...card,
        background: isSuspended
          ? 'linear-gradient(135deg,#7f1d1d,#991b1b)'
          : balance < 50
            ? 'linear-gradient(135deg,#78350f,#92400e)'
            : 'linear-gradient(135deg,#1e3a5f,#1d4ed8)',
        color: '#fff',
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>💰 Wallet Balance</div>
        <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-1px' }}>
          ৳ {fmt(balance)}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{
            background: isSuspended ? '#ef4444' : '#22c55e',
            color: '#fff', borderRadius: 99, fontSize: 11, padding: '3px 10px', fontWeight: 700,
          }}>
            {isSuspended ? '🔴 SUSPENDED' : '🟢 ACTIVE'}
          </span>
          {isSuspended && (
            <span style={{ fontSize: 12, opacity: 0.9 }}>
              Balance zero — bot AI বন্ধ। Recharge করুন।
            </span>
          )}
          {!isSuspended && balance < 50 && (
            <span style={{ fontSize: 12, opacity: 0.9 }}>⚠️ Balance কম — শীঘ্রই Recharge করুন।</span>
          )}
        </div>

        {/* Pricing breakdown */}
        <div style={{
          marginTop: 16, padding: '10px 14px', borderRadius: 10,
          background: 'rgba(255,255,255,0.12)', fontSize: 12,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6, opacity: 0.9 }}>Usage Pricing (BDT)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px' }}>
            <span style={{ opacity: 0.8 }}>Text AI Message</span>
            <span>৳ {wallet?.costPerTextMsgBdt ?? 0.05}</span>
            <span style={{ opacity: 0.8 }}>Voice Message STT</span>
            <span>৳ {wallet?.costPerVoiceMsgBdt ?? 0.40}</span>
            <span style={{ opacity: 0.8 }}>Customer Image</span>
            <span>৳ {wallet?.costPerImageBdt ?? 1.70}</span>
            <span style={{ opacity: 0.8 }}>Product Auto-Analyze</span>
            <span>৳ {wallet?.costPerAnalyzeBdt ?? 1.70}</span>
          </div>
        </div>
      </div>

      {/* ── Tab Bar ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {([
          ['recharge', '💳 Recharge'],
          ['history', '📜 লেনদেন'],
          ['requests', `📋 Requests${pendingCount > 0 ? ` (${pendingCount})` : ''}`],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setActiveTab(k)} style={{
            flex: 1, padding: '9px 4px', borderRadius: 10, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
            background: activeTab === k ? th.accent : (th.card as any).background,
            color: activeTab === k ? '#fff' : th.muted,
          }}>{label}</button>
        ))}
      </div>

      {/* ── Recharge Tab ────────────────────────────────────────────────── */}
      {activeTab === 'recharge' && (
        <div>
          {/* Admin WhatsApp contact */}
          {(waUrl || adminContact?.phone) && (
            <div style={{
              ...card, border: `1px solid #22c55e40`,
              background: (th.card as any).background,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                📲 Payment করুন
              </div>
              <div style={{ fontSize: 13, color: th.muted, marginBottom: 12 }}>
                {adminContact?.note || 'নিচের নম্বরে bKash / Nagad পাঠান, তারপর নিচে Transaction ID জমা দিন।'}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {adminContact?.phone && (
                  <div style={{
                    background: th.accent + '22', borderRadius: 10, padding: '8px 14px',
                    fontWeight: 800, fontSize: 16, letterSpacing: 1,
                  }}>
                    📞 {adminContact.phone}
                  </div>
                )}
                {waUrl && (
                  <a href={waUrl} target="_blank" rel="noreferrer" style={{
                    ...th.btnPrimary, textDecoration: 'none', padding: '9px 18px',
                    background: '#25D366', fontSize: 13, borderRadius: 10,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                    <span>WhatsApp করুন</span>
                  </a>
                )}
                {adminContact?.messengerUrl && (
                  <a href={adminContact.messengerUrl} target="_blank" rel="noreferrer" style={{
                    ...th.btn, textDecoration: 'none', padding: '9px 18px', fontSize: 13, borderRadius: 10,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                    Messenger
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Recharge request form */}
          <div style={card}>
            <CardHeader th={th} title="Recharge Request জমা দিন" sub="Payment করার পর এখানে Transaction ID দিন" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: th.muted, display: 'block', marginBottom: 4 }}>Payment Method</label>
                <select style={inp} value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}>
                  <option value="bkash">bKash</option>
                  <option value="nagad">Nagad</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="manual">অন্যান্য</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: th.muted, display: 'block', marginBottom: 4 }}>Amount (BDT) *</label>
                <input
                  style={inp} type="number" min="10" placeholder="যেমন: 500"
                  value={form.amountBdt}
                  onChange={e => setForm(f => ({ ...f, amountBdt: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: th.muted, display: 'block', marginBottom: 4 }}>Transaction ID *</label>
                <input
                  style={inp} placeholder="bKash / Nagad Transaction ID"
                  value={form.transactionId}
                  onChange={e => setForm(f => ({ ...f, transactionId: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: th.muted, display: 'block', marginBottom: 4 }}>Note (optional)</label>
                <input
                  style={inp} placeholder="যেকোনো extra তথ্য"
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                />
              </div>
              <button
                style={{ ...th.btnPrimary, padding: '11px 0', borderRadius: 10, fontSize: 14, fontWeight: 700 }}
                disabled={submitting}
                onClick={submit}
              >
                {submitting ? 'Submitting...' : '📤 Request জমা দিন'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Transaction History Tab ──────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div style={card}>
          <CardHeader th={th} title="Transaction History" sub={`সর্বশেষ ${txns.length} টি লেনদেন`} />
          {txns.length === 0 ? (
            <div style={{ textAlign: 'center', color: th.muted, padding: 32, fontSize: 13 }}>
              কোনো transaction নেই।
            </div>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {txns.map((t: any) => (
                <div key={t.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', borderRadius: 10,
                  background: t.amountBdt > 0
                    ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.07)',
                  border: `1px solid ${t.amountBdt > 0 ? '#22c55e30' : '#ef444430'}`,
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {TYPE_LABELS[t.type] || t.type}
                    </div>
                    {t.description && (
                      <div style={{ fontSize: 11, color: th.muted, marginTop: 2 }}>{t.description}</div>
                    )}
                    <div style={{ fontSize: 11, color: th.muted }}>
                      {new Date(t.createdAt).toLocaleString('en-BD')}
                    </div>
                  </div>
                  <div style={{
                    fontWeight: 800, fontSize: 15,
                    color: t.amountBdt > 0 ? '#22c55e' : '#ef4444',
                  }}>
                    {t.amountBdt > 0 ? '+' : ''}৳{Math.abs(t.amountBdt).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Requests Tab ────────────────────────────────────────────────── */}
      {activeTab === 'requests' && (
        <div style={card}>
          <CardHeader th={th} title="Recharge Requests" sub="আপনার সব recharge request" />
          {requests.length === 0 ? (
            <div style={{ textAlign: 'center', color: th.muted, padding: 32, fontSize: 13 }}>
              কোনো request নেই।
            </div>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {requests.map((r: any) => (
                <div key={r.id} style={{
                  padding: '12px 14px', borderRadius: 10, border: `1px solid ${th.border}`,
                  background: (th.card as any).background,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>৳ {fmt(r.amountBdt)}</div>
                      <div style={{ fontSize: 12, color: th.muted }}>
                        {METHOD_LABELS[r.method] || r.method} · TrxID: <b>{r.transactionId}</b>
                      </div>
                      {r.note && <div style={{ fontSize: 12, color: th.muted }}>{r.note}</div>}
                      <div style={{ fontSize: 11, color: th.muted }}>
                        {new Date(r.createdAt).toLocaleString('en-BD')}
                      </div>
                      {r.status === 'rejected' && r.rejectedReason && (
                        <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>
                          ❌ কারণ: {r.rejectedReason}
                        </div>
                      )}
                    </div>
                    <span style={{
                      background: STATUS_COLORS[r.status] || '#6b7280',
                      color: '#fff', borderRadius: 99, fontSize: 11,
                      padding: '3px 10px', fontWeight: 700, whiteSpace: 'nowrap',
                    }}>
                      {r.status === 'pending' ? '⏳ Pending'
                        : r.status === 'approved' ? '✅ Approved'
                        : '❌ Rejected'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
