'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, Avatar, Badge, DataTable, type Column } from '@/components/ui';
import { Modal, Field, TextInput, SelectInput, Button } from '@/components/Modal';
import * as Ic from '@/components/icons';

type Staff = { id: string; email: string; firstName?: string | null; lastName?: string | null; role: string; isActive: boolean };
type Me = { id: string; role: string };

const roleTone: Record<string, string> = { ADMIN: 'info', RECRUITER: 'neutral' };
const empty = { email: '', firstName: '', lastName: '', role: 'RECRUITER' };

export default function StaffPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [rows, setRows] = useState<Staff[]>([]);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const load = () => {
    apiFetch<Me>('/staff/me').then(setMe).catch(() => {});
    apiFetch<Staff[]>('/staff')
      .then(setRows)
      .catch((e) => { if (String(e.message).includes('403')) setDenied(true); else setError(e.message); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  async function invite() {
    if (!form.email.trim()) return;
    setSaving(true); setError(''); setInviteLink(null);
    try {
      const res = await apiFetch<{ inviteLink: string | null }>('/staff', { method: 'POST', body: JSON.stringify(form) });
      setInviteLink(res.inviteLink ?? 'created');
      setForm(empty);
      load();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }
  async function setRole(id: string, role: string) {
    try { await apiFetch(`/staff/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }); load(); }
    catch (e: any) { alert(e.message); }
  }
  async function setActive(id: string, isActive: boolean) {
    try { await apiFetch(`/staff/${id}/active`, { method: 'PATCH', body: JSON.stringify({ isActive }) }); load(); }
    catch (e: any) { alert(e.message); }
  }

  if (denied) return <Card title="Staff & Access"><p className="dim" style={{ fontSize: 14 }}>Only admins can manage staff and access. Ask an admin if you need a change.</p></Card>;

  const name = (s: Staff) => `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || s.email;
  const cols: Column<Staff>[] = [
    { key: 'name', header: 'Name', render: (s) => <div className="namecell"><Avatar name={name(s)} size={30} /><div><div className="nm">{name(s)}</div><div className="sub2">{s.email}</div></div></div> },
    { key: 'role', header: 'Role', render: (s) => <Badge tone={(roleTone[s.role] ?? 'neutral') as any}>{s.role === 'ADMIN' ? 'Admin' : 'Recruiter'}</Badge> },
    { key: 'status', header: 'Status', render: (s) => s.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Deactivated</Badge> },
    {
      key: 'actions', header: '', align: 'right',
      render: (s) => {
        if (me && s.id === me.id) return <span className="dim" style={{ fontSize: 12 }}>You</span>;
        const btn = { border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', fontWeight: 700, fontSize: 12, padding: '5px 10px', borderRadius: 8, cursor: 'pointer' } as React.CSSProperties;
        return (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button style={{ ...btn, color: 'var(--text-secondary)' }} onClick={() => setRole(s.id, s.role === 'ADMIN' ? 'RECRUITER' : 'ADMIN')}>
              {s.role === 'ADMIN' ? 'Make Recruiter' : 'Make Admin'}
            </button>
            {s.isActive
              ? <button style={{ ...btn, color: 'var(--error-600)' }} onClick={() => setActive(s.id, false)}>Deactivate</button>
              : <button style={{ ...btn, color: 'var(--success-600)' }} onClick={() => setActive(s.id, true)}>Reactivate</button>}
          </div>
        );
      },
    },
  ];

  return (
    <Card
      title="Staff & Access"
      subtitle="Admins can do everything including deleting accounts. Recruiters manage day-to-day work but can't delete accounts or manage staff."
      action={<button className="aibtn" style={{ background: 'var(--blue-500)', color: '#fff', border: 'none' }} onClick={() => { setInviteLink(null); setOpen(true); }}><Ic.Plus width={16} /> Invite staff</button>}
    >
      {error ? <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>
        : loading ? <p className="dim">Loading…</p>
        : <DataTable columns={cols} rows={rows} />}

      {open && (
        <Modal
          title="Invite a staff member"
          subtitle="They'll get a secure link to set their own password."
          onClose={() => setOpen(false)}
          footer={<>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            <Button onClick={invite} disabled={saving || !form.email.trim()}>{saving ? 'Inviting…' : 'Send invite'}</Button>
          </>}
        >
          {inviteLink ? (
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--success-600)', marginBottom: 8 }}>✓ Invite created</p>
              <p className="dim" style={{ fontSize: 13, marginBottom: 8 }}>Send this secure link to the new staff member so they can set their password and sign in:</p>
              <textarea readOnly value={inviteLink} onFocus={(e) => e.target.select()} style={{ width: '100%', minHeight: 60, padding: 10, fontSize: 12, fontFamily: 'monospace', border: '1px solid var(--border-strong)', borderRadius: 8 }} />
              <button className="link" style={{ marginTop: 10 }} onClick={() => { setInviteLink(null); }}>Invite another</button>
            </div>
          ) : (
            <>
              {error && <p style={{ color: 'var(--error-600)', fontSize: 13, marginBottom: 8 }}>{error}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="First name"><TextInput value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Alex" /></Field>
                <Field label="Last name"><TextInput value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Morgan" /></Field>
              </div>
              <Field label="Email"><TextInput type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="alex@starff.co.uk" /></Field>
              <Field label="Role">
                <SelectInput value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="RECRUITER">Recruiter — day-to-day, no delete/staff access</option>
                  <option value="ADMIN">Admin — full access incl. delete &amp; staff</option>
                </SelectInput>
              </Field>
            </>
          )}
        </Modal>
      )}
    </Card>
  );
}
