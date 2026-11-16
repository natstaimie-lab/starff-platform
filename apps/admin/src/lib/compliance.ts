// Shared rules for how the admin splits people across Candidates / Workers /
// Compliance. Keep the document rules in sync with complianceAttention in
// apps/api/src/stats/stats.service.ts (drives the sidebar badge).

/** Not approved yet — lives on the Candidates page. */
export const PIPELINE_STATUSES = ['NEW', 'SCREENING', 'REJECTED'];
/** Approved — lives on the Workers page. */
export const WORKER_STATUSES = ['COMPLIANT', 'ACTIVE', 'INACTIVE'];
/** Approved and bookable — checked on the Compliance page. */
export const BOOKABLE_STATUSES = ['COMPLIANT', 'ACTIVE'];

/** Same required checklist as the candidate profile page. */
export const REQUIRED_DOCS = [
  { type: 'SELFIE', label: 'Identity photo' },
  { type: 'RIGHT_TO_WORK', label: 'Right to Work' },
  { type: 'ID', label: 'Proof of ID' },
  { type: 'CV', label: 'CV' },
];

export const DOC_LABEL: Record<string, string> = {
  SELFIE: 'Identity photo', RIGHT_TO_WORK: 'Right to Work', ID: 'Proof of ID', DBS_CHECK: 'DBS Check', CV: 'CV',
  CERTIFICATE: 'Certificate', QUALIFICATION: 'Qualification', LICENCE: 'Licence', REFERENCE: 'Reference', CONTRACT: 'Contract', OTHER: 'Other',
};

export const EXPIRY_WARN_DAYS = 30;

export type ComplianceDoc = { type: string; status: string; expiryDate?: string | null; createdAt?: string };
export type IssueKind = 'expired' | 'expiring' | 'missing' | 'pending';
export type Issue = { kind: IssueKind; docType: string; label: string; detail: string; days?: number };

const fmt = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Document problems for one worker. Only the newest upload of each type counts,
 * so a replaced (old) document doesn't keep raising flags.
 */
export function complianceIssues(docs: ComplianceDoc[] = [], now = Date.now()): Issue[] {
  const latest = new Map<string, ComplianceDoc>();
  for (const d of docs) {
    const cur = latest.get(d.type);
    if (!cur || (d.createdAt ?? '') > (cur.createdAt ?? '')) latest.set(d.type, d);
  }
  const issues: Issue[] = [];
  for (const r of REQUIRED_DOCS) {
    const d = latest.get(r.type);
    if (!d || d.status === 'REJECTED') issues.push({ kind: 'missing', docType: r.type, label: r.label, detail: d ? 'Rejected — needs a new upload' : 'Not uploaded' });
  }
  for (const d of Array.from(latest.values())) {
    const label = DOC_LABEL[d.type] ?? d.type;
    if (d.status === 'REJECTED') continue;
    const days = d.expiryDate ? Math.ceil((new Date(d.expiryDate).getTime() - now) / 86400000) : undefined;
    if (d.status === 'EXPIRED' || (days !== undefined && days < 0)) {
      issues.push({ kind: 'expired', docType: d.type, label, detail: d.expiryDate ? `Expired ${fmt(d.expiryDate)}` : 'Marked expired', days });
    } else if (days !== undefined && days <= EXPIRY_WARN_DAYS) {
      issues.push({ kind: 'expiring', docType: d.type, label, detail: `Expires ${fmt(d.expiryDate!)} (${days}d)`, days });
    } else if (d.status === 'PENDING') {
      issues.push({ kind: 'pending', docType: d.type, label, detail: 'Uploaded — awaiting verification' });
    }
  }
  return issues;
}
