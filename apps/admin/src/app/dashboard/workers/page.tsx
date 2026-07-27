'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, Avatar, ComplianceBadge, DataTable, type Column } from '@/components/ui';

type Worker = {
  id: string;
  firstName: string;
  lastName: string;
  headline?: string;
  city?: string;
  status: string;
  available: boolean;
};

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'compliant', label: 'Compliant' },
];

export default function WorkersPage() {
  const [rows, setRows] = useState<Worker[]>([]);
  const [tab, setTab] = useState('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Worker[]>('/candidates').then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  async function toggle(w: Worker) {
    setRows((rs) => rs.map((r) => (r.id === w.id ? { ...r, available: !r.available } : r)));
    try {
      await apiFetch(`/candidates/${w.id}`, { method: 'PATCH', body: JSON.stringify({ available: !w.available }) });
    } catch {
      setRows((rs) => rs.map((r) => (r.id === w.id ? { ...r, available: w.available } : r))); // revert
    }
  }

  const filtered = rows.filter((w) =>
    tab === 'all' ? true : tab === 'available' ? w.available : w.status === 'COMPLIANT',
  );

  const cols: Column<Worker>[] = [
    { key: 'name', header: 'Worker', render: (r) => <Link href={`/dashboard/candidates/${r.id}`} className="namecell" style={{ textDecoration: 'none', color: 'inherit' }}><Avatar name={`${r.firstName} ${r.lastName}`} size={30} /><div><div className="nm" style={{ color: 'var(--text-link)' }}>{r.firstName} {r.lastName}</div><div className="sub2">{r.headline ?? '—'}</div></div></Link> },
    { key: 'city', header: 'Location', render: (r) => <span className="dim">{r.city ?? '—'}</span> },
    { key: 'status', header: 'Compliance', render: (r) => <ComplianceBadge status={r.status.toLowerCase()} /> },
    {
      key: 'available', header: 'Available',
      render: (r) => (
        <button onClick={() => toggle(r)} aria-label="Toggle availability" style={{ width: 42, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', background: r.available ? 'var(--success-500)' : 'var(--grey-300)', position: 'relative', transition: 'background .15s' }}>
          <span style={{ position: 'absolute', top: 2, left: r.available ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
        </button>
      ),
    },
  ];

  return (
    <Card
      title="Workers"
      action={
        <div style={{ display: 'flex', gap: 6 }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ height: 30, padding: '0 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border-subtle)', background: tab === t.key ? 'var(--navy-900)' : 'var(--surface-card)', color: tab === t.key ? '#fff' : 'var(--text-secondary)' }}>
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      {error ? <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>
        : loading ? <p className="dim">Loading…</p>
        : filtered.length === 0 ? <p className="dim">No workers in this view.</p>
        : <DataTable columns={cols} rows={filtered} />}
    </Card>
  );
}
