// Client-side preview of the restaurant delivery fee math.
// Mirrors backend/src/common/restaurant-delivery.ts — same `<=` slab boundary
// and 2-decimal rounding so the preview never disagrees with the server,
// which recomputes and is authoritative.

export interface DeliverySlab {
  maxKm: number;
  fee: number;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function previewDeliveryFee(
  slabs: DeliverySlab[],
  restaurantLat: number,
  restaurantLng: number,
  lat: number,
  lng: number,
): { distanceKm: number; fee: number | null } {
  const distanceKm = Math.round(haversineKm(restaurantLat, restaurantLng, lat, lng) * 100) / 100;
  const sorted = [...slabs].sort((a, b) => a.maxKm - b.maxKm);
  for (const slab of sorted) {
    if (distanceKm <= slab.maxKm) return { distanceKm, fee: slab.fee };
  }
  return { distanceKm, fee: null };
}
