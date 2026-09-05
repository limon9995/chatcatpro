import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { extname, join } from 'path';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { OtpService } from '../auth/otp.service';
import { ResellerLookupService } from './reseller-lookup.service';
import { AllowedOriginsService } from '../common/allowed-origins.service';
import {
  PricingFields,
  pickPricingFields,
  resolveWholesaleRate,
} from '../common/pricing-fields';

const execFileAsync = promisify(execFile);
// Same shape client-dashboard.service.ts uses for a Page's customDomain.
const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

// Subdomains/slugs that must never resolve to a reseller — protects the
// platform's own conventional hostnames (app.chatcat.pro, api.chatcat.pro,
// etc.) from being claimed by a self-serve signup.
const RESERVED_SLUGS = new Set([
  'app',
  'api',
  'www',
  'admin',
  'dashboard',
  'mail',
  'shop',
  'store',
  'catalog',
  'cdn',
  'static',
  'assets',
  'support',
  'help',
  'blog',
  'chatcat',
  'staging',
  'dev',
  'test',
]);

export interface BrandingManifest {
  found: boolean;
  resellerId?: string;
  slug?: string;
  companyName?: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  tagline?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
}

@Injectable()
export class ResellerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly otp: OtpService,
    private readonly lookup: ResellerLookupService,
    // AllowedOriginsService lives in the @Global() CommonModule — no explicit
    // module import needed for it to be injectable here.
    private readonly allowedOrigins: AllowedOriginsService,
  ) {}

  // ── Public: domain -> branding manifest ───────────────────────────────────
  async resolveByDomain(host: string): Promise<BrandingManifest> {
    const reseller = await this.lookup.resolveByHost(host);
    if (!reseller) return { found: false };
    return {
      found: true,
      resellerId: reseller.id,
      slug: reseller.slug,
      companyName: reseller.companyName,
      logoUrl: reseller.logoUrl,
      faviconUrl: reseller.faviconUrl,
      primaryColor: reseller.primaryColor,
      accentColor: reseller.accentColor,
      tagline: reseller.tagline,
      supportEmail: reseller.supportEmail,
      supportPhone: reseller.supportPhone,
    };
  }

  normalizeSlug(raw: string): string {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/^-+|-+$/g, '');
  }

  async slugAvailable(rawSlug: string): Promise<{ available: boolean; reason?: string }> {
    const slug = this.normalizeSlug(rawSlug);
    if (slug.length < 3) return { available: false, reason: 'Slug must be at least 3 characters' };
    if (RESERVED_SLUGS.has(slug)) return { available: false, reason: 'This name is reserved' };
    const existing = await this.prisma.reseller.findUnique({ where: { slug } });
    return { available: !existing };
  }

  // ── Self-serve signup ──────────────────────────────────────────────────────
  async sendSignupOtp(email: string): Promise<{ message: string }> {
    const norm = String(email || '').trim().toLowerCase();
    if (!norm.includes('@')) throw new BadRequestException('Valid email দিন');
    const existingUser = await this.prisma.user.findFirst({ where: { email: norm } });
    if (existingUser) throw new ConflictException('এই email দিয়ে ইতিমধ্যে account আছে');
    await this.otp.sendOtp(norm, 'reseller_signup');
    return { message: 'OTP পাঠানো হয়েছে' };
  }

  async verifySignupOtp(body: {
    email: string;
    code: string;
    companyName: string;
    slug: string;
    password: string;
  }) {
    const email = String(body.email || '').trim().toLowerCase();
    const companyName = String(body.companyName || '').trim();
    const slug = this.normalizeSlug(body.slug);

    if (!companyName) throw new BadRequestException('Company name দিন');
    const { available, reason } = await this.slugAvailable(slug);
    if (!available) throw new ConflictException(reason || 'এই slug টি ব্যবহার করা যাবে না');

    const valid = await this.otp.verifyOtp(email, body.code, 'reseller_signup');
    if (!valid) throw new ForbiddenException('OTP ভুল অথবা মেয়াদ শেষ');

    const user = await this.authService.register({
      email,
      username: email,
      password: body.password,
      name: companyName,
      role: 'reseller_owner',
      isActive: true,
    });

    try {
      await this.prisma.reseller.create({
        data: { slug, companyName, ownerId: user.id },
      });
    } catch (err) {
      // Compensate — don't leave an orphan reseller_owner User with no Reseller row.
      await this.prisma.user.delete({ where: { id: user.id } }).catch(() => {});
      throw err;
    }

    // Log the new reseller_owner straight in, same shape as a normal login.
    return this.authService.login({ username: email, password: body.password });
  }

  // ── Own reseller management (reseller_owner) ──────────────────────────────
  async me(reseller: { id: string }) {
    const row = await this.prisma.reseller.findUnique({ where: { id: reseller.id } });
    if (!row) throw new NotFoundException('Reseller not found');
    const clientCount = await this.prisma.user.count({ where: { resellerId: row.id } });
    return { ...row, clientCount };
  }

  async updateBranding(
    reseller: { id: string },
    body: {
      companyName?: string;
      logoUrl?: string;
      faviconUrl?: string;
      primaryColor?: string;
      accentColor?: string;
      tagline?: string;
      supportEmail?: string;
      supportPhone?: string;
      websiteUrl?: string;
    },
  ) {
    const data: any = {};
    if (body.companyName !== undefined) data.companyName = String(body.companyName).trim();
    if (body.logoUrl !== undefined) data.logoUrl = body.logoUrl || null;
    if (body.faviconUrl !== undefined) data.faviconUrl = body.faviconUrl || null;
    if (body.primaryColor !== undefined) data.primaryColor = body.primaryColor || null;
    if (body.accentColor !== undefined) data.accentColor = body.accentColor || null;
    if (body.tagline !== undefined) data.tagline = body.tagline || null;
    if (body.supportEmail !== undefined) data.supportEmail = body.supportEmail || null;
    if (body.supportPhone !== undefined) data.supportPhone = body.supportPhone || null;
    // Shown on their clients' public catalog "Powered by {companyName}" badge
    // (see CatalogController.resolveBadgeInfo) — falls back to their active
    // custom domain, then their {slug}.chatcat.pro subdomain, when blank.
    if (body.websiteUrl !== undefined) data.websiteUrl = body.websiteUrl || null;
    return this.prisma.reseller.update({ where: { id: reseller.id }, data });
  }

  async listClients(reseller: { id: string }) {
    const clients = await this.prisma.user.findMany({
      where: { resellerId: reseller.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        isActive: true,
        createdAt: true,
        pages: {
          select: { id: true, pageName: true, walletBalanceBdt: true, subscriptionStatus: true },
        },
      },
    });
    return clients;
  }

  // ── Retail pricing for a reseller's own client pages ──────────────────────
  private async ensureOwnedPage(reseller: { id: string }, pageId: number) {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
      include: { owner: { select: { resellerId: true } } },
    });
    if (!page || page.owner?.resellerId !== reseller.id) {
      throw new ForbiddenException('This page does not belong to your clients');
    }
    return page;
  }

  async getClientPagePricing(reseller: { id: string }, pageId: number) {
    const page = await this.ensureOwnedPage(reseller, pageId);
    return pickPricingFields(page);
  }

  async updateClientPagePricing(reseller: { id: string }, pageId: number, pricing: PricingFields) {
    await this.ensureOwnedPage(reseller, pageId);
    const data = pickPricingFields(pricing);
    await this.prisma.page.update({ where: { id: pageId }, data });
    return { success: true };
  }

  // ── Wholesale pricing + ledger (read-only for the reseller) ───────────────
  async getWholesalePricing(reseller: { id: string; wholesaleOverridesJson: unknown }) {
    return resolveWholesaleRate(reseller.wholesaleOverridesJson);
  }

  async getLedger(reseller: { id: string }, limit = 100) {
    const [entries, row] = await Promise.all([
      this.prisma.resellerLedgerEntry.findMany({
        where: { resellerId: reseller.id },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(limit, 1), 500),
      }),
      this.prisma.reseller.findUnique({
        where: { id: reseller.id },
        select: { walletOwedBdt: true },
      }),
    ]);
    return { entries, walletOwedBdt: row?.walletOwedBdt ?? 0 };
  }

  // ── Platform-admin management (AuthGuard + RolesGuard, role==='admin') ────
  async adminListResellers() {
    const rows = await this.prisma.reseller.findMany({ orderBy: { createdAt: 'desc' } });
    const counts = await this.prisma.user.groupBy({
      by: ['resellerId'],
      _count: { _all: true },
      where: { resellerId: { not: null } },
    });
    const countByReseller = new Map(counts.map((c) => [c.resellerId, c._count._all]));
    return rows.map((r) => ({ ...r, clientCount: countByReseller.get(r.id) ?? 0 }));
  }

  async adminUpdateReseller(
    id: string,
    body: { isActive?: boolean; wholesaleOverridesJson?: Record<string, number> | null; markupPercent?: number },
  ) {
    const data: any = {};
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
    if (body.wholesaleOverridesJson !== undefined)
      // Json? columns: plain JS `null` is ambiguous to Prisma and throws at
      // runtime — Prisma.DbNull is the explicit "clear this column" value.
      data.wholesaleOverridesJson =
        body.wholesaleOverridesJson === null ? Prisma.DbNull : body.wholesaleOverridesJson;
    if (body.markupPercent !== undefined) data.markupPercent = Number(body.markupPercent);
    const reseller = await this.prisma.reseller.update({ where: { id }, data }).catch(() => null);
    if (!reseller) throw new NotFoundException('Reseller not found');
    return reseller;
  }

  async adminSettleReseller(id: string, amountBdt: number, note?: string) {
    const amount = Number(amountBdt);
    if (!Number.isFinite(amount) || amount <= 0)
      throw new BadRequestException('amountBdt must be a positive number');

    const reseller = await this.prisma.reseller.findUnique({ where: { id } });
    if (!reseller) throw new NotFoundException('Reseller not found');

    await this.applySettlement(id, amount, note || 'Manual settlement recorded by admin');
    return { success: true };
  }

  private async applySettlement(resellerId: string, amount: number, description: string) {
    await this.prisma.$transaction([
      this.prisma.resellerLedgerEntry.create({
        data: { resellerId, type: 'SETTLEMENT_PAYMENT', amountBdt: -amount, description },
      }),
      this.prisma.reseller.update({
        where: { id: resellerId },
        data: { walletOwedBdt: { decrement: amount } },
      }),
    ]);
  }

  // ── Custom domain (Phase 2) — exact mirror of client-dashboard.service.ts's
  // Page.customDomain save + activate flow, at the reseller tier. ──────────
  async updateCustomDomain(reseller: { id: string }, rawDomain: string) {
    const raw = String(rawDomain || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');

    let data: any;
    if (!raw) {
      data = { customDomain: null, customDomainActive: false, customDomainCheckedAt: null };
    } else {
      if (!DOMAIN_RE.test(raw)) {
        throw new BadRequestException('Domain ফরম্যাট সঠিক না। যেমন: app.yourbrand.com');
      }
      // Cross-check against BOTH Page and Reseller custom domains — the two
      // share the same DNS/nginx namespace on the VPS.
      const [pageConflict, resellerConflict] = await Promise.all([
        this.prisma.page.findUnique({ where: { customDomain: raw }, select: { id: true } }),
        this.prisma.reseller.findUnique({ where: { customDomain: raw }, select: { id: true } }),
      ]);
      if (pageConflict || (resellerConflict && resellerConflict.id !== reseller.id)) {
        throw new ConflictException('এই domain অন্য কোনো account-এ যোগ করা আছে। অন্য domain দিন।');
      }
      data = { customDomain: raw, customDomainActive: false, customDomainCheckedAt: null };
    }

    return this.prisma.reseller.update({ where: { id: reseller.id }, data });
  }

  async activateCustomDomain(resellerId: string) {
    const reseller = await this.prisma.reseller.findUnique({ where: { id: resellerId } });
    const domain = reseller?.customDomain ? String(reseller.customDomain) : '';
    if (!domain) throw new BadRequestException('আগে একটা domain সেভ করুন।');
    if (!DOMAIN_RE.test(domain)) {
      throw new BadRequestException('Domain ফরম্যাট সঠিক না। যেমন: app.yourbrand.com');
    }

    let stdout = '';
    let stderr = '';
    try {
      // Deliberately a different script from the Page/catalog custom-domain
      // flow — this one serves the shared dashboard build for the domain
      // instead of proxying to /catalog/by-domain (which would be wrong for
      // a reseller's own dashboard/login domain).
      const result = await execFileAsync('/usr/local/bin/chatcat-add-reseller-domain.sh', [domain], {
        timeout: 90_000,
      });
      stdout = result.stdout || '';
      stderr = result.stderr || '';
    } catch (err: any) {
      stdout = err?.stdout || '';
      stderr = err?.stderr || err?.message || '';
    }
    const out = `${stdout}\n${stderr}`;
    await this.prisma.reseller.update({
      where: { id: resellerId },
      data: { customDomainCheckedAt: new Date() },
    });

    if (out.includes('STATUS=OK')) {
      await this.prisma.reseller.update({
        where: { id: resellerId },
        data: { customDomainActive: true },
      });
      await this.allowedOrigins.refresh();
      return {
        status: 'active',
        message: `${domain} সফলভাবে activate হয়েছে! এখন এই domain-এ আপনার ব্র্যান্ডেড dashboard দেখা যাবে। 🎉`,
      };
    }
    if (out.includes('STATUS=DNS_NOT_POINTING')) {
      return {
        status: 'dns_pending',
        message: `DNS এখনো ${domain} → 187.127.53.112 (আমাদের সার্ভার) point করছে না। আপনার DNS provider-এ একটা A record বসান: ${domain} → 187.127.53.112। DNS propagate হতে কিছুক্ষণ (৫ মিনিট থেকে কয়েক ঘন্টা) সময় লাগতে পারে — একটু পর আবার "Activate" চাপুন।`,
      };
    }
    if (out.includes('STATUS=INVALID_DOMAIN')) {
      return { status: 'error', message: 'Domain ফরম্যাট সঠিক না।' };
    }
    return {
      status: 'error',
      message: 'Activation-এ সমস্যা হয়েছে। একটু পর আবার চেষ্টা করুন, অথবা সাপোর্টে যোগাযোগ করুন।',
    };
  }

  // ── Logo upload (Phase 2) — mirrors vision-ops.service.ts's uploadProductAsset
  // resize/re-encode pattern; saves under storage/reseller-branding/{id}/. ──
  async uploadLogo(reseller: { id: string }, file: any) {
    if (!file?.buffer) throw new BadRequestException('Image file required');
    const mime = String(file.mimetype || '').toLowerCase();
    if (!mime.startsWith('image/')) throw new BadRequestException('Only image uploads are supported');

    let outBuffer = file.buffer;
    let safeExt = '.png';
    try {
      outBuffer = await sharp(file.buffer)
        .rotate()
        .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
        .png({ quality: 90 })
        .toBuffer();
    } catch {
      const ext = extname(String(file.originalname || '')).toLowerCase();
      safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.png';
    }

    const dir = join(process.cwd(), 'storage', 'reseller-branding', reseller.id);
    await fs.mkdir(dir, { recursive: true });
    const filename = `${Date.now()}-${randomUUID().slice(0, 8)}${safeExt}`;
    await fs.writeFile(join(dir, filename), outBuffer);

    const logoUrl = `/storage/reseller-branding/${reseller.id}/${filename}`;
    await this.prisma.reseller.update({ where: { id: reseller.id }, data: { logoUrl } });
    return { success: true, logoUrl };
  }

  // ── Self-serve settlement (Phase 3) ────────────────────────────────────────
  // A reseller submits a payment they made to the platform (same shape as
  // Page-level WalletRechargeRequest); a platform admin approves or rejects
  // it. Approval both records the ledger/balance change (applySettlement)
  // and marks the request resolved. Automatic SMS-gateway matching (like
  // WalletRechargeRequest's) is intentionally not wired in here — that
  // parses real bank SMS text and is a bigger, higher-stakes piece of
  // payment-verification infra to extend safely; manual admin approval is a
  // correct, safe MVP that still lets the reseller self-serve the submission.
  async submitSettlement(
    reseller: { id: string },
    body: { amountBdt: number; method: string; transactionId: string; note?: string },
  ) {
    const amount = Number(body.amountBdt);
    if (!Number.isFinite(amount) || amount <= 0)
      throw new BadRequestException('amountBdt must be a positive number');
    const method = String(body.method || '').trim();
    const transactionId = String(body.transactionId || '').trim();
    if (!method) throw new BadRequestException('Payment method দিন');
    if (!transactionId) throw new BadRequestException('Transaction ID দিন');

    return this.prisma.resellerSettlementRequest.create({
      data: {
        resellerId: reseller.id,
        amountBdt: amount,
        method,
        transactionId,
        note: body.note || null,
      },
    });
  }

  async getSettlementRequests(reseller: { id: string }) {
    return this.prisma.resellerSettlementRequest.findMany({
      where: { resellerId: reseller.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async adminListSettlementRequests(status?: string) {
    return this.prisma.resellerSettlementRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { reseller: { select: { companyName: true, slug: true } } },
    });
  }

  async adminApproveSettlement(id: number, approvedBy: string) {
    const req = await this.prisma.resellerSettlementRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Settlement request not found');
    if (req.status !== 'pending') throw new ConflictException('This request is already resolved');

    await this.applySettlement(req.resellerId, req.amountBdt, `Settlement — Trx: ${req.transactionId}`);
    return this.prisma.resellerSettlementRequest.update({
      where: { id },
      data: { status: 'approved', approvedAt: new Date(), approvedBy },
    });
  }

  async adminRejectSettlement(id: number, reason?: string) {
    const req = await this.prisma.resellerSettlementRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Settlement request not found');
    if (req.status !== 'pending') throw new ConflictException('This request is already resolved');

    return this.prisma.resellerSettlementRequest.update({
      where: { id },
      data: { status: 'rejected', rejectedReason: reason || null },
    });
  }
}
