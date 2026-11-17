/**
 * CRM Phase 4d helpers for Apollo prospecting. Plain functions (no Prisma or
 * Nest imports, no local imports) so `node --test` can load them. Company
 * names are tidied with client-match's normaliseCompany, passed in by the caller.
 */

/** Job titles that show a company is hiring the temps Starff supplies. */
export const WAREHOUSE_JOB_TITLES = [
  'warehouse operative', 'warehouse assistant', 'warehouse worker', 'picker packer',
  'order picker', 'forklift driver', 'reach truck driver', 'warehouse associate',
  'goods in operative', 'logistics operative',
];

/** Who we want to talk to, best first. */
export const CONTACT_TITLES = [
  'operations manager', 'site manager', 'warehouse manager', 'general manager',
  'logistics manager', 'distribution manager', 'fulfilment manager', 'head of operations',
];

/** ISO week for the London day containing `d`, e.g. "2026-W47". Mondays start a week. */
export function isoWeekKey(d = new Date()): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d); // yyyy-mm-dd
  const [y, m, dd] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow); // Thursday of this week decides the year
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 864e5 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** "https://www.Acme.co.uk/jobs" → "acme.co.uk". */
export function normaliseDomain(v: string | null | undefined): string {
  if (!v) return '';
  return v.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
}

/** Rank a person's title against CONTACT_TITLES (lower is better; 99 = not a fit). */
export function titleRank(title: string | null | undefined): number {
  const t = (title ?? '').toLowerCase();
  if (!t) return 99;
  if (/\b(assistant|trainee|intern|apprentice)\b/.test(t)) return 50;
  const i = CONTACT_TITLES.findIndex((c) => t.includes(c));
  if (i >= 0) return i;
  if (/\b(operations|ops|site|warehouse|logistics)\b/.test(t) && /\b(manager|director|head|lead)\b/.test(t)) return CONTACT_TITLES.length;
  return 60;
}

/** The best contact from an Apollo people search: right title first, then those Apollo has an email for. */
export function pickContact<T extends { title?: string | null; has_email?: boolean | null }>(people: T[]): T | null {
  const fits = people.filter((p) => titleRank(p.title) < 50);
  fits.sort((a, b) => titleRank(a.title) - titleRank(b.title) || Number(!!b.has_email) - Number(!!a.has_email));
  return fits[0] ?? null;
}

export type Known = { domains: Set<string>; names: Set<string> };

/** Already a lead, client or suggestion (by website domain or tidied company name)? */
export function alreadyKnown(
  org: { name?: string | null; primary_domain?: string | null; website_url?: string | null },
  known: Known,
  normaliseName: (n: string | null | undefined) => string,
): boolean {
  const d = normaliseDomain(org.primary_domain || org.website_url);
  if (d && known.domains.has(d)) return true;
  const n = normaliseName(org.name);
  return n.length >= 3 && known.names.has(n);
}

/** Room left this week under the cap. */
export const roomLeft = (cap: number, usedThisWeek: number) => Math.max(0, cap - usedThisWeek);
