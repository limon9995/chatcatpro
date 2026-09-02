import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { API_BASE } from './useApi';

export interface Branding {
  found: boolean;
  companyName: string;
  logoUrl: string;
  faviconUrl?: string;
  primaryColor: string;
  accentColor?: string;
  tagline?: string;
  supportEmail?: string;
  supportPhone?: string;
  resellerId?: string;
  slug?: string;
}

// Today's hardcoded Chatcat look — used immediately on mount and whenever the
// /reseller/by-domain lookup fails or finds nothing, so the default platform
// domain (and any transient network hiccup) never regresses visually.
const DEFAULT_BRANDING: Branding = {
  found: false,
  companyName: 'Chatcat',
  logoUrl: '/logo.png',
  primaryColor: '#6366f1',
};

const BrandingContext = createContext<Branding>(DEFAULT_BRANDING);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const host = window.location.hostname;
        const res = await fetch(`${API_BASE}/reseller/by-domain?host=${encodeURIComponent(host)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.found) return;
        setBranding({
          found: true,
          companyName: data.companyName || DEFAULT_BRANDING.companyName,
          logoUrl: data.logoUrl || DEFAULT_BRANDING.logoUrl,
          faviconUrl: data.faviconUrl || undefined,
          primaryColor: data.primaryColor || DEFAULT_BRANDING.primaryColor,
          accentColor: data.accentColor || undefined,
          tagline: data.tagline || undefined,
          supportEmail: data.supportEmail || undefined,
          supportPhone: data.supportPhone || undefined,
          resellerId: data.resellerId,
          slug: data.slug,
        });
      } catch {
        // Fail open — keep default Chatcat branding.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Vite serves one static index.html to every hostname — the only way to
  // vary the tab title/favicon per reseller domain is to set them here.
  useEffect(() => {
    document.title = branding.companyName;
    if (branding.faviconUrl) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = branding.faviconUrl;
    }
  }, [branding.companyName, branding.faviconUrl]);

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

export function useBranding(): Branding {
  return useContext(BrandingContext);
}
