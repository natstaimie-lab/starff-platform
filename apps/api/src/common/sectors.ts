/**
 * The canonical list of work sectors a worker can say they're looking for at
 * sign-up. Kept in one place so the website form, the API validation, the admin
 * filters and matching all speak the same language. Aligns with the Skill
 * catalogue categories (see scripts/seed-skills.mjs).
 */
export const SECTORS = [
  'Warehouse & Logistics',
  'Driving & Delivery',
  'Construction & Trades',
  'Industrial & Manufacturing',
  'Security',
  'Cleaning',
  'Hospitality & Catering',
  'Care & Healthcare',
  'Events',
  'Office & Admin',
] as const;

export type Sector = (typeof SECTORS)[number];

/** Keep only recognised sectors, de-duplicated — defends the DB from junk input. */
export function cleanSectors(input?: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const allow = new Set<string>(SECTORS);
  const out: string[] = [];
  for (const v of input) {
    if (typeof v === 'string' && allow.has(v) && !out.includes(v)) out.push(v);
  }
  return out;
}
