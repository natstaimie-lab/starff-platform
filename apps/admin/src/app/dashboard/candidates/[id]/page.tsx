'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useRole } from '@/lib/useRole';
import { Card, Avatar, Badge, ComplianceBadge } from '@/components/ui';
import { ReliabilityCard } from '@/components/ReliabilityCard';
import * as Ic from '@/components/icons';

type Doc = { id: string; type: string; fileName?: string; status: string; expiryDate?: string; createdAt: string };
type Job = { id: string; employer: string; jobTitle?: string | null; startDate?: string | null; endDate?: string | null; current: boolean; reasonForLeaving?: string | null };
type Ref = { id: string; name: string; relationship?: string | null; company?: string | null; email?: string | null; phone?: string | null };
type Candidate = {
  id: string; firstName: string; lastName: string; status: string;
  headline?: string; city?: string; postcode?: string; phone?: string;
  dateOfBirth?: string | null; nationalInsurance?: string | null; addressLine1?: string | null; addressLine2?: string | null;
  emergencyName?: string | null; emergencyPhone?: string | null; emergencyRelationship?: string | null;
  bankAccountName?: string | null; bankSortCode?: string | null; bankAccountNumber?: string | null;
  healthDeclaration?: boolean; healthNotes?: string | null; consentGdpr?: boolean; consentGdprAt?: string | null;
  agreementAccepted?: boolean; signatureName?: string | null; signedAt?: string | null;
  submittedAt?: string | null; registrationSource?: string | null;
  documents: Doc[]; skills: { skill: { name: string } }[]; availability: { dayOfWeek: number }[];
  employmentHistory: Job[]; references: Ref[];
};

const REQUIRED = [
  { type: 'RIGHT_TO_WORK', label: 'Right to Work' },
  { type: 'ID', label: 'Proof of ID' },
  { type: 'DBS_CHECK', label: 'DBS Check' },
  { type: 'CV', label: 'CV / Work History' },
];
const typeLabel: Record<string, string> = {
  RIGHT_TO_WORK: 'Right to Work', ID: 'Proof of ID', DBS_CHECK: 'DBS Check', CV: 'CV / Work History',
  CERTIFICATE: 'Certificate', QUALIFICATION: 'Qualification', LICENCE: 'Licence', REFERENCE: 'Reference', CONTRACT: 'Contract', OTHER: 'Other',
};
const STATUSES = ['NEW', 'SCREENING', 'COMPLIANT', 'ACTIVE', 'INACTIVE', 'REJECTED'];
// 0=Sun … 6=Sat — same convention as the Availability table, matcher and portals.
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const docStatus = (d?: Doc) => (!d ? 'missing' : d.status === 'VERIFIED' ? 'compliant' : d.status === 'EXPIRED' ? 'expired' : d.status === 'REJECTED' ? 'missing' : 'pending');
const fmt = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const mth = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '');
const maskAcct = (n?: string | null) => (n ? '•••• ' + n.replace(/\s/g, '').slice(-4) : '—');

export default function CandidateProfile() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const role = useRole();
  const [c, setC] = useState<Candidate | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState('');

  const load = () => apiFetch<Candidate>(`/candidates/${id}`).then(setC).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  async function archive() {
    if (!confirm('Archive this candidate? They\'ll be hidden from lists and unable to log in, but their data is kept and you can restore them later.')) return;
    try { await apiFetch(`/candidates/${id}/archive`, { method: 'PATCH', body: JSON.stringify({ archived: true }) }); router.push('/dashboard/candidates'); }
    catch (e: any) { alert(e.message); }
  }
  async function hardDelete() {
    if (!confirm('PERMANENTLY delete this candidate? This removes their profile, documents and login for good and cannot be undone.')) return;
    if (!confirm('Are you absolutely sure? This is irreversible.')) return;
    try { await apiFetch(`/candidates/${id}`, { method: 'DELETE' }); router.push('/dashboard/candidates'); }
    catch (e: any) { alert(e.message); }
  }

  async function setDoc(docId: string, status: 'VERIFIED' | 'REJECTED') {
    setBusy(docId);
    try { await apiFetch(`/candidates/${id}/documents/${docId}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load(); }
    finally { setBusy(null); }
  }
  async function view(docId: string) {
    try { const { url } = await apiFetch<{ url: string }>(`/candidates/${id}/documents/${docId}/url`); window.open(url, '_blank'); }
    catch (e: any) { alert(e.message); }
  }
  async function setStatus(status: string) {
    await apiFetch(`/candidates/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    load();
  }
  async function review(action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO') {
    let note: string | undefined;
    if (action !== 'APPROVE') {
      note = window.prompt(action === 'REJECT' ? 'Reason for rejection (sent to the candidate):' : 'What information is needed? (sent to the candidate):') ?? undefined;
      if (note === undefined) return; // cancelled
    }
    setReviewing(true);
    try { await apiFetch(`/registration/candidate/${id}/review`, { method: 'POST', body: JSON.stringify({ action, note }) }); await load(); }
    catch (e: any) { alert(e.message); } finally { setReviewing(false); }
  }

  if (error) return <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>;
  if (!c) return <p className="dim">Loading…</p>;

  const verifiedCount = REQUIRED.filter((r) => docStatus(c.documents.find((d) => d.type === r.type)) === 'compliant').length;
  const pct = Math.round((verifiedCount / REQUIRED.length) * 100);
  const extras = c.documents.filter((d) => !REQUIRED.some((r) => r.type === d.type));

  const DocActions = ({ d }: { d: Doc }) => (
    <div style={{ display: 'flex', gap: 6 }}>
      <button onClick={() => view(d.id)} style={{ border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12, padding: '5px 10px', borderRadius: 8, cursor: 'pointer' }}>View</button>
      {d.status !== 'VERIFIED' && <button disabled={busy === d.id} onClick={() => setDoc(d.id, 'VERIFIED')} style={{ border: 'none', background: 'var(--success-100)', color: 'var(--success-600)', fontWeight: 700, fontSize: 12, padding: '5px 10px', borderRadius: 8, cursor: 'pointer' }}>Verify</button>}
      {d.status !== 'REJECTED' && <button disabled={busy === d.id} onClick={() => setDoc(d.id, 'REJECTED')} style={{ border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', color: 'var(--error-600)', fontWeight: 700, fontSize: 12, padding: '5px 10px', borderRadius: 8, cursor: 'pointer' }}>Reject</button>}
    </div>
  );
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="fx jb" style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13.5 }}><span className="dim">{k}</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span></div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link href="/dashboard/candidates" className="link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>← Back to candidates</Link>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 16 }}>
        <Card title="Compliance checklist" subtitle={`${verifiedCount} of ${REQUIRED.length} checks verified`}>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-sunken)', marginBottom: 14 }}>
            <div style={{ height: 8, width: `${pct}%`, borderRadius: 999, background: pct === 100 ? 'var(--success-500)' : 'var(--orange-500)' }} />
          </div>
          {REQUIRED.map((r) => {
            const doc = c.documents.find((d) => d.type === r.type);
            return (
              <div key={r.type} className="fx ac jb" style={{ padding: '11px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div><div className="nm">{r.label}</div><div className="sub2">{doc ? (doc.fileName ?? 'uploaded') : 'Not uploaded'}</div></div>
                <div className="fx ac" style={{ gap: 10 }}><ComplianceBadge status={docStatus(doc)} />{doc && <DocActions d={doc} />}</div>
              </div>
            );
          })}
          {extras.length > 0 && (
            <>
              <div className="sub2" style={{ marginTop: 14, marginBottom: 6, fontWeight: 700 }}>Other documents</div>
              {extras.map((d) => (
                <div key={d.id} className="fx ac jb" style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div><div className="nm">{typeLabel[d.type] ?? d.type}</div><div className="sub2">{d.fileName ?? 'uploaded'}</div></div>
                  <div className="fx ac" style={{ gap: 10 }}><ComplianceBadge status={docStatus(d)} /><DocActions d={d} /></div>
                </div>
              ))}
            </>
          )}
          {c.documents.length === 0 && <p className="dim" style={{ fontSize: 13.5 }}>No documents uploaded yet. The candidate uploads these in their portal.</p>}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <div className="fx ac" style={{ gap: 14 }}>
              <Avatar name={`${c.firstName} ${c.lastName}`} size={56} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{c.firstName} {c.lastName}</div>
                <div className="dim" style={{ fontSize: 13 }}>{c.headline ?? '—'}</div>
                <div style={{ marginTop: 6 }}><ComplianceBadge status={c.status.toLowerCase()} /></div>
              </div>
            </div>
          </Card>

          {/* Registration review */}
          <Card title="Registration review">
            {c.submittedAt ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Badge tone="warning">Awaiting review</Badge>
                  <span className="dim" style={{ fontSize: 12.5 }}>submitted {fmt(c.submittedAt)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button disabled={reviewing} onClick={() => review('APPROVE')} className="aibtn" style={{ background: 'var(--success-500)', color: '#fff', border: 'none', width: '100%', justifyContent: 'center' }}><Ic.Check width={16} /> Approve registration</button>
                  <button disabled={reviewing} onClick={() => review('REQUEST_INFO')} style={{ background: 'var(--orange-100)', color: 'var(--orange-600)', border: 'none', fontWeight: 700, fontSize: 13, padding: '9px 12px', borderRadius: 10, cursor: 'pointer' }}>Request more information</button>
                  <button disabled={reviewing} onClick={() => review('REJECT')} style={{ background: 'var(--surface-card)', color: 'var(--error-600)', border: '1px solid var(--border-subtle)', fontWeight: 700, fontSize: 13, padding: '9px 12px', borderRadius: 10, cursor: 'pointer' }}>Reject</button>
                </div>
              </>
            ) : (
              <p className="dim" style={{ fontSize: 13.5 }}>{c.status === 'REJECTED' ? 'This registration was rejected.' : c.status === 'COMPLIANT' || c.status === 'ACTIVE' ? 'Already approved.' : 'The candidate hasn’t submitted their registration for review yet.'}</p>
            )}
          </Card>

          <Card title="Pipeline status">
            <select value={c.status} onChange={(e) => setStatus(e.target.value)} style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 14 }}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <div style={{ marginTop: 12 }}>
              <div className="dim" style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Weekly availability</div>
              {c.availability.length === 0 ? (
                <span className="dim" style={{ fontSize: 12.5 }}>No days set yet</span>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {[...new Set(c.availability.map((a) => a.dayOfWeek))].sort((a, b) => a - b).map((d) => (
                    <span key={d} style={{ fontSize: 11.5, background: 'var(--success-100)', color: 'var(--success-600)', padding: '2px 8px', borderRadius: 999, fontWeight: 700 }}>{DAY_LABELS[d]}</span>
                  ))}
                  <span className="dim" style={{ fontSize: 11.5, alignSelf: 'center' }}>· all day</span>
                </div>
              )}
            </div>
            <div className="dim" style={{ fontSize: 12.5, marginTop: 10 }}>Source: {c.registrationSource ?? '—'} · Skills: {c.skills.map((s) => s.skill.name).join(', ') || '—'}</div>
          </Card>

          <Card title="Manage account">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={archive} style={{ background: 'var(--surface-card)', color: 'var(--warning-600)', border: '1px solid var(--border-subtle)', fontWeight: 700, fontSize: 13, padding: '9px 12px', borderRadius: 10, cursor: 'pointer' }}>Archive candidate</button>
              {role === 'ADMIN' && <button onClick={hardDelete} style={{ background: 'var(--error-50, #fdecea)', color: 'var(--error-600)', border: '1px solid var(--error-600)', fontWeight: 700, fontSize: 13, padding: '9px 12px', borderRadius: 10, cursor: 'pointer' }}>Permanently delete</button>}
            </div>
            <p className="dim" style={{ fontSize: 12, marginTop: 8 }}>
              {role === 'ADMIN' ? 'Archive is reversible. Permanent delete removes everything for good.' : 'Archiving is reversible. Only admins can permanently delete accounts.'}
            </p>
          </Card>
        </div>
      </div>

      {/* Reliability monitoring (internal) */}
      <ReliabilityCard candidateId={id} />

      {/* Onboarding details */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <Card title="Personal & contact">
          <Row k="Date of birth" v={fmt(c.dateOfBirth)} />
          <Row k="National Insurance" v={c.nationalInsurance ?? '—'} />
          <Row k="Address" v={[c.addressLine1, c.addressLine2, c.city, c.postcode].filter(Boolean).join(', ') || '—'} />
          <Row k="Phone" v={c.phone ?? '—'} />
        </Card>
        <Card title="Emergency contact">
          <Row k="Name" v={c.emergencyName ?? '—'} />
          <Row k="Phone" v={c.emergencyPhone ?? '—'} />
          <Row k="Relationship" v={c.emergencyRelationship ?? '—'} />
        </Card>
        <Card title="Bank details" subtitle="For payroll">
          <Row k="Account name" v={c.bankAccountName ?? '—'} />
          <Row k="Sort code" v={c.bankSortCode ?? '—'} />
          <Row k="Account number" v={maskAcct(c.bankAccountNumber)} />
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Card title="Employment history">
          {c.employmentHistory.length === 0 ? <p className="dim" style={{ fontSize: 13.5 }}>None provided.</p> : c.employmentHistory.map((j) => (
            <div key={j.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="nm">{j.jobTitle ? `${j.jobTitle} · ` : ''}{j.employer}</div>
              <div className="sub2">{mth(j.startDate)} – {j.current ? 'Present' : mth(j.endDate) || '—'}{j.reasonForLeaving ? ` · left: ${j.reasonForLeaving}` : ''}</div>
            </div>
          ))}
        </Card>
        <Card title="References">
          {c.references.length === 0 ? <p className="dim" style={{ fontSize: 13.5 }}>None provided.</p> : c.references.map((r) => (
            <div key={r.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="nm">{r.name}{r.relationship ? <span className="dim" style={{ fontWeight: 500 }}> · {r.relationship}</span> : null}</div>
              <div className="sub2">{[r.company, r.email, r.phone].filter(Boolean).join(' · ') || '—'}</div>
            </div>
          ))}
        </Card>
      </div>

      <Card title="Declarations & agreement">
        <Row k="Health & safety declaration" v={c.healthDeclaration ? <Badge tone="success">Confirmed</Badge> : <span className="dim">Not confirmed</span>} />
        {c.healthNotes && <Row k="Health notes" v={c.healthNotes} />}
        <Row k="GDPR consent" v={c.consentGdpr ? <Badge tone="success">Consented {fmt(c.consentGdprAt)}</Badge> : <span className="dim">No</span>} />
        <Row k="Candidate agreement" v={c.agreementAccepted ? <Badge tone="success">Accepted</Badge> : <span className="dim">Not accepted</span>} />
        <Row k="Signature" v={c.signatureName ? `${c.signatureName} · ${fmt(c.signedAt)}` : '—'} />
      </Card>
    </div>
  );
}
