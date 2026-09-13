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
  spam?: boolean;
  spamReason?: string | null;
  createdAt?: string;
};

const typeLabel: Record<string, string> = { CONTACT: 'Contact', POST_A_JOB: 'Post a job', CANDIDATE_REGISTER: 'Register' };
const statusTone: Record<string, string> = { NEW: 'warning', CONTACTED: 'info', CONVERTED: 'success', CLOSED: 'neutral' };

export default function EnquiriesPage() {
  const [tab, setTab] = useState<'inbox' | 'spam'>('inbox');
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<Enquiry | null>(null);

  const load = (t: 'inbox' | 'spam' = tab) => {
    setLoading(true);
    return apiFetch<Enquiry[]>(`/enquiries${t === 'spam' ? '?spam=true' : ''}`)
      .then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(tab); /* eslint-disable-next-line */ }, [tab]);

  async function convert(id: string) {
    setBusy(id);
    try {
      const res = await apiFetch<{ kind: string }>(`/enquiries/${id}/convert`, { method: 'POST' });
      await load();
      alert(`Converted to a ${res.kind}. Find it under ${res.kind === 'client' ? 'Clients' : 'Candidates'}.`);
    } catch (e: any) {
      alert(e?.message || 'Could not convert this enquiry.');
    } finally { setBusy(null); }
  }

  async function setSpam(id: string, spam: boolean) {
    setBusy(id);
    try {
      await apiFetch(`/enquiries/${id}/spam`, { method: 'PATCH', body: JSON.stringify({ spam }) });
      await load();
    } catch (e: any) { alert(e?.message || 'Could not update this enquiry.'); }
    finally { setBusy(null); }
  }

  const btn = (bg: string): React.CSSProperties => ({ border: 'none', background: bg, color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer' });
  const ghost: React.CSSProperties = { border: '1px solid var(--grey-200)', background: '#fff', color: 'var(--navy-900)', fontWeight: 700, fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer' };

  const cols: Column<Enquiry>[] = [
    { key: 'type', header: 'Type', render: (r) => <Badge tone="info">{typeLabel[r.type] ?? r.type}</Badge> },
    { key: 'name', header: 'Name', render: (r) => <div><div className="nm">{r.name ?? '—'}</div><div className="sub2">{r.email}</div></div> },
    { key: 'company', header: 'Company', render: (r) => <span className="dim">{r.company ?? '—'}</span> },
    { key: 'message', header: 'Message', render: (r) => <span className="dim" style={{ display: 'block', maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.message ?? '—'}</span> },
    tab === 'spam'
      ? { key: 'reason', header: 'Flagged for', render: (r) => <Badge tone={'error' as any}>{r.spamReason ?? 'spam'}</Badge> }
      : { key: 'status', header: 'Status', render: (r) => <Badge tone={(statusTone[r.status] ?? 'neutral') as any}>{r.status}</Badge> },
    {
      key: 'act', header: '', align: 'right',
      render: (r) => {
        if (tab === 'spam') {
          return (
            <span style={{ display: 'inline-flex', gap: 8 }}>
              <button onClick={() => setView(r)} style={ghost}>View</button>
              <button disabled={busy === r.id} onClick={() => setSpam(r.id, false)} style={btn('var(--green, #16A34A)')}>{busy === r.id ? '…' : 'Not spam'}</button>
            </span>
          );
        }
        if (r.type === 'CONTACT') {
          return (
            <span style={{ display: 'inline-flex', gap: 8 }}>
              <button onClick={() => setView(r)} style={btn('var(--navy-900)')}>View</button>
              <button disabled={busy === r.id} onClick={() => setSpam(r.id, true)} style={ghost} title="Mark as spam">Spam</button>
            </span>
          );
        }
        if (r.status === 'CONVERTED') return <span className="sub2">Converted</span>;
        return (
          <span style={{ display: 'inline-flex', gap: 8 }}>
            <button disabled={busy === r.id} onClick={() => convert(r.id)} style={btn('var(--blue-500)')}>{busy === r.id ? '…' : 'Convert'}</button>
            <button disabled={busy === r.id} onClick={() => setSpam(r.id, true)} style={ghost} title="Mark as spam">Spam</button>
          </span>
        );
      },
    },
  ];

  const TabBtn = ({ id, label }: { id: 'inbox' | 'spam'; label: string }) => (
    <button
      onClick={() => setTab(id)}
      style={{
        border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13.5, fontWeight: 700,
        padding: '6px 2px', color: tab === id ? 'var(--navy-900)' : 'var(--grey-500)',
        borderBottom: `2px solid ${tab === id ? 'var(--orange-500)' : 'transparent'}`,
      }}
    >{label}</button>
  );

  return (
    <>
      <Card
        title="Enquiries"
        action={
          <span style={{ display: 'inline-flex', gap: 16, alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', gap: 14 }}>
              <TabBtn id="inbox" label="Inbox" />
              <TabBtn id="spam" label="Spam" />
            </span>
            <span className="dim" style={{ fontSize: 13 }}>{rows.length} {tab === 'spam' ? 'flagged' : 'submissions'}</span>
          </span>
        }
      >
        {error ? <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>
          : loading ? <p className="dim">Loading…</p>
          : rows.length === 0 ? <p className="dim">{tab === 'spam' ? 'No spam — nice.' : 'No enquiries yet.'}</p>
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
              <button onClick={() => setView(null)} style={ghost}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
