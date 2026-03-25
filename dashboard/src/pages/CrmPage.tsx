import { useCallback, useEffect, useState } from 'react';
import { CardHeader, EmptyState, FieldWithInfo, Spinner } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';

interface Customer {
  id: number; psid: string; name: string | null; phone: string | null;
  address: string | null; note: string | null; tags: string[];
  totalOrders: number; totalSpent: number;
  firstOrderAt: string | null; lastOrderAt: string | null; isBlocked: boolean;
}
interface CustomerDetail extends Customer {
  orders: any[];
}

export function CrmPage({ th, pageId, onToast }: {
  th: Theme; pageId: number; onToast: (m: string, t?: any) => void;
}) {
  const { copy } = useLanguage();
  const { request } = useApi();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal]         = useState(0);
  const [stats, setStats]         = useState<any>(null);
  const [allTags, setAllTags]     = useState<string[]>([]);
  const [loading, setLoading]     = useState(false);
  const [search, setSearch]       = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [sortBy, setSortBy]       = useState<'recent' | 'spent' | 'orders'>('recent');
  const [selected, setSelected]   = useState<CustomerDetail | null>(null);
  const [editNote, setEditNote]   = useState('');
  const [editTags, setEditTags]   = useState('');
  const [saving, setSaving]       = useState(false);

  const BASE = `${API_BASE}/client-dashboard/${pageId}`;
  const cur  = '৳';
  const fmt  = (n: number) => `${cur}${Number(n || 0).toLocaleString()}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ orderBy: sortBy, limit: '50' });
      if (search)    params.set('search', search);
      if (filterTag) params.set('tag', filterTag);
      const [data, st, tags] = await Promise.all([
        request<{ total: number; items: Customer[] }>(`${BASE}/crm/customers?${params}`),
        request<any>(`${BASE}/crm/customers/stats`),
        request<string[]>(`${BASE}/crm/customers/tags`),
      ]);
      setCustomers(data.items); setTotal(data.total);
      setStats(st); setAllTags(tags);
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [pageId, search, filterTag, sortBy]);

  useEffect(() => { load(); }, [load]);

  const openCustomer = async (c: Customer) => {
    try {
      const d = await request<CustomerDetail>(`${BASE}/crm/customers/${c.id}`);
      setSelected(d);
      setEditNote(d.note || '');
      setEditTags((d.tags || []).join(', '));
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  const saveCustomer = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await request(`${BASE}/crm/customers/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          note: editNote,
          tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
        }),
      });
      onToast(copy('✅ Saved', '✅ Saved')); await load();
      setSelected(s => s ? { ...s, note: editNote, tags: editTags.split(',').map(t => t.trim()).filter(Boolean) } : s);
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const toggleBlock = async (c: Customer) => {
    try {
      await request(`${BASE}/crm/customers/${c.id}`, {
        method: 'PATCH', body: JSON.stringify({ isBlocked: !c.isBlocked }),
      });
      onToast(c.isBlocked ? copy('✅ Unblocked', '✅ Unblocked') : copy('🚫 Blocked', '🚫 Blocked'));
      await load();
      if (selected?.id === c.id) setSelected(s => s ? { ...s, isBlocked: !s.isBlocked } : s);
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.3px' }}>👥 Customer CRM</div>
        <div style={{ fontSize: 12.5, color: th.muted, marginTop: 3 }}>{copy('সব customer এর history, tags, notes একসাথে', 'See customer history, tags, and notes in one place')}</div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
          {[
            { label: 'Total Customers', val: stats.total,   color: th.accent,  icon: '👥' },
            { label: 'Blocked',          val: stats.blocked, color: '#ef4444',  icon: '🚫' },
          ].map(k => (
            <div key={k.label} style={{ ...th.card, padding: '16px 18px' }}>
              <div style={{ fontSize: 20 }}>{k.icon}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: k.color, marginTop: 4 }}>{k.val}</div>
              <div style={{ fontSize: 11, color: th.muted, fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>{k.label}</div>
            </div>
          ))}
          {stats.topSpenders?.slice(0, 3).map((c: any) => (
            <div key={c.id} style={{ ...th.card, padding: '16px 18px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{c.name || 'Unknown'}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#16a34a' }}>{fmt(c.totalSpent)}</div>
              <div style={{ fontSize: 11, color: th.muted }}>{c.totalOrders} {copy('orders', 'orders')}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: 16, alignItems: 'start' }}>
        {/* Customer list */}
        <div style={th.card}>
          <CardHeader th={th} title={copy(`Customers (${total})`, `Customers (${total})`)}
            action={<button style={th.btnGhost} onClick={load}>{loading ? <Spinner size={13}/> : '🔄'}</button>}
          />

          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <input style={{ ...th.input, flex: 1, minWidth: 160 }} placeholder={copy('🔍 নাম বা ফোন দিয়ে খুঁজুন', '🔍 Search by name or phone')}
              value={search} onChange={e => setSearch(e.target.value)} />
            {allTags.length > 0 && (
              <select style={{ ...th.input, width: 130 }} value={filterTag} onChange={e => setFilterTag(e.target.value)}>
                <option value="">All Tags</option>
                {allTags.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            <select style={{ ...th.input, width: 120 }} value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
              <option value="recent">{copy('সর্বশেষ Order', 'Latest order')}</option>
              <option value="spent">{copy('বেশি খরচ', 'Highest spent')}</option>
              <option value="orders">{copy('বেশি Order', 'Most orders')}</option>
            </select>
          </div>

          {loading && !customers.length
            ? <div style={{ textAlign: 'center', padding: 40 }}><Spinner size={22}/></div>
            : customers.length === 0
            ? <EmptyState icon="👥" title={copy('কোনো customer নেই', 'No customers yet')} sub={copy('Order আসলে customer automatically যোগ হবে', 'Customers will appear automatically once orders arrive')} />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 520, overflowY: 'auto' }}>
                {customers.map(c => (
                  <div key={c.id}
                    onClick={() => openCustomer(c)}
                    style={{
                      ...th.card2, cursor: 'pointer',
                      border: `1.5px solid ${selected?.id === c.id ? th.accent : c.isBlocked ? '#ef444433' : th.border}`,
                      background: c.isBlocked ? 'rgba(239,68,68,0.04)' : selected?.id === c.id ? th.accentSoft : undefined,
                      opacity: c.isBlocked ? 0.6 : 1, transition: 'all .12s',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                          <span style={{ fontWeight: 700, fontSize: 13.5 }}>{c.name || copy('Unknown', 'Unknown')}</span>
                          {c.isBlocked && <span style={{ ...th.pill, ...th.pillRed, fontSize: 9.5 }}>{copy('🚫 Blocked', '🚫 Blocked')}</span>}
                        </div>
                        <div style={{ fontSize: 12, color: th.muted }}>📞 {c.phone || '—'}</div>
                        <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                          {(c.tags || []).map(t => (
                            <span key={t} style={{ background: th.accentSoft, color: th.accent, fontSize: 10, padding: '1px 7px', borderRadius: 5 }}>{t}</span>
                          ))}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 12 }}>
                        <div style={{ fontWeight: 700, color: '#16a34a' }}>{fmt(c.totalSpent)}</div>
                        <div style={{ color: th.muted }}>{c.totalOrders} {copy('orders', 'orders')}</div>
                        {c.lastOrderAt && <div style={{ color: th.muted, fontSize: 10.5 }}>{new Date(c.lastOrderAt).toLocaleDateString()}</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Customer detail panel */}
        {selected && (
          <div style={{ ...th.card, position: 'sticky', top: 16 }}>
            <CardHeader th={th} title={selected.name || copy('Customer', 'Customer')}
              action={<button style={th.btnGhost} onClick={() => setSelected(null)}>✕</button>}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Info */}
              <div style={{ ...th.card2, fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div>📞 {selected.phone || '—'}</div>
                <div>📍 {selected.address || '—'}</div>
                <div style={{ color: '#16a34a', fontWeight: 700 }}>💰 {fmt(selected.totalSpent)} · {selected.totalOrders} {copy('orders', 'orders')}</div>
              </div>

              {/* Tags */}
              <FieldWithInfo th={th} label="Tags" helpText={copy('Comma দিয়ে আলাদা করুন। যেমন: vip, wholesale, problem', 'Separate with commas, for example: vip, wholesale, problem')}>
                <input style={th.input} value={editTags} placeholder="vip, wholesale, regular"
                  onChange={e => setEditTags(e.target.value)} />
              </FieldWithInfo>

              {/* Note */}
              <FieldWithInfo th={th} label="Internal Note" helpText={copy('এই note শুধু dashboard এ দেখা যাবে, customer দেখতে পাবে না।', 'This note is only visible in the dashboard, not to the customer.')}>
                <textarea style={{ ...th.input, height: 72, resize: 'vertical' }}
                  value={editNote} placeholder={copy('যেকোনো internal note...', 'Any internal note...')}
                  onChange={e => setEditNote(e.target.value)} />
              </FieldWithInfo>

              <div style={{ display: 'flex', gap: 8 }}>
                <button style={th.btnPrimary} onClick={saveCustomer} disabled={saving}>
                  {saving ? <Spinner size={13}/> : '💾 Save'}
                </button>
                <button
                  style={{ ...th.btnSm, ...(selected.isBlocked ? th.btnSmSuccess : th.btnSmDanger) }}
                  onClick={() => toggleBlock(selected)}>
                  {selected.isBlocked ? copy('✅ Unblock', '✅ Unblock') : copy('🚫 Block', '🚫 Block')}
                </button>
              </div>

              {/* Order history */}
              {selected.orders?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: th.muted, textTransform: 'uppercase', marginBottom: 8 }}>Order History</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 220, overflowY: 'auto' }}>
                    {selected.orders.map((o: any) => (
                      <div key={o.id} style={{ ...th.card2, fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 700 }}>#{o.id}</span>
                          <span style={{ color: o.status === 'CONFIRMED' ? '#16a34a' : o.status === 'CANCELLED' ? '#ef4444' : '#f59e0b', fontWeight: 700, fontSize: 11 }}>{o.status}</span>
                        </div>
                        <div style={{ color: th.muted, fontSize: 11, marginTop: 2 }}>{new Date(o.createdAt).toLocaleDateString()}</div>
                        {o.courierShipment?.trackingId && (
                          <div style={{ color: th.accent, fontSize: 11, marginTop: 2 }}>
                            🚚 {o.courierShipment.courierName} · {o.courierShipment.trackingId}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
