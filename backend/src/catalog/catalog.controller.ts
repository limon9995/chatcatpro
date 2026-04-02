import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';

// ── Video URL helpers ─────────────────────────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  if (!url?.trim()) return null;
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  );
  return m?.[1] ?? null;
}

function extractFacebookVideoId(url: string): string | null {
  if (!url?.trim()) return null;
  // facebook.com/video/xxx  |  fb.watch/xxx  |  facebook.com/reel/xxx
  const m = url.match(
    /(?:facebook\.com\/(?:video|reel|watch)\/|fb\.watch\/|facebook\.com\/[^/]+\/videos\/)([0-9a-zA-Z_-]+)/,
  );
  return m?.[1] ?? null;
}

type VideoType = 'youtube' | 'facebook' | null;

function detectVideoType(url: string): VideoType {
  if (!url?.trim()) return null;
  if (extractYouTubeId(url)) return 'youtube';
  if (url.includes('facebook.com') || url.includes('fb.watch'))
    return 'facebook';
  return null;
}

/** Convert any name to URL-safe slug: "Limon Tech Diary" → "limon-tech-diary" */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Build Prisma where clause: tries numeric id → slug → Facebook pageId */
function pageWhere(pid: string) {
  const numId = Number(pid);
  if (!isNaN(numId) && numId > 0) return { id: numId, isActive: true };
  return { OR: [{ catalogSlug: pid }, { pageId: pid }], isActive: true } as any;
}

function esc(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizePhone(phone?: string | null): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('880')) return digits;
  if (digits.startsWith('0')) return `88${digits}`;
  return digits;
}

function buildWhatsAppUrl(phone?: string | null): string {
  const normalized = normalizePhone(phone);
  return normalized ? `https://wa.me/${normalized}` : '';
}

function isWhatsAppUrl(url?: string | null): boolean {
  const value = String(url ?? '').toLowerCase();
  return value.includes('wa.me/') || value.includes('whatsapp.com/');
}

function buildFacebookPageUrl(pageId?: string | null, messengerUrl?: string | null) {
  const customUrl = String(messengerUrl ?? '').trim();
  if (customUrl && !isWhatsAppUrl(customUrl)) return customUrl;
  const cleanPageId = String(pageId ?? '').trim();
  if (!cleanPageId) return '';
  return `https://www.facebook.com/${cleanPageId}`;
}

// ── Controller ────────────────────────────────────────────────────────────────

// ── "Powered by" badge ───────────────────────────────────────────────────────

const LANDING_URL = process.env.LANDING_PAGE_URL || '';
const POWERED_CSS = `
/* Powered-by badge */
.pwby{position:fixed;bottom:16px;right:16px;z-index:9999;display:flex;align-items:center;gap:6px;background:rgba(15,23,42,.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:rgba(255,255,255,.75);text-decoration:none;padding:6px 11px 6px 8px;border-radius:22px;font-size:11.5px;font-weight:600;letter-spacing:.01em;border:1px solid rgba(255,255,255,.12);box-shadow:0 4px 16px rgba(0,0,0,.22);transition:all .18s;white-space:nowrap;font-family:"Inter",system-ui,sans-serif}
.pwby:hover{background:rgba(79,70,229,.85);color:#fff;border-color:rgba(255,255,255,.25);transform:translateY(-2px);box-shadow:0 6px 20px rgba(79,70,229,.35)}
.pwby-icon{width:18px;height:18px;border-radius:6px;background:linear-gradient(135deg,#4f46e5,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0}
.pwby-text{opacity:.85}.pwby-brand{opacity:1;font-weight:700;color:#a5b4fc}
.pwby:hover .pwby-text,.pwby:hover .pwby-brand{opacity:1;color:#fff}
@media(max-width:480px){.pwby{bottom:12px;right:12px;padding:5px 9px 5px 7px;font-size:11px}}`;

function poweredByBadge(): string {
  if (!LANDING_URL) return '';
  return `
<style>${POWERED_CSS}</style>
<a class="pwby" href="${esc(LANDING_URL)}" target="_blank" rel="noopener" title="ChatCat Pro দিয়ে তৈরি">
  <div class="pwby-icon">🤖</div>
  <span class="pwby-text">Powered by </span><span class="pwby-brand">ChatCat Pro</span>
</a>`;
}

@SkipThrottle() // Public catalog page — no auth needed
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  private normalizeCodeList(raw?: string): string[] {
    return String(raw || '')
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)
      .filter((value, index, all) => all.indexOf(value) === index)
      .slice(0, 12);
  }

  private parseReferenceImages(raw?: string | null): string[] {
    const value = String(raw || '').trim();
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item || '').trim())
          .filter(Boolean)
          .filter((url, index, all) => all.indexOf(url) === index);
      }
    } catch {
      // Allow legacy plain-text values.
    }
    return value
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((url, index, all) => all.indexOf(url) === index);
  }

  // JSON API — used by dashboard preview
  @Get(':pageId/data')
  async getCatalogData(
    @Param('pageId') pid: string,
    @Query('q') q?: string,
    @Query('codes') codes?: string,
  ) {
    return this.buildData(pid, q, codes);
  }

  // Single product HTML page
  @Get(':pageId/product/:code')
  async getProductHtml(
    @Param('pageId') pid: string,
    @Param('code') code: string,
    @Res() res: Response,
    @Query('select') select?: string,
    @Query('codes') codes?: string,
  ) {
    const page = await this.prisma.page.findFirst({
      where: pageWhere(pid),
      select: {
        id: true,
        pageId: true,
        pageName: true,
        businessName: true,
        businessPhone: true,
        businessAddress: true,
        logoUrl: true,
        currencySymbol: true,
        primaryColor: true,
        memoFooterText: true,
        catalogMessengerUrl: true,
        catalogSlug: true,
      },
    });
    if (!page) {
      res.status(404).send('<h2>Page not found</h2>');
      return;
    }

    const product = await this.prisma.product.findFirst({
      where: { pageId: page.id, code: code.toUpperCase(), isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        price: true,
        stockQty: true,
        imageUrl: true,
        description: true,
        videoUrl: true,
        variantOptions: true,
      },
    });
    if (!product) {
      res.status(404).send('<h2>Product not found</h2>');
      return;
    }

    const productWithReferenceImages =
      await this.productsService.attachReferenceImages(page.id, product);

    const pageInfo = {
      id: page.id,
      pageId: page.pageId,
      name: page.businessName || page.pageName,
      phone: page.businessPhone || '',
      logoUrl: page.logoUrl || '',
      currency: page.currencySymbol || '৳',
      primaryColor: page.primaryColor || '#5b63f5',
      footerText: page.memoFooterText || '',
      messengerUrl: page.catalogMessengerUrl || `https://m.me/${page.pageId}`,
      whatsappUrl: buildWhatsAppUrl(page.businessPhone),
      facebookPageUrl: buildFacebookPageUrl(
        page.pageId,
        page.catalogMessengerUrl,
      ),
    };
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(
      this.buildProductHtml(pageInfo, productWithReferenceImages, {
        selectionMode: select === '1',
        shortlistCodes: this.normalizeCodeList(codes),
      }),
    );
  }

  // Public HTML catalog page
  @Get(':pageId')
  async getCatalogHtml(
    @Param('pageId') pid: string,
    @Res() res: Response,
    @Query('q') q: string,
    @Query('codes') codes?: string,
    @Query('select') select?: string,
  ) {
    const data = await this.buildData(pid, q, codes);
    if ('error' in data) {
      res
        .status(404)
        .send(
          '<html><body style="font-family:sans-serif;padding:40px"><h2>Page not found</h2></body></html>',
        );
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(
      this.buildHtml(data, q || '', {
        selectionMode: select === '1',
        shortlistCodes: this.normalizeCodeList(codes),
      }),
    );
  }

  // ── Data builder ────────────────────────────────────────────────────────
  private async buildData(pageId: string, search?: string, codeFilterRaw?: string) {
    const page = await this.prisma.page.findFirst({
      where: pageWhere(pageId),
      select: {
        id: true,
        pageId: true,
        pageName: true,
        businessName: true,
        businessPhone: true,
        businessAddress: true,
        logoUrl: true,
        currencySymbol: true,
        primaryColor: true,
        memoFooterText: true,
        catalogMessengerUrl: true,
        catalogSlug: true,
      },
    });
    if (!page) return { error: 'Page not found' };

    const where: any = {
      pageId: page.id,
      isActive: true,
      catalogVisible: true,
    };
    if (search?.trim()) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search.toUpperCase() } },
        { description: { contains: search } },
      ];
    }
    const filteredCodes = this.normalizeCodeList(codeFilterRaw);
    if (filteredCodes.length > 0) {
      where.code = { in: filteredCodes };
    }

    const products = await this.prisma.product.findMany({
      where,
      orderBy: [{ catalogSortOrder: 'asc' }, { id: 'desc' }],
      select: {
        id: true,
        code: true,
        name: true,
        price: true,
        stockQty: true,
        imageUrl: true,
        description: true,
        videoUrl: true,
      },
    });

    return {
      page: {
        id: page.id,
        pageId: page.pageId,
        name: page.businessName || page.pageName,
        phone: page.businessPhone || '',
        address: page.businessAddress || '',
        logoUrl: page.logoUrl || '',
        currency: page.currencySymbol || '৳',
        primaryColor: page.primaryColor || '#5b63f5',
        footerText: page.memoFooterText || '',
        messengerUrl: page.catalogMessengerUrl || `https://m.me/${page.pageId}`,
        whatsappUrl: buildWhatsAppUrl(page.businessPhone),
        facebookPageUrl: buildFacebookPageUrl(
          page.pageId,
          page.catalogMessengerUrl,
        ),
        catalogSlug: page.catalogSlug || null,
      },
      products,
      total: products.length,
    };
  }

  // ── Single product HTML page ─────────────────────────────────────────────
  private buildProductHtml(
    page: any,
    p: any,
    opts?: { selectionMode?: boolean; shortlistCodes?: string[] },
  ): string {
    const primary = esc(page.primaryColor);
    const currency = esc(page.currency);
    const inStock = p.stockQty > 0;
    const selectionMode = Boolean(opts?.selectionMode);
    const shortlistCodes = opts?.shortlistCodes || [];
    const shortlistQuery = shortlistCodes.length
      ? `?select=1&codes=${encodeURIComponent(shortlistCodes.join(','))}`
      : '?select=1';
    const catalogHref = shortlistCodes.length
      ? `/catalog/${esc(page.id)}${shortlistQuery}`
      : `/catalog/${esc(page.id)}`;

    const videoType = detectVideoType(p.videoUrl || '');
    const ytId = videoType === 'youtube' ? extractYouTubeId(p.videoUrl) : null;
    const isFB = videoType === 'facebook';
    const galleryImages = [
      p.imageUrl,
      ...this.parseReferenceImages(p.referenceImagesJson),
    ].filter((value, index, all) => !!value && all.indexOf(value) === index);
    const primaryImage = galleryImages[0] || '';
    const hasMedia = !!(ytId || isFB || primaryImage);

    let mediaBlock = '';
    if (ytId) {
      mediaBlock = `<div class="media-frame video-box"><iframe src="https://www.youtube.com/embed/${esc(ytId)}?rel=0&modestbranding=1&color=white" frameborder="0" allowfullscreen allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" loading="lazy"></iframe></div>`;
    } else if (isFB) {
      const fbUrl = encodeURIComponent(p.videoUrl);
      mediaBlock = `<div class="media-frame video-box fb-box"><iframe src="https://www.facebook.com/plugins/video.php?href=${fbUrl}&width=500&show_text=false" frameborder="0" allowfullscreen scrolling="no" allow="autoplay;clipboard-write;encrypted-media;picture-in-picture;web-share" loading="lazy"></iframe></div>`;
    } else if (primaryImage) {
      mediaBlock = `<div class="media-frame img-frame"><img src="${esc(primaryImage)}" alt="${esc(p.name || p.code)}" loading="lazy" onerror="this.closest('.media-frame').outerHTML=noImgBlock"/></div>`;
    } else {
      mediaBlock = ``;
    }

    const galleryBlock =
      galleryImages.length > 1
        ? `<div class="gallery-strip">
      ${galleryImages
        .map(
          (url: string, index: number) =>
            `<button class="g-thumb ${index === 0 ? 'active' : ''}" type="button" onclick="setGalleryImage('${esc(url)}', this)"><img src="${esc(url)}" alt="${esc(p.name || p.code)} view ${index + 1}" loading="lazy"/></button>`,
        )
        .join('')}
    </div>`
        : '';

    let variantHtml = '';
    if (p.variantOptions) {
      try {
        const variants: Array<{ label: string; choices?: string[] }> =
          JSON.parse(p.variantOptions);
        variantHtml = variants
          .filter((v) => v.choices?.length)
          .map(
            (v) => `
          <div class="var-group">
            <div class="var-label">${esc(v.label)}</div>
            <div class="var-chips">
              ${v.choices!.map((c) => `<button class="chip" onclick="this.parentElement.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));this.classList.add('active')">${esc(c)}</button>`).join('')}
            </div>
          </div>`,
          )
          .join('');
      } catch {
        /* ignore */
      }
    }

    const orderText = encodeURIComponent(`${p.code} order করতে চাই`);
    const selectText = encodeURIComponent(`SELECT_PRODUCT:${p.code}`);
    const priceFormatted = Number(p.price).toLocaleString('bn-BD');

    return `<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="theme-color" content="${primary}"/>
<meta property="og:title" content="${esc(p.name || p.code)} — ${esc(page.name)}"/>
${primaryImage ? `<meta property="og:image" content="${esc(primaryImage)}"/>` : ''}
<meta property="og:description" content="মূল্য: ${currency}${Number(p.price).toLocaleString()} · ${esc(p.description || p.name || '')}"/>
<title>${esc(p.name || p.code)} — ${esc(page.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --p:${primary};
  --p-dark:color-mix(in srgb,${primary} 78%,#000);
  --p-light:color-mix(in srgb,${primary} 12%,#fff);
  --p-mid:color-mix(in srgb,${primary} 18%,transparent);
  --bg:#f4f6fb;
  --surface:#fff;
  --text:#0d1117;
  --sub:#4b5563;
  --muted:#9ca3af;
  --border:#e5e7eb;
  --r:18px;
  --shadow:0 2px 20px rgba(0,0,0,.07),0 1px 4px rgba(0,0,0,.04);
  --shadow-lg:0 8px 40px rgba(0,0,0,.1),0 2px 8px rgba(0,0,0,.06);
}
html{scroll-behavior:smooth}
body{font-family:"Hind Siliguri","Inter",system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;-webkit-font-smoothing:antialiased}

/* ── NAV ── */
.nav{position:sticky;top:0;z-index:200;background:rgba(255,255,255,.92);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-bottom:1px solid var(--border);box-shadow:0 1px 8px rgba(0,0,0,.04)}
.nav-inner{max-width:980px;margin:0 auto;padding:11px 20px;display:flex;align-items:center;gap:10px}
.nav-logo{width:34px;height:34px;border-radius:10px;object-fit:cover;flex-shrink:0;border:1.5px solid var(--border)}
.nav-logo-ph{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--p),var(--p-dark));display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}
.nav-biz{font-size:14.5px;font-weight:700;color:var(--text);letter-spacing:-.2px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nav-back{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:22px;background:var(--bg);color:var(--sub);text-decoration:none;font-size:12.5px;font-weight:600;border:1.5px solid var(--border);transition:all .15s;white-space:nowrap;flex-shrink:0}
.nav-back:hover{background:var(--p);color:#fff;border-color:var(--p)}
.nav-back svg{width:13px;height:13px;fill:currentColor}

/* ── LAYOUT ── */
.wrapper{max-width:980px;margin:28px auto 80px;padding:0 18px}
.product-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}

/* ── MEDIA COLUMN ── */
.media-col{position:sticky;top:70px;display:flex;flex-direction:column;gap:12px}
.media-frame{border-radius:var(--r);overflow:hidden;box-shadow:var(--shadow-lg);background:var(--surface);position:relative}
.img-frame img{width:100%;aspect-ratio:1;object-fit:cover;display:block;transition:transform .5s cubic-bezier(.25,.46,.45,.94)}
.img-frame:hover img{transform:scale(1.05)}
.gallery-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(72px,1fr));gap:10px}
.g-thumb{appearance:none;border:1.5px solid var(--border);border-radius:14px;overflow:hidden;aspect-ratio:1;background:var(--surface);padding:0;cursor:pointer;box-shadow:var(--shadow);transition:transform .15s,border-color .15s,box-shadow .15s}
.g-thumb:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--p) 30%,#dbe4f0)}
.g-thumb.active{border-color:var(--p);box-shadow:0 0 0 3px color-mix(in srgb,var(--p) 16%,transparent),var(--shadow)}
.g-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.video-box{aspect-ratio:16/9;position:relative}
.fb-box{aspect-ratio:4/3}
.video-box iframe{position:absolute;inset:0;width:100%;height:100%;border:none}

/* No-image placeholder — rich design */
.no-img-card{background:linear-gradient(145deg,var(--p-light),color-mix(in srgb,var(--p) 6%,#fff));border-radius:var(--r);box-shadow:var(--shadow-lg);overflow:hidden;position:relative;aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px;border:1.5px solid color-mix(in srgb,var(--p) 14%,#fff)}
.no-img-orb{position:absolute;border-radius:50%;opacity:.18;pointer-events:none}
.no-img-orb-1{width:260px;height:260px;top:-60px;left:-60px;background:radial-gradient(circle,var(--p),transparent 70%)}
.no-img-orb-2{width:200px;height:200px;bottom:-40px;right:-40px;background:radial-gradient(circle,var(--p-dark),transparent 70%)}
.no-img-icon{font-size:72px;line-height:1;filter:drop-shadow(0 4px 12px rgba(0,0,0,.12));position:relative;z-index:1}
.no-img-code{position:relative;z-index:1;background:rgba(255,255,255,.75);backdrop-filter:blur(8px);border:1.5px solid color-mix(in srgb,var(--p) 22%,#fff);border-radius:12px;padding:10px 22px;text-align:center}
.no-img-code-lbl{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-bottom:4px}
.no-img-code-val{font-size:22px;font-weight:900;color:var(--p);letter-spacing:.04em}
.no-img-hint{position:relative;z-index:1;font-size:11.5px;color:var(--muted);font-weight:500;text-align:center;opacity:.8}

/* Info panel below image */
.media-info-strip{background:var(--surface);border-radius:14px;padding:14px 18px;box-shadow:var(--shadow);display:flex;gap:0;border:1px solid var(--border)}
.mi-item{flex:1;text-align:center;position:relative}
.mi-item+.mi-item::before{content:'';position:absolute;left:0;top:10%;bottom:10%;width:1px;background:var(--border)}
.mi-val{font-size:13px;font-weight:800;color:var(--text);margin-bottom:3px}
.mi-lbl{font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.tips-card{margin-top:14px;background:linear-gradient(135deg,var(--p-light),color-mix(in srgb,var(--p) 6%,#fff));border:1.5px solid color-mix(in srgb,var(--p) 18%,#fff);border-radius:16px;padding:16px 16px 14px;box-shadow:var(--shadow)}
.tips-kicker{font-size:10.5px;font-weight:800;color:var(--p);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px}
.tips-title{font-size:14px;font-weight:800;color:var(--text);margin-bottom:10px}
.tips-list{display:grid;gap:7px}
.tip-row{display:flex;align-items:flex-start;gap:8px;font-size:12.5px;color:var(--sub);line-height:1.6}
.tip-dot{width:22px;height:22px;border-radius:999px;background:rgba(255,255,255,.72);border:1px solid color-mix(in srgb,var(--p) 16%,#fff);display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0}
.tips-visual{margin-top:12px;display:grid;grid-template-columns:96px 1fr;gap:10px;align-items:center}
.tips-frame{position:relative;width:96px;height:118px;border-radius:16px;background:rgba(255,255,255,.82);border:1.5px dashed color-mix(in srgb,var(--p) 18%,#fff)}
.tips-frame::before{content:'';position:absolute;inset:14px 12px;border:2px solid var(--p);border-radius:12px}
.tips-frame::after{content:'1 item';position:absolute;bottom:8px;left:8px;padding:4px 8px;border-radius:999px;background:var(--p);color:#fff;font-size:9px;font-weight:800}
.tips-copy{font-size:12px;color:var(--sub);line-height:1.55}

/* ── INFO CARD ── */
.info-card{background:var(--surface);border-radius:var(--r);box-shadow:var(--shadow-lg);overflow:hidden}
.info-card-accent{height:4px;background:linear-gradient(90deg,var(--p),var(--p-dark),color-mix(in srgb,var(--p) 60%,#c084fc))}
.info-body{padding:26px 26px 28px}

/* Breadcrumb */
.bc{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:16px}
.bc a{color:var(--muted);text-decoration:none;transition:color .12s}
.bc a:hover{color:var(--p)}
.bc-sep{opacity:.35}

/* Code pill */
.code-pill{display:inline-flex;align-items:center;gap:5px;background:var(--p-light);border:1px solid color-mix(in srgb,var(--p) 20%,transparent);color:var(--p);font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:5px 12px;border-radius:8px;margin-bottom:14px}

/* Name */
.pname{font-size:22px;font-weight:800;line-height:1.35;color:var(--text);letter-spacing:-.3px;margin-bottom:20px}

/* Price block */
.price-block{display:flex;align-items:center;gap:14px;padding:16px 20px;background:linear-gradient(135deg,var(--p-mid),color-mix(in srgb,var(--p) 8%,transparent));border-radius:14px;border:1.5px solid color-mix(in srgb,var(--p) 18%,transparent);margin-bottom:22px}
.price-val{font-size:32px;font-weight:900;color:var(--p);letter-spacing:-1px;line-height:1}
.stock-pill{font-size:11.5px;font-weight:700;padding:5px 13px;border-radius:20px;letter-spacing:.03em;white-space:nowrap}
.s-in{background:#dcfce7;color:#15803d;border:1px solid #bbf7d0}
.s-out{background:#fee2e2;color:#dc2626;border:1px solid #fecaca}

/* Divider */
.divider{height:1px;background:var(--border);margin:18px 0}

/* Variants */
.var-group{margin-bottom:16px}
.var-label{font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:9px}
.var-chips{display:flex;flex-wrap:wrap;gap:7px}
.chip{padding:7px 16px;border-radius:22px;border:1.5px solid var(--border);font-size:13px;font-weight:600;color:var(--sub);background:var(--surface);cursor:pointer;transition:all .15s;font-family:inherit}
.chip:hover,.chip.active{border-color:var(--p);color:var(--p);background:var(--p-light);transform:translateY(-1px);box-shadow:0 2px 8px color-mix(in srgb,var(--p) 20%,transparent)}

/* Description */
.desc-lbl{font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:9px}
.desc-txt{font-size:14px;color:var(--sub);line-height:1.85}

/* CTA */
.cta-stack{display:flex;flex-direction:column;gap:10px;margin-top:2px}
.btn-order{display:flex;align-items:center;justify-content:center;gap:9px;background:linear-gradient(135deg,var(--p),var(--p-dark));color:#fff;text-decoration:none;padding:15px 24px;border-radius:14px;font-weight:700;font-size:15px;transition:all .2s;box-shadow:0 4px 18px color-mix(in srgb,var(--p) 38%,transparent);font-family:inherit;border:none;cursor:pointer;letter-spacing:.01em}
.btn-order:hover:not(.disabled){transform:translateY(-2px);box-shadow:0 8px 28px color-mix(in srgb,var(--p) 48%,transparent)}
.btn-order:active:not(.disabled){transform:translateY(0)}
.btn-order.disabled{background:var(--border);color:var(--muted);pointer-events:none;box-shadow:none}
.btn-secondary{display:flex;align-items:center;justify-content:center;gap:7px;background:var(--bg);color:var(--sub);text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600;font-size:13.5px;transition:all .15s;border:1.5px solid var(--border)}
.btn-secondary:hover{background:var(--border);color:var(--text)}

/* Share + phone */
.action-row{display:flex;gap:8px;margin-top:8px}
.btn-action{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;background:var(--bg);color:var(--sub);border:1.5px solid var(--border);border-radius:10px;padding:10px 8px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;text-decoration:none;white-space:nowrap}
.btn-action:hover{background:var(--border);color:var(--text);border-color:#d1d5db}

/* Trust */
.trust-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}
.trust-item{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);font-weight:600;background:var(--bg);padding:4px 10px;border-radius:20px;border:1px solid var(--border)}

/* ── FOOTER ── */
.site-footer{background:var(--surface);border-top:1px solid var(--border);padding:28px 20px;text-align:center;margin-top:16px}
.footer-inner{max-width:980px;margin:0 auto}
.footer-biz{font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px}
.footer-sub{font-size:13px;color:var(--muted)}
.footer-sub a{color:var(--p);text-decoration:none;font-weight:600}
.footer-help{font-size:13px;color:var(--muted);margin-top:8px}
.footer-links{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:10px}
.footer-links a{color:var(--p);text-decoration:none;font-weight:600}

/* ── MOBILE STICKY CTA ── */
.mobile-cta{display:none;position:fixed;bottom:0;left:0;right:0;z-index:300;padding:10px 16px 18px;background:linear-gradient(to top,rgba(255,255,255,1) 60%,rgba(255,255,255,0));pointer-events:none}
.mobile-cta .btn-order{pointer-events:all}

/* ── MOBILE ── */
@media(max-width:680px){
  .wrapper{padding:0 12px;margin-top:16px;margin-bottom:60px}
  .product-grid{grid-template-columns:1fr;gap:14px}
  .media-col{position:static}
  .info-body{padding:20px 18px 22px}
  .pname{font-size:19px}
  .price-val{font-size:28px}
  .btn-order{font-size:14px;padding:13px 20px}
  .mobile-cta{display:block}
  .media-info-strip{display:none}
}

/* ── ANIMATIONS ── */
@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.media-col{animation:fadeUp .4s ease both}
.info-card{animation:fadeUp .4s .07s ease both}

/* ── DARK MODE ── */
@media(prefers-color-scheme:dark){
  :root{color-scheme:dark;--bg:#0b0b13;--surface:#13131f;--text:#eeeef5;--sub:#9ca3af;--muted:#6b7280;--border:rgba(255,255,255,.08)}
  .nav{background:rgba(19,19,31,.92)!important}
  .no-img-card{background:linear-gradient(145deg,rgba(79,70,229,.12),rgba(124,58,237,.07))!important;border-color:rgba(255,255,255,.07)!important}
  .media-info-strip{background:rgba(255,255,255,.03)}
  .s-in{background:rgba(21,128,61,.18);color:#4ade80;border-color:rgba(21,128,61,.3)}
  .s-out{background:rgba(220,38,38,.18);color:#f87171;border-color:rgba(220,38,38,.3)}
  .mobile-cta{background:linear-gradient(to top,rgba(11,11,19,1) 60%,rgba(11,11,19,0))!important}
}
[data-dark="1"]{color-scheme:dark;--bg:#0b0b13;--surface:#13131f;--text:#eeeef5;--sub:#9ca3af;--muted:#6b7280;--border:rgba(255,255,255,.08)}
[data-dark="1"] .nav{background:rgba(19,19,31,.92)!important}
[data-dark="1"] .no-img-card{background:linear-gradient(145deg,rgba(79,70,229,.12),rgba(124,58,237,.07))!important;border-color:rgba(255,255,255,.07)!important}
[data-dark="1"] .media-info-strip{background:rgba(255,255,255,.03)}
[data-dark="1"] .s-in{background:rgba(21,128,61,.18);color:#4ade80;border-color:rgba(21,128,61,.3)}
[data-dark="1"] .s-out{background:rgba(220,38,38,.18);color:#f87171;border-color:rgba(220,38,38,.3)}
[data-dark="1"] .mobile-cta{background:linear-gradient(to top,rgba(11,11,19,1) 60%,rgba(11,11,19,0))!important}
[data-dark="0"]{color-scheme:light;--bg:#f4f6fb;--surface:#fff;--text:#0d1117;--sub:#4b5563;--muted:#9ca3af;--border:#e5e7eb}
[data-dark="0"] .nav{background:rgba(255,255,255,.92)!important}

/* Dark toggle button */
.dark-btn{background:var(--bg);border:1.5px solid var(--border);color:var(--sub);border-radius:22px;padding:6px 12px;font-size:14px;cursor:pointer;transition:all .15s;flex-shrink:0;line-height:1;display:flex;align-items:center;justify-content:center}
.dark-btn:hover{background:var(--border)}
</style>
<script>
(function(){
  var s=localStorage.getItem('cat_dark');
  var sys=window.matchMedia('(prefers-color-scheme:dark)').matches;
  document.documentElement.dataset.dark=(s!==null?s==='1':sys)?'1':'0';
})();
</script>
</head>
<body>

<nav class="nav">
  <div class="nav-inner">
    ${
      page.logoUrl
        ? `<img src="${esc(page.logoUrl)}" alt="logo" class="nav-logo" onerror="this.outerHTML='<div class=nav-logo-ph>🛍️</div>'">`
        : `<div class="nav-logo-ph">🛍️</div>`
    }
    <span class="nav-biz">${esc(page.name)}</span>
    <a href="${catalogHref}" class="nav-back">
      <svg viewBox="0 0 20 20"><path d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"/></svg>
      সব Product
    </a>
    <button class="dark-btn" id="dkBtn" onclick="(function(){var d=document.documentElement.dataset.dark==='1';document.documentElement.dataset.dark=d?'0':'1';localStorage.setItem('cat_dark',d?'0':'1');document.getElementById('dkBtn').textContent=d?'🌙':'☀️'})()">🌙</button>
  </div>
</nav>
<script>document.addEventListener('DOMContentLoaded',function(){var b=document.getElementById('dkBtn');if(b)b.textContent=document.documentElement.dataset.dark==='1'?'☀️':'🌙'});</script>

<div class="wrapper">
  <div class="product-grid">

    <!-- Left: Media -->
    <div class="media-col">
      ${
        hasMedia
          ? mediaBlock
          : `
      <div class="no-img-card">
        <div class="no-img-orb no-img-orb-1"></div>
        <div class="no-img-orb no-img-orb-2"></div>
        <div class="no-img-icon">🛍️</div>
        <div class="no-img-code">
          <div class="no-img-code-lbl">Product Code</div>
          <div class="no-img-code-val">${esc(p.code)}</div>
        </div>
        <div class="no-img-hint">ছবি শীঘ্রই আসছে</div>
      </div>`
      }

      ${galleryBlock}

      <div class="media-info-strip">
        <div class="mi-item">
          <div class="mi-val">${currency}${Number(p.price).toLocaleString()}</div>
          <div class="mi-lbl">Price</div>
        </div>
        <div class="mi-item">
          <div class="mi-val" style="color:${inStock ? '#16a34a' : '#dc2626'}">${inStock ? 'Available' : 'Out'}</div>
          <div class="mi-lbl">Stock</div>
        </div>
        <div class="mi-item">
          <div class="mi-val">${esc(p.code)}</div>
          <div class="mi-lbl">Code</div>
        </div>
      </div>
      <div class="tips-card">
        <div class="tips-kicker">Best Result</div>
        <div class="tips-title">ছবি পাঠানোর সময় এভাবে দিলে match better হবে</div>
        <div class="tips-list">
          <div class="tip-row"><span class="tip-dot">1</span><span>একবারে ১টা product-এর clear photo দিন</span></div>
          <div class="tip-row"><span class="tip-dot">2</span><span>পুরো product যেন frame-এর মধ্যে থাকে</span></div>
          <div class="tip-row"><span class="tip-dot">3</span><span>blur / collage না দিয়ে front photo দিন</span></div>
          <div class="tip-row"><span class="tip-dot">4</span><span>চাইলে color/type লিখুন, যেমন: blue kurti</span></div>
        </div>
        <div class="tips-visual">
          <div class="tips-frame"></div>
          <div class="tips-copy">
            Full frame, 1 item, paused clear shot. Video থেকে screenshot নিলে front view আর print close-up আলাদা করে দিন।
          </div>
        </div>
      </div>
    </div>

    <!-- Right: Info -->
    <div class="info-card">
      <div class="info-card-accent"></div>
      <div class="info-body">

        <div class="bc">
          <a href="/catalog/${esc(page.id)}">Catalog</a>
          <span class="bc-sep">›</span>
          <span>${esc(p.name || p.code)}</span>
        </div>

        <div class="code-pill">🏷️ ${esc(p.code)}</div>
        <div class="pname">${esc(p.name || p.code)}</div>

        <div class="price-block">
          <div class="price-val">${currency}${Number(p.price).toLocaleString()}</div>
          <span class="stock-pill ${inStock ? 's-in' : 's-out'}">${inStock ? '✓ In Stock' : '✕ Stock Out'}</span>
        </div>

        ${variantHtml ? `${variantHtml}<div class="divider"></div>` : ''}

        ${
          p.description
            ? `
        <div class="desc-lbl">বিবরণ</div>
        <div class="desc-txt">${esc(p.description)}</div>
        <div class="divider"></div>`
            : '<div class="divider"></div>'
        }

        <div class="cta-stack">
          ${
            selectionMode
              ? `<a class="btn-order${!inStock ? ' disabled' : ''}"
            href="${esc(page.messengerUrl)}?text=${selectText}"
            target="_blank" rel="noopener"
            ${!inStock ? 'onclick="return false"' : ''}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            ${inStock ? 'এই Product টা Select করুন' : 'Stock নেই'}
          </a>`
              : ''
          }
          <a class="btn-order${!inStock ? ' disabled' : ''}"
            href="${esc(page.messengerUrl)}?text=${orderText}"
            target="_blank" rel="noopener"
            ${!inStock ? 'onclick="return false"' : ''}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            ${inStock ? 'Messenger এ Order করুন' : 'Stock নেই'}
          </a>
          <a class="btn-secondary" href="${catalogHref}">
            🛍️ ${shortlistCodes.length ? 'শর্টলিস্টে ফিরে যান' : 'সব Product দেখুন'}
          </a>
        </div>

        <div class="action-row">
          <button class="btn-action" onclick="navigator.clipboard.writeText(location.href);this.textContent='✅ Copied!'">
            🔗 Link Copy
          </button>
          ${page.phone ? `<a class="btn-action" href="tel:${esc(page.phone)}">📞 ${esc(page.phone)}</a>` : ''}
        </div>

        <div class="trust-row">
          <span class="trust-item">🔒 Secure Order</span>
          <span class="trust-item">💬 Fast Reply</span>
          ${inStock ? '<span class="trust-item">🚚 Home Delivery</span>' : ''}
        </div>

      </div>
    </div>

  </div>
</div>

${
  inStock
    ? `
<div class="mobile-cta">
  <a class="btn-order" href="${esc(page.messengerUrl)}?text=${orderText}" target="_blank" rel="noopener">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    Messenger এ Order করুন
  </a>
</div>`
    : ''
}

<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-biz">${esc(page.name)}</div>
    <div class="footer-sub">
      ${page.footerText ? `${esc(page.footerText)} · ` : ''}
      <a href="${esc(page.messengerUrl)}" target="_blank">💬 Messenger এ Order করুন</a>
    </div>
    ${page.phone ? `<div class="footer-help">Helpline: ${esc(page.phone)}</div>` : ''}
    ${
      page.whatsappUrl || page.facebookPageUrl
        ? `<div class="footer-links">
      ${page.whatsappUrl ? `<a href="${esc(page.whatsappUrl)}" target="_blank" rel="noopener">WhatsApp Support</a>` : ''}
      ${page.facebookPageUrl ? `<a href="${esc(page.facebookPageUrl)}" target="_blank" rel="noopener">Facebook Page</a>` : ''}
    </div>`
        : ''
    }
  </div>
</footer>

<script>
var noImgBlock = '<div class="no-img-card"><div class="no-img-orb no-img-orb-1"></div><div class="no-img-orb no-img-orb-2"></div><div class="no-img-icon">🛍️</div><div class="no-img-code"><div class="no-img-code-lbl">Product Code</div><div class="no-img-code-val">${esc(p.code)}</div></div><div class="no-img-hint">ছবি শীঘ্রই আসছে</div></div>';
function setGalleryImage(url, button){
  var frame = document.querySelector('.img-frame img');
  if(!frame) return;
  frame.src = url;
  document.querySelectorAll('.g-thumb').forEach(function(item){ item.classList.remove('active'); });
  if(button) button.classList.add('active');
}
</script>
${poweredByBadge()}
</body>
</html>`;
  }

  // ── Catalog HTML page ──────────────────────────────────────────────────────
  private buildHtml(
    data: any,
    search: string,
    opts?: { selectionMode?: boolean; shortlistCodes?: string[] },
  ): string {
    const { page, products } = data;
    const primary = esc(page.primaryColor);
    const currency = esc(page.currency);
    const selectionMode = Boolean(opts?.selectionMode);
    const shortlistCodes = opts?.shortlistCodes || [];
    const shortlistQuery = shortlistCodes.length
      ? `?select=1&codes=${encodeURIComponent(shortlistCodes.join(','))}`
      : '?select=1';

    const cards = products
      .map((p: any, idx: number) => {
        const videoType = detectVideoType(p.videoUrl || '');
        const ytId =
          videoType === 'youtube' ? extractYouTubeId(p.videoUrl) : null;
        const isFB = videoType === 'facebook';
        const inStock = p.stockQty > 0;
        const delay = Math.min(idx * 40, 400);

        let topBlock = '';
        if (ytId) {
          topBlock = `<div class="c-video"><iframe src="https://www.youtube.com/embed/${esc(ytId)}?rel=0&modestbranding=1" frameborder="0" allowfullscreen allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" loading="lazy"></iframe></div>`;
        } else if (isFB) {
          const fbUrl = encodeURIComponent(p.videoUrl);
          topBlock = `<div class="c-video fb"><iframe src="https://www.facebook.com/plugins/video.php?href=${fbUrl}&width=500&show_text=false&appId" frameborder="0" allowfullscreen scrolling="no" allow="autoplay;clipboard-write;encrypted-media;picture-in-picture;web-share" loading="lazy"></iframe></div>`;
        } else if (p.imageUrl) {
          topBlock = `<div class="c-img"><img src="${esc(p.imageUrl)}" alt="${esc(p.name || p.code)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=c-ph>🛍️</div>'"/></div>`;
        } else {
          topBlock = `<div class="c-ph">🛍️</div>`;
        }

        return `
      <a class="card" href="/catalog/${esc(page.id)}/product/${esc(p.code)}${selectionMode ? shortlistQuery : ''}" style="animation-delay:${delay}ms" id="p-${esc(p.id)}" data-price="${Number(p.price) || 0}" data-custom-index="${idx}" data-new-index="${idx}" data-product-id="${esc(p.id)}">
        <div class="c-media">
          ${topBlock}
          ${!inStock ? '<div class="c-out-badge">Stock Out</div>' : ''}
          ${p.videoUrl ? '<div class="c-vid-badge">🎬</div>' : ''}
        </div>
        <div class="c-body">
          <div class="c-code">${esc(p.code)}</div>
          <div class="c-name">${esc(p.name || p.code)}</div>
          ${p.description ? `<div class="c-desc">${esc(p.description)}</div>` : ''}
          <div class="c-footer">
            <div class="c-price">${currency}${Number(p.price).toLocaleString()}</div>
            <div class="c-order ${!inStock ? 'c-order-dis' : ''}">${inStock ? (selectionMode ? '✅ Select' : '💬 Order') : 'Out'}</div>
          </div>
        </div>
      </a>`;
      })
      .join('');

    const emptyState =
      products.length === 0
        ? `
      <div class="empty">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">${search ? `"${esc(search)}" পাওয়া যায়নি` : selectionMode ? 'ম্যাচ করা shortlist এ কোনো product নেই' : 'কোনো product নেই'}</div>
        ${(search || selectionMode) ? `<a href="/catalog/${esc(page.id)}" class="empty-btn">সব product দেখুন</a>` : ''}
      </div>`
        : '';

    return `<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="theme-color" content="${primary}"/>
<title>${esc(page.name)} — Product Catalog</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --p:${primary};
  --p2:color-mix(in srgb,${primary} 80%,#000);
  --p-soft:color-mix(in srgb,${primary} 14%,#fff);
  --bg:#f7f8fc;
  --surface:#ffffff;
  --surface-2:#f9fbff;
  --text:#0f172a;
  --sub:#475569;
  --muted:#94a3b8;
  --border:#e2e8f0;
  --r:22px;
  --shadow:0 18px 50px rgba(15,23,42,.08);
  --shadow-sm:0 8px 24px rgba(15,23,42,.06);
}
html{scroll-behavior:smooth}
body{font-family:"Hind Siliguri","Inter",system-ui,sans-serif;background:radial-gradient(circle at top left,color-mix(in srgb,var(--p) 12%,transparent),transparent 34%),linear-gradient(180deg,#f9fbff 0%,#f6f7fb 32%,#eef2f8 100%);color:var(--text);min-height:100vh;-webkit-font-smoothing:antialiased}

/* ── HEADER ── */
.header{background:linear-gradient(135deg,var(--p),var(--p2));color:#fff;position:sticky;top:0;z-index:100;box-shadow:0 10px 30px rgba(15,23,42,.16)}
.header::after{content:'';position:absolute;bottom:-1px;left:0;right:0;height:1px;background:rgba(255,255,255,.15)}
.header-glass{backdrop-filter:blur(0);-webkit-backdrop-filter:blur(0)}
.header-inner{max-width:1180px;margin:0 auto;padding:14px 20px 10px;display:flex;align-items:center;gap:14px}
.h-logo{width:48px;height:48px;border-radius:15px;object-fit:cover;border:2px solid rgba(255,255,255,.3);flex-shrink:0}
.h-logo-ph{width:48px;height:48px;border-radius:15px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;border:2px solid rgba(255,255,255,.2)}
.h-biz{font-size:19px;font-weight:800;letter-spacing:-.3px;line-height:1.15}
.h-sub{font-size:12px;opacity:.82;margin-top:4px;font-weight:500}
.header-actions{margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}
.h-msg-btn{background:rgba(255,255,255,.18);color:#fff;border:1.5px solid rgba(255,255,255,.35);border-radius:999px;padding:10px 18px;font-weight:700;font-size:13px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:7px;white-space:nowrap;backdrop-filter:blur(8px);transition:all .15s;font-family:inherit}
.h-msg-btn:hover{background:rgba(255,255,255,.28);border-color:rgba(255,255,255,.5)}

/* ── HERO ── */
.hero-wrap{max-width:1180px;margin:0 auto;padding:0 20px 8px}
.hero-card{position:relative;overflow:hidden;border-radius:22px;background:linear-gradient(135deg,rgba(255,255,255,.14),rgba(255,255,255,.06));border:1px solid rgba(255,255,255,.12);padding:14px 16px;box-shadow:inset 0 1px 0 rgba(255,255,255,.12)}
.hero-card::before{content:'';position:absolute;width:340px;height:340px;border-radius:50%;right:-110px;top:-160px;background:radial-gradient(circle,rgba(255,255,255,.28),transparent 70%)}
.hero-card::after{content:'';position:absolute;width:240px;height:240px;border-radius:50%;left:-60px;bottom:-120px;background:radial-gradient(circle,rgba(255,255,255,.14),transparent 72%)}
.hero-search{position:relative;z-index:2;margin-bottom:12px}
.hero-grid{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1.7fr) minmax(240px,.8fr);gap:10px;align-items:center}
.hero-copy{padding:0}
.hero-kicker{display:inline-flex;align-items:center;gap:8px;padding:6px 11px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.16);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.hero-title{margin-top:8px;font-size:22px;line-height:1.08;font-weight:900;letter-spacing:-.8px;max-width:none}
.hero-text{margin-top:8px;max-width:60ch;font-size:12.5px;line-height:1.6;color:rgba(255,255,255,.82)}
.hero-points{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
.hero-pill{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.14);font-size:11.5px;font-weight:600}
.hero-panel{background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-radius:18px;padding:12px 14px;border:1px solid rgba(255,255,255,.5);box-shadow:0 18px 44px rgba(15,23,42,.12);color:var(--text)}
.hero-panel-label{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.hero-panel-title{margin-top:4px;font-size:17px;font-weight:900;letter-spacing:-.5px}
.hero-panel-text{margin-top:6px;font-size:12px;line-height:1.55;color:var(--sub)}
.hero-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px}
.hero-stat{padding:8px;border-radius:14px;background:var(--surface-2);border:1px solid var(--border)}
.hero-stat-num{font-size:16px;font-weight:900;color:var(--p);letter-spacing:-.5px}
.hero-stat-lbl{font-size:10px;color:var(--sub);margin-top:2px}
.hero-tips{margin-top:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.hero-tip{display:flex;gap:8px;align-items:flex-start;padding:9px 10px;border-radius:14px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.12);font-size:11.5px;line-height:1.5}
.hero-tip-badge{width:22px;height:22px;border-radius:999px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0}
.hero-guide{margin-top:12px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:12px;display:grid;grid-template-columns:112px 1fr;gap:12px;align-items:center}
.hero-guide-frame{position:relative;width:112px;height:138px;border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.24),rgba(255,255,255,.08));border:1.5px dashed rgba(255,255,255,.46);overflow:hidden}
.hero-guide-box{position:absolute;inset:18px 14px;border-radius:14px;border:2px solid rgba(255,255,255,.88)}
.hero-guide-dot{position:absolute;top:10px;left:50%;transform:translateX(-50%);width:34px;height:6px;border-radius:999px;background:rgba(255,255,255,.9)}
.hero-guide-badge{position:absolute;padding:4px 8px;border-radius:999px;background:rgba(10,16,28,.72);color:#fff;font-size:9.5px;font-weight:800}
.hero-guide-badge.top{top:10px;right:8px}
.hero-guide-badge.bottom{bottom:10px;left:8px}
.hero-guide-copy{font-size:12px;line-height:1.6;color:rgba(255,255,255,.88)}
.hero-guide-copy strong{display:block;font-size:13px;color:#fff;margin-bottom:4px}

/* ── SEARCH ── */
.search-strip{padding:0}
.search-inner{max-width:none;margin:0}
.s-wrap{position:relative}
.s-icon{position:absolute;left:18px;top:50%;transform:translateY(-50%);opacity:.45;pointer-events:none;font-size:16px;line-height:1}
.s-input{width:100%;padding:14px 18px 14px 48px;border-radius:18px;border:1.5px solid rgba(255,255,255,.22);font-size:14px;font-family:inherit;background:rgba(9,13,20,.14);outline:none;color:#fff;box-shadow:0 10px 26px rgba(15,23,42,.12);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.s-input::placeholder{color:var(--muted)}
.s-input:focus{box-shadow:0 0 0 4px color-mix(in srgb,var(--p) 18%,transparent),0 10px 26px rgba(15,23,42,.14);border-color:rgba(255,255,255,.42)}

/* ── STATS ── */
.stats{max-width:1180px;margin:8px auto 6px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.stats-count{font-size:14px;font-weight:700;color:var(--sub)}
.stats-count span{color:var(--p)}
.stats-badges{display:flex;flex-wrap:wrap;gap:10px}
.stats-badge{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:999px;background:rgba(255,255,255,.9);border:1px solid var(--border);box-shadow:var(--shadow-sm);font-size:12px;font-weight:700;color:var(--sub)}

/* ── FILTERS ── */
.filters{max-width:1180px;margin:4px auto 0;padding:0 20px}
.filters-inner{display:flex;gap:10px;flex-wrap:wrap}
.filter-btn{appearance:none;border:none;cursor:pointer;padding:10px 14px;border-radius:999px;background:rgba(255,255,255,.88);border:1px solid var(--border);box-shadow:var(--shadow-sm);font-size:12.5px;font-weight:800;color:var(--sub);font-family:inherit;transition:all .18s}
.filter-btn:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--p) 22%,#dbe4f0)}
.filter-btn.active{background:linear-gradient(135deg,var(--p),var(--p2));color:#fff;border-color:transparent;box-shadow:0 14px 28px color-mix(in srgb,var(--p) 28%,transparent)}

/* ── GRID ── */
.grid-wrap{max-width:1180px;margin:0 auto 70px;padding:0 20px}
.section-head{display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:12px 0 14px}
.section-kicker{font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--p)}
.section-title{margin-top:6px;font-size:28px;font-weight:900;letter-spacing:-.8px}
.section-text{margin-top:6px;font-size:13px;color:var(--sub)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px}

/* ── CARD ── */
.card{position:relative;background:linear-gradient(180deg,#fff 0%,#fbfcff 100%);border-radius:28px;overflow:hidden;text-decoration:none;color:inherit;display:flex;flex-direction:column;border:1px solid rgba(148,163,184,.16);transition:transform .22s cubic-bezier(.25,.46,.45,.94),box-shadow .22s,border-color .22s;box-shadow:var(--shadow-sm);animation:fadeUp .45s ease both}
.card:hover{transform:translateY(-7px);box-shadow:var(--shadow);border-color:color-mix(in srgb,var(--p) 22%,#dbe4f0)}
.card::after{content:'';position:absolute;inset:auto 0 0 0;height:5px;background:linear-gradient(90deg,var(--p),color-mix(in srgb,var(--p) 40%,#fff));opacity:0;transition:opacity .18s}
.card:hover::after{opacity:1}

/* Media */
.c-media{position:relative;overflow:hidden}
.c-img{width:100%;aspect-ratio:1;overflow:hidden;background:linear-gradient(135deg,#f8fbff,#eef3ff)}
.c-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .35s cubic-bezier(.25,.46,.45,.94)}
.card:hover .c-img img{transform:scale(1.07)}
.c-video{position:relative;width:100%;padding-top:56.25%;background:#0f172a}
.c-video.fb{padding-top:60%}
.c-video iframe{position:absolute;inset:0;width:100%;height:100%}
.c-ph{width:100%;aspect-ratio:1;background:radial-gradient(circle at top left,#eff4ff,#dfe8ff);display:flex;align-items:center;justify-content:center;font-size:54px}
.c-out-badge{position:absolute;top:14px;left:14px;background:rgba(220,38,38,.92);color:#fff;font-size:10px;font-weight:800;padding:5px 10px;border-radius:999px;letter-spacing:.06em}
.c-vid-badge{position:absolute;top:14px;right:14px;background:rgba(15,23,42,.72);color:#fff;font-size:10px;font-weight:700;padding:5px 10px;border-radius:999px;backdrop-filter:blur(6px)}
.c-store-badge{position:absolute;left:14px;bottom:14px;background:rgba(255,255,255,.88);color:var(--text);font-size:10.5px;font-weight:800;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.95);backdrop-filter:blur(8px)}

/* Body */
.c-body{padding:16px 17px 18px;flex:1;display:flex;flex-direction:column}
.c-code{font-size:10.5px;color:var(--muted);font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px}
.c-name{font-size:16px;font-weight:800;color:var(--text);margin-bottom:6px;line-height:1.35;flex:1}
.c-desc{font-size:12px;color:var(--sub);line-height:1.65;margin-bottom:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.c-footer{display:flex;align-items:end;justify-content:space-between;gap:10px;margin-top:auto;padding-top:12px;border-top:1px solid var(--border)}
.c-price-wrap{display:flex;flex-direction:column;gap:3px}
.c-price-lbl{font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.c-price{font-size:22px;font-weight:900;color:var(--p);letter-spacing:-.8px}
.c-order{background:linear-gradient(135deg,var(--p),var(--p2));color:#fff;font-size:11.5px;font-weight:800;padding:9px 14px;border-radius:999px;white-space:nowrap;transition:opacity .15s}
.c-order:hover{opacity:.88}
.c-order-dis{background:var(--border);color:var(--muted)}

/* ── EMPTY ── */
.empty{grid-column:1/-1;text-align:center;padding:90px 22px;border-radius:28px;background:rgba(255,255,255,.76);backdrop-filter:blur(10px);border:1px solid var(--border);box-shadow:var(--shadow-sm)}
.empty-icon{font-size:56px;margin-bottom:16px}
.empty-title{font-size:18px;font-weight:700;color:var(--sub)}
.empty-btn{display:inline-block;margin-top:20px;padding:12px 24px;background:linear-gradient(135deg,var(--p),var(--p2));color:#fff;border-radius:999px;text-decoration:none;font-size:14px;font-weight:800;transition:opacity .15s}
.empty-btn:hover{opacity:.88}

/* ── FOOTER ── */
.site-footer{padding:20px 20px 36px}
.footer-inner{max-width:1180px;margin:0 auto;background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(255,255,255,.84));border:1px solid var(--border);border-radius:30px;padding:28px 22px;text-align:center;box-shadow:var(--shadow-sm)}
.f-name{font-size:18px;font-weight:900;color:var(--text);margin-bottom:6px;letter-spacing:-.3px}
.f-sub{font-size:13px;color:var(--muted)}
.f-sub a{color:var(--p);text-decoration:none;font-weight:600}
.footer-help{font-size:13px;color:var(--sub);margin-top:10px;font-weight:600}
.footer-links{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:12px}
.footer-links a{display:inline-flex;align-items:center;gap:7px;padding:10px 14px;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);box-shadow:var(--shadow-sm);text-decoration:none;font-size:12.5px;font-weight:700;color:var(--text)}

/* ── RESPONSIVE ── */
@media(max-width:900px){
  .hero-grid{grid-template-columns:1fr}
  .hero-panel{display:none}
  .hero-title{max-width:none}
  .stats{align-items:flex-start}
  .hero-tips{grid-template-columns:1fr}
}
@media(max-width:600px){
  .header-inner{padding:14px 16px 10px;align-items:flex-start}
  .header-actions{width:100%;margin-left:0;justify-content:space-between}
  .hero-wrap,.stats,.filters,.grid-wrap,.site-footer{padding-left:14px;padding-right:14px}
  .hero-card{padding:12px 14px}
  .hero-kicker{font-size:10px;padding:5px 9px}
  .hero-title{font-size:18px}
  .hero-text{font-size:11.5px}
  .hero-points{display:none}
  .h-biz{font-size:16px}
  .h-msg-btn{padding:9px 14px;font-size:12px}
  .h-msg-btn .h-msg-txt{display:inline}
  .s-input{padding:13px 16px 13px 44px;font-size:13px}
  .grid{grid-template-columns:repeat(2,1fr);gap:12px}
  .section-title{font-size:23px}
  .c-body{padding:12px 12px 14px}
  .c-name{font-size:13px}
  .c-price{font-size:16px}
  .c-order{font-size:10px;padding:5px 10px}
  .stats-badges{gap:8px}
  .stats-badge{padding:8px 12px;font-size:11px}
}
@media(max-width:360px){.grid{grid-template-columns:1fr}}

/* ── ANIMATION ── */
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.header{animation:fadeUp .3s ease}

/* ── DARK MODE ── */
@media(prefers-color-scheme:dark){
  :root{color-scheme:dark;--bg:#05070b;--surface:#0f141c;--surface-2:#131a24;--text:#eef2ff;--sub:#9aa6bc;--muted:#64748b;--border:rgba(255,255,255,.08);--shadow:0 24px 64px rgba(0,0,0,.42);--shadow-sm:0 12px 30px rgba(0,0,0,.28)}
  body{background:
    radial-gradient(circle at top left,color-mix(in srgb,var(--p) 18%,transparent),transparent 32%),
    radial-gradient(circle at top right,rgba(255,255,255,.04),transparent 24%),
    linear-gradient(180deg,#04060a 0%,#090d14 34%,#0b1119 100%)}
  .header{background:linear-gradient(180deg,#090d14 0%,#0c1220 58%,#10192a 100%)!important;box-shadow:0 14px 40px rgba(0,0,0,.34)}
  .hero-card{background:linear-gradient(135deg,rgba(16,25,42,.96),rgba(18,24,38,.88));border-color:rgba(255,255,255,.06);box-shadow:0 18px 40px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.04)}
  .hero-panel,.footer-inner,.stats-badge,.footer-links a,.filter-btn{background:#121925;color:var(--text);border-color:rgba(255,255,255,.08)}
  .hero-kicker,.hero-pill{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.1)}
  .hero-text{color:rgba(238,242,255,.8)}
  .hero-panel-title,.section-title,.c-name,.f-name{color:#eef2ff}
  .hero-panel-label,.section-kicker,.c-code,.c-price-lbl{color:#9fb2d8}
  .hero-panel-text,.section-text,.c-desc,.f-sub,.footer-help,.stats-count{color:#9aa6bc}
  .hero-stat-num,.stats-count span,.c-price{color:#8ea2ff}
  .hero-stat-lbl,.s-input::placeholder{color:#7b8aa3}
  .stats-badge,.filter-btn,.footer-links a{color:#dbe7ff !important}
  .filter-btn.active{color:#fff !important}
  .h-sub,.nav-sub{color:#c5d1ec}
  .h-msg-btn,.dk-btn{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12);color:#eef2ff}
  .h-msg-btn:hover,.dk-btn:hover{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.18)}
  .s-input{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.08);color:#eef2ff;box-shadow:0 12px 30px rgba(0,0,0,.18)}
  .stats-badge,.filter-btn,.footer-links a,.hero-panel{backdrop-filter:none}
  .card{background:linear-gradient(180deg,#0f141c 0%,#121924 100%);border-color:rgba(255,255,255,.06)}
  .c-img{background:linear-gradient(135deg,#0f1722,#131b29)}
  .c-ph{background:linear-gradient(135deg,#141b27,#0f141d)!important}
  .c-store-badge{background:rgba(10,14,20,.84);color:#eef2ff;border-color:rgba(255,255,255,.08)}
  .c-order-dis{background:#1b2431;color:#7b8aa3}
  .hero-stat{background:rgba(255,255,255,.03)}
  .stats-badge,.footer-links a,.filter-btn{box-shadow:none}
  .filter-btn:hover{border-color:color-mix(in srgb,var(--p) 35%,rgba(255,255,255,.12))}
  .site-footer{background:transparent}
  .section-text,.c-desc,.hero-panel-text,.footer-help{color:var(--sub)}
}
[data-dark="1"]{color-scheme:dark;--bg:#05070b;--surface:#0f141c;--surface-2:#131a24;--text:#eef2ff;--sub:#9aa6bc;--muted:#64748b;--border:rgba(255,255,255,.08);--shadow:0 24px 64px rgba(0,0,0,.42);--shadow-sm:0 12px 30px rgba(0,0,0,.28)}
[data-dark="1"] body{background:
  radial-gradient(circle at top left,color-mix(in srgb,var(--p) 18%,transparent),transparent 32%),
  radial-gradient(circle at top right,rgba(255,255,255,.04),transparent 24%),
  linear-gradient(180deg,#04060a 0%,#090d14 34%,#0b1119 100%)}
[data-dark="1"] .header{background:linear-gradient(180deg,#090d14 0%,#0c1220 58%,#10192a 100%)!important;box-shadow:0 14px 40px rgba(0,0,0,.34)}
[data-dark="1"] .hero-card{background:linear-gradient(135deg,rgba(16,25,42,.96),rgba(18,24,38,.88));border-color:rgba(255,255,255,.06);box-shadow:0 18px 40px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.04)}
[data-dark="1"] .hero-panel,[data-dark="1"] .footer-inner,[data-dark="1"] .stats-badge,[data-dark="1"] .footer-links a,[data-dark="1"] .filter-btn{background:#121925;color:var(--text);border-color:rgba(255,255,255,.08)}
[data-dark="1"] .hero-kicker,[data-dark="1"] .hero-pill{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.1)}
[data-dark="1"] .hero-text{color:rgba(238,242,255,.8)}
[data-dark="1"] .hero-panel-title,[data-dark="1"] .section-title,[data-dark="1"] .c-name,[data-dark="1"] .f-name{color:#eef2ff}
[data-dark="1"] .hero-panel-label,[data-dark="1"] .section-kicker,[data-dark="1"] .c-code,[data-dark="1"] .c-price-lbl{color:#9fb2d8}
[data-dark="1"] .hero-panel-text,[data-dark="1"] .section-text,[data-dark="1"] .c-desc,[data-dark="1"] .f-sub,[data-dark="1"] .footer-help,[data-dark="1"] .stats-count{color:#9aa6bc}
[data-dark="1"] .hero-stat-num,[data-dark="1"] .stats-count span,[data-dark="1"] .c-price{color:#8ea2ff}
[data-dark="1"] .hero-stat-lbl,[data-dark="1"] .s-input::placeholder{color:#7b8aa3}
[data-dark="1"] .stats-badge,[data-dark="1"] .filter-btn,[data-dark="1"] .footer-links a{color:#dbe7ff !important}
[data-dark="1"] .filter-btn.active{color:#fff !important}
[data-dark="1"] .h-sub,[data-dark="1"] .nav-sub{color:#c5d1ec}
[data-dark="1"] .h-msg-btn,[data-dark="1"] .dk-btn{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12);color:#eef2ff}
[data-dark="1"] .h-msg-btn:hover,[data-dark="1"] .dk-btn:hover{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.18)}
[data-dark="1"] .s-input{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.08);color:#eef2ff;box-shadow:0 12px 30px rgba(0,0,0,.18)}
[data-dark="1"] .stats-badge,[data-dark="1"] .filter-btn,[data-dark="1"] .footer-links a,[data-dark="1"] .hero-panel{backdrop-filter:none}
[data-dark="1"] .card{background:linear-gradient(180deg,#0f141c 0%,#121924 100%);border-color:rgba(255,255,255,.06)}
[data-dark="1"] .c-img{background:linear-gradient(135deg,#0f1722,#131b29)}
[data-dark="1"] .c-ph{background:linear-gradient(135deg,#141b27,#0f141d)!important}
[data-dark="1"] .c-store-badge{background:rgba(10,14,20,.84);color:#eef2ff;border-color:rgba(255,255,255,.08)}
[data-dark="1"] .c-order-dis{background:#1b2431;color:#7b8aa3}
[data-dark="1"] .hero-stat{background:rgba(255,255,255,.03)}
[data-dark="1"] .stats-badge,[data-dark="1"] .footer-links a,[data-dark="1"] .filter-btn{box-shadow:none}
[data-dark="1"] .filter-btn:hover{border-color:color-mix(in srgb,var(--p) 35%,rgba(255,255,255,.12))}
[data-dark="1"] .site-footer{background:transparent}
[data-dark="1"] .section-text,[data-dark="1"] .c-desc,[data-dark="1"] .hero-panel-text,[data-dark="1"] .footer-help{color:var(--sub)}
[data-dark="0"]{color-scheme:light;--bg:#f0f2f8;--surface:#fff;--text:#0f172a;--sub:#475569;--muted:#94a3b8;--border:#e2e8f0}
[data-dark="0"] .s-input{background:rgba(255,255,255,.92);border-color:rgba(255,255,255,.76);color:var(--text)}

/* Dark toggle in header */
.dk-btn{background:rgba(255,255,255,.14);border:1.5px solid rgba(255,255,255,.25);color:#fff;border-radius:22px;padding:7px 12px;font-size:14px;cursor:pointer;transition:all .15s;line-height:1;backdrop-filter:blur(8px);flex-shrink:0}
.dk-btn:hover{background:rgba(255,255,255,.24)}
</style>
<script>
(function(){
  var s=localStorage.getItem('cat_dark');
  var sys=window.matchMedia('(prefers-color-scheme:dark)').matches;
  document.documentElement.dataset.dark=(s!==null?s==='1':sys)?'1':'0';
})();
</script>
</head>
<body>

<header class="header">
  <div class="header-inner">
    ${
      page.logoUrl
        ? `<img src="${esc(page.logoUrl)}" alt="logo" class="h-logo" onerror="this.outerHTML='<div class=h-logo-ph>🛍️</div>'">`
        : `<div class="h-logo-ph">🛍️</div>`
    }
    <div>
      <div class="h-biz">${esc(page.name)}</div>
      ${page.phone ? `<div class="h-sub">📞 ${esc(page.phone)}</div>` : ''}
    </div>
    <div class="header-actions">
      <a class="h-msg-btn" href="${esc(page.messengerUrl)}" target="_blank" rel="noopener">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span class="h-msg-txt">Message করুন</span>
      </a>
      <button class="dk-btn" id="dkBtn" onclick="(function(){var d=document.documentElement.dataset.dark==='1';document.documentElement.dataset.dark=d?'0':'1';localStorage.setItem('cat_dark',d?'0':'1');document.getElementById('dkBtn').textContent=d?'🌙':'☀️'})()">🌙</button>
    </div>
  </div>
<script>document.addEventListener('DOMContentLoaded',function(){var b=document.getElementById('dkBtn');if(b)b.textContent=document.documentElement.dataset.dark==='1'?'☀️':'🌙'});</script>
  <div class="hero-wrap">
    <div class="hero-card">
      <div class="hero-search">
        <div class="search-strip">
          <div class="search-inner">
            <form method="GET" action="/catalog/${esc(page.id)}">
              <div class="s-wrap">
                <span class="s-icon">🔍</span>
                <input class="s-input" type="search" name="q"
                  placeholder="Product খুঁজুন — code বা নাম লিখুন..."
                  value="${esc(search)}" autocomplete="off"/>
              </div>
            </form>
          </div>
        </div>
      </div>
      <div class="hero-grid">
        <div class="hero-copy">
          <div class="hero-kicker">Online Storefront</div>
          <div class="hero-title">${search ? `"${esc(search)}" এর result` : `${esc(page.name)} collection`}</div>
        <div class="hero-text">
          ${search ? 'Search result থেকে product বেছে নিয়ে সরাসরি order করুন।' : 'Product browse করুন, detail দেখুন, তারপর message দিয়ে order করুন।'}
        </div>
        <div class="hero-points">
          <div class="hero-pill">⚡ Fast Response</div>
          <div class="hero-pill">🛒 Direct Order</div>
          <div class="hero-pill">🎬 Photo / Video Ready</div>
        </div>
        <div class="hero-tips">
          <div class="hero-tip"><span class="hero-tip-badge">1</span><span>একবারে ১টা product-এর photo দিন</span></div>
          <div class="hero-tip"><span class="hero-tip-badge">2</span><span>পুরো product যেন clear দেখা যায়</span></div>
          <div class="hero-tip"><span class="hero-tip-badge">3</span><span>blur / collage না দিয়ে front photo দিন</span></div>
          <div class="hero-tip"><span class="hero-tip-badge">4</span><span>চাইলে color/type লিখুন, যেমন: black panjabi</span></div>
        </div>
        <div class="hero-guide">
          <div class="hero-guide-frame">
            <div class="hero-guide-dot"></div>
            <div class="hero-guide-box"></div>
            <div class="hero-guide-badge top">Front</div>
            <div class="hero-guide-badge bottom">1 item only</div>
          </div>
          <div class="hero-guide-copy">
            <strong>Best match frame</strong>
            Pause video, keep the full product inside the box, and send one front shot plus one close-up if the print matters.
          </div>
        </div>
      </div>
        <div class="hero-panel">
          <div class="hero-panel-label">Store Snapshot</div>
          <div class="hero-panel-title">${esc(page.name)}</div>
          <div class="hero-panel-text">
            ${page.address ? `${esc(page.address)}<br/>` : ''}${page.phone ? `Contact: ${esc(page.phone)}` : 'Messenger এ message দিয়ে সরাসরি order করতে পারবেন।'}
          </div>
          <div class="hero-stats">
            <div class="hero-stat">
              <div class="hero-stat-num">${products.length}</div>
              <div class="hero-stat-lbl">Products</div>
            </div>
            <div class="hero-stat">
              <div class="hero-stat-num">${products.filter((p:any) => p.stockQty > 0).length}</div>
              <div class="hero-stat-lbl">In Stock</div>
            </div>
            <div class="hero-stat">
              <div class="hero-stat-num">${products.filter((p:any) => !!p.videoUrl || !!p.imageUrl).length}</div>
              <div class="hero-stat-lbl">Media Ready</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</header>

<div class="stats">
  <div class="stats-count">
    ${
      search
        ? `"${esc(search)}" — <span>${products.length} টি result</span>`
        : `মোট <span>${products.length}</span> টি product`
    }
  </div>
  <div class="stats-badges">
    <div class="stats-badge">💬 Messenger এ Order</div>
    <div class="stats-badge">🛍️ ছবি ও ভিডিও সহ Product</div>
    <div class="stats-badge">🚚 দ্রুত Response</div>
  </div>
</div>

<div class="filters">
  <div class="filters-inner" id="filterBar">
    <button type="button" class="filter-btn active" data-sort="all">All</button>
    <button type="button" class="filter-btn" data-sort="custom">Custom</button>
    <button type="button" class="filter-btn" data-sort="new">New</button>
    <button type="button" class="filter-btn" data-sort="price-asc">Pricing Up</button>
    <button type="button" class="filter-btn" data-sort="price-desc">Pricing Down</button>
  </div>
</div>

<div class="grid-wrap">
  <div class="section-head">
    <div>
      <div class="section-kicker">Featured Products</div>
      <div class="section-title">${search ? 'Search Result' : 'Shop The Collection'}</div>
      <div class="section-text">${search ? 'আপনার search অনুযায়ী filtered product দেখানো হচ্ছে।' : 'স্টোরের available product গুলো browse করুন, detail page খুলে order complete করুন।'}</div>
    </div>
  </div>
  <div class="grid">
    ${cards || emptyState}
  </div>
</div>

<footer class="site-footer">
  <div class="footer-inner">
    <div class="f-name">${esc(page.name)}</div>
    <div class="f-sub">
      ${page.footerText ? `${esc(page.footerText)} · ` : ''}
      <a href="${esc(page.messengerUrl)}" target="_blank">💬 Messenger এ Order করুন</a>
    </div>
    ${page.phone ? `<div class="footer-help">Helpline: ${esc(page.phone)}</div>` : ''}
    ${
      page.whatsappUrl || page.facebookPageUrl
        ? `<div class="footer-links">
      ${page.whatsappUrl ? `<a href="${esc(page.whatsappUrl)}" target="_blank" rel="noopener">WhatsApp Support</a>` : ''}
      ${page.facebookPageUrl ? `<a href="${esc(page.facebookPageUrl)}" target="_blank" rel="noopener">Facebook Page</a>` : ''}
    </div>`
        : ''
    }
  </div>
</footer>

${poweredByBadge()}
<script>
(function(){
  var grid = document.querySelector('.grid');
  var buttons = Array.from(document.querySelectorAll('.filter-btn'));
  if(!grid || !buttons.length) return;
  var originalCards = Array.from(grid.querySelectorAll('.card'));
  function sortCards(mode){
    var cards = originalCards.slice();
    if(mode === 'price-asc'){
      cards.sort(function(a,b){ return Number(a.dataset.price||0) - Number(b.dataset.price||0); });
    } else if(mode === 'price-desc'){
      cards.sort(function(a,b){ return Number(b.dataset.price||0) - Number(a.dataset.price||0); });
    } else if(mode === 'new'){
      cards.sort(function(a,b){ return Number(b.dataset.productId||0) - Number(a.dataset.productId||0); });
    } else {
      cards.sort(function(a,b){ return Number(a.dataset.customIndex||0) - Number(b.dataset.customIndex||0); });
    }
    cards.forEach(function(card){ grid.appendChild(card); });
  }
  buttons.forEach(function(btn){
    btn.addEventListener('click', function(){
      buttons.forEach(function(item){ item.classList.remove('active'); });
      btn.classList.add('active');
      sortCards(btn.dataset.sort || 'all');
    });
  });
})();
</script>
</body>
</html>`;
  }
}
