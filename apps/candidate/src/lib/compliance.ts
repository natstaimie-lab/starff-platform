// Single source of truth for how the candidate portal shows compliance.
//
// The authoritative signal is the candidate's `status` (set by the Starff admin):
// COMPLIANT / ACTIVE means Starff has cleared this worker to work, whether or not
// individual document rows happen to exist in the portal. The document checklist
// is the granular evidence used *before* clearance. So:
//   • cleared (COMPLIANT/ACTIVE) → show the required checks as met (a genuinely
//     EXPIRED document is still surfaced so the worker knows to renew).
//   • not cleared → fall back to per-document progress so the worker can see
//     what they still need to upload.

export type DocLike = { type: string; status: string };
export type CheckStatus = 'compliant' | 'pending' | 'expired' | 'missing';

export const REQUIRED = [
  { type: 'RIGHT_TO_WORK', label: 'Right to Work', desc: 'Passport, visa or share code' },
  { type: 'ID', label: 'Proof of ID', desc: 'Photo ID' },
  { type: 'DBS_CHECK', label: 'DBS Certificate', desc: 'Background check' },
  { type: 'CV', label: 'CV / Work History', desc: 'Your experience' },
];

const perDoc = (doc?: DocLike): CheckStatus =>
  !doc ? 'missing'
    : doc.status === 'VERIFIED' ? 'compliant'
    : doc.status === 'EXPIRED' ? 'expired'
    : doc.status === 'REJECTED' ? 'missing'
    : 'pending';

export function complianceChecks(status: string | undefined, documents: DocLike[]) {
  const cleared = status === 'COMPLIANT' || status === 'ACTIVE';
  const checks = REQUIRED.map((r) => {
    const doc = documents.find((d) => d.type === r.type);
    const s: CheckStatus = cleared
      ? (doc && doc.status === 'EXPIRED' ? 'expired' : 'compliant')
      : perDoc(doc);
    return { ...r, status: s };
  });
  const done = checks.filter((c) => c.status === 'compliant').length;
  const total = checks.length;
  const pct = Math.round((done / total) * 100);
  return { checks, done, total, pct, cleared };
}
