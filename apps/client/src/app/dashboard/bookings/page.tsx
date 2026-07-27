'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, Badge, DataTable, type Column } from '@/components/ui';
import * as Ic from '@/components/icons';

type Job = { id: string; title: string; status: string; site?: string; filled: number; total: number; reviewNote?: string | null };
const EDITABLE = ['SUBMITTED', 'UNDER_REVIEW'];
const tone: Record<string, string> = {
  DRAFT: 'neutral', OPEN: 'warning', SUBMITTED: 'warning', UNDER_REVIEW: 'warning', APPROVED: 'info',
  RECRUITING: 'info', OFFERS_SENT: 'info', CANDIDATES_SUBMITTED: 'info', PARTIALLY_FILLED: 'warning',
  FILLED: 'success', CONFIRMED: 'success', IN_PROGRESS: 'info', COMPLETED: 'success', CLOSED: 'neutral', CANCELLED: 'error',
};
const label: Record<string, string> = {
  DRAFT: 'Draft', OPEN: 'Pending', SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under review', APPROVED: 'Approved',
  RECRUITING: 'Finding workers', OFFERS_SENT: 'Finding workers', CANDIDATES_SUBMITTED: 'Candidates ready to review',
  PARTIALLY_FILLED: 'Partially filled', FILLED: 'Fully filled', CONFIRMED: 'Confirmed', IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed', CLOSED: 'Closed', CANCELLED: 'Cancelled',
};

export default function BookingsPage() {
  const [rows, setRows] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { apiFetch<Job[]>('/client/jobs').then(setRows).catch(() => {}).finally(() => setLoading(false)); }, []);

  const needInfo = rows.filter((r) => r.status === 'UNDER_REVIEW' && r.reviewNote);

  const cols: Column<Job>[] = [
    { key: 'role', header: 'Role', render: (r) => <span className="nm">{r.title}</span> },
    { key: 'site', header: 'Location', render: (r) => <span className="dim">{r.site ?? '—'}</span> },
    { key: 'filled', header: 'Filled', align: 'right', render: (r) => <span className="mono">{r.filled}/{r.total}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={(tone[r.status] ?? 'neutral') as any}>{label[r.status] ?? r.status}</Badge> },
    { key: 'action', header: '', align: 'right', render: (r) => EDITABLE.includes(r.status)
        ? <Link href={`/dashboard/book?id=${r.id}`} className="link" style={{ fontWeight: 600, fontSize: 13 }}>{r.status === 'UNDER_REVIEW' ? 'Respond →' : 'Edit →'}</Link>
        : <span className="dim" style={{ fontSize: 12.5 }}>—</span> },
  ];

  return (
    <>
      {needInfo.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {needInfo.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 'var(--radius-lg)', background: 'var(--warning-100, #fdf3d8)', border: '1px solid #f6dd9e' }}>
              <span style={{ fontSize: 18 }}>💬</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: 'var(--warning-600, #a9700a)' }}>Starff needs more info on “{r.title}”</div>
                <div className="dim" style={{ fontSize: 13 }}>{r.reviewNote}</div>
              </div>
              <Link href={`/dashboard/book?id=${r.id}`} className="btn-primary" style={{ textDecoration: 'none', height: 34, whiteSpace: 'nowrap' }}>Respond</Link>
            </div>
          ))}
        </div>
      )}
      <Card title="My Bookings" action={<Link href="/dashboard/book" className="btn-primary" style={{ textDecoration: 'none', height: 34 }}><Ic.Plus width={16} /> Book Staff</Link>}>
        {loading ? <p className="mut">Loading…</p> : rows.length === 0 ? <p className="mut">No bookings yet.</p> : <DataTable columns={cols} rows={rows} />}
      </Card>
    </>
  );
}
