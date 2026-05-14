import { useCallback, useEffect, useState } from 'react';
import { CardHeader, Spinner } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE } from '../hooks/useApi';
import { useLanguage } from '../i18n';

export function CatalogPage({ th, pageId, onToast }: {
  th: Theme; pageId: number; onToast: (m: string, t?: any) => void;
}) {
  const { copy } = useLanguage();
  const [catalogData, setCatalogData]     = useState<any>(null);
  const [loading, setLoading]             = useState(false);
  const [copied, setCopied]               = useState(false);
  const [copiedCode, setCopiedCode]       = useState<string | null>(null);
  const [customDomain, setCustomDomain]   = useState('');
  const [savingDomain, setSavingDomain]   = useState(false);
  const [domainSaved, setDomainSaved]     = useState(false);
  const [slugInput, setSlugInput]         = useState('');
  const [savingSlug, setSavingSlug]       = useState(false);
  const [slugError, setSlugError]         = useState('');
  const [editingSlug, setEditingSlug]     = useState(false);

  const backendBase = API_BASE.startsWith('http') ? API_BASE : `${window.location.protocol}//${window.location.hostname}:3000`;
  const slug        = catalogData?.page?.catalogSlug;
  const catalogKey  = slug || pageId;
  const CATALOG_URL = `${backendBase}/catalog/${catalogKey}`;
  const productUrl  = (code: string) => `${backendBase}/catalog/${catalogKey}/product/${code}`;

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/catalog/${pageId}/data`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCatalogData(data);
      setCustomDomain(data?.page?.customDomain || '');
      setSlugInput(data?.page?.catalogSlug || '');
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [pageId]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  const copyUrl = () => {
    navigator.clipboard.writeText(CATALOG_URL);
    setCopied(true);
    onToast(copy('✅ URL copied!', '✅ URL copied!'));
    setTimeout(() => setCopied(false), 2000);
  };

  const openCatalog = () => window.open(CATALOG_URL, '_blank');

  const patchSettings = async (fields: Record<string, any>) => {
    const res = await fetch(`${API_BASE}/client-dashboard/${pageId}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('dfbot_token')}` },
      body: JSON.stringify({ pageFields: fields }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.message || `HTTP ${res.status}`);
    }
  };

  const saveCustomDomain = async () => {
    setSavingDomain(true);
    try {
      await patchSettings({ customDomain: customDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '') || null });
      setDomainSaved(true);
      onToast('✅ Custom domain saved!', 'success');
      setTimeout(() => setDomainSaved(false), 3000);
    } catch (e: any) { onToast(e.message, 'error'); }
    finally { setSavingDomain(false); }
  };

  const handleSlugInput = (val: string) => {
    const clean = val.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    setSlugInput(clean);
    setSlugError('');
  };

  const saveSlug = async () => {
    const clean = slugInput.trim();
    if (!clean) { setSlugError('খালি রাখা যাবে না'); return; }
    if (clean.length < 3) { setSlugError('কমপক্ষে ৩ টি character দিন'); return; }
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(clean)) {
      setSlugError('শুধু a-z, 0-9 এবং hyphen (-)। শুরু ও শেষ letter/number হতে হবে।');
      return;
    }
    setSavingSlug(true);
    try {
      await patchSettings({ catalogSlug: clean });
      onToast('✅ URL পরিবর্তন হয়েছে!', 'success');
      setEditingSlug(false);
      setSlugError('');
      await loadPreview();
    } catch (e: any) {
      setSlugError(String(e.message || 'সমস্যা হয়েছে, আবার চেষ্টা করুন।'));
    } finally { setSavingSlug(false); }
  };

  const startEditSlug = () => {
    setSlugInput(catalogData?.page?.catalogSlug || '');
    setSlugError('');
    setEditingSlug(true);
  };

  if (loading) return (
    <div style={{ ...th.card, display: 'flex', alignItems: 'center', gap: 12, color: th.muted }}>
      <Spinner size={20}/> {copy('Loading...', 'Loading...')}
    </div>
  );

  const page     = catalogData?.page;
  const products = catalogData?.products || [];

  const activeCustomDomain = page?.customDomain;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: `linear-gradient(135deg, ${th.accent}, ${th.accent}88)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, flexShrink: 0, boxShadow: `0 4px 14px ${th.accent}33`,
        }}>🌐</div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.3px' }}>
            {page?.businessName || 'আপনার Website'}
          </div>
          <div style={{ fontSize: 12.5, color: th.muted, marginTop: 2 }}>
            {copy('Customer রা এই website থেকে product দেখে order করতে পারবে', 'Customers can browse and order from this website')}
          </div>
        </div>
      </div>

      {/* Website URL card */}
      <div style={{ ...th.card, border: `2px solid ${th.accent}33` }}>
        <CardHeader th={th}
          title={copy('🔗 Website URL', '🔗 Website URL')}
          sub={copy('Customer দের এই link share করুন', 'Share this link with customers')}
        />

        {/* URL row — normal view OR inline slug edit */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {copy('✅ আপনার Website Link', '✅ Your Website Link')}
          </div>

          {editingSlug ? (
            /* ── Inline slug edit mode ── */
            <div>
              <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
                <div style={{
                  padding: '10px 11px', borderRadius: '10px 0 0 10px',
                  border: `1.5px solid ${th.border}`, borderRight: 'none',
                  background: th.bg, color: th.muted,
                  fontSize: 12, fontFamily: 'monospace', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center',
                }}>
                  {`${backendBase}/catalog/`}
                </div>
                <input
                  autoFocus
                  style={{
                    flex: 1, padding: '10px 11px', minWidth: 100,
                    border: `1.5px solid ${slugError ? '#ef4444' : th.accent}`,
                    borderLeft: 'none', borderRight: 'none',
                    background: th.surface, color: th.accent,
                    fontSize: 13, fontFamily: 'monospace', fontWeight: 700,
                    outline: 'none',
                  }}
                  value={slugInput}
                  onChange={e => handleSlugInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveSlug(); if (e.key === 'Escape') setEditingSlug(false); }}
                  placeholder="your-shop-name"
                  spellCheck={false}
                />
                <button
                  style={{ ...th.btnPrimary, borderRadius: 0, padding: '10px 16px', whiteSpace: 'nowrap', opacity: savingSlug ? 0.7 : 1 }}
                  onClick={saveSlug} disabled={savingSlug}
                >
                  {savingSlug ? <Spinner size={13} /> : copy('💾 Save', 'Save')}
                </button>
                <button
                  style={{ ...th.btnGhost, borderRadius: '0 10px 10px 0', padding: '10px 14px', whiteSpace: 'nowrap' }}
                  onClick={() => { setEditingSlug(false); setSlugError(''); }}
                >✕</button>
              </div>
              {slugError
                ? <div style={{ marginTop: 5, fontSize: 12, color: '#ef4444', fontWeight: 600 }}>⚠️ {slugError}</div>
                : <div style={{ marginTop: 5, fontSize: 11.5, color: th.muted }}>
                    {copy('⚠️ Save করলে পুরনো link কাজ করবে না। • Esc = বাতিল', '⚠️ Old link stops working after save. • Esc = cancel')}
                  </div>
              }
            </div>
          ) : (
            /* ── Normal view ── */
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{
                flex: 1, padding: '10px 14px', ...th.card2,
                borderRadius: 10, border: `1.5px solid ${th.accent}44`,
                fontSize: 13, fontFamily: 'monospace', wordBreak: 'break-all',
                color: th.accent, minWidth: 0,
              }}>
                {activeCustomDomain ? `https://${activeCustomDomain}` : CATALOG_URL}
              </div>
              <button
                title={copy('URL-এর শেষ অংশ বদলান', 'Edit URL slug')}
                style={{ ...th.btnGhost, whiteSpace: 'nowrap', padding: '10px 13px' }}
                onClick={startEditSlug}
              >✏️</button>
              <button style={{ ...th.btnPrimary, whiteSpace: 'nowrap' }} onClick={copyUrl}>
                {copied ? '✅' : '📋 Copy'}
              </button>
              <button style={{ ...th.btnGhost, whiteSpace: 'nowrap' }} onClick={openCatalog}>
                🔗 Open
              </button>
            </div>
          )}

          <div style={{ fontSize: 11.5, color: th.muted, marginTop: 8 }}>
            {copy('💡 Products page এ ছবি ও YouTube video যোগ করলে এখানে নিজে থেকেই দেখাবে। "Catalog Visible" tick তুলে দিলে product লুকাবে।', '💡 Add product photos and YouTube videos from the Products page — they appear automatically here. Untick "Catalog Visible" to hide a product.')}
          </div>
        </div>

        {/* Option B — custom domain */}
        <div style={{ borderTop: `1px solid ${th.border}`, paddingTop: 14, marginTop: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: th.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {copy('🌐 Personal Domain (যদি থাকে)', '🌐 Personal Domain (optional)')}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              style={{
                flex: 1, padding: '10px 14px',
                borderRadius: 10, border: `1.5px solid ${th.border}`,
                background: th.surface, color: th.text, fontSize: 13,
                outline: 'none', fontFamily: 'monospace', minWidth: 180,
              }}
              value={customDomain}
              onChange={e => setCustomDomain(e.target.value)}
              placeholder="shop.yourbrand.com"
            />
            <button
              style={{ ...th.btnPrimary, whiteSpace: 'nowrap', opacity: savingDomain ? 0.7 : 1 }}
              onClick={saveCustomDomain}
              disabled={savingDomain}
            >
              {savingDomain ? '...' : domainSaved ? '✅ Saved' : copy('💾 Save', 'Save')}
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: th.muted, marginTop: 8, lineHeight: 1.6 }}>
            {copy(
              'নিজের domain ব্যবহার করতে চাইলে domain টি এখানে enter করুন। তারপর DNS-এ CNAME করুন:',
              'To use your own domain, enter it here, then set a DNS CNAME record:',
            )}
          </div>
          {(customDomain || activeCustomDomain) && (
            <div style={{
              marginTop: 8, padding: '10px 14px', borderRadius: 10,
              background: `${th.accent}0d`, border: `1px dashed ${th.accent}44`,
              fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8,
            }}>
              <div style={{ color: th.muted }}>DNS Record (CNAME):</div>
              <div style={{ color: th.accent }}>
                {customDomain || activeCustomDomain} <span style={{ color: th.muted }}>→</span> api.chatcat.pro
              </div>
            </div>
          )}
          {activeCustomDomain && (
            <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#16a34a', fontWeight: 700 }}>
              <span>✅</span>
              <span>{copy(`${activeCustomDomain} — active আছে`, `${activeCustomDomain} — active`)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
        {[
          { value: products.length, label: 'Products', color: th.accent },
          { value: products.filter((p: any) => p.imageUrl).length, label: 'With Photo', color: '#16a34a' },
          { value: products.filter((p: any) => p.videoUrl).length, label: 'With Video', color: '#8b5cf6' },
          { value: (catalogData?.page?.catalogViews ?? 0).toLocaleString(), label: 'Website Views', color: '#f59e0b' },
          { value: products.reduce((s: number, p: any) => s + (p.productViews ?? 0), 0).toLocaleString(), label: 'Product Views', color: '#06b6d4' },
        ].map(({ value, label, color }) => (
          <div key={label} style={{ ...th.card, padding: '16px 20px' }}>
            <div style={{ fontSize: 26, fontWeight: 900, color }}>{value}</div>
            <div style={{ fontSize: 11, color: th.muted, marginTop: 4, fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* QR Code */}
      <div style={{ ...th.card }}>
        <CardHeader th={th} title="📱 QR Code" sub={copy('Print করুন, প্যাকেজে দিন — scan করলেই website খুলবে', 'Print and stick on packages — scan opens your website')} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(CATALOG_URL)}&color=000000&bgcolor=ffffff&margin=10`}
              alt="Website QR Code"
              style={{ width: 180, height: 180, borderRadius: 12, border: `1.5px solid ${th.border}`, display: 'block' }}
            />
            <div style={{ fontSize: 11, color: th.muted, fontWeight: 700, textAlign: 'center' }}>Website QR</div>
            <a
              href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(CATALOG_URL)}&color=000000&bgcolor=ffffff&margin=20`}
              download="website-qr.png"
              target="_blank"
              rel="noreferrer"
              style={{ ...th.btnGhost, fontSize: 11, padding: '5px 12px', textDecoration: 'none' }}
            >
              ⬇️ Download
            </a>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Website QR ব্যবহারের উপায়:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['📦', 'প্রতিটা প্যাকেজে print করে দিন — customer next order সহজে করতে পারবে'],
                ['🖨️', 'ভিজিটিং কার্ড বা ফ্লায়ারে লাগান — offline promotion'],
                ['📱', 'Facebook/WhatsApp story তে share করুন'],
                ['🏷️', 'Product এর গায়ে sticker হিসেবে লাগান'],
              ].map(([icon, text]) => (
                <div key={text} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: th.muted }}>
                  <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mini preview */}
      {products.length > 0 && page && (
        <div style={th.card}>
          <CardHeader th={th}
            title={copy('Preview', 'Preview')}
            sub={`${products.length} ${copy('products', 'products')}`}
            action={<button style={th.btnGhost} onClick={loadPreview}>🔄</button>}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(175px,1fr))', gap: 12 }}>
            {products.slice(0, 12).map((p: any) => {
              const pUrl = productUrl(p.code);
              const isCopied = copiedCode === p.code;
              const copyProductLink = (e: React.MouseEvent) => {
                e.preventDefault();
                navigator.clipboard.writeText(pUrl);
                setCopiedCode(p.code);
                onToast(copy(`✅ ${p.code} link copied!`, `✅ ${p.code} link copied!`));
                setTimeout(() => setCopiedCode(null), 2000);
              };
              return (
                <div key={p.id} style={{ ...th.card2, borderRadius: 14, overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' }}>
                  {p.imageUrl
                    ? <img src={p.imageUrl} alt={p.name || p.code} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    : <div style={{ aspectRatio: '1', background: `${th.accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>🛍️</div>
                  }
                  <div style={{ padding: '10px 12px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 10, color: th.muted, fontWeight: 700, letterSpacing: '0.07em' }}>{p.code}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || p.code}</div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: th.accent }}>{page.currency}{Number(p.price).toLocaleString()}</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                      {p.videoUrl && <span style={{ fontSize: 9, ...th.pill, background: '#8b5cf622', color: '#8b5cf6', padding: '1px 5px' }}>🎬</span>}
                      {p.stockQty > 0
                        ? <span style={{ fontSize: 9, ...th.pill, ...th.pillGreen, padding: '1px 5px' }}>In Stock</span>
                        : <span style={{ fontSize: 9, ...th.pill, ...th.pillRed, padding: '1px 5px' }}>Stock Out</span>
                      }
                      {(p.productViews ?? 0) > 0 && (
                        <span style={{ fontSize: 9, ...th.pill, background: '#f59e0b22', color: '#d97706', padding: '1px 5px' }}>
                          👁 {p.productViews}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
                      <a href={pUrl} target="_blank" rel="noreferrer"
                        style={{ flex: 1, textAlign: 'center', fontSize: 11, padding: '6px 4px', borderRadius: 7, background: `${th.accent}15`, color: th.accent, textDecoration: 'none', fontWeight: 700, border: `1px solid ${th.accent}25` }}>
                        🔗 Open
                      </a>
                      <button onClick={copyProductLink}
                        style={{ flex: 1, fontSize: 11, padding: '6px 4px', borderRadius: 7, background: isCopied ? '#dcfce7' : th.surface, color: isCopied ? '#16a34a' : th.muted, border: `1px solid ${th.border}`, fontWeight: 700, cursor: 'pointer' }}>
                        {isCopied ? '✅' : '📋'} {isCopied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {products.length > 12 && (
            <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 12.5, color: th.muted }}>
              {copy(`আরো ${products.length - 12} টি product আছে — `, `${products.length - 12} more products — `)}<button style={{ ...th.btnGhost, fontSize: 12.5, padding: '4px 10px' }} onClick={openCatalog}>{copy('Website খুলুন', 'Open Website')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
