'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, Avatar, Badge, DataTable, type Column } from '@/components/ui';

type Req = {
  userId: string;
  name: string;
  email: string;
  phone?: string | null;
  role: 'CANDIDATE' | 'CLIENT' | string;
  requestedAt: string;
  reason?: string | null;
};

export default function DeletionsPage() {
  const [rows, setRows] = useState<Req[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = (first = false) =>
    apiFetch<Req[]>('/account/deletion-requests')
      .then(setRows)
      .catch((e) => { if (first) setError(e.message); })
      .finally(() => { if (first) setLoading(false); });

  // Auto-refresh so new requests appear without a manual reload.
  useEffect(() => { load(true); const i = setInterval(() => load(), 15000); return () => clearInterval(i); }, []);

  async function complete(r: Req) {
    if (!confirm(
      `Mark ${r.name}'s account as erased?\n\n` +
      `Only do this once you've deleted everything that is NOT under statutory retention ` +
      `(right-to-work and payroll records must be kept for the legal period). ` +
      `The account stays permanently deactivated and leaves this list.`,
    )) return;
    setBusy(r.userId);
    try {
      await apiFetch(`/account/deletion-requests/${r.userId}/complete`, { method: 'POST' });
      await load();
    } catch (e: any) { alert(e?.message || 'Could not update.'); }
    finally { setBusy(null); }
  }

  async function cancel(r: Req) {
    if (!confirm(
      `Restore ${r.name}'s account?\n\n` +
      `This cancels their deletion request and re-enables their login. Use this only if ` +
      `they've asked to keep the account or it was a mistake.`,
    )) return;
    setBusy(r.userId);
    try {
      await apiFetch(`/account/deletion-requests/${r.userId}/cancel`, { method: 'POST' });
      await load();
    } catch (e: any) { alert(e?.message || 'Could not update.'); }
    finally { setBusy(null); }
  }

  const cols: Column<Req>[] = [
    {
      key: 'name',
      header: 'Person',
      render: (r) => (
        r.role === 'CANDIDATE'
          ? <Link href={`/dashboard/candidates`} className="namecell" style={{ textDecoration: 'none', color: 'inherit' }}>
              <Avatar name={r.name} size={28} /><span className="nm">{r.name}</span>
            </Link>
          : <span className="namecell"><Avatar name={r.name} size={28} /><span className="nm">{r.name}</span></span>
      ),
    },
    { key: 'role', header: 'Type', render: (r) => <Badge tone={r.role === 'CLIENT' ? 'info' : 'neutral'}>{r.role === 'CLIENT' ? 'Employer' : 'Worker'}</Badge> },
    { key: 'email', header: 'Contact', render: (r) => <span className="dim">{r.email}{r.phone ? ` · ${r.phone}` : ''}</span> },
    { key: 'requestedAt', header: 'Requested', render: (r) => <span className="dim">{new Date(r.requestedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span> },
    { key: 'reason', header: 'Reason', render: (r) => <span className="dim">{r.reason || '—'}</span> },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="aibtn" disabled={busy === r.userId} onClick={() => complete(r)}>Mark erased</button>
          <button className="aibtn" disabled={busy === r.userId} style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }} onClick={() => cancel(r)}>Restore</button>
        </div>
      ),
    },
  ];

  if (loading) return <p className="dim">Loading…</p>;
  if (error) return <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>;

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Account deletions</h1>
        <p className="dim" style={{ fontSize: 13, margin: '6px 0 0', maxWidth: 680 }}>
          When a worker or employer deletes their account in the app, their access is switched off
          straight away and they appear here. Erase everything that isn&apos;t legally required to be
          kept (right-to-work and payroll records have statutory retention), then <strong>Mark erased</strong>.
          Use <strong>Restore</strong> only if the request was a mistake.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <p className="dim" style={{ fontSize: 14, margin: 0 }}>No pending deletion requests. 🎉</p>
        </Card>
      ) : (
        <DataTable columns={cols} rows={rows} />
      )}
    </>
  );
}
