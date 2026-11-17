/**
 * How far a worker's phone was from the shift's site when they checked in/out.
 *
 * Sites only store an address, so the site postcode is looked up on
 * postcodes.io (free, UK-only, no key) to get its centre point. Everything is
 * best-effort: if the postcode is missing or the lookup fails, the distance is
 * null and the check-in still goes through. Staff judge the result; nothing
 * here blocks a worker.
 */

/** Further than this from the site postcode is flagged to staff. */
export const SITE_RADIUS_M = 500;

const cache = new Map<string, { lat: number; lng: number } | null>();

export async function postcodeCentre(postcode?: string | null): Promise<{ lat: number; lng: number } | null> {
  const pc = (postcode ?? '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{5,8}$/.test(pc)) return null;
  if (cache.has(pc)) return cache.get(pc)!;
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`, {
      signal: AbortSignal.timeout(3000),
    });
    const body: any = res.ok ? await res.json() : null;
    const r = body?.result;
    const point = r && typeof r.latitude === 'number' && typeof r.longitude === 'number'
      ? { lat: r.latitude, lng: r.longitude }
      : null;
    if (res.ok || res.status === 404) cache.set(pc, point);
    return point;
  } catch {
    return null;
  }
}

/** Great-circle distance in metres. */
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
