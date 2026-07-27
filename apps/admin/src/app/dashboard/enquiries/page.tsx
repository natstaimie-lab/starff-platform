'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, Badge, DataTable, type Column } from '@/components/ui';

type Enquiry = {
  id: string;
  type: string;
  status: string;
  name?: string;
  email?: string;
  company?: string;
  message?: string;
};

const typeLabel: Record<string, string> = { CONTACT: 'Contact', POST_A_JOB: 'Post a job', CANDIDATE_REGISTER: 'Register' };
const statusTone: Record<string, string> = { NEW: 'warning', CONTACTED: 'info', CONVERTED: 'success', CLOSED: 'neutral' };

export default function EnquiriesPage() {
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => apiFetch<Enquiry[]>('/enquiries').then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function convert(id: string) {
    setBusy(id);
    try {
      const res = await apiFetch<{ kind: string }>(`/enquiries/${id}/convert`, { method: 'POST' });
      await load();
      alert(`Converted to a ${res.kind}. Find it under ${res.kind === 'client' ? 'Clients' : 'Candidates'}.`);
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }

  const cols: Column<Enquiry>[] = [
    { key: 'type', header: 'Type', render: (r) => <Badge tone="info">{typeLabel[r.type] ?? r.type}</Badge> },
    { key: 'name', header: 'Name', render: (r) => <div><div className="nm">{r.name ?? '—'}</div><div className="sub2">{r.email}</div></div> },
    { key: 'company', header: 'Company', render: (r) => <span className="dim">{r.company ?? '—'}</span> },
    { key: 'message', header: 'Message', render: (r) => <span className="dim" style={{ display: 'block', maxWidth: 300 }}>{r.message ?? '—'}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={(statusTone[r.status] ?? 'neutral') as any}>{r.status}</Badge> },
    {
      key: 'act', header: '', align: 'right',
      render: (r) => r.status === 'CONVERTED' ? <span className="sub2">Converted</span> : (
        <button disabled={busy === r.id} onClick={() => convert(r.id)} style={{ border: 'none', background: 'var(--blue-500)', color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer' }}>
          {busy === r.id ? '…' : 'Convert'}
        </button>
      ),
    },
  ];

  return (
    <Card title="Enquiries" action={<span className="dim" style={{ fontSize: 13 }}>{rows.length} submissions</span>}>
      {error ? <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>
        : loading ? <p className="dim">Loading…</p>
        : rows.length === 0 ? <p className="dim">No enquiries yet.</p>
        : <DataTable columns={cols} rows={rows} />}
    </Card>
  );
}
