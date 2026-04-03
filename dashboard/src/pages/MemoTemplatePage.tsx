import { useCallback, useEffect, useRef, useState } from 'react';
import { CardHeader, EmptyState, Field, Spinner } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';

// ── Preset Templates ──────────────────────────────────────────────────────────
const PRESETS: ReadonlyArray<{
  key: string;
  theme: string;
  layout: string;
  label: string;
  icon: string;
  desc: string;
  descEn: string;
  palette: readonly [string, string, string];
  badge?: string;
}> = [
  {
    key: 'classic-memo',    theme: 'classic', layout: 'memo',
    label: 'Classic Memo',  icon: '📄',
    desc: 'সাদা-কালো, সিম্পল, সব ধরনের ব্যবসার জন্য',
    descEn: 'Clean black-and-white memo for almost any business',
    palette: ['#1f2937','#f9fafb','#2563eb'],
    badge: 'Most Popular',
  },
  {
    key: 'classic-invoice', theme: 'classic', layout: 'invoice',
    label: 'Classic Invoice', icon: '🧾',
    desc: 'Professional invoice layout, দুই কলাম',
    descEn: 'Professional two-column invoice layout',
    palette: ['#1f2937','#f9fafb','#2563eb'],
  },
  {
    key: 'fashion-memo',    theme: 'fashion', layout: 'memo',
    label: 'Fashion Memo',  icon: '👗',
    desc: 'Pink & purple — ফ্যাশন ও পোশাকের জন্য perfect',
    descEn: 'Pink and purple memo for fashion and apparel brands',
    palette: ['#c026d3','#fdf4ff','#db2777'],
    badge: 'Trending',
  },
  {
    key: 'fashion-invoice', theme: 'fashion', layout: 'invoice',
    label: 'Fashion Invoice', icon: '🌸',
    desc: 'Fashion brand এর জন্য elegant invoice',
    descEn: 'Elegant invoice style for fashion brands',
    palette: ['#c026d3','#fdf4ff','#db2777'],
  },
  {
    key: 'luxury-memo',    theme: 'luxury', layout: 'memo',
    label: 'Luxury Memo',  icon: '✨',
    desc: 'Gold & dark — premium products এর জন্য',
    descEn: 'Gold and dark memo for premium products',
    palette: ['#111827','#fff7ed','#d4af37'],
    badge: 'Premium',
  },
  {
    key: 'luxury-invoice', theme: 'luxury', layout: 'invoice',
    label: 'Luxury Invoice', icon: '💎',
    desc: 'High-end invoice, gold accent',
    descEn: 'High-end invoice with gold accents',
    palette: ['#111827','#fff7ed','#d4af37'],
  },
];

interface FieldBox { x: number; y: number; width: number; height: number; fontSize?: number; fontWeight?: number; align?: string; maxLines?: number; source?: string; }
interface TemplateInfo {
  fileName: string; fileUrl: string; mimeType?: string; renderMode: string;
  status: string; mapping: Record<string, FieldBox>;
  templateWidth: number; templateHeight: number;
  detectionConfidence: number; autoDetected: boolean;
  updatedAt: string; originalFileUrl?: string;
}

const FIELD_KEYS = ['customerName','customerPhone','customerAddress','orderId','date','businessName','businessPhone','codAmount','totalAmount','deliveryFee','items'];
const FIELD_LABELS: Record<string, string> = {
  customerName: 'Customer Name', customerPhone: 'Customer Phone', customerAddress: 'Address',
  orderId: 'Order ID', date: 'Date', businessName: 'Business Name',
  businessPhone: 'Business Phone', codAmount: 'COD Amount', totalAmount: 'Total',
  deliveryFee: 'Delivery Fee', items: 'Items List',
};
const FIELD_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#0891b2','#f97316','#84cc16','#ec4899','#6366f1','#14b8a6'];

// Sample Bengali data for live preview in mapped boxes
const SAMPLE_FIELD_DATA = {
  bn: {
    customerName: 'রহিম উদ্দিন',
    customerPhone: '০১৭০০-০০০০০০',
    customerAddress: 'বাসা ১২, রোড ৪, সেক্টর ৭, উত্তরা, ঢাকা-১২৩০। মিরপুর ১০ নম্বর গোলচত্বরের কাছে',
    orderId: '#1001',
    date: '১৮ মার্চ ২০২৬',
    businessName: 'Dress Fashion Zone',
    businessPhone: '০১৯০০-১১১২২২',
    codAmount: '৳৮৫০',
    totalAmount: '৳৮৫০',
    deliveryFee: '৳৮০',
    items: 'DF-001 x1 = ৳৬৫০ | DF-002 x2 = ৳৩৬০',
  },
  en: {
    customerName: 'Rahim Uddin',
    customerPhone: '01700-000000',
    customerAddress: 'House 12, Road 4, Sector 7, Uttara, Dhaka-1230. Near Mirpur 10 circle.',
    orderId: '#1001',
    date: '18 March 2026',
    businessName: 'Dress Fashion Zone',
    businessPhone: '01900-111222',
    codAmount: 'Tk 850',
    totalAmount: 'Tk 850',
    deliveryFee: 'Tk 80',
    items: 'DF-001 x1 = Tk 650 | DF-002 x2 = Tk 360',
  },
};

// Format detection for display
function getFormatBadge(info: TemplateInfo | null): { icon: string; label: string; color: string; bg: string } | null {
  if (!info) return null;
  const mime = info.mimeType || '';
  const name = info.fileName || '';
  if (mime.includes('pdf') || name.endsWith('.pdf')) return { icon: '📕', label: 'PDF', color: '#dc2626', bg: '#fef2f2' };
  if (mime.includes('html') || name.endsWith('.html') || name.endsWith('.htm')) return { icon: '🌐', label: 'HTML', color: '#2563eb', bg: '#eff6ff' };
  if (mime.includes('png') || name.endsWith('.png') || name.endsWith('-preview.png')) return { icon: '🖼', label: 'PNG', color: '#7c3aed', bg: '#f5f3ff' };
  if (mime.includes('jpeg') || mime.includes('jpg') || name.endsWith('.jpg') || name.endsWith('.jpeg')) return { icon: '📷', label: 'JPG', color: '#059669', bg: '#ecfdf5' };
  if (mime.includes('image')) return { icon: '🖼', label: 'Image', color: '#7c3aed', bg: '#f5f3ff' };
  return { icon: '📄', label: 'File', color: '#6b7280', bg: '#f9fafb' };
}

export function MemoTemplatePage({ th, pageId, onToast }: {
  th: Theme; pageId: number; onToast: (m: string, t?: any) => void;
}) {
  const { copy, language } = useLanguage();
  const { request } = useApi();
  const [info, setInfo]       = useState<TemplateInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [activePreset, setActivePreset] = useState<string>('classic-memo');
  const [presetSaving, setPresetSaving] = useState(false);
  const [memosPerPage, setMemosPerPage] = useState<3 | 4>(3);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [mapping, setMapping] = useState<Record<string, FieldBox>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ key: string; mode: 'move'|'resize'; startX: number; startY: number; startBox: FieldBox } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileRef  = useRef<HTMLInputElement>(null);

  const BASE = `${API_BASE}/client-dashboard/${pageId}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, preset] = await Promise.all([
        request<TemplateInfo>(`${BASE}/template`).catch(() => null),
        request<{memoTheme: string; memoLayout: string; memosPerPage: number}>(`${BASE}/memo-preset`).catch(() => null),
      ]);
      if (t) { setInfo(t); setMapping(t.mapping || {}); }
      if (preset) {
        const found = PRESETS.find(p => p.theme === preset.memoTheme && p.layout === preset.memoLayout);
        if (found) setActivePreset(found.key);
        if (preset.memosPerPage === 4) setMemosPerPage(4);
        else setMemosPerPage(3);
      }
    } catch {}
    finally { setLoading(false); }
  }, [pageId]);

  const applyPreset = async (preset: typeof PRESETS[number]) => {
    setPresetSaving(true);
    try {
      await request(`${BASE}/memo-preset`, {
        method: 'PATCH',
        body: JSON.stringify({ memoTheme: preset.theme, memoLayout: preset.layout }),
      });
      setActivePreset(preset.key);
      onToast(copy(`✅ "${preset.label}" template selected!`, `✅ "${preset.label}" template selected!`), 'success');
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setPresetSaving(false); }
  };

  const fetchPreview = async () => {
    setPreviewLoading(true);
    try {
      const html = await request<string>(`${BASE}/memo-preview-html`);
      setPreviewHtml(typeof html === 'string' ? html : JSON.stringify(html));
    } catch (e: any) {
      onToast(e.message, 'error');
      setShowPreview(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const openPreview = async () => {
    setShowPreview(true);
    if (previewHtml) return; // already loaded
    await fetchPreview();
  };

  // Reset preview HTML when preset changes so next open re-fetches
  const applyPresetAndReset = async (preset: typeof PRESETS[number]) => {
    await applyPreset(preset);
    setPreviewHtml(null);
  };

  const changeMemosPerPage = async (count: 3 | 4) => {
    if (count === memosPerPage) return;
    setPresetSaving(true);
    try {
      await request(`${BASE}/memo-preset`, {
        method: 'PATCH',
        body: JSON.stringify({ memosPerPage: count }),
      });
      setMemosPerPage(count);
      setPreviewHtml(null);
      onToast(copy(`✅ প্রতি পাতায় ${count}টি মেমো সেট হয়েছে`, `✅ ${count} memos per page selected`), 'success');
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setPresetSaving(false); }
  };

  useEffect(() => { load(); }, [load]);

  const upload = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append('template', file);
    try {
      await fetch(`${BASE}/template/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('dfbot_token')||''}` },
        body: fd,
      });
      onToast(copy('✅ Template uploaded', '✅ Template uploaded')); await load();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setUploading(false); }
  };

  const saveMapping = async (confirm = false) => {
    setSaving(true);
    try {
      await request(`${BASE}/template/mapping`, {
        method: 'PATCH', body: JSON.stringify({ mapping, confirm }),
      });
      onToast(confirm ? copy('✅ Template confirmed!', '✅ Template confirmed!') : copy('✅ Draft saved', '✅ Draft saved'));
      await load();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const addField = (key: string) => {
    if (mapping[key]) return;
    const isAddress = key === 'customerAddress';
    const tw = info?.templateWidth || 794;
    const th2 = info?.templateHeight || 1123;
    setMapping(m => ({ ...m, [key]: {
      x: Math.round(tw * 0.12), y: 40, source: 'manual',
      width: Math.round(tw * (isAddress ? 0.76 : 0.50)),
      height: isAddress ? Math.round(th2 * 0.20) : 44,
      fontSize: isAddress ? 16 : 18,
      fontWeight: 700, align: 'left',
      maxLines: isAddress ? 6 : 2,
    } }));
    setSelected(key);
  };

  const removeField = (key: string) => {
    setMapping(m => { const n = {...m}; delete n[key]; return n; });
    if (selected === key) setSelected(null);
  };

  // Drag logic
  const getStageScale = () => {
    if (!stageRef.current || !info) return { sx: 1, sy: 1 };
    const rect = stageRef.current.getBoundingClientRect();
    return { sx: (info.templateWidth||1200) / rect.width, sy: (info.templateHeight||1800) / rect.height };
  };

  const onMouseDown = (e: React.MouseEvent, key: string, mode: 'move'|'resize') => {
    e.preventDefault(); e.stopPropagation();
    setSelected(key);
    const box = mapping[key];
    if (!box) return;
    setDragging({ key, mode, startX: e.clientX, startY: e.clientY, startBox: { ...box } });
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const { sx, sy } = getStageScale();
      const dx = (e.clientX - dragging.startX) * sx;
      const dy = (e.clientY - dragging.startY) * sy;
      setMapping(m => {
        const b = { ...dragging.startBox };
        if (dragging.mode === 'move') { b.x = Math.max(0, Math.round(b.x + dx)); b.y = Math.max(0, Math.round(b.y + dy)); }
        else { b.width = Math.max(40, Math.round(b.width + dx)); b.height = Math.max(20, Math.round(b.height + dy)); }
        return { ...m, [dragging.key]: { ...b, source: 'manual' } };
      });
    };
    const onUp = () => setDragging(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, info]);

  const selBox = selected ? mapping[selected] : null;
  const updateSelBox = (patch: Partial<FieldBox>) => {
    if (!selected) return;
    setMapping(m => ({ ...m, [selected]: { ...m[selected], ...patch, source: 'manual' } }));
  };

  const imgUrl = info?.fileUrl
    ? (info.fileUrl.startsWith('http') ? info.fileUrl : `${API_BASE.replace('/api','').replace(':3000','') || 'http://localhost:3000'}${info.fileUrl}`)
    : null;

  // Computed scale for display
  const stageW = 480;
  const stageH = info ? Math.round(stageW * ((info.templateHeight||1800) / (info.templateWidth||1200))) : 680;
  const scaleX = info ? stageW / (info.templateWidth||1200) : 1;
  const scaleY = info ? stageH / (info.templateHeight||1800) : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 20, fontWeight: 900 }}>📋 {copy('Memo Template', 'Memo Template')}</div>

      {/* ── Preview Modal ────────────────────────────────────────────── */}
      {showPreview && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowPreview(false)}>
          <div style={{
            background: th.panel, borderRadius: 16, overflow: 'hidden',
            width: 'min(92vw, 880px)', height: 'min(92vh, 780px)',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
          }} onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', borderBottom: `1px solid ${th.border}`,
            }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>👁 {copy('Memo Preview', 'Memo Preview')}</div>
                <div style={{ fontSize: 12, color: th.muted, marginTop: 2, display: 'flex', gap: 8 }}>
                  <span>{PRESETS.find(p => p.key === activePreset)?.icon} {PRESETS.find(p => p.key === activePreset)?.label}</span>
                  <span>·</span>
                  <span>{copy(`প্রতি পাতায় ${memosPerPage}টি মেমো · প্রতিটি ~${memosPerPage === 3 ? '90' : '65'}mm`, `${memosPerPage} memos per page · about ${memosPerPage === 3 ? '90' : '65'}mm each`)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button style={th.btnGhost}
                  onClick={() => { setPreviewHtml(null); fetchPreview(); }}>
                  🔄 Refresh
                </button>
                <button
                  style={{ ...th.btnPrimary, fontSize: 13 }}
                  onClick={() => {
                    const html = previewHtml;
                    if (!html) return;
                    const tab = window.open('', '_blank');
                    if (!tab) return;
                    tab.document.open();
                    tab.document.write(html);
                    tab.document.close();
                  }}>
                  {copy('🖨️ Print Tab', 'Print Tab')}
                </button>
                <button style={th.btnGhost} onClick={() => setShowPreview(false)}>✕</button>
              </div>
            </div>
            {/* Iframe */}
            <div style={{ flex: 1, position: 'relative' }}>
              {previewLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: th.muted }}>
                  <Spinner size={20} /> {copy('Loading preview...', 'Loading preview...')}
                </div>
              ) : previewHtml ? (
                <iframe
                  srcDoc={previewHtml}
                  style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
                  title="Memo Preview"
                />
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ── Preset Template Gallery ────────────────────────────────────── */}
      <div style={th.card}>
        <CardHeader th={th} title={copy('🎨 Beautiful Templates', '🎨 Beautiful Templates')} sub={copy('একটা template বেছে নাও — সাথে সাথে apply হবে', 'Choose a template and it will be applied instantly')}
          action={<button style={{ ...th.btnPrimary, whiteSpace: 'nowrap' }} onClick={openPreview}>👁 {copy('Preview', 'Preview')}</button>}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginTop: 4 }}>
          {PRESETS.map(preset => {
            const isActive = activePreset === preset.key;
            const [primary, bg, accent] = preset.palette;
            return (
              <div key={preset.key}
                onClick={() => !presetSaving && applyPresetAndReset(preset)}
                style={{
                  borderRadius: 14,
                  border: isActive ? `2.5px solid ${th.accent}` : `1.5px solid ${th.border}`,
                  background: isActive ? th.accentSoft : th.panel,
                  cursor: presetSaving ? 'not-allowed' : 'pointer',
                  overflow: 'hidden',
                  transition: 'all .15s',
                  boxShadow: isActive ? `0 0 0 3px ${th.accent}30` : th.shadow,
                  position: 'relative',
                }}
              >
                {/* Mini template preview */}
                <div style={{
                  height: 110, background: bg,
                  display: 'flex', flexDirection: 'column',
                  padding: 10, gap: 5, position: 'relative', overflow: 'hidden',
                }}>
                  {/* Header bar */}
                  <div style={{ background: primary, borderRadius: 5, height: 14, width: '70%' }} />
                  {/* Accent line */}
                  <div style={{ background: accent, height: 2, width: '90%', borderRadius: 2 }} />
                  {/* Content lines */}
                  {[90, 75, 60, 85].map((w, i) => (
                    <div key={i} style={{ background: primary, opacity: 0.15, height: 6, width: `${w}%`, borderRadius: 3 }} />
                  ))}
                  {/* Bottom COD box */}
                  <div style={{
                    position: 'absolute', bottom: 8, right: 8,
                    background: accent, borderRadius: 6, padding: '3px 8px',
                    fontSize: 9, color: '#fff', fontWeight: 800,
                  }}>COD ৳</div>
                  {/* Active checkmark */}
                  {isActive && (
                    <div style={{
                      position: 'absolute', top: 8, right: 8,
                      width: 22, height: 22, borderRadius: '50%',
                      background: th.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, color: '#fff',
                    }}>✓</div>
                  )}
                </div>

                {/* Info */}
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 15 }}>{preset.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? th.accent : th.text }}>
                      {preset.label}
                    </span>
                    {preset.badge && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4,
                        background: accent + '22', color: accent, marginLeft: 'auto',
                      }}>{preset.badge}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: th.muted, lineHeight: 1.4 }}>{language === 'en' ? preset.descEn : preset.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
        {/* ── Memos per page selector ────────────────────────── */}
        <div style={{
          marginTop: 14, padding: '14px 16px',
          background: th.bg, borderRadius: 12, border: `1px solid ${th.border}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            {copy('📐 প্রতি A4 পাতায় কতটা মেমো?', '📐 How many memos per A4 page?')}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {([3, 4] as const).map(count => {
              const isSelected = memosPerPage === count;
              const heightMm = count === 3 ? '~90mm' : '~65mm';
              const desc = count === 3 ? copy('বড় সাইজ, পড়তে সহজ', 'Larger size, easier to read') : copy('ছোট সাইজ, কাগজ বাঁচে', 'Smaller size, saves paper');
              return (
                <button key={count} onClick={() => changeMemosPerPage(count)} disabled={presetSaving}
                  style={{
                    ...(isSelected ? th.btnPrimary : th.btnGhost),
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: '12px 24px', gap: 3, minWidth: 110, borderRadius: 12,
                    boxShadow: isSelected ? `0 0 0 3px ${th.accent}30` : 'none',
                    opacity: presetSaving ? 0.6 : 1,
                  }}>
                  <span style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{count}</span>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{copy('per page', 'per page')}</span>
                  <span style={{ fontSize: 10, opacity: 0.75 }}>{copy(`${heightMm} প্রতিটি`, `${heightMm} each`)}</span>
                  <span style={{ fontSize: 10, opacity: 0.7 }}>{desc}</span>
                </button>
              );
            })}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 4 }}>
              <div style={{ fontSize: 12, color: th.muted }}>
                {memosPerPage === 3
                  ? copy('✅ এখন: ৩টি মেমো — প্রতিটি ~৯০মিমি লম্বা', '✅ Current: 3 memos - about 90mm each')
                  : copy('✅ এখন: ৪টি মেমো — প্রতিটি ~৬৫মিমি লম্বা', '✅ Current: 4 memos - about 65mm each')}
              </div>
              <div style={{ fontSize: 11, color: th.muted }}>
                {copy('Preview এ দেখলে সঠিক size বোঝা যাবে', 'Use Preview to verify the exact size')}
              </div>
            </div>
          </div>
        </div>

        {presetSaving && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, color: th.muted, fontSize: 13 }}>
            <Spinner size={13} /> {copy('Saving...', 'Saving...')}
          </div>
        )}
      </div>

      {/* Upload card */}
      <div style={th.card}>
        <CardHeader th={th} title={copy('📁 Upload Your Template', '📁 Upload Your Template')} sub={copy('নিজের ডিজাইন করা মেমো slip upload করুন — bot নিজে area চিহ্নিত করবে', 'Upload your custom memo slip design and the bot will detect field areas automatically')} />

        {/* Format support info */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            { fmt: 'PNG / JPG', icon: '🖼', hint: copy('সেরা ফলাফল — স্ক্যান বা ফোন ক্যামেরায় তোলা ছবি', 'Best result - scanned image or clear phone photo'), color: '#7c3aed' },
            { fmt: 'PDF',       icon: '📕', hint: copy('Word/Canva export — bot PNG-তে convert করবে', 'Export from Word/Canva - bot converts it to PNG'), color: '#dc2626' },
            { fmt: 'HTML',      icon: '🌐', hint: copy('{{placeholder}} দিলে সরাসরি কাজ করে', 'Works directly when you use {{placeholders}}'), color: '#2563eb' },
          ].map(f => (
            <div key={f.fmt} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: th.bg, border: `1px solid ${th.border}`, borderRadius: 8, fontSize: 11.5 }}>
              <span>{f.icon}</span>
              <span style={{ fontWeight: 700, color: f.color }}>{f.fmt}</span>
              <span style={{ color: th.muted }}>— {f.hint}</span>
            </div>
          ))}
        </div>

        <input ref={fileRef} type="file" accept="image/*,.html,.htm,.pdf,application/pdf" style={{ display: 'none' }}
          onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={{ ...th.btnPrimary, display: 'flex', alignItems: 'center', gap: 7 }}
            onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <><Spinner size={13}/> {copy('Uploading & Detecting...', 'Uploading & Detecting...')}</> : copy('📤 Upload Template', 'Upload Template')}
          </button>
          <button style={th.btnGhost} onClick={load} title="Refresh">🔄</button>
        </div>

        {info && (() => {
          const fmt = getFormatBadge(info);
          const confColor = info.detectionConfidence >= 70 ? '#16a34a' : info.detectionConfidence >= 40 ? '#d97706' : '#dc2626';
          return (
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 12 }}>
              {fmt && (
                <span style={{ padding: '3px 9px', background: fmt.bg, color: fmt.color, borderRadius: 6, fontWeight: 700, fontSize: 11 }}>
                  {fmt.icon} {fmt.label}
                </span>
              )}
              <span style={{ color: th.muted }}>
                <b style={{ color: th.text }}>{info.fileName}</b>
                {info.templateWidth ? ` · ${info.templateWidth}×${info.templateHeight}px` : ''}
              </span>
              <span style={{ padding: '3px 9px', background: info.status === 'confirmed' ? '#f0fdf4' : '#fffbeb', color: info.status === 'confirmed' ? '#16a34a' : '#d97706', borderRadius: 6, fontWeight: 700, fontSize: 11 }}>
                {info.status === 'confirmed' ? '✅ Confirmed' : '⏳ Draft'}
              </span>
              {info.autoDetected && (
                <span style={{ padding: '3px 9px', background: '#f5f3ff', borderRadius: 6, fontSize: 11, color: confColor, fontWeight: 700 }}>
                  🤖 Auto-detect: {info.detectionConfidence}% confidence
                </span>
              )}
              <span style={{ padding: '3px 9px', background: th.accentSoft, color: th.accentText, borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                mode: {info.renderMode}
              </span>
            </div>
          );
        })()}

        {uploading && (
          <div style={{ marginTop: 10, padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, fontSize: 12.5, color: '#1d4ed8', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Spinner size={13} color="#1d4ed8"/>
            {copy('PDF হলে Puppeteer দিয়ে PNG-তে convert হচ্ছে, OCR চলছে… একটু অপেক্ষা করুন', 'PDF is being converted to PNG with Puppeteer and OCR is running. Please wait a moment.')}
          </div>
        )}
      </div>

      {!info && !loading && <EmptyState icon="📋" title="No template uploaded yet" sub="Upload an image or HTML file above" />}

      {info && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
          {/* Stage (left) */}
          <div style={th.card}>
            <CardHeader th={th} title={copy('🗺 Field Mapping Editor', '🗺 Field Mapping Editor')}
              sub={copy(`Bot auto-detected ${Object.values(mapping).filter(b => (b as any).source !== 'manual').length}টি field · drag করে adjust করুন · resize handle: bottom-right`, `Bot auto-detected ${Object.values(mapping).filter(b => (b as any).source !== 'manual').length} fields · drag to adjust · resize handle: bottom-right`)}
            />

            {/* Legend: auto-detected vs manual */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 11, color: th.muted, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: '#2563eb', display: 'inline-block' }}/> {copy('Auto-detected', 'Auto-detected')}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: '#f59e0b', display: 'inline-block' }}/> {copy('Default position (drag to correct)', 'Default position (drag to correct)')}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: '#10b981', display: 'inline-block' }}/> {copy('Manually placed', 'Manually placed')}
              </span>
            </div>

            <div ref={stageRef} style={{
              position: 'relative', width: stageW, height: stageH,
              border: `1.5px solid ${th.border}`, borderRadius: 12, overflow: 'hidden',
              background: '#f8faff', cursor: 'default', userSelect: 'none',
            }} onClick={() => setSelected(null)}>
              {/* Template background: img for raster, embed for PDF */}
              {imgUrl && info.renderMode !== 'pdf-overlay' && (
                <img src={imgUrl} alt="template" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
              )}
              {imgUrl && info.renderMode === 'pdf-overlay' && (
                <embed src={imgUrl} type="application/pdf" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
              )}

              {Object.entries(mapping).map(([key, box]) => {
                const isSel = selected === key;
                const src = (box as any).source || '';
                // Color based on detection source
                const color = src === 'manual' ? '#10b981' : src === 'auto' ? '#2563eb' : '#f59e0b';
                const sampleText = SAMPLE_FIELD_DATA[language][key as keyof typeof SAMPLE_FIELD_DATA.en] || key;
                const displayH = Math.max(box.height * scaleY, 22);
                return (
                  <div key={key}
                    onMouseDown={e => onMouseDown(e, key, 'move')}
                    style={{
                      position: 'absolute',
                      left: box.x * scaleX, top: box.y * scaleY,
                      width: box.width * scaleX, height: displayH,
                      border: `2px solid ${color}`,
                      background: isSel ? `${color}28` : `${color}12`,
                      borderRadius: 5,
                      cursor: 'move',
                      outline: isSel ? `2px solid ${color}99` : 'none',
                      outlineOffset: 2,
                      transition: 'background .1s',
                    }}
                  >
                    {/* Field label tag */}
                    <div style={{ position: 'absolute', top: 0, left: 0, background: color, color: '#fff', fontSize: 8, padding: '1px 4px', borderBottomRightRadius: 4, fontWeight: 700, whiteSpace: 'nowrap', lineHeight: 1.6 }}>
                      {FIELD_LABELS[key] || key}
                    </div>
                    {/* Sample data preview inside box */}
                    {displayH > 22 && (
                      <div style={{
                        position: 'absolute', top: 14, left: 3, right: 14, bottom: 3,
                        fontSize: Math.max(Math.round((box.fontSize || 16) * scaleX), 7),
                        fontWeight: box.fontWeight || 700,
                        color: '#111', lineHeight: 1.3,
                        overflow: 'hidden',
                        wordBreak: 'break-word',
                        whiteSpace: key === 'customerAddress' ? 'normal' : 'nowrap',
                        textOverflow: key === 'customerAddress' ? undefined : 'ellipsis',
                        opacity: 0.75,
                      }}>
                        {sampleText}
                      </div>
                    )}
                    {/* Resize handle */}
                    <div
                      onMouseDown={e => onMouseDown(e, key, 'resize')}
                      style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, background: color, borderTopLeftRadius: 4, cursor: 'nwse-resize' }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Save/Confirm buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <button style={th.btnPrimary} onClick={() => saveMapping(false)} disabled={saving}>
                {saving ? <Spinner size={13}/> : copy('💾 Save Draft', 'Save Draft')}
              </button>
              <button style={{ ...th.btnSuccess, fontWeight: 700 }} onClick={() => saveMapping(true)} disabled={saving}>
                {copy('✅ Confirm & Use', 'Confirm & Use')}
              </button>
              <span style={{ fontSize: 11.5, color: th.muted, marginLeft: 4 }}>
                {copy('Confirm করলে bot এই mapping দিয়ে memo print করবে', 'Once confirmed, the bot will print memos using this mapping')}
              </span>
            </div>
          </div>

          {/* Controls (right) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Add/remove fields */}
            <div style={th.card}>
              <CardHeader th={th} title={copy('Fields', 'Fields')} sub={copy('Click + Add to place on stage', 'Click + Add to place it on the stage')} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {FIELD_KEYS.map((k, ki) => {
                  const added = Boolean(mapping[k]);
                  const color = FIELD_COLORS[ki % FIELD_COLORS.length];
                  const src = added ? ((mapping[k] as any).source || '') : '';
                  const srcLabel = src === 'auto' ? '🤖' : src === 'auto-default' ? '📍' : src === 'manual' ? '✋' : '';
                  return (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 12, fontWeight: selected === k ? 700 : 400, color: selected === k ? th.accent : th.text }}>
                        {FIELD_LABELS[k]}
                        {srcLabel && <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>{srcLabel}</span>}
                      </span>
                      {added
                        ? <button style={{ ...th.btnSmDanger, fontSize: 10 }} onClick={() => removeField(k)}>✕</button>
                        : <button style={{ ...th.btnSmAccent, fontSize: 10 }} onClick={() => addField(k)}>{copy('+ Add', '+ Add')}</button>
                      }
                    </div>
                  );
                })}
              </div>

              {/* Address hint */}
              <div style={{ marginTop: 10, padding: '8px 10px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, fontSize: 11, color: '#92400e', lineHeight: 1.6 }}>
                {copy('📌 Address field এর height বড় রাখুন — লম্বা ঠিকানা auto-wrap হবে, কোনো text কাটবে না।', '📌 Keep the Address field tall enough so long addresses can wrap without being cut off.')}
              </div>
            </div>

            {/* Selected field editor */}
            {selected && selBox && (
              <div style={{ ...th.card, border: `2px solid ${th.accent}` }}>
                <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, color: th.accent }}>
                  ✏️ {copy('Edit:', 'Edit:')} {FIELD_LABELS[selected] || selected}
                </div>
                {/* Sample preview */}
                <div style={{ marginBottom: 10, padding: '6px 8px', background: th.bg, borderRadius: 7, fontSize: 11, color: '#111', wordBreak: 'break-word', lineHeight: 1.5, fontWeight: Number(selBox.fontWeight || 700) }}>
                  {SAMPLE_FIELD_DATA[language][selected as keyof typeof SAMPLE_FIELD_DATA.en] || selected}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { l: 'X', k: 'x' }, { l: 'Y', k: 'y' },
                    { l: 'Width', k: 'width' }, { l: 'Height', k: 'height' },
                    { l: 'Font Size', k: 'fontSize' }, { l: 'Max Lines', k: 'maxLines' },
                  ].map(({ l, k }) => (
                    <Field key={k} th={th} label={l}>
                      <input style={{ ...th.input, padding: '7px 10px', fontSize: 12 }} type="number" min={k==='fontSize'?8:k==='maxLines'?1:0}
                        value={(selBox as any)[k] ?? ''}
                        onChange={e => updateSelBox({ [k]: Number(e.target.value) })} />
                    </Field>
                  ))}
                  <Field th={th} label="Align">
                    <select style={{ ...th.input, padding: '7px 10px', fontSize: 12 }} value={selBox.align || 'left'}
                      onChange={e => updateSelBox({ align: e.target.value })}>
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </Field>
                  <Field th={th} label="Bold">
                    <select style={{ ...th.input, padding: '7px 10px', fontSize: 12 }} value={selBox.fontWeight || 700}
                      onChange={e => updateSelBox({ fontWeight: Number(e.target.value) })}>
                      <option value={400}>Normal</option>
                      <option value={600}>Semi-bold</option>
                      <option value={700}>Bold</option>
                    </select>
                  </Field>
                </div>
                {selected === 'customerAddress' && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#92400e', background: '#fff7ed', padding: '6px 9px', borderRadius: 7 }}>
                    {copy('💡 Address এর Height বড় করুন যাতে লম্বা ঠিকানাও দেখা যায়', '💡 Increase the Address height so long addresses stay visible')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
