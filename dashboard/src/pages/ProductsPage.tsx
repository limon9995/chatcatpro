import { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState, FieldWithInfo, Spinner } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE, useApi } from '../hooks/useApi';
import { useLanguage } from '../i18n';

type Product = {
  id: number; code: string; name: string | null;
  price: number; costPrice: number; stockQty: number;
  isActive: boolean; postCaption: string | null;
  videoUrl: string | null; catalogVisible: boolean;
  imageUrl: string | null; description: string | null;
  referenceImagesJson: string | null;
  productGroup: string | null;
  variantLabel: string | null;
  variantOptions: string | null;
  // V18: Image recognition metadata
  category: string | null; color: string | null;
  tags: string | null; imageKeywords: string | null;
  visionSearchable: boolean;
  // V19: Detection mode
  detectionMode: 'OCR' | 'AI_VISION';
};

type EditData = {
  name?: string; price?: number; costPrice?: number; stockQty?: number;
  postCaption?: string; videoUrl?: string; catalogVisible?: boolean;
  description?: string; imageUrl?: string; referenceImagesJson?: string; productGroup?: string; variantLabel?: string; variantOptions?: string;
  // V18: Image recognition metadata
  category?: string; color?: string; tags?: string; imageKeywords?: string;
  visionSearchable?: boolean;
  // V19: Detection mode
  detectionMode?: 'OCR' | 'AI_VISION';
};

const EMPTY = { code: '', name: '', price: 0, costPrice: 0, stockQty: 0, postCaption: '', videoUrl: '', catalogVisible: true, description: '', imageUrl: '', referenceImagesJson: '', productGroup: '', variantLabel: '', variantOptions: '', category: '', color: '', tags: '', imageKeywords: '', visionSearchable: false, detectionMode: 'AI_VISION' as 'OCR' | 'AI_VISION' };

/** Convert DB JSON variantOptions → textarea text ("Size: S,M,L,XL\nColor: Red,Blue") */
function variantOptionsToText(json: string | null): string {
  if (!json) return '';
  try {
    const arr: { label: string; choices?: string[] }[] = JSON.parse(json);
    return arr.map(v => v.choices?.length ? `${v.label}: ${v.choices.join(',')}` : v.label).join('\n');
  } catch { return ''; }
}

function referenceImagesToText(value: string | null): string {
  if (!value) return '';
  try {
    const arr = JSON.parse(value);
    if (Array.isArray(arr)) {
      return arr
        .map(item => String(item || '').trim())
        .filter(Boolean)
        .join('\n');
    }
  } catch {}
  return value;
}

function parseReferenceImages(value: string | null | undefined): string[] {
  const raw = String(value || '').trim();
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr
        .map(item => String(item || '').trim())
        .filter(Boolean)
        .filter((url, index, all) => all.indexOf(url) === index);
    }
  } catch {}
  return raw
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .filter((url, index, all) => all.indexOf(url) === index);
}

function getVideoEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch?.[1]) {
    return `https://www.youtube.com/embed/${ytMatch[1]}`;
  }
  if (url.includes('facebook.com') || url.includes('fb.watch')) {
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`;
  }
  return null;
}

function UniquenessCard({ data, hidden, onHide, th, onApplyMode }: {
  data: any; hidden: boolean; onHide: () => void; th: any;
  onApplyMode: (mode: 'OCR' | 'AI_VISION') => void;
}) {
  if (!data || hidden) return null;
  const pct: number = data.uniquenessPercent ?? 0;
  const isGood = pct >= 70;
  const isMid = pct >= 45 && pct < 70;
  const color = isGood ? '#34d399' : isMid ? '#f59e0b' : '#f87171';
  const bg = isGood ? 'rgba(16,185,129,0.07)' : isMid ? 'rgba(245,158,11,0.07)' : 'rgba(248,113,113,0.07)';
  const border = isGood ? 'rgba(16,185,129,0.25)' : isMid ? 'rgba(245,158,11,0.25)' : 'rgba(248,113,113,0.25)';
  const icon = isGood ? '✅' : isMid ? '⚠️' : '🔴';
  const topSimilar: any[] = data.topSimilar ?? [];
  return (
    <div style={{ marginTop: 12, background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: '12px 14px', position: 'relative' }}>
      <button onClick={onHide} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: th.muted, cursor: 'pointer', fontSize: 16, lineHeight: 1 }} title="Hide">×</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color, minWidth: 54, textAlign: 'center', lineHeight: 1 }}>
          {pct}%
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color }}>{icon} Uniqueness Score</div>
          <div style={{ fontSize: 11, color: th.muted, marginTop: 2 }}>{data.reason}</div>
        </div>
      </div>
      {/* Progress bar */}
      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', marginBottom: 10, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
      {/* Similar products */}
      {topSimilar.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: th.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Similar Products Found ({data.totalProductsChecked} checked)
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {topSimilar.map((s: any) => (
              <div key={s.code} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '4px 8px', fontSize: 11 }}>
                {s.imageUrl && <img src={s.imageUrl} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }} />}
                <span style={{ color: th.text }}>{s.name || s.code}</span>
                <span style={{ color, fontWeight: 700 }}>{s.similarity}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Recommendation buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => onApplyMode(data.recommendation)}
          style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${color}`, background: `${color}18`, color, fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
        >
          {data.recommendation === 'AI_VISION' ? '🤖 AI Vision Mode Apply করুন' : '📷 OCR Mode Apply করুন'} (Recommended)
        </button>
        <button
          type="button"
          onClick={() => onApplyMode(data.recommendation === 'AI_VISION' ? 'OCR' : 'AI_VISION')}
          style={{ padding: '7px 10px', borderRadius: 8, border: `1px solid ${th.border}`, background: 'transparent', color: th.muted, fontSize: 11, cursor: 'pointer' }}
        >
          {data.recommendation === 'AI_VISION' ? 'OCR দিয়ে চালাবো' : 'AI Vision দিয়ে চালাবো'}
        </button>
      </div>
    </div>
  );
}

export function ProductsPage({ th, pageId, onToast }: {
  th: Theme; pageId: number; onToast: (m: string, t?: any) => void;
}) {
  const { copy } = useLanguage();
  const { request } = useApi();
  const [products, setProducts]   = useState<Product[]>([]);
  const [loading, setLoading]     = useState(false);
  const [view, setView]           = useState<'grid' | 'list'>('grid');
  const [search, setSearch]       = useState('');
  const [editId, setEditId]       = useState<number | null>(null);
  const [editData, setEditData]   = useState<EditData>({});
  const [newP, setNewP]           = useState(EMPTY);
  const [showNew, setShowNew]     = useState(false);
  const [busy, setBusy]           = useState(false);
  const [newVideoGuide, setNewVideoGuide] = useState<any | null>(null);
  const [editVideoGuide, setEditVideoGuide] = useState<any | null>(null);
  const [analyzingNew, setAnalyzingNew] = useState(false);
  const [analyzingEdit, setAnalyzingEdit] = useState(false);
  const [uploadingNewImage, setUploadingNewImage] = useState(false);
  const [uploadingEditImage, setUploadingEditImage] = useState(false);
  const [uploadingNewRefs, setUploadingNewRefs] = useState(false);
  const [uploadingEditRefs, setUploadingEditRefs] = useState(false);
  const [uniquenessNew, setUniquenessNew] = useState<any | null>(null);
  const [uniquenessEdit, setUniquenessEdit] = useState<any | null>(null);
  const [uniquenessNewHidden, setUniquenessNewHidden] = useState(false);
  const [uniquenessEditHidden, setUniquenessEditHidden] = useState(false);
  const [generatingDescNew, setGeneratingDescNew] = useState(false);
  const [generatingDescEdit, setGeneratingDescEdit] = useState(false);
  const newImageRef = useRef<HTMLInputElement>(null);
  const newRefsRef = useRef<HTMLInputElement>(null);
  const editImageRef = useRef<HTMLInputElement>(null);
  const editRefsRef = useRef<HTMLInputElement>(null);
  const BASE = `${API_BASE}/client-dashboard/${pageId}`;

  const load = useCallback(async () => {
    setLoading(true);
    try { setProducts(await request<Product[]>(`${BASE}/products`)); }
    catch (e: any) { onToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [pageId]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (p: Product) => {
    setEditId(p.id);
    setEditData({ name: p.name ?? '', price: p.price, costPrice: p.costPrice, stockQty: p.stockQty, postCaption: p.postCaption ?? '', videoUrl: p.videoUrl ?? '', catalogVisible: p.catalogVisible ?? true, description: p.description ?? '', imageUrl: p.imageUrl ?? '', referenceImagesJson: referenceImagesToText(p.referenceImagesJson), productGroup: p.productGroup ?? '', variantLabel: p.variantLabel ?? '', variantOptions: variantOptionsToText(p.variantOptions), category: p.category ?? '', color: p.color ?? '', tags: p.tags ?? '', imageKeywords: p.imageKeywords ?? '', visionSearchable: p.visionSearchable ?? false, detectionMode: p.detectionMode ?? 'AI_VISION' });
    setEditVideoGuide(null);
    setUniquenessEdit(null);
    setUniquenessEditHidden(false);
  };

  const saveEdit = async (p: Product) => {
    setBusy(true);
    try {
      await request(`${BASE}/products/${p.code}`, { method: 'PATCH', body: JSON.stringify(editData) });
      onToast(copy('✓ Saved', '✓ Saved')); setEditId(null); load();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const createProduct = async () => {
    if (!newP.code.trim()) return onToast(copy('Product code দিন', 'Enter a product code'), 'error');
    setBusy(true);
    try {
      await request(`${BASE}/products`, { method: 'POST', body: JSON.stringify(newP) });
      onToast(copy('✓ Product created', '✓ Product created')); setNewP(EMPTY); setShowNew(false); load();
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const deleteProduct = async (code: string) => {
    if (!confirm(copy('Delete করবেন?', 'Do you want to delete this product?'))) return;
    try {
      await request(`${BASE}/products/${code}`, { method: 'DELETE' });
      onToast(copy('Deleted', 'Deleted')); load();
    } catch (e: any) { onToast(e.message, 'error'); }
  };

  const uploadProductFile = useCallback(async (file: File): Promise<string> => {
    const token = localStorage.getItem('dfbot_token') || '';
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${BASE}/products/upload-image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: fd,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Upload failed');
    }
    const data = await res.json();
    return `${API_BASE.replace(/\/api$/, '')}${data.url}`;
  }, [BASE]);

  const appendReferenceUrls = (current: string, urls: string[]) => {
    const merged = [...parseReferenceImages(current), ...urls]
      .filter((url, index, all) => all.indexOf(url) === index);
    return merged.join('\n');
  };

  const analyzeImage = async (imageUrl: string, target: 'new' | 'edit') => {
    if (!imageUrl.trim()) {
      onToast(copy('আগে image দিন', 'Add an image first'), 'error');
      return;
    }
    if (target === 'new') { setAnalyzingNew(true); setUniquenessNewHidden(false); }
    else { setAnalyzingEdit(true); setUniquenessEditHidden(false); }
    try {
      const currentCode = target === 'edit' ? products.find(p => p.id === editId)?.code : undefined;
      const result = await request<any>(`${BASE}/products/analyze-image`, {
        method: 'POST',
        body: JSON.stringify({ imageUrl, excludeCode: currentCode }),
      });
      const suggested = result?.suggested || {};
      const applyFn = (prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          category: (suggested.category || prev.category || '').trim(),
          color: (suggested.color || prev.color || '').trim(),
          imageKeywords: (suggested.imageKeywords || prev.imageKeywords || '').trim(),
          tags: (suggested.tags || prev.tags || '').trim(),
          visionSearchable: typeof suggested.visionSearchable === 'boolean' ? suggested.visionSearchable : !!prev.visionSearchable,
        };
      };
      if (target === 'new') {
        setNewP((p) => applyFn(p));
        setUniquenessNew(result?.uniqueness || null);
      } else {
        setEditData((d) => applyFn(d));
        setUniquenessEdit(result?.uniqueness || null);
      }
      if (result?.fromCache) {
        onToast(copy('এই ছবিটা আগেই analyze করা হয়েছে — same result ব্যবহার হচ্ছে (wallet charge হয়নি)', 'Same photo detected — cached result used (no charge)'), 'warning');
      } else {
        onToast(copy('AI analysis applied', 'AI analysis applied'), 'success');
      }
    } catch (e: any) {
      onToast((e as any).message ?? copy('AI analysis ব্যর্থ হয়েছে', 'AI analysis failed'), 'error');
    } finally {
      if (target === 'new') setAnalyzingNew(false);
      else setAnalyzingEdit(false);
    }
  };

  const batchAnalyzeAll = async (referenceImagesJson: string | undefined, mainImageUrl: string | undefined, target: 'new' | 'edit') => {
    const urls = [
      ...(mainImageUrl ? [mainImageUrl] : []),
      ...parseReferenceImages(referenceImagesJson ?? ''),
    ].filter(Boolean).slice(0, 5);
    if (urls.length < 2) {
      onToast(copy('কমপক্ষে ২টা reference image দরকার', 'Need at least 2 reference images'), 'error');
      return;
    }
    if (target === 'new') { setAnalyzingNew(true); setUniquenessNewHidden(false); }
    else { setAnalyzingEdit(true); setUniquenessEditHidden(false); }
    try {
      const currentCode = target === 'edit' ? products.find(p => p.id === editId)?.code : undefined;
      const result = await request<any>(`${BASE}/products/batch-analyze`, {
        method: 'POST',
        body: JSON.stringify({ imageUrls: urls, excludeCode: currentCode }),
      });
      const suggested = result?.suggested || {};
      const applyFn = (prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          category: (suggested.category || prev.category || '').trim(),
          color: (suggested.color || prev.color || '').trim(),
          imageKeywords: (suggested.imageKeywords || prev.imageKeywords || '').trim(),
          tags: (suggested.tags || prev.tags || '').trim(),
          visionSearchable: typeof suggested.visionSearchable === 'boolean' ? suggested.visionSearchable : !!prev.visionSearchable,
        };
      };
      if (target === 'new') {
        setNewP((p) => applyFn(p));
        setUniquenessNew(result?.uniqueness || null);
      } else {
        setEditData((d) => applyFn(d));
        setUniquenessEdit(result?.uniqueness || null);
      }
      if (result?.fromCache) {
        onToast(copy('এই ছবিগুলো আগেই analyze করা হয়েছে — same result ব্যবহার হচ্ছে (wallet charge হয়নি)', 'Same photos detected — cached result used (no charge)'), 'warning');
      } else {
        onToast(copy(`${urls.length}টা angle থেকে AI analysis সম্পন্ন ✓`, `AI analysis from ${urls.length} angles done ✓`), 'success');
      }
    } catch (e: any) {
      onToast((e as any).message ?? copy('AI analysis ব্যর্থ হয়েছে', 'AI analysis failed'), 'error');
    } finally {
      if (target === 'new') setAnalyzingNew(false);
      else setAnalyzingEdit(false);
    }
  };

  const generateDescription = async (target: 'new' | 'edit') => {
    const data = target === 'new' ? newP : editData;
    const name = (data.name || '').trim();
    if (!name) return onToast(copy('আগে product name দিন', 'Enter a product name first'), 'error');
    if (target === 'new') setGeneratingDescNew(true);
    else setGeneratingDescEdit(true);
    try {
      const result = await request<{ text: string | null }>(`${API_BASE}/ai-generate/product-description`, {
        method: 'POST',
        body: JSON.stringify({
          pageId,
          name,
          category: (data.category || '').trim(),
          color: (data.color || '').trim(),
          keywords: (data.imageKeywords || '').trim(),
        }),
      });
      if (result?.text) {
        if (target === 'new') setNewP(p => ({ ...p, description: result.text! }));
        else setEditData(d => ({ ...d, description: result.text! }));
        onToast(copy('AI description তৈরি হয়েছে ✓', 'AI description generated ✓'), 'success');
      }
    } catch (e: any) {
      onToast(e.message ?? copy('AI description ব্যর্থ হয়েছে', 'AI description failed'), 'error');
    } finally {
      if (target === 'new') setGeneratingDescNew(false);
      else setGeneratingDescEdit(false);
    }
  };

  const loadVideoGuide = async (videoUrl: string, existingImages: number, target: 'new' | 'edit') => {
    if (!videoUrl.trim()) {
      onToast(copy('আগে video URL দিন', 'Add a video URL first'), 'error');
      return;
    }
    try {
      const guide = await request<any>(`${BASE}/products/video-guide`, {
        method: 'POST',
        body: JSON.stringify({ videoUrl, existingImages }),
      });
      if (target === 'new') setNewVideoGuide(guide);
      else setEditVideoGuide(guide);
    } catch (e: any) {
      onToast(e.message, 'error');
    }
  };

  const filtered = products.filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return p.code.toLowerCase().includes(s) || (p.name || '').toLowerCase().includes(s);
  });

  const stats = {
    total:    products.length,
    active:   products.filter(p => p.isActive).length,
    lowStock: products.filter(p => p.stockQty <= 3 && p.isActive).length,
    withImg:  products.filter(p => p.imageUrl).length,
    withAngles: products.filter(p => parseReferenceImages(p.referenceImagesJson).length > 0).length,
    withVid:  products.filter(p => p.videoUrl).length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', margin: 0 }}>Products</h1>
          <p style={{ fontSize: 13, color: th.muted, margin: '3px 0 0' }}>
            {stats.active} {copy('active', 'active')} · {stats.lowStock > 0 ? <span style={{ color: '#ea580c' }}>{stats.lowStock} {copy('low stock', 'low stock')}</span> : copy('stock ok', 'stock ok')}
          </p>
        </div>
        <button style={th.btnPrimary} onClick={() => setShowNew(v => !v)}>
          {showNew ? copy('✕ Cancel', '✕ Cancel') : copy('+ Add Product', '+ Add Product')}
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 10 }}>
        {[
          { label: 'Total',     val: stats.total,    color: th.accent },
          { label: 'Active',    val: stats.active,   color: '#16a34a' },
          { label: 'Low Stock', val: stats.lowStock, color: stats.lowStock > 0 ? '#ea580c' : '#16a34a' },
          { label: 'With Photo',val: stats.withImg,  color: '#8b5cf6' },
          { label: 'Multi Angle',val: stats.withAngles,  color: '#ec4899' },
          { label: 'With Video',val: stats.withVid,  color: '#0891b2' },
        ].map(k => (
          <div key={k.label} style={{ ...th.card2, textAlign: 'center', padding: '12px 8px' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: k.color, letterSpacing: '-0.05em' }}>{k.val}</div>
            <div style={{ fontSize: 10.5, color: th.muted, marginTop: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* New product form */}
      {showNew && (
        <div style={{ ...th.card, border: `1.5px solid ${th.accent}44` }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>{copy('Add New Product', 'Add New Product')}</div>
          {(() => {
            const newVideoEmbedUrl = getVideoEmbedUrl(newP.videoUrl);
            return (
              <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
            <FieldWithInfo th={th} label="Code *" helpText={copy('Unique product code। যেমন: DF-0001, SK-0042', 'Unique product code, for example: DF-0001, SK-0042')}>
              <input style={th.input} placeholder="DF-0001" value={newP.code}
                onChange={e => setNewP(p => ({ ...p, code: e.target.value.toUpperCase() }))} />
            </FieldWithInfo>
            <FieldWithInfo th={th} label="Name" helpText={copy('Product এর নাম', 'Product name')}>
              <input style={th.input} placeholder="Blue Kurti" value={newP.name}
                onChange={e => setNewP(p => ({ ...p, name: e.target.value }))} />
            </FieldWithInfo>
            <FieldWithInfo th={th} label="Price (৳)" helpText="Selling price">
              <input style={th.input} type="number" min={0} value={newP.price || ''}
                onChange={e => setNewP(p => ({ ...p, price: Number(e.target.value) }))} />
            </FieldWithInfo>
            <FieldWithInfo th={th} label="Cost Price (৳)" helpText={copy('আপনার ক্রয় মূল্য — profit হিসাবের জন্য', 'Your purchase cost, used for profit calculation')}>
              <input style={th.input} type="number" min={0} value={newP.costPrice || ''}
                onChange={e => setNewP(p => ({ ...p, costPrice: Number(e.target.value) }))} />
            </FieldWithInfo>
            <FieldWithInfo th={th} label="Stock" helpText={copy('প্রাথমিক stock পরিমাণ', 'Initial stock quantity')}>
              <input style={th.input} type="number" min={0} value={newP.stockQty || ''}
                onChange={e => setNewP(p => ({ ...p, stockQty: Number(e.target.value) }))} />
            </FieldWithInfo>
            <FieldWithInfo th={th} label="Image URL" helpText={copy('Product এর ছবির URL', 'Product image URL')}>
              <div style={{ display: 'grid', gap: 8 }}>
                <input style={th.input} placeholder="https://..." value={newP.imageUrl}
                  onChange={e => setNewP(p => ({ ...p, imageUrl: e.target.value }))} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" style={th.btnGhost} onClick={() => newImageRef.current?.click()} disabled={uploadingNewImage}>
                    {uploadingNewImage ? copy('Uploading...', 'Uploading...') : copy('Upload Main Image', 'Upload Main Image')}
                  </button>
                  <button type="button" style={th.btnGhost} onClick={() => analyzeImage(newP.imageUrl || parseReferenceImages(newP.referenceImagesJson)[0] || '', 'new')} disabled={analyzingNew}>
                    {analyzingNew ? copy('Analyzing...', 'Analyzing...') : copy('AI Analyze', 'AI Analyze')}
                  </button>
                </div>
                <input
                  ref={newImageRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingNewImage(true);
                    try {
                      const url = await uploadProductFile(file);
                      setNewP((p) => ({ ...p, imageUrl: url }));
                      onToast(copy('Main image uploaded', 'Main image uploaded'), 'success');
                    } catch (err: any) {
                      onToast(err.message, 'error');
                    } finally {
                      setUploadingNewImage(false);
                      e.target.value = '';
                    }
                  }}
                />
              </div>
            </FieldWithInfo>
            <FieldWithInfo th={th} label="Video URL" helpText={copy('YouTube video link দিন, catalog-এ ভিডিও দেখাবে', 'Add a YouTube video link to show it in the catalog')}>
              <div style={{ display: 'grid', gap: 8 }}>
                <input style={th.input} placeholder="https://youtube.com/watch?v=..." value={newP.videoUrl}
                  onChange={e => setNewP(p => ({ ...p, videoUrl: e.target.value }))} />
                <button type="button" style={th.btnGhost} onClick={() => loadVideoGuide(newP.videoUrl, parseReferenceImages(newP.referenceImagesJson).length, 'new')}>
                  {copy('Video Screenshot Plan', 'Video Screenshot Plan')}
                </button>
              </div>
            </FieldWithInfo>
          </div>
          <div style={{ marginTop: 12 }}>
            <FieldWithInfo th={th} label="Description" helpText={copy('Product সম্পর্কে ছোট বিবরণ — catalog ও bot reply-এ দেখাবে', 'Short description shown in catalog and bot replies')}>
              <div style={{ display: 'grid', gap: 8 }}>
                <textarea
                  style={{ ...th.input, minHeight: 72, resize: 'vertical', fontSize: 12.5 }}
                  placeholder={copy('এই product সম্পর্কে ২-৩ লাইন লিখুন...', 'Write 2-3 lines about this product...')}
                  value={newP.description}
                  onChange={e => setNewP(p => ({ ...p, description: e.target.value }))}
                />
                <button type="button" style={th.btnGhost} onClick={() => generateDescription('new')} disabled={generatingDescNew}>
                  {generatingDescNew ? copy('AI লিখছে...', 'AI writing...') : copy('✨ AI লিখুন', '✨ AI Write')}
                </button>
              </div>
            </FieldWithInfo>
          </div>
          <div style={{ marginTop: 12 }}>
            <FieldWithInfo th={th} label="Reference Images" helpText={copy('একই product-এর front, side, back, close-up, video screenshot আলাদা লাইনে দিন। এতে customer shortlist দেখে সহজে confirm করতে পারবে।', 'Paste multiple angles of the same product, one URL per line: front, side, back, close-up, or clear video screenshots.')}>
              <div style={{ display: 'grid', gap: 8 }}>
                <textarea
                  style={{ ...th.input, minHeight: 92, resize: 'vertical', fontSize: 12.5 }}
                  placeholder={'https://...\nhttps://...\nhttps://...'}
                  value={newP.referenceImagesJson}
                  onChange={e => setNewP(p => ({ ...p, referenceImagesJson: e.target.value }))}
                />
                <button type="button" style={th.btnGhost} onClick={() => newRefsRef.current?.click()} disabled={uploadingNewRefs}>
                  {uploadingNewRefs ? copy('Uploading...', 'Uploading...') : copy('Upload Angle Images', 'Upload Angle Images')}
                </button>
                <input
                  ref={newRefsRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    if (!files.length) return;
                    setUploadingNewRefs(true);
                    try {
                      const urls = await Promise.all(files.map(uploadProductFile));
                      setNewP((p) => ({
                        ...p,
                        referenceImagesJson: appendReferenceUrls(p.referenceImagesJson, urls),
                      }));
                      onToast(copy('Angle images uploaded', 'Angle images uploaded'), 'success');
                    } catch (err: any) {
                      onToast(err.message, 'error');
                    } finally {
                      setUploadingNewRefs(false);
                      e.target.value = '';
                    }
                  }}
                />
              </div>
            </FieldWithInfo>
            {parseReferenceImages(newP.referenceImagesJson).length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(72px,1fr))', gap: 8 }}>
                  {parseReferenceImages(newP.referenceImagesJson).slice(0, 6).map((url, idx) => (
                    <div key={url + idx} style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${th.border}`, background: th.surface, aspectRatio: '1 / 1', position: 'relative' }}>
                      <img src={url} alt={`ref-${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      <div style={{ position: 'absolute', bottom: 3, right: 4, fontSize: 9, background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: 4, padding: '1px 4px' }}>#{idx + 1}</div>
                    </div>
                  ))}
                </div>
                {(parseReferenceImages(newP.referenceImagesJson).length + (newP.imageUrl ? 1 : 0)) >= 2 && (
                  <button
                    type="button"
                    style={{ ...th.btnGhost, marginTop: 8, width: '100%', justifyContent: 'center', background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.3)', color: '#34d399', fontSize: 12, fontWeight: 700 }}
                    onClick={() => batchAnalyzeAll(newP.referenceImagesJson, newP.imageUrl, 'new')}
                    disabled={analyzingNew}
                  >
                    {analyzingNew ? '⏳ AI analyzing all angles...' : `🤖 Analyze All ${parseReferenceImages(newP.referenceImagesJson).length + (newP.imageUrl ? 1 : 0)} Angles Together`}
                  </button>
                )}
              </div>
            )}
          </div>
          {newVideoGuide && (
            <div style={{ marginTop: 12, ...th.card2, borderRadius: 14, padding: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Video Screenshot Plan</div>
              <div style={{ fontSize: 12.5, color: th.muted, marginBottom: 8 }}>{newVideoGuide.reason}</div>
              <div style={{ display: 'grid', gap: 4 }}>
                {(newVideoGuide.checklist || []).map((item: string, idx: number) => (
                  <div key={item + idx} style={{ fontSize: 12.5 }}>{idx + 1}. {item}</div>
                ))}
              </div>
            </div>
          )}
          {newVideoEmbedUrl && (
            <div style={{ marginTop: 12, borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9', background: '#000', border: `1px solid ${th.border}` }}>
              <iframe
                src={newVideoEmbedUrl}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                allowFullScreen
                title="new-product-video-preview"
              />
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={newP.catalogVisible}
                onChange={e => setNewP(p => ({ ...p, catalogVisible: e.target.checked }))}
                style={{ accentColor: th.accent }}
              />
              {copy('Catalog এ দেখাবে', 'Show in Catalog')}
            </label>
            <div style={{ fontSize: 11.5, color: th.muted, marginTop: 4 }}>
              {copy('Tick থাকলে product catalog-এ দেখাবে। Tick তুলে দিলে add হবে, কিন্তু catalog-এ লুকানো থাকবে।', 'If checked, the product will appear in the catalog. If unchecked, it will be added but stay hidden from the catalog.')}
            </div>
          </div>
          {/* Variant options — bot asks these before order */}
          <div style={{ marginTop: 12 }}>
            <FieldWithInfo th={th} label="Bot Variants (optional)" helpText={copy('Bot order নেওয়ার সময় customer কে জিজ্ঞেস করবে। প্রতি লাইনে: Label: choice1, choice2 — যেমন: Size: S,M,L,XL', 'The bot will ask customers these choices while ordering. Use one line per option group, for example: Size: S,M,L,XL')}>
              <textarea
                style={{ ...th.input, minHeight: 64, resize: 'vertical', fontFamily: 'monospace', fontSize: 12.5 }}
                placeholder={'Size: S,M,L,XL\nColor: Red,Blue,Black'}
                value={newP.variantOptions}
                onChange={e => setNewP(p => ({ ...p, variantOptions: e.target.value }))}
              />
            </FieldWithInfo>
          </div>
          {/* V19: Detection Mode */}
          <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#34d399', marginBottom: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Image Detection Mode</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['OCR', 'AI_VISION'] as const).map(mode => (
                <label key={mode} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', borderRadius: 10, border: `2px solid ${newP.detectionMode === mode ? '#34d399' : (th.border ?? '#333')}`, background: newP.detectionMode === mode ? 'rgba(16,185,129,0.1)' : 'transparent', cursor: 'pointer', userSelect: 'none', transition: 'all 0.15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="radio" name="new-detectionMode" value={mode} checked={newP.detectionMode === mode}
                      onChange={() => setNewP(p => ({ ...p, detectionMode: mode, visionSearchable: mode === 'AI_VISION' }))} style={{ accentColor: '#34d399' }} />
                    <span style={{ fontWeight: 700, fontSize: 13, color: th.text }}>{mode === 'OCR' ? '📷 OCR Mode' : '🤖 AI Vision Mode'}</span>
                  </div>
                  <span style={{ fontSize: 11, color: th.muted ?? '#888', lineHeight: 1.5 }}>
                    {mode === 'OCR'
                      ? 'Customer image থেকে product code পড়বে। কোনো AI API call হবে না। খরচ: ৳0.85/image (50%)'
                      : 'OpenAI Vision দিয়ে product detect করবে। খরচ: ৳1.70/image (100%)'}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <UniquenessCard
            data={uniquenessNew}
            hidden={uniquenessNewHidden}
            onHide={() => setUniquenessNewHidden(true)}
            th={th}
            onApplyMode={(mode) => setNewP(p => ({ ...p, detectionMode: mode, visionSearchable: mode === 'AI_VISION' }))}
          />
          {/* V18: Image recognition metadata */}
          <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: `${th.accent}0d`, border: `1px solid ${th.accent}22` }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: th.accent, marginBottom: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {copy('Image Recognition Tags (AI)', 'Image Recognition Tags (AI)')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10 }}>
              <FieldWithInfo th={th} label="Category" helpText={copy('পণ্যের ধরন — dress, saree, panjabi, shirt, kurti, t-shirt', 'Product category for image matching, e.g. dress, saree, panjabi, shirt, kurti')}>
                <input style={th.input} placeholder="dress" value={newP.category}
                  onChange={e => setNewP(p => ({ ...p, category: e.target.value }))} />
              </FieldWithInfo>
              <FieldWithInfo th={th} label="Color" helpText={copy('প্রধান রঙ — black, red, white, multicolor', 'Primary color for image matching, e.g. black, red, white, multicolor')}>
                <input style={th.input} placeholder="black" value={newP.color}
                  onChange={e => setNewP(p => ({ ...p, color: e.target.value }))} />
              </FieldWithInfo>
              <FieldWithInfo th={th} label="Product Group" helpText={copy('Same design family/group name — যেমন: Noor Kurti Set', 'Family/group name for similar variants, e.g. Noor Kurti Set')}>
                <input style={th.input} placeholder="Noor Kurti Set" value={newP.productGroup}
                  onChange={e => setNewP(p => ({ ...p, productGroup: e.target.value }))} />
              </FieldWithInfo>
              <FieldWithInfo th={th} label="Variant Label" helpText={copy('Variant short label — যেমন: Navy Floral / Size M', 'Short variant label, e.g. Navy Floral / Size M')}>
                <input style={th.input} placeholder="Navy Floral" value={newP.variantLabel}
                  onChange={e => setNewP(p => ({ ...p, variantLabel: e.target.value }))} />
              </FieldWithInfo>
              <FieldWithInfo th={th} label="Keywords" helpText={copy('ছবি থেকে পণ্য খুঁজতে কীওয়ার্ড — floral printed maxi', 'Keywords to help match this product from customer images, e.g. floral printed maxi')}>
                <input style={th.input} placeholder="floral printed summer" value={newP.imageKeywords}
                  onChange={e => setNewP(p => ({ ...p, imageKeywords: e.target.value }))} />
              </FieldWithInfo>
              <FieldWithInfo th={th} label="Tags (JSON)" helpText={copy('JSON array — [\"floral\",\"summer\"]', 'JSON array of tags, e.g. ["floral","summer","cotton"]')}>
                <input style={th.input} placeholder='["floral","cotton"]' value={newP.tags}
                  onChange={e => setNewP(p => ({ ...p, tags: e.target.value }))} />
              </FieldWithInfo>
            </div>
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <button style={th.btnPrimary} onClick={createProduct} disabled={busy}>
              {busy ? <Spinner size={13} color="#fff"/> : null} {copy('Create Product', 'Create Product')}
            </button>
            <button style={th.btnGhost} onClick={() => setShowNew(false)}>{copy('Cancel', 'Cancel')}</button>
          </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 260 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: th.muted, fontSize: 13 }}>⌕</span>
          <input style={{ ...th.input, paddingLeft: 30 }} placeholder="Search products..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', background: th.surface, borderRadius: 8, padding: 3, border: `1px solid ${th.border}` }}>
          {(['grid','list'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
              background: view === v ? th.panel : 'transparent',
              color: view === v ? th.accent : th.muted,
              boxShadow: view === v ? th.shadow : 'none',
              transition: 'all .12s',
            }}>
              {v === 'grid' ? '⊞' : '☰'} {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <button style={th.btnGhost} onClick={load}>{loading ? <Spinner size={13}/> : '↺'}</button>
        <span style={{ fontSize: 12.5, color: th.muted }}>{filtered.length} products</span>
      </div>

      {/* Products — Grid view */}
      {view === 'grid' && (
        loading && !products.length ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size={22} color={th.accent}/></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="📦" title={copy('No products found', 'No products found')} sub={copy('উপরে Add Product ক্লিক করে শুরু করুন', 'Click Add Product above to get started')} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 14 }}>
            {filtered.map(p => {
              const isEditing = editId === p.id;
              const videoEmbedUrl = getVideoEmbedUrl(editData.videoUrl ?? p.videoUrl ?? '');
              const referenceCount = parseReferenceImages(p.referenceImagesJson).length;

              return (
                <div key={p.id} style={{
                  ...th.card, padding: 0, overflow: 'hidden',
                  border: `1px solid ${isEditing ? th.accent + '66' : th.border}`,
                  opacity: p.isActive ? 1 : 0.55, transition: 'all .15s',
                }}>
                  {/* Image */}
                  <div style={{ position: 'relative', aspectRatio: '4/3', background: th.surface, overflow: 'hidden' }}>
                    {p.imageUrl
                      ? <img src={p.imageUrl} alt={p.name || p.code} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: th.muted }}>🛍</div>
                    }
                    {/* Badges */}
                    <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 4 }}>
                      {getVideoEmbedUrl(p.videoUrl) && <span style={{ ...th.pill, background: '#0891b244', color: '#0891b2', border: '1px solid #0891b244', fontSize: 9.5 }}>🎬</span>}
                      {referenceCount > 0 && <span style={{ ...th.pill, background: '#ec489922', color: '#db2777', border: '1px solid #ec489944', fontSize: 9.5 }}>📸 {referenceCount + 1}</span>}
                      {!p.catalogVisible && <span style={{ ...th.pill, ...th.pillGray, fontSize: 9.5 }}>Hidden</span>}
                    </div>
                    {/* Stock badge */}
                    <div style={{ position: 'absolute', top: 8, right: 8 }}>
                      <span style={{ ...th.pill, fontSize: 9.5, ...(p.stockQty === 0 ? th.pillRed : p.stockQty <= 3 ? th.pillYellow : th.pillGreen) }}>
                        {p.stockQty === 0 ? 'Out' : `${p.stockQty}`}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  {!isEditing ? (
                    <div style={{ padding: '12px 14px' }}>
                      <div style={{ fontSize: 10.5, color: th.muted, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 3 }}>{p.code}</div>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || '—'}</div>
                      {(p.productGroup || p.variantLabel) && (
                        <div style={{ fontSize: 11, color: th.muted, marginBottom: 6 }}>
                          {[p.productGroup, p.variantLabel].filter(Boolean).join(' • ')}
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontWeight: 900, fontSize: 16, color: th.accent, letterSpacing: '-0.03em' }}>৳{p.price.toLocaleString()}</span>
                        {p.costPrice > 0 && <span style={{ fontSize: 11, color: '#16a34a' }}>+৳{(p.price - p.costPrice).toLocaleString()} profit</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={{ ...th.btnSm, flex: 1, justifyContent: 'center' }} onClick={() => openEdit(p)}>Edit</button>
                        <button style={{ ...th.btnSmDanger }} onClick={() => deleteProduct(p.code)}>✕</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input style={{ ...th.input, fontSize: 12.5 }} placeholder="Name" value={editData.name ?? ''}
                          onChange={e => setEditData(d => ({ ...d, name: e.target.value }))} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                          <input style={{ ...th.input, fontSize: 12.5 }} type="number" placeholder="Price" value={editData.price ?? ''}
                            onChange={e => setEditData(d => ({ ...d, price: Number(e.target.value) }))} />
                          <input style={{ ...th.input, fontSize: 12.5 }} type="number" placeholder="Cost" value={editData.costPrice ?? ''}
                            onChange={e => setEditData(d => ({ ...d, costPrice: Number(e.target.value) }))} />
                        </div>
                        <input style={{ ...th.input, fontSize: 12.5 }} type="number" placeholder="Stock" value={editData.stockQty ?? ''}
                          onChange={e => setEditData(d => ({ ...d, stockQty: Number(e.target.value) }))} />
                        <input style={{ ...th.input, fontSize: 12.5 }} placeholder="Image URL" value={editData.imageUrl ?? ''}
                          onChange={e => setEditData(d => ({ ...d, imageUrl: e.target.value }))} />
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button type="button" style={th.btnSmGhost} onClick={() => editImageRef.current?.click()} disabled={uploadingEditImage}>
                            {uploadingEditImage ? 'Uploading…' : 'Upload Main'}
                          </button>
                          <button type="button" style={th.btnSmGhost} onClick={() => analyzeImage(editData.imageUrl || parseReferenceImages(editData.referenceImagesJson)[0] || '', 'edit')} disabled={analyzingEdit}>
                            {analyzingEdit ? 'Analyzing…' : 'AI Analyze'}
                          </button>
                        </div>
                        <input
                          ref={editImageRef}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setUploadingEditImage(true);
                            try {
                              const url = await uploadProductFile(file);
                              setEditData((d) => ({ ...d, imageUrl: url }));
                              onToast(copy('Main image uploaded', 'Main image uploaded'), 'success');
                            } catch (err: any) {
                              onToast(err.message, 'error');
                            } finally {
                              setUploadingEditImage(false);
                              e.target.value = '';
                            }
                          }}
                        />
                        <textarea
                          style={{ ...th.input, fontSize: 12, minHeight: 82, resize: 'vertical' }}
                          placeholder={'Reference image URLs\nhttps://...\nhttps://...'}
                          value={editData.referenceImagesJson ?? ''}
                          onChange={e => setEditData(d => ({ ...d, referenceImagesJson: e.target.value }))}
                        />
                        <button type="button" style={th.btnSmGhost} onClick={() => editRefsRef.current?.click()} disabled={uploadingEditRefs}>
                          {uploadingEditRefs ? 'Uploading…' : 'Upload Angles'}
                        </button>
                        <input
                          ref={editRefsRef}
                          type="file"
                          accept="image/*"
                          multiple
                          style={{ display: 'none' }}
                          onChange={async (e) => {
                            const files = Array.from(e.target.files || []);
                            if (!files.length) return;
                            setUploadingEditRefs(true);
                            try {
                              const urls = await Promise.all(files.map(uploadProductFile));
                              setEditData((d) => ({
                                ...d,
                                referenceImagesJson: appendReferenceUrls(d.referenceImagesJson || '', urls),
                              }));
                              onToast(copy('Angle images uploaded', 'Angle images uploaded'), 'success');
                            } catch (err: any) {
                              onToast(err.message, 'error');
                            } finally {
                              setUploadingEditRefs(false);
                              e.target.value = '';
                            }
                          }}
                        />
                        {(editData.referenceImagesJson ?? '').trim() && (
                          <div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(56px,1fr))', gap: 6 }}>
                              {parseReferenceImages(editData.referenceImagesJson).slice(0, 6).map((url, idx) => (
                                <div key={url + idx} style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${th.border}`, aspectRatio: '1 / 1', background: th.surface, position: 'relative' }}>
                                  <img src={url} alt={`edit-ref-${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                  <div style={{ position: 'absolute', bottom: 2, right: 3, fontSize: 8, background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: 3, padding: '1px 3px' }}>#{idx + 1}</div>
                                </div>
                              ))}
                            </div>
                            {(parseReferenceImages(editData.referenceImagesJson).length + (editData.imageUrl ? 1 : 0)) >= 2 && (
                              <button
                                type="button"
                                style={{ ...th.btnSmGhost, marginTop: 6, width: '100%', justifyContent: 'center', background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.3)', color: '#34d399', fontSize: 11, fontWeight: 700 }}
                                onClick={() => batchAnalyzeAll(editData.referenceImagesJson, editData.imageUrl, 'edit')}
                                disabled={analyzingEdit}
                              >
                                {analyzingEdit ? '⏳ Analyzing...' : `🤖 Analyze All ${parseReferenceImages(editData.referenceImagesJson).length + (editData.imageUrl ? 1 : 0)} Angles Together`}
                              </button>
                            )}
                          </div>
                        )}
                        {/* Video URL */}
                        <div>
                          <input style={{ ...th.input, fontSize: 12.5 }} placeholder="YouTube / Facebook video URL"
                            value={editData.videoUrl ?? ''}
                            onChange={e => setEditData(d => ({ ...d, videoUrl: e.target.value }))} />
                          <button type="button" style={{ ...th.btnSmGhost, marginTop: 6 }} onClick={() => loadVideoGuide(editData.videoUrl || '', parseReferenceImages(editData.referenceImagesJson).length, 'edit')}>
                            Video Screenshot Plan
                          </button>
                          {videoEmbedUrl && (
                            <div style={{ marginTop: 6, borderRadius: 8, overflow: 'hidden', aspectRatio: '16/9', background: '#000' }}>
                              <iframe src={videoEmbedUrl} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} allowFullScreen title="preview"/>
                            </div>
                          )}
                          {editVideoGuide && (
                            <div style={{ marginTop: 6, ...th.card2, borderRadius: 10, padding: 10 }}>
                              <div style={{ fontSize: 11.5, fontWeight: 800, marginBottom: 6 }}>Manual Capture Guide</div>
                              {(editVideoGuide.checklist || []).map((item: string, idx: number) => (
                                <div key={item + idx} style={{ fontSize: 11.5, color: th.muted }}>{idx + 1}. {item}</div>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* Catalog visible toggle */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5 }}>
                          <input type="checkbox" checked={editData.catalogVisible ?? true}
                            onChange={e => setEditData(d => ({ ...d, catalogVisible: e.target.checked }))}
                            style={{ accentColor: th.accent }} />
                          Show in Catalog
                        </label>
                        {/* Variant options */}
                        <div>
                          <div style={{ fontSize: 11, color: th.muted, marginBottom: 4 }}>Bot Variants — প্রতি লাইনে: Label: choice1,choice2</div>
                          <textarea
                            style={{ ...th.input, fontSize: 12, minHeight: 56, resize: 'vertical', fontFamily: 'monospace' }}
                            placeholder={'Size: S,M,L,XL\nColor: Red,Blue'}
                            value={editData.variantOptions ?? ''}
                            onChange={e => setEditData(d => ({ ...d, variantOptions: e.target.value }))}
                          />
                        </div>
                        {/* Description + AI */}
                        <div>
                          <div style={{ fontSize: 11, color: th.muted, marginBottom: 4 }}>Description</div>
                          <textarea
                            style={{ ...th.input, fontSize: 12, minHeight: 64, resize: 'vertical' }}
                            placeholder={copy('Product বিবরণ...', 'Product description...')}
                            value={editData.description ?? ''}
                            onChange={e => setEditData(d => ({ ...d, description: e.target.value }))}
                          />
                          <button type="button" style={{ ...th.btnSmGhost, marginTop: 6 }} onClick={() => generateDescription('edit')} disabled={generatingDescEdit}>
                            {generatingDescEdit ? copy('AI লিখছে...', 'AI writing...') : copy('✨ AI লিখুন', '✨ AI Write')}
                          </button>
                        </div>
                        {/* V19: Detection Mode */}
                        <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#34d399', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Image Detection Mode</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {(['OCR', 'AI_VISION'] as const).map(mode => (
                              <label key={mode} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', borderRadius: 8, border: `2px solid ${editData.detectionMode === mode ? '#34d399' : (th.border ?? '#333')}`, background: editData.detectionMode === mode ? 'rgba(16,185,129,0.1)' : 'transparent', cursor: 'pointer', userSelect: 'none', transition: 'all 0.15s' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <input type="radio" name={`detectionMode-${editId}`} value={mode} checked={editData.detectionMode === mode}
                                    onChange={() => setEditData(d => ({ ...d, detectionMode: mode, visionSearchable: mode === 'AI_VISION' }))} style={{ accentColor: '#34d399' }} />
                                  <span style={{ fontWeight: 700, fontSize: 12, color: th.text }}>{mode === 'OCR' ? '📷 OCR Mode' : '🤖 AI Vision'}</span>
                                </div>
                                <span style={{ fontSize: 10, color: th.muted ?? '#888', lineHeight: 1.4 }}>
                                  {mode === 'OCR' ? `Product code পড়বে • ৳${(1.70 * 0.5).toFixed(2)}/image` : `AI দিয়ে detect করবে • ৳1.70/image`}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <UniquenessCard
                          data={uniquenessEdit}
                          hidden={uniquenessEditHidden}
                          onHide={() => setUniquenessEditHidden(true)}
                          th={th}
                          onApplyMode={(mode) => setEditData(d => ({ ...d, detectionMode: mode, visionSearchable: mode === 'AI_VISION' }))}
                        />
                        {/* V18: Image recognition metadata */}
                        <div style={{ padding: '8px 10px', borderRadius: 8, background: `${th.accent}0d`, border: `1px solid ${th.accent}22` }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: th.accent, marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>AI Tags</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
                              <input type="checkbox" checked={editData.visionSearchable ?? false}
                                onChange={e => setEditData(d => ({ ...d, visionSearchable: e.target.checked }))} />
                              <span style={{ color: th.text }}>
                                {copy('AI Vision দিয়ে খোঁজা হবে (code নেই)', 'Find via AI Vision (no product code)')}
                              </span>
                            </label>
                            <input style={{ ...th.input, fontSize: 12 }} placeholder="Category (dress, saree…)" value={editData.category ?? ''}
                              onChange={e => setEditData(d => ({ ...d, category: e.target.value }))} />
                            <input style={{ ...th.input, fontSize: 12 }} placeholder="Color (black, red…)" value={editData.color ?? ''}
                              onChange={e => setEditData(d => ({ ...d, color: e.target.value }))} />
                            <input style={{ ...th.input, fontSize: 12 }} placeholder="Product group / family" value={editData.productGroup ?? ''}
                              onChange={e => setEditData(d => ({ ...d, productGroup: e.target.value }))} />
                            <input style={{ ...th.input, fontSize: 12 }} placeholder="Variant label" value={editData.variantLabel ?? ''}
                              onChange={e => setEditData(d => ({ ...d, variantLabel: e.target.value }))} />
                            <input style={{ ...th.input, fontSize: 12 }} placeholder="Keywords (floral printed)" value={editData.imageKeywords ?? ''}
                              onChange={e => setEditData(d => ({ ...d, imageKeywords: e.target.value }))} />
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                        <button style={{ ...th.btnSmSuccess, flex: 1, justifyContent: 'center', fontSize: 12 }}
                          onClick={() => saveEdit(p)} disabled={busy}>
                          {busy ? <Spinner size={11}/> : '✓'} Save
                        </button>
                        <button style={th.btnSmGhost} onClick={() => setEditId(null)}>✕</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Products — List view */}
      {view === 'list' && (
        <div style={{ ...th.card, padding: 0, overflow: 'hidden' }}>
          {filtered.length === 0
            ? <EmptyState icon="📦" title="No products" />
            : (
              <table style={th.table}>
                <thead>
                  <tr>
                    <th style={th.th}>Code</th>
                    <th style={th.th}>Name</th>
                    <th style={th.th}>Price</th>
                    <th style={th.th}>Cost</th>
                    <th style={th.th}>Stock</th>
                    <th style={th.th}>Status</th>
                    <th style={th.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} style={{ opacity: p.isActive ? 1 : 0.5 }}>
                      <td style={{ ...th.td, fontWeight: 700, color: th.accentText, fontSize: 12.5 }}>{p.code}</td>
                      <td style={th.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {p.imageUrl && <img src={p.imageUrl} style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}/>}
                          <span style={{ fontWeight: 600 }}>{p.name || '—'}</span>
                          {parseReferenceImages(p.referenceImagesJson).length > 0 && (
                            <span style={{ ...th.pill, background: '#ec489922', color: '#db2777', border: '1px solid #ec489944', fontSize: 9.5 }}>
                              {parseReferenceImages(p.referenceImagesJson).length + 1} views
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ ...th.td, fontWeight: 700 }}>৳{p.price.toLocaleString()}</td>
                      <td style={{ ...th.td, color: th.muted }}>৳{p.costPrice}</td>
                      <td style={th.td}>
                        <span style={{ ...th.pill, fontSize: 11, ...(p.stockQty === 0 ? th.pillRed : p.stockQty <= 3 ? th.pillYellow : th.pillGreen) }}>
                          {p.stockQty}
                        </span>
                      </td>
                      <td style={th.td}>
                        {getVideoEmbedUrl(p.videoUrl) && <span style={{ ...th.pill, ...th.pillBlue, fontSize: 10, marginRight: 4 }}>🎬</span>}
                        {!p.catalogVisible && <span style={{ ...th.pill, ...th.pillGray, fontSize: 10 }}>Hidden</span>}
                      </td>
                      <td style={th.td}>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button style={th.btnSmGhost} onClick={() => openEdit(p)}>Edit</button>
                          <button style={th.btnSmDanger} onClick={() => deleteProduct(p.code)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}
    </div>
  );
}
