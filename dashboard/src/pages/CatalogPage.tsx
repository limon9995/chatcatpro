import { useCallback, useEffect, useState } from 'react';
import { CardHeader, Spinner } from '../components/ui';
import type { Theme } from '../components/ui';
import { API_BASE } from '../hooks/useApi';
import { useLanguage } from '../i18n';

// V10: Client dashboard এ Catalog settings/preview page
// Public catalog URL: /catalog/:pageId (served by backend)

export function CatalogPage({ th, pageId, onToast }: {
  th: Theme; pageId: number; onToast: (m: string, t?: any) => void;
}) {
  const { copy } = useLanguage();
  const [catalogData, setCatalogData] = useState<any>(null);
  const [loading, setLoading]         = useState(false);
  const [copied, setCopied]           = useState(false);
  const [copiedCode, setCopiedCode]   = useState<string | null>(null);

  // Catalog is served by backend — always use absolute URL
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
      setCatalogData(await res.json());
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

  if (loading) return (
    <div style={{ ...th.card, display: 'flex', alignItems: 'center', gap: 12, color: th.muted }}>
      <Spinner size={20}/> {copy('Loading catalog preview...', 'Loading catalog preview...')}
    </div>
  );

  const page    = catalogData?.page;
  const products = catalogData?.products || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.3px' }}>🛍️ Product Catalog</div>
        <div style={{ fontSize: 12.5, color: th.muted, marginTop: 3 }}>
          {copy('Customer দের এই URL share করুন — সুন্দর product page দেখতে পাবে', 'Share this URL with customers so they can browse your product catalog')}
        </div>
      </div>

      {/* URL share card */}
      <div style={{ ...th.card, border: `2px solid ${th.accent}33` }}>
        <CardHeader th={th} title={copy('📎 Catalog URL', '📎 Catalog URL')} sub={copy('এই link customer দের দিন', 'Share this link with customers')} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{
            flex: 1, padding: '10px 14px', ...th.card2,
            borderRadius: 10, border: `1.5px solid ${th.border}`,
            fontSize: 13, fontFamily: 'monospace', wordBreak: 'break-all',
            color: th.accent,
          }}>
            {CATALOG_URL}
          </div>
          <button style={{ ...th.btnPrimary, whiteSpace: 'nowrap' }} onClick={copyUrl}>
            {copied ? copy('✅ Copied!', '✅ Copied!') : copy('📋 Copy URL', 'Copy URL')}
          </button>
          <button style={{ ...th.btnGhost, whiteSpace: 'nowrap' }} onClick={openCatalog}>
            {copy('🔗 Open', 'Open')}
          </button>
        </div>
        <div style={{ fontSize: 12, color: th.muted, marginTop: 10 }}>
          {copy('💡 Products page এ product-এর ছবি আর YouTube video যোগ করলে এখানে নিজে থেকেই দেখাবে। কোনো product লুকাতে চাইলে শুধু "Catalog Visible" এর tick তুলে দিন।', '💡 Add product photos and YouTube videos from the Products page and they will show here automatically. To hide a product, just untick "Catalog Visible".')}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
        <div style={{ ...th.card, padding: '16px 20px' }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: th.accent }}>{products.length}</div>
          <div style={{ fontSize: 11, color: th.muted, marginTop: 4, fontWeight: 700, textTransform: 'uppercase' }}>Products</div>
        </div>
        <div style={{ ...th.card, padding: '16px 20px' }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#16a34a' }}>
            {products.filter((p: any) => p.imageUrl).length}
          </div>
          <div style={{ fontSize: 11, color: th.muted, marginTop: 4, fontWeight: 700, textTransform: 'uppercase' }}>With Photo</div>
        </div>
        <div style={{ ...th.card, padding: '16px 20px' }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#8b5cf6' }}>
            {products.filter((p: any) => p.videoUrl).length}
          </div>
          <div style={{ fontSize: 11, color: th.muted, marginTop: 4, fontWeight: 700, textTransform: 'uppercase' }}>With Video</div>
        </div>
        <div style={{ ...th.card, padding: '16px 20px' }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#f59e0b' }}>
            {(catalogData?.page?.catalogViews ?? 0).toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: th.muted, marginTop: 4, fontWeight: 700, textTransform: 'uppercase' }}>Catalog Views</div>
        </div>
        <div style={{ ...th.card, padding: '16px 20px' }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#06b6d4' }}>
            {products.reduce((s: number, p: any) => s + (p.productViews ?? 0), 0).toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: th.muted, marginTop: 4, fontWeight: 700, textTransform: 'uppercase' }}>Product Views</div>
        </div>
      </div>

      {/* QR Code */}
      <div style={{ ...th.card }}>
        <CardHeader th={th} title="📱 QR Code" sub="Print করুন, প্যাকেজে দিন, দোকানে লাগান — scan করলেই catalog খুলবে" />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(CATALOG_URL)}&color=000000&bgcolor=ffffff&margin=10`}
              alt="Catalog QR Code"
              style={{ width: 180, height: 180, borderRadius: 12, border: `1.5px solid ${th.border}`, display: 'block' }}
            />
            <div style={{ fontSize: 11, color: th.muted, fontWeight: 700, textAlign: 'center' }}>Catalog QR</div>
            <a
              href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(CATALOG_URL)}&color=000000&bgcolor=ffffff&margin=20`}
              download="catalog-qr.png"
              target="_blank"
              rel="noreferrer"
              style={{ ...th.btnGhost, fontSize: 11, padding: '5px 12px', textDecoration: 'none' }}
            >
              ⬇️ Download
            </a>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>QR Code ব্যবহারের উপায়:</div>
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
          <CardHeader th={th} title={copy('Preview', 'Preview')} sub={`${products.length} ${copy('products', 'products')}`}
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
                    {/* Action buttons */}
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
          {products.length > 8 && (
            <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 12.5, color: th.muted }}>
              {copy(`আরো ${products.length - 8} টি product আছে — `, `${products.length - 8} more products available - `)}<button style={{ ...th.btnGhost, fontSize: 12.5, padding: '4px 10px' }} onClick={openCatalog}>{copy('Catalog খুলুন', 'Open Catalog')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
