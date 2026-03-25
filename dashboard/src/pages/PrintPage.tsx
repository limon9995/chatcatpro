import { useCallback, useEffect, useRef, useState } from 'react';
import { CardHeader, EmptyState, Spinner } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE } from '../hooks/useApi';
import { useLanguage } from '../i18n';

export interface PrintPagePreset {
  filter?: string;
  autoSelectAll?: boolean;
  label?: string;
  onlyPendingPrint?: boolean;
}

interface Order {
  id: number; customerName: string; phone: string; address: string;
  status: string; printedAt?: string | null; items: { productCode: string; qty: number; unitPrice: number }[];
}

export function PrintPage({ th, pageId, onToast, preset }: {
  th: Theme; pageId: number; onToast: (m: string, t?: any) => void;
  preset?: PrintPagePreset | null;
}) {
  const { copy } = useLanguage();
  const [orders, setOrders]     = useState<Order[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading]   = useState(false);
  const [printing, setPrinting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [filter, setFilter]     = useState('ALL');
  const [memosPerPage, setMemosPerPage] = useState<3 | 4>(3);
  const previewRef              = useRef<HTMLIFrameElement>(null);

  const BASE = `${API_BASE}/client-dashboard/${pageId}`;
  const auth = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('dfbot_token')||''}` });

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/orders?status=${filter}`, { headers: auth() });
      if (!res.ok) throw new Error('Failed');
      setOrders(await res.json());
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [pageId, filter]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  useEffect(() => {
    let mounted = true;
    const loadMemoPreset = async () => {
      try {
        const res = await fetch(`${BASE}/memo-preset`, { headers: auth() });
        if (!res.ok) return;
        const preset = await res.json();
        if (!mounted) return;
        setMemosPerPage(preset?.memosPerPage === 4 ? 4 : 3);
      } catch {}
    };
    void loadMemoPreset();
    return () => { mounted = false; };
  }, [pageId]);

  useEffect(() => {
    if (!preset) return;
    setFilter(preset.filter || 'ALL');
  }, [preset?.filter, preset?.label]);

  useEffect(() => {
    if (preset?.autoSelectAll && orders.length) {
      setSelected(new Set(orders.map(o => o.id)));
    }
  }, [preset?.autoSelectAll, preset?.label, orders]);

  const visibleOrders = orders.filter((o) => !o.printedAt);

  useEffect(() => {
    if (preset?.autoSelectAll && visibleOrders.length) {
      setSelected(new Set(visibleOrders.map(o => o.id)));
    }
  }, [preset?.autoSelectAll, preset?.label, visibleOrders]);

  const toggleSelect = (id: number) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => setSelected(new Set(visibleOrders.map(o => o.id)));
  const clearAll  = () => setSelected(new Set());

  const markPrinted = async () => {
    if (!selected.size) return;
    await fetch(`${BASE}/orders/mark-printed`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ ids: [...selected] }),
    });
    setSelected(new Set());
    await loadOrders();
  };

  const fetchMemoHtml = async () => {
    const res = await fetch(`${BASE}/memo-html`, {
      method: 'POST', headers: auth(),
      body: JSON.stringify({ ids: [...selected], memosPerPage }),
    });
    if (!res.ok) throw new Error('HTML generation failed');
    return res.text();
  };

  const openPrint = async () => {
    if (!selected.size) return onToast(copy('কোনো order select করুন', 'Select at least one order'), 'error');
    setPrinting(true);
    try {
      const html = await fetchMemoHtml();
      setPreviewHtml(html);
      setPreviewing(true);
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setPrinting(false); }
  };

  const confirmPrint = () => {
    const w = window.open('', '_blank');
    if (w) { w.document.write(previewHtml); w.document.close(); setTimeout(() => w.print(), 600); }
    setPreviewing(false);
    void markPrinted();
  };

  const downloadPDF = async () => {
    if (!selected.size) return onToast(copy('কোনো order select করুন', 'Select at least one order'), 'error');
    setPrinting(true);
    try {
      const res = await fetch(`${BASE}/memo-pdf`, {
        method: 'POST', headers: auth(),
        body: JSON.stringify({ ids: [...selected], memosPerPage }),
      });
      if (!res.ok) throw new Error('PDF generation failed');
      const blob = await res.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'memo.pdf'; a.click();
      await markPrinted();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setPrinting(false); }
  };

  const previewInFrame = async () => {
    if (!selected.size) return onToast(copy('কোনো order select করুন', 'Select at least one order'), 'error');
    try {
      const html = await fetchMemoHtml();
      if (previewRef.current) previewRef.current.srcdoc = html;
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Print Preview Modal */}
      {previewing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.72)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: th.bg, borderRadius: 18, width: '100%', maxWidth: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${th.border}` }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>👁️ {copy('Print Preview', 'Print Preview')}</div>
                <div style={{ fontSize: 12, color: th.muted, marginTop: 2 }}>{copy(`${selected.size}টি order`, `${selected.size} orders`)}</div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={confirmPrint} style={{ ...th.btnPrimary, fontSize: 14, padding: '10px 22px' }}>{copy('🖨️ এখনই Print করুন', 'Print now')}</button>
                <button onClick={() => setPreviewing(false)} style={{ ...th.btnGhost, fontSize: 14, padding: '10px 18px' }}>{copy('✕ বাতিল', 'Cancel')}</button>
              </div>
            </div>
            <iframe srcDoc={previewHtml} style={{ flex: 1, border: 'none', borderRadius: '0 0 18px 18px', minHeight: 480, background: '#fff' }} title="print-preview-modal" />
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 20, fontWeight: 900 }}>🖨️ Print / Invoice</div>
        <div style={{ fontSize: 12.5, color: th.muted, marginTop: 3 }}>{copy('Memo Template-এ যে design set করা আছে সেটাই print হবে', 'The active Memo Template design will be used for printing')}</div>
      </div>

      {/* Order selector */}
      <div style={th.card}>
        <CardHeader th={th} title={copy('📦 Orders Select করুন', '📦 Select Orders')}
          action={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select style={{ ...th.input, width: 'auto', padding: '6px 10px', fontSize: 12 }} value={filter} onChange={e => setFilter(e.target.value)}>
                {['ALL','RECEIVED','CONFIRMED','CANCELLED'].map(f => <option key={f}>{f}</option>)}
              </select>
              <button style={th.btnGhost} onClick={loadOrders}>{loading ? <Spinner size={13}/> : '🔄'}</button>
            </div>
          }
        />

        {preset?.label && (
          <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: th.surface, border: `1px solid ${th.border}`, fontSize: 12.5, color: th.textSub }}>
            {copy('এখন দেখানো হচ্ছে:', 'Now showing:')} <strong style={{ color: th.text }}>{preset.label}</strong>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button style={th.btnGhost} onClick={selectAll}>{copy(`✅ Select All (${visibleOrders.length})`, `✅ Select All (${visibleOrders.length})`)}</button>
          <button style={th.btnGhost} onClick={clearAll}>{copy('☐ Clear', '☐ Clear')}</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <span style={{ color: th.muted, fontSize: 12.5 }}>{copy('প্রতি A4 পাতায়', 'Per A4 page')}</span>
            {[3, 4].map((count) => (
              <button
                key={count}
                onClick={() => setMemosPerPage(count as 3 | 4)}
                style={{
                  ...(memosPerPage === count ? th.btnPrimary : th.btnGhost),
                  padding: '6px 12px',
                  fontSize: 12.5,
                }}
              >
                {count} {copy('টি', '')}
              </button>
            ))}
          </div>
          <span style={{ color: th.muted, fontSize: 13, alignSelf: 'center' }}>{copy(`${selected.size} selected`, `${selected.size} selected`)}</span>
        </div>

        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: th.surface, border: `1px solid ${th.border}`, fontSize: 12.5, color: th.textSub }}>
          {copy(
            `Printing-এর সময় এখন ${memosPerPage}টি memo প্রতি A4 page-এ apply হবে।`,
            `${memosPerPage} memos per A4 page will be applied during printing.`,
          )}
        </div>

        {loading ? <div style={{ textAlign: 'center', padding: 30 }}><Spinner size={20}/></div>
        : visibleOrders.length === 0 ? <EmptyState icon="📭" title={copy('কোনো order নেই', 'No orders found')} />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
            {visibleOrders.map(o => (
              <div key={o.id} onClick={() => toggleSelect(o.id)}
                style={{ ...th.card2, border: `2px solid ${selected.has(o.id) ? th.accent : th.border}`, background: selected.has(o.id) ? th.accentSoft : th.panel, cursor: 'pointer', transition: 'all .15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 800, color: th.accent }}>#{o.id}</span>
                  {selected.has(o.id) && <span style={{ color: th.accent, fontSize: 16 }}>✓</span>}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{o.customerName || '—'}</div>
                <div style={{ fontSize: 11, color: th.muted }}>{o.phone || '—'}</div>
                <div style={{ fontSize: 11, color: th.muted, marginTop: 2 }}>{(o.address||'').slice(0,30)}{(o.address||'').length>30?'…':''}</div>
                <div style={{ fontSize: 11, marginTop: 4, color: th.muted }}>{o.items?.length || 0} {copy('items', 'items')}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <button style={th.btnPrimary} onClick={openPrint} disabled={printing || !selected.size}>
            {printing ? <><Spinner size={13}/> {copy('Loading...', 'Loading...')}</> : copy('👁️ Preview & Print', 'Preview & Print')}
          </button>
          <button style={th.btnGhost} onClick={downloadPDF} disabled={printing || !selected.size}>
            {copy('📥 Download PDF', 'Download PDF')}
          </button>
          <button style={th.btnGhost} onClick={previewInFrame} disabled={!selected.size}>
            {copy('👁️ Quick Preview', 'Quick Preview')}
          </button>
        </div>
      </div>

      {/* Preview iframe */}
      <div style={th.card}>
        <CardHeader th={th} title={copy('👁️ Quick Preview', '👁️ Quick Preview')} sub={copy('Preview এখানে দেখাবে', 'Preview will appear here')} />
        <iframe ref={previewRef} style={{ width: '100%', height: 540, border: `1.5px solid ${th.border}`, borderRadius: 12, background: '#fff' }} title="print-preview" />
      </div>
    </div>
  );
}
