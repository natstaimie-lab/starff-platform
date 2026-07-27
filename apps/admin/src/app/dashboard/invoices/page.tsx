'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, KPIStat, Badge, DataTable, type Column } from '@/components/ui';
import * as Ic from '@/components/icons';

type Invoice = {
  id: string;
  number: string;
  status: string;
  total: string;
  periodEnd: string;
  dueDate?: string;
  client: { name: string };
};

const tone: Record<string, string> = { PAID: 'success', SENT: 'info', OVERDUE: 'error', DRAFT: 'neutral', VOID: 'neutral' };
const gbp = (v: string | number) => '£' + Number(v).toLocaleString();
const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function InvoicesPage() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Invoice[]>('/invoices').then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const sum = (s: string) => rows.filter((r) => r.status === s).reduce((a, r) => a + Number(r.total), 0);
  const kpis = [
    { label: 'Total Billed', value: gbp(rows.reduce((a, r) => a + Number(r.total), 0)), icon: <Ic.Receipt width={22} />, tone: 'info' as const },
    { label: 'Paid', value: gbp(sum('PAID')), icon: <Ic.PoundSterling width={22} />, tone: 'success' as const },
    { label: 'Outstanding', value: gbp(sum('SENT') + sum('OVERDUE')), icon: <Ic.AlertCircle width={22} />, tone: 'accent' as const },
    { label: 'Invoices', value: String(rows.length), icon: <Ic.FileText width={22} />, tone: 'info' as const },
  ];

  const cols: Column<Invoice>[] = [
    { key: 'number', header: 'Invoice', render: (r) => <Link href={`/dashboard/invoices/${r.id}`} className="mono" style={{ color: 'var(--text-link)', textDecoration: 'none', fontWeight: 700 }}>{r.number}</Link> },
    { key: 'client', header: 'Client', render: (r) => <span className="nm">{r.client?.name}</span> },
    { key: 'period', header: 'Period end', render: (r) => <span className="dim">{fmt(r.periodEnd)}</span> },
    { key: 'due', header: 'Due', render: (r) => <span className="dim">{fmt(r.dueDate)}</span> },
    { key: 'total', header: 'Amount', align: 'right', render: (r) => <span className="mono">{gbp(r.total)}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={(tone[r.status] ?? 'neutral') as any}>{r.status}</Badge> },
  ];

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: 16 }}>
        {kpis.map((k) => <KPIStat key={k.label} label={k.label} value={k.value} icon={k.icon} tone={k.tone} />)}
      </div>
      <Card title="Invoices & Payroll">
        {error ? <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>
          : loading ? <p className="dim">Loading…</p>
          : rows.length === 0 ? <p className="dim">No invoices yet.</p>
          : <DataTable columns={cols} rows={rows} />}
      </Card>
    </>
  );
}
