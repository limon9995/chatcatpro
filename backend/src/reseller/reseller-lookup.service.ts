import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Standalone (PrismaService-only) host -> Reseller resolver. Kept out of
// ResellerModule/ResellerService on purpose: AuthModule needs this exact
// lookup during public signup (to stamp the correct User.resellerId) without
// pulling in the rest of the reseller module (which itself depends on
// AuthModule for account creation) — a dependency-free module here avoids
// that circular import entirely.
@Injectable()
export class ResellerLookupService {
  constructor(private readonly prisma: PrismaService) {}

  /** Mirrors catalog.controller.ts's by-domain host normalization exactly. */
  normalizeHost(raw: string): string {
    return String(raw || '')
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .split('/')[0];
  }

  /**
   * Resolves a browser hostname to its Reseller, checking (1) an active
   * custom domain, then (2) the {slug}.PLATFORM_ROOT_DOMAIN wildcard pattern.
   * Returns null when the host isn't a reseller's (the default platform
   * domain, or any unrecognized host) — callers must treat that as "no
   * reseller", not an error.
   */
  async resolveByHost(rawHost: string) {
    const host = this.normalizeHost(rawHost);
    if (!host) return null;

    const byCustomDomain = await this.prisma.reseller.findFirst({
      where: { customDomain: host, customDomainActive: true, isActive: true },
    });
    if (byCustomDomain) return byCustomDomain;

    const rootDomain = String(process.env.PLATFORM_ROOT_DOMAIN || '')
      .trim()
      .toLowerCase();
    if (rootDomain && host.endsWith(`.${rootDomain}`)) {
      const slug = host.slice(0, host.length - rootDomain.length - 1);
      if (slug && !slug.includes('.')) {
        const bySlug = await this.prisma.reseller.findFirst({
          where: { slug, isActive: true },
        });
        if (bySlug) return bySlug;
      }
    }

    return null;
  }
}
