'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, Avatar, ComplianceBadge, DataTable, type Column } from '@/components/ui';
import * as Ic from '@/components/icons';

type Cand = { id: string; firstName: string; lastName: string; status: string; headline?: string; city?: string };

const CATS = [
  { key: 'COMPLIANT', label: 'Compliant', tone: 'var(--success-500)' },
  { key: 'ACTIVE', label: 'Active', tone: 'var(--blue-500)' },
  { key: 'SCREENING', label: 'In Screening', tone: 'var(--warning-500)' },
  { key: 'NEW', label: 'Awaiting Checks', tone: 'var(--orange-500)' },
];
const ATTENTION = ['NEW', 'SCREENING', 'INACTIVE', 'REJECTED'];

export default function CompliancePage() {
  const [rows, setRows] = useState<Cand[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Cand[]>('/candidates').then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const total = rows.length || 1;
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const compliantPct = Math.round(((count('COMPLIANT') + count('ACTIVE')) / total) * 100);
  const needAttention = rows.filter((r) => ATTENTION.includes(r.status));

  // Clicking a category card narrows the table to that status; click again to clear.
  const displayed = filter ? rows.filter((r) => r.status === filter) : needAttention;
  const selected = CATS.find((c) => c.key === filter);

  const cols: Column<Cand>[] = [
    { key: 'name', header: 'Worker', render: (r) => <Link href={`/dashboard/candidates/${r.id}`} className="namecell" style={{ textDecoration: 'none', color: 'inherit' }}><Avatar name={`${r.firstName} ${r.lastName}`} size={28} /><span className="nm" style={{ color: 'var(--text-link)' }}>{r.firstName} {r.lastName}</span></Link> },
    { key: 'role', header: 'Role', render: (r) => <span className="dim">{r.headline ?? '—'}</span> },
    { key: 'city', header: 'Location', render: (r) => <span className="dim">{r.city ?? '—'}</span> },
    { key: 'status', header: 'Status', render: (r) => <ComplianceBadge status={r.status.toLowerCase()} /> },
  ];

  if (loading) return <p className="dim">Loading…</p>;
  if (error) return <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>;

  return (
    <>
      {needAttention.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 'var(--radius-lg)', background: 'var(--warning-100)', border: '1px solid #f6dd9e' }}>
          <span style={{ color: 'var(--warning-600)' }}><Ic.AlertCircle /></span>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--warning-600)' }}>{needAttention.length} workers need attention</div>
            <div className="dim" style={{ fontSize: 13 }}>Resolve their checks before their next scheduled shift to stay compliant.</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {CATS.map((c) => {
          const n = count(c.key);
          const pct = Math.round((n / total) * 100);
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
                <span style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--orange-100)', color: 'var(--orange-500)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic.ClipboardCheck width={18} /></span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{c.label}</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{n}</div>
              <div className="dim" style={{ marginBottom: 10, fontSize: 13 }}>{pct}% of workers</div>
              <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-sunken)' }}>
                <div style={{ height: 8, width: `${pct}%`, borderRadius: 999, background: c.tone }} />
              </div>
              <div className="fx ac" style={{ gap: 5, marginTop: 9, fontSize: 11.5, fontWeight: 700, color: on ? c.tone : 'var(--text-tertiary)' }}>
                {on ? '✓ Filtering — click to clear' : 'Click to view these workers'}
              </div>
            </button>
          );
        })}
      </div>

      <Card
        title={selected ? `${selected.label} — ${displayed.length} worker${displayed.length === 1 ? '' : 's'}` : `Compliance rate: ${compliantPct}% — Workers needing attention`}
        action={filter ? <button onClick={() => setFilter(null)} className="link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}>Clear filter ✕</button> : undefined}
      >
        {displayed.length === 0
          ? <p className="dim">{selected ? `No workers in “${selected.label}”.` : 'Everyone is compliant. 🎉'}</p>
          : <DataTable columns={cols} rows={displayed} />}
      </Card>
    </>
  );
}
