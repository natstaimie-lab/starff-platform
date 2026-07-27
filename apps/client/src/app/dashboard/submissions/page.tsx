'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, Badge } from '@/components/ui';
import * as Ic from '@/components/icons';

type Submission = {
  id: string;
  shiftId: string | null;
  status: string;
  submittedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  adminSummary: string | null;
  job: { id: string; title: string; startDate: string | null; endDate: string | null; openings: number };
  candidate: {
    firstName: string;
    reference: string;
    role: string;
    experience: string | null;
    skills: string[];
    qualifications: string[];
    availability: string[];
    travelArea: string | null;
    complianceConfirmed: boolean;
    rating: number | null;
  };
};

const tone: Record<string, string> = {
  SUBMITTED_TO_CLIENT: 'warning', CLIENT_ACCEPTED: 'success', CLIENT_REJECTED: 'error', ALTERNATIVE_REQUESTED: 'info', BOOKED: 'success',
};
const label: Record<string, string> = {
  SUBMITTED_TO_CLIENT: 'Awaiting your decision', CLIENT_ACCEPTED: 'Accepted', CLIENT_REJECTED: 'Rejected', ALTERNATIVE_REQUESTED: 'Alternative requested', BOOKED: 'Booked by Starff',
};
const DECIDABLE = ['SUBMITTED_TO_CLIENT', 'CLIENT_ACCEPTED', 'CLIENT_REJECTED', 'ALTERNATIVE_REQUESTED'];
const dt = (s?: string | null) => (s ? new Date(s).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null);

export default function SubmissionsPage() {
  const [subs, setSubs] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => apiFetch<Submission[]>('/client/submissions').then(setSubs).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function decide(id: string, decision: 'ACCEPT' | 'REJECT' | 'ALTERNATIVE') {
    let note: string | undefined;
    if (decision !== 'ACCEPT') {
      note = window.prompt(decision === 'REJECT' ? 'Reason for rejecting (optional):' : 'What would you prefer instead? (optional):') ?? undefined;
      if (note === undefined && decision === 'ALTERNATIVE') return;
    }
    setBusy(id);
    try {
      await apiFetch(`/client/submissions/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision, note }) });
      await load();
    } catch (e: any) { alert(e.message); } finally { setBusy(null); }
  }
  async function requestReplacement(id: string) {
    const reason = window.prompt('Why do you need a replacement? (optional):') ?? undefined;
    if (reason === undefined) return;
    setBusy(id);
    try {
      await apiFetch(`/client/submissions/${id}/request-replacement`, { method: 'POST', body: JSON.stringify({ reason }) });
      alert('Thanks — Starff has been notified and will arrange a replacement.');
    } catch (e: any) { alert(e.message); } finally { setBusy(null); }
  }
  async function reportAbsent(shiftId: string) {
    if (!confirm('Report this worker as absent? Starff will be notified to arrange cover.')) return;
    const note = window.prompt('Any details? (optional):') ?? undefined;
    setBusy(shiftId);
    try {
      await apiFetch(`/client/shifts/${shiftId}/report-absent`, { method: 'POST', body: JSON.stringify({ note }) });
      alert('Thanks — Starff has been notified.');
      await load();
    } catch (e: any) { alert(e.message); } finally { setBusy(null); }
  }

  if (loading) return <p className="dim">Loading…</p>;
  if (subs.length === 0)
    return <Card title="Candidates for review"><p className="dim" style={{ padding: 8 }}>No candidates have been submitted for your review yet. Starff will put forward suitable workers once your request is approved.</p></Card>;

  // group by job
  const byJob = new Map<string, Submission[]>();
  for (const s of subs) { const k = s.job.id; if (!byJob.has(k)) byJob.set(k, []); byJob.get(k)!.push(s); }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {[...byJob.values()].map((group) => {
        const job = group[0].job;
        return (
          <div key={job.id}>
            <div className="fx ac jb" style={{ marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{job.title}</div>
                <div className="dim" style={{ fontSize: 12.5 }}>{job.openings} worker{job.openings > 1 ? 's' : ''} needed{dt(job.startDate) ? ` · starts ${dt(job.startDate)}` : ''}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
              {group.map((s) => {
                const c = s.candidate;
                const canDecide = DECIDABLE.includes(s.status);
                return (
                  <div key={s.id} className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="fx jb ac" style={{ gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{c.firstName} <span className="dim" style={{ fontWeight: 500, fontSize: 12.5 }}>· {c.reference}</span></div>
                        <div className="dim" style={{ fontSize: 13 }}>{c.role}</div>
                      </div>
                      <Badge tone={(tone[s.status] ?? 'neutral') as any}>{label[s.status] ?? s.status}</Badge>
                    </div>

                    <div className="fx ac" style={{ gap: 12, flexWrap: 'wrap', fontSize: 12.5 }}>
                      {c.complianceConfirmed && <span className="fx ac" style={{ gap: 4, color: 'var(--success-600)', fontWeight: 600 }}><Ic.Check width={14} /> Compliance confirmed</span>}
                      {c.rating != null && <span className="fx ac" style={{ gap: 4 }}><Ic.Award width={14} /> {c.rating.toFixed(1)}/5</span>}
                      {c.travelArea && <span className="dim">{c.travelArea}</span>}
                    </div>

                    {s.adminSummary && <div style={{ fontSize: 13, background: 'var(--surface-sunken, #f4f6fa)', borderRadius: 8, padding: '8px 10px' }}>{s.adminSummary}</div>}

                    {c.skills.length > 0 && (
                      <div>
                        <div className="dim" style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>Skills</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{c.skills.map((sk) => <span key={sk} style={{ fontSize: 11.5, background: 'var(--surface-sunken, #eef1f6)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>{sk}</span>)}</div>
                      </div>
                    )}
                    {c.qualifications.length > 0 && <div className="dim" style={{ fontSize: 12.5 }}><b>Qualifications:</b> {c.qualifications.join(', ')}</div>}
                    {c.availability.length > 0 && <div className="dim" style={{ fontSize: 12.5 }}><b>Available:</b> {c.availability.join(', ')}</div>}

                    {s.decisionNote && <div className="dim" style={{ fontSize: 12.5 }}>Your note: {s.decisionNote}</div>}

                    {canDecide ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                        <button className="btn-primary" disabled={busy === s.id} onClick={() => decide(s.id, 'ACCEPT')}>Accept</button>
                        <button className="btn-outline" disabled={busy === s.id} onClick={() => decide(s.id, 'ALTERNATIVE')}>Request alternative</button>
                        <button className="btn-outline" disabled={busy === s.id} onClick={() => decide(s.id, 'REJECT')} style={{ color: 'var(--error-600)' }}>Reject</button>
                      </div>
                    ) : s.status === 'BOOKED' ? (
                      <div className="fx ac jb" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12.5, color: 'var(--success-600)', fontWeight: 600 }}>Confirmed by Starff — see Assigned Workers.</span>
                        <div className="fx" style={{ gap: 8 }}>
                          {s.shiftId && <button className="btn-outline" disabled={busy === s.shiftId} onClick={() => reportAbsent(s.shiftId!)} style={{ fontSize: 12.5, color: 'var(--error-600)' }}>Report absent</button>}
                          <button className="btn-outline" disabled={busy === s.id} onClick={() => requestReplacement(s.id)} style={{ fontSize: 12.5 }}>Request replacement</button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
