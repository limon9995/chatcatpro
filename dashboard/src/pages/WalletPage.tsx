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
  bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', bank: 'Bank Transfer', manual: 'Manual',
};

const METHODS = [
  { key: 'bkash',  label: 'bKash',  icon: '💚', color: '#E2136E', bg: '#fce7f3', light: '#fdf2f8' },
  { key: 'nagad',  label: 'Nagad',  icon: '🟠', color: '#F7941D', bg: '#fff7ed', light: '#fffbf5' },
  { key: 'rocket', label: 'Rocket', icon: '🟣', color: '#8B3FC7', bg: '#f5f3ff', light: '#faf5ff' },
  { key: 'bank',   label: 'Bank',   icon: '🏦', color: '#1d4ed8', bg: '#eff6ff', light: '#f0f9ff' },
] as const;

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
            <span>৳ {wallet?.costPerImageBdt ?? 0.50}</span>
            <span style={{ opacity: 0.8 }}>Product Auto-Analyze</span>
            <span>৳ {wallet?.costPerAnalyzeBdt ?? 0.50}</span>
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
          {/* ── Step 1: Method Selector ───────────────────────────────────── */}
          <div style={{ ...card, padding: '18px 16px' }}>
            <div style={{ fontSize: 12, color: th.muted, fontWeight: 600, marginBottom: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              ধাপ ১ — Payment Method বেছে নিন
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {METHODS.map(m => {
                const isSelected = form.method === m.key;
                return (
                  <button
                    key={m.key}
                    onClick={() => setForm(f => ({ ...f, method: m.key }))}
                    style={{
                      border: `2px solid ${isSelected ? m.color : 'transparent'}`,
                      borderRadius: 12,
                      padding: '12px 10px',
                      cursor: 'pointer',
                      background: isSelected ? m.bg : (th.card as any).background,
                      display: 'flex', alignItems: 'center', gap: 8,
                      transition: 'all 0.15s',
                      boxShadow: isSelected ? `0 0 0 3px ${m.color}22` : 'none',
                    }}
                  >
                    <span style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: isSelected ? m.color : m.color + '22',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, flexShrink: 0,
                    }}>
                      {m.key === 'bkash'  ? <span style={{ color: isSelected ? '#fff' : m.color, fontWeight: 900, fontSize: 11 }}>bK</span>
                       : m.key === 'nagad'  ? <span style={{ color: isSelected ? '#fff' : m.color, fontWeight: 900, fontSize: 11 }}>Ng</span>
                       : m.key === 'rocket' ? <span style={{ color: isSelected ? '#fff' : m.color, fontWeight: 900, fontSize: 11 }}>Rk</span>
                       : <span style={{ fontSize: 18 }}>🏦</span>}
                    </span>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: isSelected ? m.color : th.fg }}>{m.label}</div>
                      <div style={{ fontSize: 10, color: th.muted, marginTop: 1 }}>
                        {m.key === 'bank' ? 'NRBC Bank' : 'Send Money'}
                      </div>
                    </div>
                    {isSelected && (
                      <span style={{
                        marginLeft: 'auto', width: 18, height: 18, borderRadius: '50%',
                        background: m.color, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 11, color: '#fff', flexShrink: 0,
                      }}>✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Step 2: Selected Method Details ──────────────────────────── */}
          {(() => {
            const m = METHODS.find(x => x.key === form.method);
            if (!m) return null;
            const copyBtn = (text: string, label?: string) => (
              <button
                onClick={() => { navigator.clipboard.writeText(text); onToast('Copied!', 'success'); }}
                style={{
                  background: m.color + '18', border: `1px solid ${m.color}40`,
                  borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
                  fontSize: 12, color: m.color, fontWeight: 700, whiteSpace: 'nowrap',
                }}
              >{label || 'Copy'}</button>
            );

            return (
              <div style={{
                ...card,
                border: `2px solid ${m.color}40`,
                background: m.light,
              }}>
                <div style={{ fontSize: 12, color: m.color, fontWeight: 700, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  ধাপ ২ — {m.label} এ টাকা পাঠান
                </div>

                {m.key !== 'bank' ? (
                  /* Mobile Banking */
                  <div>
                    <div style={{ fontSize: 12, color: '#555', marginBottom: 10 }}>
                      নিচের নম্বরে <b>Send Money</b> করুন:
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: '#fff', borderRadius: 12, padding: '14px 16px',
                      border: `1px solid ${m.color}30`,
                      boxShadow: `0 2px 8px ${m.color}15`,
                    }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>{m.label} নম্বর</div>
                        <div style={{ fontWeight: 900, fontSize: 22, color: '#111', letterSpacing: 2 }}>
                          {m.key === 'bkash'  ? (adminContact?.bkash  || adminContact?.phone || '—')
                           : m.key === 'nagad'  ? (adminContact?.nagad  || '—')
                           : (adminContact?.rocket || '—')}
                        </div>
                      </div>
                      {copyBtn(
                        m.key === 'bkash'  ? (adminContact?.bkash  || adminContact?.phone || '')
                        : m.key === 'nagad'  ? (adminContact?.nagad  || '')
                        : (adminContact?.rocket || ''),
                        '📋 Copy'
                      )}
                    </div>

                    {/* Contact links */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      {waUrl && (
                        <a href={waUrl} target="_blank" rel="noreferrer" style={{
                          textDecoration: 'none', padding: '8px 16px', borderRadius: 10,
                          background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 13,
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                        }}>📱 WhatsApp</a>
                      )}
                      {adminContact?.messengerUrl && (
                        <a href={adminContact.messengerUrl} target="_blank" rel="noreferrer" style={{
                          textDecoration: 'none', padding: '8px 16px', borderRadius: 10,
                          background: '#0084FF', color: '#fff', fontWeight: 700, fontSize: 13,
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                        }}>💬 Messenger</a>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Bank Transfer */
                  <div>
                    <div style={{ fontSize: 12, color: '#555', marginBottom: 10 }}>
                      নিচের account এ <b>Bank Transfer</b> করুন:
                    </div>
                    <div style={{
                      background: '#fff', borderRadius: 12, overflow: 'hidden',
                      border: `1px solid ${m.color}30`,
                      boxShadow: `0 2px 8px ${m.color}15`,
                    }}>
                      {[
                        { label: 'Account Number', value: adminContact?.bankAccount || '518131400000385' },
                        { label: 'Bank Name',       value: adminContact?.bankName    || 'NRB Commercial Bank' },
                        { label: 'Branch',          value: adminContact?.bankBranch  || 'Tangail / Kalihati' },
                        { label: 'Account Name',    value: adminContact?.bankHolder  || adminContact?.label || 'Chatcat' },
                      ].map((row, i) => (
                        <div key={row.label} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '11px 16px',
                          borderBottom: i < 3 ? `1px solid ${m.color}15` : 'none',
                        }}>
                          <div>
                            <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>{row.label}</div>
                            <div style={{ fontWeight: 800, fontSize: 14, color: '#111' }}>{row.value}</div>
                          </div>
                          {(i === 0 || i === 3) && copyBtn(row.value)}
                        </div>
                      ))}
                    </div>
                    <div style={{
                      marginTop: 10, padding: '9px 13px', borderRadius: 10,
                      background: '#fef9c3', border: '1px solid #fde047',
                      fontSize: 12, color: '#854d0e',
                    }}>
                      ⚠️ Transfer করার পর Bank reference/transaction number নিচে Transaction ID তে দিন।
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Step 3: Submit Form ───────────────────────────────────────── */}
          {(() => {
            const m = METHODS.find(x => x.key === form.method)!;
            return (
              <div style={{ ...card, border: `1px solid ${th.border}` }}>
                <div style={{ fontSize: 12, color: th.muted, fontWeight: 700, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  ধাপ ৩ — Request জমা দিন
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, color: th.muted, display: 'block', marginBottom: 5, fontWeight: 600 }}>
                      পরিমাণ (BDT) *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{
                        position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
                        fontWeight: 800, fontSize: 16, color: th.muted,
                      }}>৳</span>
                      <input
                        style={{ ...inp, paddingLeft: 30 }} type="number" min="10" placeholder="500"
                        value={form.amountBdt}
                        onChange={e => setForm(f => ({ ...f, amountBdt: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: th.muted, display: 'block', marginBottom: 5, fontWeight: 600 }}>
                      {form.method === 'bank' ? 'Bank Reference / TrxID *' : `${METHOD_LABELS[form.method]} Transaction ID *`}
                    </label>
                    <input
                      style={inp}
                      placeholder={form.method === 'bank' ? 'Bank transfer reference number' : `${METHOD_LABELS[form.method]} TrxID (যেমন: 8D3KA2F1P)` }
                      value={form.transactionId}
                      onChange={e => setForm(f => ({ ...f, transactionId: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: th.muted, display: 'block', marginBottom: 5, fontWeight: 600 }}>
                      Note (optional)
                    </label>
                    <input
                      style={inp} placeholder="যেকোনো extra তথ্য"
                      value={form.note}
                      onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                    />
                  </div>
                  <button
                    style={{
                      border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800,
                      padding: '14px 0', cursor: submitting ? 'not-allowed' : 'pointer',
                      background: submitting ? '#94a3b8' : `linear-gradient(135deg, ${m.color}, ${m.color}cc)`,
                      color: '#fff', letterSpacing: 0.3,
                      boxShadow: submitting ? 'none' : `0 4px 14px ${m.color}55`,
                      transition: 'all 0.2s',
                    }}
                    disabled={submitting}
                    onClick={submit}
                  >
                    {submitting ? '⏳ জমা হচ্ছে...' : `📤 ${METHOD_LABELS[form.method]} Recharge Request জমা দিন`}
                  </button>
                </div>
              </div>
            );
          })()}
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
