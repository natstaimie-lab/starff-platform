'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useRole } from '@/lib/useRole';
import { Card, Avatar, Badge } from '@/components/ui';
import { Modal, Field, TextInput, SelectInput, Button } from '@/components/Modal';
import * as Ic from '@/components/icons';

type Contact = { id: string; firstName: string; lastName: string; email: string; phone?: string | null; jobTitle?: string | null; isPrimary: boolean; userId?: string | null };
type Site = { id: string; name: string; addressLine1?: string | null; city?: string | null; postcode?: string | null };
type Client = {
  id: string; name: string; industry?: string | null; companyRegNo?: string | null; status: string;
  addressLine1?: string | null; city?: string | null; postcode?: string | null;
  billingEmail?: string | null; paymentTerms?: number | null;
  agreementAccepted?: boolean; agreementAcceptedAt?: string | null; signatureName?: string | null; signedAt?: string | null;
  submittedAt?: string | null; registrationSource?: string | null;
  contacts: Contact[]; sites: Site[]; jobs: { id: string }[];
};

const statusTone: Record<string, string> = { ACTIVE: 'success', LEAD: 'info', PROSPECT: 'warning', ON_HOLD: 'warning', CLOSED: 'neutral' };
const fmt = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function progressPct(c: Client): number {
  const sections = [
    !!(c.industry && c.companyRegNo),
    !!(c.addressLine1 && c.city && c.postcode),
    !!(c.billingEmail && c.paymentTerms != null),
    c.sites.length > 0,
    c.agreementAccepted === true && !!c.signatureName,
  ];
  return Math.round((sections.filter(Boolean).length / sections.length) * 100);
}

export default function ClientProfile() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const role = useRole();
  const [c, setC] = useState<Client | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contact, setContact] = useState({ firstName: '', lastName: '', email: '', phone: '', jobTitle: '', sendInvite: false });
  const [savingContact, setSavingContact] = useState(false);
  const [busyContact, setBusyContact] = useState<string | null>(null);

  const load = () => apiFetch<Client>(`/clients/${id}`).then(setC).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  const CO_FIELDS = ['name', 'industry', 'companyRegNo', 'addressLine1', 'city', 'postcode', 'billingEmail', 'paymentTerms'] as const;
  function openEdit() {
    if (!c) return;
    const seed: Record<string, string> = { status: c.status };
    for (const k of CO_FIELDS) { const v = (c as any)[k]; seed[k] = v == null ? '' : String(v); }
    setEdit(seed); setEditing(true);
  }
  async function saveEdit() {
    setSavingEdit(true); setError('');
    try {
      const body: Record<string, any> = { status: edit.status };
      for (const k of CO_FIELDS) {
        const v = (edit[k] ?? '').trim();
        if (k === 'paymentTerms') { body.paymentTerms = v === '' ? null : Number(v); }
        else body[k] = v === '' ? null : v;
      }
      await apiFetch(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setEditing(false); await load();
    } catch (e: any) { setError(e.message); } finally { setSavingEdit(false); }
  }
  async function addContact() {
    if (!contact.firstName.trim() || !contact.lastName.trim() || !contact.email.trim()) return;
    setSavingContact(true); setError('');
    try {
      await apiFetch(`/clients/${id}/contacts`, { method: 'POST', body: JSON.stringify(contact) });
      setContactOpen(false); setContact({ firstName: '', lastName: '', email: '', phone: '', jobTitle: '', sendInvite: false }); await load();
    } catch (e: any) { setError(e.message); } finally { setSavingContact(false); }
  }
  async function inviteContact(ctId: string) {
    setBusyContact(ctId);
    try { await apiFetch(`/clients/${id}/contacts/${ctId}/invite`, { method: 'POST' }); await load(); alert('Invite sent.'); }
    catch (e: any) { alert(e.message); } finally { setBusyContact(null); }
  }
  async function removeContact(ctId: string) {
    if (!confirm('Remove this contact and their portal login? This cannot be undone for that person.')) return;
    setBusyContact(ctId);
    try { await apiFetch(`/clients/${id}/contacts/${ctId}`, { method: 'DELETE' }); await load(); }
    catch (e: any) { alert(e.message); } finally { setBusyContact(null); }
  }

  async function archive() {
    if (!confirm('Archive this client? They\'ll be hidden from lists and their team unable to log in, but the data is kept and you can restore them later.')) return;
    try { await apiFetch(`/clients/${id}/archive`, { method: 'PATCH', body: JSON.stringify({ archived: true }) }); router.push('/dashboard/clients'); }
    catch (e: any) { alert(e.message); }
  }
  async function hardDelete() {
    if (!confirm('PERMANENTLY delete this client? This removes the company, its contacts, sites, bookings and every login for good and cannot be undone.')) return;
    if (!confirm('Are you absolutely sure? This is irreversible.')) return;
    try { await apiFetch(`/clients/${id}`, { method: 'DELETE' }); router.push('/dashboard/clients'); }
    catch (e: any) { alert(e.message); }
  }

  async function review(action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO') {
    let note: string | undefined;
    if (action !== 'APPROVE') {
      note = window.prompt(action === 'REJECT' ? 'Reason for rejection (sent to the client):' : 'What information is needed? (sent to the client):') ?? undefined;
      if (note === undefined) return;
    }
    setReviewing(true);
    try { await apiFetch(`/registration/client/${id}/review`, { method: 'POST', body: JSON.stringify({ action, note }) }); await load(); }
    catch (e: any) { alert(e.message); } finally { setReviewing(false); }
  }

  if (error) return <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>;
  if (!c) return <p className="dim">Loading…</p>;

  const pct = progressPct(c);
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="fx jb" style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13.5 }}><span className="dim">{k}</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span></div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link href="/dashboard/clients" className="link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>← Back to clients</Link>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <div className="fx ac jb" style={{ gap: 14 }}>
              <div className="fx ac" style={{ gap: 14 }}>
                <Avatar name={c.name} size={56} />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{c.name}</div>
                  <div className="dim" style={{ fontSize: 13 }}>{c.industry ?? '—'}</div>
                  <div style={{ marginTop: 6 }}><Badge tone={(statusTone[c.status] ?? 'neutral') as any}>{c.status}</Badge></div>
                </div>
              </div>
              <button onClick={openEdit} style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-card)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 13, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap' }}>Edit company</button>
            </div>
          </Card>

          <Card title="Company profile">
            <Row k="Industry / sector" v={c.industry ?? '—'} />
            <Row k="Company reg. no." v={c.companyRegNo ?? '—'} />
            <Row k="Business address" v={[c.addressLine1, c.city, c.postcode].filter(Boolean).join(', ') || '—'} />
            <Row k="Billing email" v={c.billingEmail ?? '—'} />
            <Row k="Payment terms" v={c.paymentTerms != null ? `${c.paymentTerms} days` : '—'} />
            <Row k="Source" v={c.registrationSource ?? '—'} />
          </Card>

          <Card title={`Hiring locations (${c.sites.length})`}>
            {c.sites.length === 0 ? <p className="dim" style={{ fontSize: 13.5 }}>None added.</p> : c.sites.map((s) => (
              <div key={s.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="nm">{s.name}</div>
                <div className="sub2">{[s.addressLine1, s.city, s.postcode].filter(Boolean).join(', ') || '—'}</div>
              </div>
            ))}
          </Card>

          <Card
            title={`Authorised users (${c.contacts.length})`}
            action={<button onClick={() => setContactOpen(true)} style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-card)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12.5, padding: '6px 10px', borderRadius: 9, cursor: 'pointer' }}>+ Add contact</button>}
          >
            {c.contacts.length === 0 && <p className="dim" style={{ fontSize: 13.5 }}>No contacts yet.</p>}
            {c.contacts.map((ct) => (
              <div key={ct.id} className="fx ac jb" style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="nm">{ct.firstName} {ct.lastName}{ct.isPrimary && <span className="dim" style={{ fontWeight: 500 }}> · Primary</span>} {ct.userId ? <Badge tone="success">Has login</Badge> : <Badge tone="neutral">No login</Badge>}</div>
                  <div className="sub2">{[ct.jobTitle, ct.email, ct.phone].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="fx ac" style={{ gap: 6 }}>
                  <button disabled={busyContact === ct.id} onClick={() => inviteContact(ct.id)} style={{ border: 'none', background: 'var(--blue-100, #e4eeff)', color: 'var(--blue-600, #2563eb)', fontWeight: 700, fontSize: 12, padding: '5px 10px', borderRadius: 8, cursor: 'pointer' }}>{ct.userId ? 'Resend' : 'Invite'}</button>
                  <button disabled={busyContact === ct.id} onClick={() => removeContact(ct.id)} style={{ border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', color: 'var(--error-600)', fontWeight: 700, fontSize: 12, padding: '5px 10px', borderRadius: 8, cursor: 'pointer' }}>Remove</button>
                </div>
              </div>
            ))}
          </Card>

          <Card title="Terms & agreement">
            <Row k="Terms accepted" v={c.agreementAccepted ? <Badge tone="success">Accepted {fmt(c.agreementAcceptedAt)}</Badge> : <span className="dim">Not accepted</span>} />
            <Row k="Signature" v={c.signatureName ? `${c.signatureName} · ${fmt(c.signedAt)}` : '—'} />
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Onboarding progress" subtitle={`${pct}% complete`}>
            <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-sunken)' }}>
              <div style={{ height: 8, width: `${pct}%`, borderRadius: 999, background: pct === 100 ? 'var(--success-500)' : 'var(--orange-500)' }} />
            </div>
            <div className="dim" style={{ fontSize: 12.5, marginTop: 10 }}>{c.jobs.length} bookings placed</div>
          </Card>

          <Card title="Onboarding review">
            {c.submittedAt ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Badge tone="warning">Awaiting review</Badge>
                  <span className="dim" style={{ fontSize: 12.5 }}>submitted {fmt(c.submittedAt)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button disabled={reviewing} onClick={() => review('APPROVE')} className="aibtn" style={{ background: 'var(--success-500)', color: '#fff', border: 'none', width: '100%', justifyContent: 'center' }}><Ic.Check width={16} /> Approve account</button>
                  <button disabled={reviewing} onClick={() => review('REQUEST_INFO')} style={{ background: 'var(--orange-100)', color: 'var(--orange-600)', border: 'none', fontWeight: 700, fontSize: 13, padding: '9px 12px', borderRadius: 10, cursor: 'pointer' }}>Request more information</button>
                  <button disabled={reviewing} onClick={() => review('REJECT')} style={{ background: 'var(--surface-card)', color: 'var(--error-600)', border: '1px solid var(--border-subtle)', fontWeight: 700, fontSize: 13, padding: '9px 12px', borderRadius: 10, cursor: 'pointer' }}>Reject</button>
                </div>
              </>
            ) : (
              <p className="dim" style={{ fontSize: 13.5 }}>{c.status === 'CLOSED' ? 'This account was rejected/closed.' : c.status === 'ACTIVE' ? 'Already approved and active.' : 'The client hasn’t submitted their onboarding for review yet.'}</p>
            )}
          </Card>

          <Card title="Manage account">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={archive} style={{ background: 'var(--surface-card)', color: 'var(--warning-600)', border: '1px solid var(--border-subtle)', fontWeight: 700, fontSize: 13, padding: '9px 12px', borderRadius: 10, cursor: 'pointer' }}>Archive client</button>
              {role === 'ADMIN' && <button onClick={hardDelete} style={{ background: 'var(--error-50, #fdecea)', color: 'var(--error-600)', border: '1px solid var(--error-600)', fontWeight: 700, fontSize: 13, padding: '9px 12px', borderRadius: 10, cursor: 'pointer' }}>Permanently delete</button>}
            </div>
            <p className="dim" style={{ fontSize: 12, marginTop: 8 }}>
              {role === 'ADMIN' ? 'Archive is reversible. Permanent delete removes everything for good.' : 'Archiving is reversible. Only admins can permanently delete accounts.'}
            </p>
          </Card>
        </div>
      </div>

      {editing && (
        <Modal
          title="Edit company"
          subtitle="Update this client's record"
          width={540}
          onClose={() => setEditing(false)}
          footer={<>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={savingEdit || !edit.name?.trim()}>{savingEdit ? 'Saving…' : 'Save changes'}</Button>
          </>}
        >
          <Field label="Company name"><TextInput value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Industry / sector"><TextInput value={edit.industry} onChange={(e) => setEdit({ ...edit, industry: e.target.value })} /></Field>
            <Field label="Company reg. no."><TextInput value={edit.companyRegNo} onChange={(e) => setEdit({ ...edit, companyRegNo: e.target.value })} placeholder="12345678" /></Field>
          </div>
          <Field label="Address line 1"><TextInput value={edit.addressLine1} onChange={(e) => setEdit({ ...edit, addressLine1: e.target.value })} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="City"><TextInput value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></Field>
            <Field label="Postcode"><TextInput value={edit.postcode} onChange={(e) => setEdit({ ...edit, postcode: e.target.value })} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Billing email"><TextInput type="email" value={edit.billingEmail} onChange={(e) => setEdit({ ...edit, billingEmail: e.target.value })} /></Field>
            <Field label="Payment terms (days)"><TextInput type="number" value={edit.paymentTerms} onChange={(e) => setEdit({ ...edit, paymentTerms: e.target.value })} placeholder="30" /></Field>
          </div>
          <Field label="Status">
            <SelectInput value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
              {['LEAD', 'PROSPECT', 'ACTIVE', 'ON_HOLD', 'CLOSED'].map((s) => <option key={s} value={s}>{s}</option>)}
            </SelectInput>
          </Field>
        </Modal>
      )}

      {contactOpen && (
        <Modal
          title="Add contact"
          subtitle="Add an authorised person for this client"
          onClose={() => setContactOpen(false)}
          footer={<>
            <Button variant="outline" onClick={() => setContactOpen(false)}>Cancel</Button>
            <Button onClick={addContact} disabled={savingContact || !contact.firstName.trim() || !contact.lastName.trim() || !contact.email.trim()}>{savingContact ? 'Saving…' : 'Add contact'}</Button>
          </>}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="First name"><TextInput value={contact.firstName} onChange={(e) => setContact({ ...contact, firstName: e.target.value })} /></Field>
            <Field label="Last name"><TextInput value={contact.lastName} onChange={(e) => setContact({ ...contact, lastName: e.target.value })} /></Field>
          </div>
          <Field label="Job title"><TextInput value={contact.jobTitle} onChange={(e) => setContact({ ...contact, jobTitle: e.target.value })} placeholder="Operations Manager" /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Email"><TextInput type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
            <Field label="Phone"><TextInput value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, cursor: 'pointer', background: 'var(--surface-sunken)', padding: '10px 12px', borderRadius: 10 }}>
            <input type="checkbox" checked={contact.sendInvite} onChange={(e) => setContact({ ...contact, sendInvite: e.target.checked })} style={{ marginTop: 2 }} />
            <span>Email them a portal invite now<br /><span className="dim" style={{ fontSize: 12 }}>Secure set-password link to the client portal. Leave unticked to record them only — you can invite later.</span></span>
          </label>
        </Modal>
      )}
    </div>
  );
}
