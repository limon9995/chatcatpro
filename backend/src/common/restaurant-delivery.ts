/**
 * Restaurant mode — distance-slab delivery fee helpers.
 *
 * A restaurant page stores its own location (restaurantLat/Lng) and a JSON
 * list of fee slabs ordered by distance: [{maxKm: 1, fee: 30}, {maxKm: 1.5, fee: 50}].
 * The customer's exact map pin is measured against the restaurant pin
 * (haversine, straight line) and the first slab whose maxKm covers the
 * distance wins. Beyond the last slab the page does not deliver.
 *
 * Pure functions — imported directly (no DI), same style as pricing-estimator.
 * The server is always authoritative for fees: clients only ever send
 * coordinates, never a fee.
 */

export interface DeliverySlab {
  maxKm: number;
  fee: number;
}

export const MAX_DELIVERY_SLABS = 10;

/** Straight-line distance between two coordinates in kilometers. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // earth radius km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function isValidLat(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90;
}

export function isValidLng(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180;
}

/**
 * Parse deliverySlabsJson safely: drop invalid entries, sort ascending by
 * maxKm, cap the row count. Returns [] on any malformed input.
 */
export function parseSlabs(json: string | null | undefined): DeliverySlab[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s: any) => ({ maxKm: Number(s?.maxKm), fee: Number(s?.fee) }))
    .filter(
      (s) =>
        Number.isFinite(s.maxKm) &&
        Number.isFinite(s.fee) &&
        s.maxKm > 0 &&
        s.fee >= 0,
    )
    .sort((a, b) => a.maxKm - b.maxKm)
    .slice(0, MAX_DELIVERY_SLABS);
}

/**
 * First slab covering the distance (distanceKm <= maxKm), or null when the
 * pin is beyond the delivery area. The same `<=` boundary is used by the
 * client-side previews so they never disagree with the server verdict.
 */
export function resolveDeliveryFee(
  slabs: DeliverySlab[],
  distanceKm: number,
): DeliverySlab | null {
  for (const slab of slabs) {
    if (distanceKm <= slab.maxKm) return slab;
  }
  return null;
}

/**
 * True when the page is fully configured for restaurant delivery. A
 * half-configured page (flag on but no pin / no slabs) falls back to the
 * normal flow everywhere instead of breaking checkout.
 */
export function isRestaurantReady(page: {
  restaurantModeEnabled?: boolean | null;
  restaurantLat?: number | null;
  restaurantLng?: number | null;
  deliverySlabsJson?: string | null;
}): boolean {
  return Boolean(
    page?.restaurantModeEnabled &&
    isValidLat(page.restaurantLat ?? null) &&
    isValidLng(page.restaurantLng ?? null) &&
    parseSlabs(page.deliverySlabsJson).length > 0,
  );
}

// ── V25: Food size/portion price variants ────────────────────────────────────

export interface PriceVariant {
  label: string;
  price: number;
  /** Piece count for per-piece recipe scaling (e.g. "8 pcs" momo → 8) */
  pieces?: number;
}

export const MAX_PRICE_VARIANTS = 12;

/**
 * Parse Product.priceVariantsJson safely: [{label, price, pieces?}].
 * Drops invalid entries; [] on malformed input.
 */
export function parsePriceVariants(
  json: string | null | undefined,
): PriceVariant[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v: any) => {
      const pieces = Number(v?.pieces);
      return {
        label: String(v?.label ?? '').trim(),
        price: Number(v?.price),
        ...(Number.isFinite(pieces) && pieces > 0
          ? { pieces: Math.round(pieces) }
          : {}),
      };
    })
    .filter(
      (v) => v.label.length > 0 && Number.isFinite(v.price) && v.price >= 0,
    )
    .slice(0, MAX_PRICE_VARIANTS);
}

/** Compact price text: single price or "৳120 – ৳220" range. */
export function priceRangeText(
  variants: PriceVariant[],
  basePrice: number,
  currencySymbol = '৳',
): string {
  if (!variants.length)
    return `${currencySymbol}${Number(basePrice).toLocaleString()}`;
  const prices = variants.map((v) => v.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return `${currencySymbol}${min.toLocaleString()}`;
  return `${currencySymbol}${min.toLocaleString()} – ${currencySymbol}${max.toLocaleString()}`;
}

/** One-line variant summary for bot prompts: "5 pcs ৳120 / 10 pcs ৳220" */
export function variantsSummaryText(
  variants: PriceVariant[],
  currencySymbol = '৳',
): string {
  return variants
    .map((v) => `${v.label} ${currencySymbol}${v.price}`)
    .join(' / ');
}

// ── V25: Google Maps link / coordinate parsing ───────────────────────────────
// Customers paste a Google Maps link or raw coordinates (in Messenger chat or
// at checkout when the in-app browser blocks GPS) — extract the point so the
// delivery fee can be computed.

/** {lat, lng} from a Google Maps URL or raw "23.79, 90.41" text; null if none. */
export function parseMapsPoint(
  text: string,
): { lat: number; lng: number } | null {
  const s = String(text || '').trim();
  if (!s) return null;
  const tryPair = (a: string, b: string) => {
    const lat = Number(a);
    const lng = Number(b);
    return isValidLat(lat) && isValidLng(lng) && (lat !== 0 || lng !== 0)
      ? { lat, lng }
      : null;
  };
  // /maps/.../@23.79,90.41,17z
  const at = s.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (at) {
    const p = tryPair(at[1], at[2]);
    if (p) return p;
  }
  // ?q= / ?ll= / ?query= / ?destination= / !3dLAT!4dLNG
  const q = s.match(
    /(?:[?&](?:q|ll|query|destination)=|!3d)(-?\d{1,3}\.\d+)(?:%2C|,|!4d)(-?\d{1,3}\.\d+)/i,
  );
  if (q) {
    const p = tryPair(q[1], q[2]);
    if (p) return p;
  }
  // raw "23.79, 90.41" (or space-separated) — require decimals so plain
  // numbers in normal sentences never match
  const raw = s.match(/(-?\d{1,3}\.\d{3,})\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})/);
  if (raw) {
    const p = tryPair(raw[1], raw[2]);
    if (p) return p;
  }
  return null;
}

const MAPS_SHORT_HOSTS = ['maps.app.goo.gl', 'goo.gl', 'g.co'];

/** First Google-Maps-ish short link in the text, or null. */
export function findMapsShortLink(text: string): string | null {
  const m = String(text || '').match(/https?:\/\/[^\s]+/g);
  for (const url of m || []) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (MAPS_SHORT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)))
        return url;
    } catch {
      /* not a URL */
    }
  }
  return null;
}

/**
 * Follow a maps short link server-side (browsers can't — CORS) and parse the
 * destination URL for coordinates. Returns null on any failure.
 */
export async function resolveMapsShortLink(
  url: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!findMapsShortLink(url)) return null; // whitelist only
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      // Without a browser-like User-Agent, Google often serves an
      // interstitial/app-install page instead of redirecting to the map
      // point, so the link fails to resolve.
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,bn;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    });
    const point = parseMapsPoint(res.url || '');
    if (point) return point;
    // Some share pages embed the point in the HTML instead of the final URL
    // (as @lat,lng, ?q=, or !3dLAT!4dLNG) — reuse the full parser here too.
    const body = await res.text();
    return parseMapsPoint(body);
  } catch {
    return null;
  }
}

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

function toBnNumber(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/**
 * Bengali one-liner describing the slabs, e.g.
 * "১ কিমি পর্যন্ত ৳৩০, ১.৫ কিমি পর্যন্ত ৳৫০ — এর বাইরে delivery হয় না"
 */
export function formatSlabsBn(
  slabs: DeliverySlab[],
  currencySymbol = '৳',
): string {
  if (!slabs.length) return '';
  const parts = slabs.map(
    (s) =>
      `${toBnNumber(s.maxKm)} কিমি পর্যন্ত ${currencySymbol}${toBnNumber(s.fee)}`,
  );
  return `${parts.join(', ')} — এর বাইরে delivery হয় না`;
}

// ── V26: Business hours ──────────────────────────────────────────────────────
// One row per weekday (0=Sunday .. 6=Saturday, matching JS Date#getDay), all
// times in Asia/Dhaka local time (the only timezone this product serves).

export interface BusinessHoursRow {
  day: number; // 0-6
  open: string; // "HH:mm"
  close: string; // "HH:mm"
  closed: boolean;
}

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Validate + normalize raw rows into exactly 7 entries (missing days = closed). */
export function parseBusinessHours(raw: unknown): BusinessHoursRow[] {
  const byDay = new Map<number, BusinessHoursRow>();
  if (Array.isArray(raw)) {
    for (const r of raw) {
      const day = Number(r?.day);
      if (!Number.isInteger(day) || day < 0 || day > 6) continue;
      const closed = Boolean(r?.closed);
      const open = HHMM_RE.test(r?.open) ? r.open : '10:00';
      const close = HHMM_RE.test(r?.close) ? r.close : '22:00';
      byDay.set(day, { day, open, close, closed });
    }
  }
  return Array.from(
    { length: 7 },
    (_, day) =>
      byDay.get(day) || { day, open: '10:00', close: '22:00', closed: false },
  );
}

/** "HH:mm" → minutes since midnight. */
function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Whether the restaurant is open right now, in Asia/Dhaka local time. */
export function isOpenNow(
  hours: BusinessHoursRow[],
  now: Date = new Date(),
): boolean {
  if (!hours.length) return true; // no hours configured = always open (today's behavior)
  const dhaka = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }),
  );
  const row = hours.find((r) => r.day === dhaka.getDay());
  if (!row || row.closed) return false;
  const nowMin = dhaka.getHours() * 60 + dhaka.getMinutes();
  const openMin = hhmmToMinutes(row.open);
  const closeMin = hhmmToMinutes(row.close);
  // overnight window (e.g. open 18:00, close 02:00) wraps past midnight
  return openMin <= closeMin
    ? nowMin >= openMin && nowMin < closeMin
    : nowMin >= openMin || nowMin < closeMin;
}

// ── V29: Offer time-of-day schedule ─────────────────────────────────────────
// Deliberately NOT a reuse of parseBusinessHours/isOpenNow above: those
// default a day that's missing from the saved data to "open 10:00-22:00" —
// correct for "is my shop open" (assume open unless told otherwise), but
// backwards for a promotional offer window (assume INACTIVE unless a day is
// explicitly configured). Reusing the shop-hours default here would silently
// make an offer meant for "Friday only" apply on every other day too.

export interface OfferHoursDayRow {
  day: number; // 0-6, JS Date#getDay
  open: string; // "HH:mm"
  close: string; // "HH:mm"
}

function isWithinRange(openMin: number, closeMin: number, nowMin: number): boolean {
  return openMin <= closeMin
    ? nowMin >= openMin && nowMin < closeMin
    : nowMin >= openMin || nowMin < closeMin; // overnight wrap
}

/**
 * Whether an Offer's attached time-of-day schedule is active right now
 * (Asia/Dhaka). `hoursMode` null/undefined = no time restriction (always
 * active). "general" = one open/close range, every day. "daywise" = only the
 * listed days are active; a day not present in `rows` is INACTIVE.
 */
export function isOfferActiveNow(
  hoursMode: string | null | undefined,
  hoursJson: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!hoursMode) return true;
  let parsed: unknown;
  try {
    parsed = JSON.parse(hoursJson || 'null');
  } catch {
    return true; // malformed schedule — fail open rather than hide a live offer
  }
  const dhaka = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
  const nowMin = dhaka.getHours() * 60 + dhaka.getMinutes();

  if (hoursMode === 'general') {
    const open = HHMM_RE.test((parsed as any)?.open) ? (parsed as any).open : null;
    const close = HHMM_RE.test((parsed as any)?.close) ? (parsed as any).close : null;
    if (!open || !close) return true; // unconfigured — don't hide the offer
    return isWithinRange(hhmmToMinutes(open), hhmmToMinutes(close), nowMin);
  }

  if (hoursMode === 'daywise') {
    if (!Array.isArray(parsed)) return true; // unconfigured — don't hide the offer
    const row = (parsed as OfferHoursDayRow[]).find(
      (r) => Number(r?.day) === dhaka.getDay() && HHMM_RE.test(r?.open) && HHMM_RE.test(r?.close),
    );
    if (!row) return false; // this weekday was never configured — inactive
    return isWithinRange(hhmmToMinutes(row.open), hhmmToMinutes(row.close), nowMin);
  }

  return true;
}

/** Sanitize a client-submitted offer schedule; returns null when there's nothing valid to save. */
export function sanitizeOfferHours(
  hoursMode: unknown,
  hoursRaw: unknown,
): { hoursMode: string | null; hoursJson: string | null } {
  if (hoursMode === 'general') {
    const open = HHMM_RE.test((hoursRaw as any)?.open) ? (hoursRaw as any).open : '17:00';
    const close = HHMM_RE.test((hoursRaw as any)?.close) ? (hoursRaw as any).close : '22:00';
    return { hoursMode: 'general', hoursJson: JSON.stringify({ open, close }) };
  }
  if (hoursMode === 'daywise') {
    const rows: OfferHoursDayRow[] = Array.isArray(hoursRaw)
      ? hoursRaw
          .map((r: any) => ({ day: Number(r?.day), open: String(r?.open ?? ''), close: String(r?.close ?? '') }))
          .filter((r) => Number.isInteger(r.day) && r.day >= 0 && r.day <= 6 && HHMM_RE.test(r.open) && HHMM_RE.test(r.close))
      : [];
    return { hoursMode: 'daywise', hoursJson: JSON.stringify(rows) };
  }
  return { hoursMode: null, hoursJson: null };
}
