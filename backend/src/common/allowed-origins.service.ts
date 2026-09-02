import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Caches every active custom hostname (merchant Page.customDomain +
// Reseller.customDomain) so main.ts's CORS callback can allow them — an
// arbitrary customer-owned domain can never be listed in the static
// CORS_ORIGINS env var, so this is the only way those requests get CORS
// headers in production. Refreshed periodically and after any domain
// activation succeeds; a stale cache only means a brand-new custom domain
// needs a few minutes (or a manual refresh() call) before it starts working
// — it never revokes access to a domain that WAS active a moment ago except
// through the same periodic refresh, which is an acceptable trade-off for
// avoiding a DB round trip on every single request.
@Injectable()
export class AllowedOriginsService implements OnModuleInit {
  private readonly logger = new Logger(AllowedOriginsService.name);
  private hosts = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refresh();
    setInterval(() => this.refresh().catch(() => {}), 5 * 60 * 1000);
  }

  async refresh(): Promise<void> {
    try {
      const [pages, resellers] = await Promise.all([
        this.prisma.page.findMany({
          where: { customDomain: { not: null }, customDomainActive: true },
          select: { customDomain: true },
        }),
        this.prisma.reseller.findMany({
          where: { customDomain: { not: null }, customDomainActive: true },
          select: { customDomain: true },
        }),
      ]);
      const next = new Set<string>();
      for (const p of pages) if (p.customDomain) next.add(p.customDomain.toLowerCase());
      for (const r of resellers) if (r.customDomain) next.add(r.customDomain.toLowerCase());
      this.hosts = next;
    } catch (err) {
      this.logger.error(`Failed to refresh allowed-origins cache: ${err}`);
    }
  }

  isAllowed(hostname: string): boolean {
    const host = String(hostname || '').toLowerCase();
    if (!host) return false;
    if (this.hosts.has(host)) return true;
    const rootDomain = String(process.env.PLATFORM_ROOT_DOMAIN || '').trim().toLowerCase();
    if (rootDomain && host.endsWith(`.${rootDomain}`)) return true;
    return false;
  }
}
