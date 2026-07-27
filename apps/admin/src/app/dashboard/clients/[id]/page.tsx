'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useRole } from '@/lib/useRole';
import { Card, Avatar, Badge } from '@/components/ui';
import * as Ic from '@/components/icons';

type Contact = { id: string; firstName: string; lastName: string; email: string; phone?: string | null; jobTitle?: string | null; isPrimary: boolean };
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

  const load = () => apiFetch<Client>(`/clients/${id}`).then(setC).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

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
            <div className="fx ac" style={{ gap: 14 }}>
              <Avatar name={c.name} size={56} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{c.name}</div>
                <div className="dim" style={{ fontSize: 13 }}>{c.industry ?? '—'}</div>
                <div style={{ marginTop: 6 }}><Badge tone={(statusTone[c.status] ?? 'neutral') as any}>{c.status}</Badge></div>
              </div>
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

          <Card title={`Authorised users (${c.contacts.length})`}>
            {c.contacts.map((ct) => (
              <div key={ct.id} className="fx ac jb" style={{ padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div><div className="nm">{ct.firstName} {ct.lastName}{ct.isPrimary && <span className="dim" style={{ fontWeight: 500 }}> · Primary</span>}</div><div className="sub2">{[ct.jobTitle, ct.email, ct.phone].filter(Boolean).join(' · ')}</div></div>
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
    </div>
  );
}
