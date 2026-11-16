'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, Avatar, Badge, DataTable, type Column } from '@/components/ui';
import * as Ic from '@/components/icons';
import { BOOKABLE_STATUSES, EXPIRY_WARN_DAYS, complianceIssues, type ComplianceDoc, type Issue, type IssueKind } from '@/lib/compliance';

// Document-level checks on approved, bookable workers (COMPLIANT / ACTIVE).
// Candidates still registering are reviewed on the Candidates page instead.
type Cand = { id: string; firstName: string; lastName: string; status: string; headline?: string; documents?: ComplianceDoc[] };
type Row = Issue & { id: string; worker: Cand };

const CATS: { key: IssueKind; label: string; hint: string; tone: string; badge: 'error' | 'warning' | 'info' }[] = [
  { key: 'expired', label: 'Expired', hint: 'Do not book until renewed', tone: 'var(--error-500)', badge: 'error' },
  { key: 'expiring', label: `Expiring ≤ ${EXPIRY_WARN_DAYS} days`, hint: 'Ask for a renewal now', tone: 'var(--orange-500)', badge: 'warning' },
  { key: 'missing', label: 'Missing or rejected', hint: 'Required document not on file', tone: 'var(--error-500)', badge: 'error' },
  { key: 'pending', label: 'Awaiting verification', hint: 'Uploaded — needs your check', tone: 'var(--blue-500)', badge: 'info' },
];
const ORDER: Record<IssueKind, number> = { expired: 0, missing: 1, expiring: 2, pending: 3 };

export default function CompliancePage() {
  const [workers, setWorkers] = useState<Cand[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<IssueKind | null>(null);

  useEffect(() => {
    // first=true shows the skeleton + surfaces errors; the 15s background polls
    // refresh silently.
    const load = (first = false) =>
      apiFetch<Cand[]>('/candidates?take=500')
        .then((all) => setWorkers(all.filter((c) => BOOKABLE_STATUSES.includes(c.status))))
        .catch((e) => { if (first) setError(e.message); })
        .finally(() => { if (first) setLoading(false); });
    load(true);
    const i = setInterval(() => load(), 15000);
    return () => clearInterval(i);
  }, []);

  const issues: Row[] = workers
    .flatMap((w) => complianceIssues(w.documents).map((i) => ({ ...i, id: `${w.id}:${i.kind}:${i.docType}`, worker: w })))
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || (a.days ?? 0) - (b.days ?? 0));
  const clearCount = workers.filter((w) => complianceIssues(w.documents).length === 0).length;
  const ratePct = workers.length ? Math.round((clearCount / workers.length) * 100) : 100;
  const urgent = new Set(issues.filter((i) => i.kind === 'expired' || i.kind === 'missing').map((i) => i.worker.id)).size;

  const displayed = filter ? issues.filter((i) => i.kind === filter) : issues;
  const selected = CATS.find((c) => c.key === filter);

  const cols: Column<Row>[] = [
    { key: 'name', header: 'Worker', render: (r) => <Link href={`/dashboard/candidates/${r.worker.id}`} className="namecell" style={{ textDecoration: 'none', color: 'inherit' }}><Avatar name={`${r.worker.firstName} ${r.worker.lastName}`} size={28} /><div><div className="nm" style={{ color: 'var(--text-link)' }}>{r.worker.firstName} {r.worker.lastName}</div><div className="sub2">{r.worker.headline ?? '—'}</div></div></Link> },
    { key: 'doc', header: 'Document', render: (r) => <span style={{ fontWeight: 600 }}>{r.label}</span> },
    { key: 'kind', header: 'Problem', render: (r) => { const c = CATS.find((x) => x.key === r.kind)!; return <Badge tone={c.badge}>{c.label}</Badge>; } },
    { key: 'detail', header: 'Detail', render: (r) => <span className="dim">{r.detail}</span> },
    { key: 'go', header: '', render: (r) => <Link href={`/dashboard/candidates/${r.worker.id}`} className="link" style={{ fontSize: 13 }}>{r.kind === 'pending' ? 'Verify →' : 'Open →'}</Link> },
  ];

  if (loading) return <p className="dim">Loading…</p>;
  if (error) return <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>;

  return (
    <>
      {urgent > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 'var(--radius-lg)', background: 'var(--warning-100)', border: '1px solid #f6dd9e' }}>
          <span style={{ color: 'var(--warning-600)' }}><Ic.AlertCircle /></span>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--warning-600)' }}>{urgent} bookable worker{urgent === 1 ? ' has' : 's have'} an expired or missing document</div>
            <div className="dim" style={{ fontSize: 13 }}>Sort these before their next shift — they're still marked as approved.</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {CATS.map((c) => {
          const n = issues.filter((i) => i.kind === c.key).length;
          const on = filter === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(on ? null : c.key)}
              aria-pressed={on}
              className="card card-pad"
              style={{
                textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit',
                border: on ? `2px solid ${c.tone}` : '1px solid var(--border-subtle)',
                boxShadow: on ? '0 4px 14px rgba(11,31,58,.10)' : 'none',
                transition: 'border-color .12s, box-shadow .12s, transform .12s', transform: on ? 'translateY(-1px)' : 'none',
              }}
            >
              <div className="fx ac" style={{ gap: 10, marginBottom: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: c.tone }} />
                <span style={{ fontSize: 14, fontWeight: 700 }}>{c.label}</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: n ? 'inherit' : 'var(--text-tertiary)' }}>{n}</div>
              <div className="dim" style={{ fontSize: 13 }}>{c.hint}</div>
              <div className="fx ac" style={{ gap: 5, marginTop: 9, fontSize: 11.5, fontWeight: 700, color: on ? c.tone : 'var(--text-tertiary)' }}>
                {on ? '✓ Filtering — click to clear' : 'Click to filter'}
              </div>
            </button>
          );
        })}
      </div>

      <Card
        title={selected ? `${selected.label} — ${displayed.length}` : `Document checks — ${ratePct}% of ${workers.length} bookable workers fully clear`}
        subtitle="Approved workers only. People still registering are reviewed on Candidates."
        action={filter ? <button onClick={() => setFilter(null)} className="link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}>Clear filter ✕</button> : undefined}
      >
        {workers.length === 0
          ? <p className="dim">No approved workers yet.</p>
          : displayed.length === 0
            ? <p className="dim">{selected ? `Nothing in “${selected.label}”.` : 'Every bookable worker’s documents are in order. 🎉'}</p>
            : <DataTable columns={cols} rows={displayed} />}
      </Card>
    </>
  );
}
