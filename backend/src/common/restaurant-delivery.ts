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
    .filter((v) => v.label.length > 0 && Number.isFinite(v.price) && v.price >= 0)
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
    (s) => `${toBnNumber(s.maxKm)} কিমি পর্যন্ত ${currencySymbol}${toBnNumber(s.fee)}`,
  );
  return `${parts.join(', ')} — এর বাইরে delivery হয় না`;
}
