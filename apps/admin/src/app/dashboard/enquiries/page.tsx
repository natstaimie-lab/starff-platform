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
  phone?: string;
  company?: string;
  message?: string;
  createdAt?: string;
};

const typeLabel: Record<string, string> = { CONTACT: 'Contact', POST_A_JOB: 'Post a job', CANDIDATE_REGISTER: 'Register' };
const statusTone: Record<string, string> = { NEW: 'warning', CONTACTED: 'info', CONVERTED: 'success', CLOSED: 'neutral' };

export default function EnquiriesPage() {
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<Enquiry | null>(null);

  const load = () => apiFetch<Enquiry[]>('/enquiries').then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function convert(id: string) {
    setBusy(id);
    try {
      const res = await apiFetch<{ kind: string }>(`/enquiries/${id}/convert`, { method: 'POST' });
      await load();
      alert(`Converted to a ${res.kind}. Find it under ${res.kind === 'client' ? 'Clients' : 'Candidates'}.`);
    } catch (e: any) {
      // Show the reason without wiping the list.
      alert(e?.message || 'Could not convert this enquiry.');
    } finally { setBusy(null); }
  }

  const btn = (bg: string): React.CSSProperties => ({ border: 'none', background: bg, color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer' });

  const cols: Column<Enquiry>[] = [
    { key: 'type', header: 'Type', render: (r) => <Badge tone="info">{typeLabel[r.type] ?? r.type}</Badge> },
    { key: 'name', header: 'Name', render: (r) => <div><div className="nm">{r.name ?? '—'}</div><div className="sub2">{r.email}</div></div> },
    { key: 'company', header: 'Company', render: (r) => <span className="dim">{r.company ?? '—'}</span> },
    { key: 'message', header: 'Message', render: (r) => <span className="dim" style={{ display: 'block', maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.message ?? '—'}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={(statusTone[r.status] ?? 'neutral') as any}>{r.status}</Badge> },
    {
      key: 'act', header: '', align: 'right',
      render: (r) => {
        // A general Contact enquiry is just a message to read — never converted.
        if (r.type === 'CONTACT') {
          return <button onClick={() => setView(r)} style={btn('var(--navy-900)')}>View</button>;
        }
        if (r.status === 'CONVERTED') return <span className="sub2">Converted</span>;
        return (
          <button disabled={busy === r.id} onClick={() => convert(r.id)} style={btn('var(--blue-500)')}>
            {busy === r.id ? '…' : 'Convert'}
          </button>
        );
      },
    },
  ];

  return (
    <>
      <Card title="Enquiries" action={<span className="dim" style={{ fontSize: 13 }}>{rows.length} submissions</span>}>
        {error ? <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>
          : loading ? <p className="dim">Loading…</p>
          : rows.length === 0 ? <p className="dim">No enquiries yet.</p>
          : <DataTable columns={cols} rows={rows} />}
      </Card>

      {view && (
        <div
          onClick={() => setView(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(11,31,58,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 14, maxWidth: 520, width: '100%', padding: 24, boxShadow: '0 20px 60px rgba(11,31,58,0.25)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Badge tone="info">{typeLabel[view.type] ?? view.type}</Badge>
              <button onClick={() => setView(null)} style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, cursor: 'pointer', color: 'var(--grey-500)' }} aria-label="Close">×</button>
            </div>
            <h3 style={{ margin: '8px 0 2px', fontSize: 18 }}>{view.name ?? '—'}</h3>
            <div className="sub2" style={{ marginBottom: 16 }}>{view.email}{view.phone ? ` · ${view.phone}` : ''}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--grey-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Message</div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6, color: 'var(--navy-900)', background: 'var(--grey-50)', border: '1px solid var(--grey-200)', borderRadius: 10, padding: 14 }}>
              {view.message || '(no message provided)'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              {view.email && (
                <a href={`mailto:${view.email}?subject=${encodeURIComponent('Re: Your enquiry to Starff')}`} style={{ ...btn('var(--orange-500)'), textDecoration: 'none', display: 'inline-block' }}>Reply by email</a>
              )}
              <button onClick={() => setView(null)} style={{ border: '1px solid var(--grey-200)', background: '#fff', color: 'var(--navy-900)', fontWeight: 700, fontSize: 12, padding: '6px 14px', borderRadius: 8, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
