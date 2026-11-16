'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, Avatar, Badge, ComplianceBadge, DataTable, type Column } from '@/components/ui';
import { WORKER_STATUSES, BOOKABLE_STATUSES, complianceIssues, type ComplianceDoc } from '@/lib/compliance';

// Approved people only (COMPLIANT / ACTIVE, plus INACTIVE ones you've stood
// down). Anyone still registering or in review lives on the Candidates page.
type Worker = {
  id: string;
  firstName: string;
  lastName: string;
  headline?: string;
  city?: string;
  status: string;
  available: boolean;
  preferredSectors?: string[];
  documents?: ComplianceDoc[];
};

const TABS = [
  { key: 'bookable', label: 'Bookable', match: (w: Worker) => BOOKABLE_STATUSES.includes(w.status) },
  { key: 'available', label: 'Available now', match: (w: Worker) => BOOKABLE_STATUSES.includes(w.status) && w.available },
  { key: 'issues', label: 'Document issues', match: (w: Worker) => BOOKABLE_STATUSES.includes(w.status) && complianceIssues(w.documents).length > 0 },
  { key: 'inactive', label: 'Inactive', match: (w: Worker) => w.status === 'INACTIVE' },
];

export default function WorkersPage() {
  const [rows, setRows] = useState<Worker[]>([]);
  const [tab, setTab] = useState('bookable');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Silent 15s refresh, same as Candidates/Compliance, so newly approved
    // workers appear without a reload.
    const load = (first = false) =>
      apiFetch<Worker[]>('/candidates?take=500')
        .then((all) => setRows(all.filter((w) => WORKER_STATUSES.includes(w.status))))
        .catch((e) => { if (first) setError(e.message); })
        .finally(() => { if (first) setLoading(false); });
    load(true);
    const i = setInterval(() => load(), 15000);
    return () => clearInterval(i);
  }, []);

  async function toggle(w: Worker) {
    setRows((rs) => rs.map((r) => (r.id === w.id ? { ...r, available: !r.available } : r)));
    try {
      await apiFetch(`/candidates/${w.id}`, { method: 'PATCH', body: JSON.stringify({ available: !w.available }) });
    } catch {
      setRows((rs) => rs.map((r) => (r.id === w.id ? { ...r, available: w.available } : r))); // revert
    }
  }

  const current = TABS.find((t) => t.key === tab)!;
  const filtered = rows.filter(current.match);

  const cols: Column<Worker>[] = [
    { key: 'name', header: 'Worker', render: (r) => <Link href={`/dashboard/candidates/${r.id}`} className="namecell" style={{ textDecoration: 'none', color: 'inherit' }}><Avatar name={`${r.firstName} ${r.lastName}`} size={30} /><div><div className="nm" style={{ color: 'var(--text-link)' }}>{r.firstName} {r.lastName}</div><div className="sub2">{r.headline ?? '—'}</div></div></Link> },
    { key: 'sectors', header: 'Sectors', render: (r) => (
      r.preferredSectors?.length
        ? <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{r.preferredSectors.map((s) => (
            <span key={s} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'var(--blue-100, #e7efff)', color: 'var(--blue-700, #1d4ed8)', whiteSpace: 'nowrap' }}>{s}</span>
          ))}</span>
        : <span className="dim">—</span>
    ) },
    { key: 'city', header: 'Location', render: (r) => <span className="dim">{r.city ?? '—'}</span> },
    { key: 'status', header: 'Status', render: (r) => <ComplianceBadge status={r.status.toLowerCase()} /> },
    { key: 'docs', header: 'Documents', render: (r) => {
      const issues = complianceIssues(r.documents);
      if (!issues.length) return <Badge tone="success">All clear</Badge>;
      const bad = issues.some((i) => i.kind === 'expired' || i.kind === 'missing');
      return <Link href="/dashboard/compliance" style={{ textDecoration: 'none' }}><Badge tone={bad ? 'error' : 'warning'}>{issues.length} issue{issues.length === 1 ? '' : 's'}</Badge></Link>;
    } },
    {
      key: 'available', header: 'Available',
      render: (r) => r.status === 'INACTIVE' ? <span className="dim">—</span> : (
        <button onClick={() => toggle(r)} aria-label="Toggle availability" style={{ width: 42, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', background: r.available ? 'var(--success-500)' : 'var(--grey-300)', position: 'relative', transition: 'background .15s' }}>
          <span style={{ position: 'absolute', top: 2, left: r.available ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
        </button>
      ),
    },
  ];

  return (
    <Card
      title="Workers"
      subtitle="Approved people you can book. Sign-ups still registering are on Candidates."
      action={
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ height: 30, padding: '0 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border-subtle)', background: tab === t.key ? 'var(--navy-900)' : 'var(--surface-card)', color: tab === t.key ? '#fff' : 'var(--text-secondary)' }}>
              {t.label} <span style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{rows.filter(t.match).length}</span>
            </button>
          ))}
        </div>
      }
    >
      {error ? <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>
        : loading ? <p className="dim">Loading…</p>
        : rows.length === 0 ? <p className="dim">No approved workers yet. Approve candidates from their profile and they'll appear here.</p>
        : filtered.length === 0 ? <p className="dim">No workers in this view.</p>
        : <DataTable columns={cols} rows={filtered} />}
    </Card>
  );
}
