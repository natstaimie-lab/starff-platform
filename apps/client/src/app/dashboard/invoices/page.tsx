'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, Badge, DataTable, type Column } from '@/components/ui';

type Inv = { id: string; number: string; total: string; status: string; periodEnd: string; dueDate?: string };
const tone: Record<string, string> = { PAID: 'success', SENT: 'info', OVERDUE: 'error', DRAFT: 'neutral', VOID: 'neutral' };
const gbp = (v: string | number) => '£' + Number(v).toLocaleString();
const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function InvoicesPage() {
  const [rows, setRows] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { apiFetch<Inv[]>('/client/invoices').then(setRows).catch(() => {}).finally(() => setLoading(false)); }, []);

  const cols: Column<Inv>[] = [
    { key: 'number', header: 'Invoice', render: (r) => <span className="mono">{r.number}</span> },
    { key: 'period', header: 'Period end', render: (r) => <span className="dim">{fmt(r.periodEnd)}</span> },
    { key: 'due', header: 'Due', render: (r) => <span className="dim">{fmt(r.dueDate)}</span> },
    { key: 'total', header: 'Amount', align: 'right', render: (r) => <span className="mono">{gbp(r.total)}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={(tone[r.status] ?? 'neutral') as any}>{r.status}</Badge> },
  ];

  return (
    <Card title="Invoices">
      {loading ? <p className="mut">Loading…</p> : rows.length === 0 ? <p className="mut">No invoices yet.</p> : <DataTable columns={cols} rows={rows} />}
    </Card>
  );
}
