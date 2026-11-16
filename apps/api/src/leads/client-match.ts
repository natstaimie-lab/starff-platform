/**
 * Duplicate check for "Convert to client": does this lead already exist as a
 * client? Plain functions (no Prisma import) so `node --test` can load them.
 */

/** Endings and filler that don't make two companies different. */
const NOISE = new Set([
  'ltd', 'limited', 'plc', 'llp', 'llc', 'inc', 'co', 'company', 'corp', 'corporation',
  'group', 'holdings', 'uk', 'the', 'and',
]);

/**
 * Company name reduced to the words that identify it: lower case, accents and
 * punctuation removed, "&" read as "and", and legal endings / filler dropped.
 * "The Riverside Warehouse Co. Ltd" and "riverside warehouse" both become
 * "riverside warehouse".
 */
export function normaliseCompany(name: string | null | undefined): string {
  if (!name) return '';
  const words = name
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w));
  return words.join(' ');
}

/** Two company names count as the same business. Very short names (under 3 letters) never match. */
export function sameCompany(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normaliseCompany(a);
  const y = normaliseCompany(b);
  return x.length >= 3 && x === y;
}

export const normaliseEmail = (e: string | null | undefined) => (e ?? '').trim().toLowerCase();

export type MatchReason = 'email' | 'company';

export type ClientCandidate = {
  id: string;
  name: string;
  billingEmail: string | null;
  contactEmails: string[];
};

/**
 * Which existing clients look like this lead, and why. A client matches when
 * the login email is already one of its contacts (or its billing email), or
 * its company name is the same once tidied up.
 */
export function findClientMatches(
  lead: { companyName: string; email: string | null | undefined },
  clients: ClientCandidate[],
): { clientId: string; reasons: MatchReason[] }[] {
  const email = normaliseEmail(lead.email);
  const out: { clientId: string; reasons: MatchReason[] }[] = [];
  for (const c of clients) {
    const reasons: MatchReason[] = [];
    if (email && (normaliseEmail(c.billingEmail) === email || c.contactEmails.some((e) => normaliseEmail(e) === email))) reasons.push('email');
    if (sameCompany(lead.companyName, c.name)) reasons.push('company');
    if (reasons.length) out.push({ clientId: c.id, reasons });
  }
  // Email matches first: they're the stronger signal.
  return out.sort((a, b) => Number(b.reasons.includes('email')) - Number(a.reasons.includes('email')) || b.reasons.length - a.reasons.length);
}
