'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, Badge } from '@/components/ui';
import * as Ic from '@/components/icons';

type Invitation = {
  id: string;
  status: string;
  invitedAt: string | null;
  responseDeadline: string | null;
  respondedAt: string | null;
  responseNote: string | null;
  job: {
    title: string;
    sector: string | null;
    startDate: string | null;
    endDate: string | null;
    location: string | null;
    payRate: string;
    skills: string[];
    ppe: string | null;
    instructions: string | null;
    breakInfo: string | null;
  };
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const statusTone: Record<string, string> = {
  INVITED: 'warning', INTERESTED: 'success', UNAVAILABLE: 'neutral', INFO_REQUESTED: 'info',
  DECLINED: 'neutral', ALTERNATIVE_REQUESTED: 'info', SUBMITTED_TO_CLIENT: 'info', CLIENT_ACCEPTED: 'success',
};
const statusLabel: Record<string, string> = {
  INVITED: 'Awaiting your response', INTERESTED: "You're available", UNAVAILABLE: 'You said you cannot make it',
  INFO_REQUESTED: 'You asked a question', DECLINED: 'Declined', ALTERNATIVE_REQUESTED: 'Alternative requested',
  SUBMITTED_TO_CLIENT: 'Starff is putting you forward', CLIENT_ACCEPTED: 'Accepted — Starff is confirming',
};
const RESPONDABLE = ['INVITED', 'INTERESTED', 'UNAVAILABLE', 'INFO_REQUESTED'];
const hhmm = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export default function OffersPage() {
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    apiFetch<Invitation[]>('/me/invitations').then(setInvites).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function respond(id: string, response: 'INTERESTED' | 'UNAVAILABLE' | 'DECLINE' | 'INFO') {
    let note: string | undefined;
    if (response === 'INFO') {
      note = window.prompt('What would you like to know about this shift?') ?? undefined;
      if (note === undefined) return;
    }
    setBusy(id);
    try {
      await apiFetch(`/me/invitations/${id}/respond`, { method: 'POST', body: JSON.stringify({ response, note }) });
      await load();
    } catch (e: any) { alert(e.message); } finally { setBusy(null); }
  }

  if (loading) return <p className="mut">Loading…</p>;
  if (invites.length === 0)
    return <Card><p className="mut" style={{ padding: 8 }}>You have no shift offers right now. When Starff offers you a shift, it’ll appear here — keep your availability and documents up to date so you don’t miss out.</p></Card>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {invites.map((iv) => {
        const j = iv.job;
        const d = j.startDate ? new Date(j.startDate) : null;
        const canRespond = RESPONDABLE.includes(iv.status);
        return (
          <div key={iv.id} className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="fx jb ac" style={{ gap: 12 }}>
              <div className="fx ac" style={{ gap: 12 }}>
                <div style={{ width: 52, height: 52, borderRadius: 'var(--radius-md)', background: 'var(--orange-100)', color: 'var(--orange-600)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  {d ? <><b style={{ fontSize: 19, lineHeight: 1 }}>{d.getDate()}</b><span style={{ fontSize: 10, fontWeight: 700 }}>{MONTHS[d.getMonth()]}</span></> : <Ic.Sparkle width={22} />}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{j.title}</div>
                  <div className="mut" style={{ fontSize: 13 }}>{[j.sector, j.location].filter(Boolean).join(' · ') || 'Shift opportunity'}</div>
                </div>
              </div>
              <Badge tone={(statusTone[iv.status] ?? 'neutral') as any}>{statusLabel[iv.status] ?? iv.status}</Badge>
            </div>

            <div className="shmeta" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0, gap: 20, flexWrap: 'wrap' }}>
              {d && <span className="fx ac mut" style={{ gap: 5, fontSize: 12.5 }}><Ic.Calendar width={15} /> {day(j.startDate!)}</span>}
              {j.startDate && j.endDate && <span className="fx ac mut" style={{ gap: 5, fontSize: 12.5 }}><Ic.Clock width={15} /> {hhmm(j.startDate)}–{hhmm(j.endDate)}</span>}
              <span className="fx ac mut" style={{ gap: 5, fontSize: 12.5 }}><Ic.PoundSterling width={15} /> £{Number(j.payRate).toFixed(2)}/hr</span>
            </div>

            {(j.skills.length > 0 || j.ppe || j.instructions || j.breakInfo) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                {j.skills.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {j.skills.map((s) => <span key={s} style={{ fontSize: 11.5, background: 'var(--surface-sunken, #eef1f6)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>{s}</span>)}
                  </div>
                )}
                {j.ppe && <div className="mut"><b>PPE:</b> {j.ppe}</div>}
                {j.breakInfo && <div className="mut"><b>Breaks:</b> {j.breakInfo}</div>}
                {j.instructions && <div className="mut"><b>Instructions:</b> {j.instructions}</div>}
              </div>
            )}

            {iv.responseDeadline && canRespond && (
              <div className="mut" style={{ fontSize: 12.5 }}>Please respond by {new Date(iv.responseDeadline).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
            )}

            {canRespond ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button className="btn-primary" disabled={busy === iv.id} onClick={() => respond(iv.id, 'INTERESTED')}>I&apos;m available</button>
                <button className="btn-outline" disabled={busy === iv.id} onClick={() => respond(iv.id, 'UNAVAILABLE')}>Can&apos;t make it</button>
                <button className="btn-outline" disabled={busy === iv.id} onClick={() => respond(iv.id, 'INFO')}>Ask a question</button>
              </div>
            ) : (
              <div className="mut" style={{ fontSize: 12.5 }}>Response sent — Starff will confirm your booking and it’ll show under My Bookings.</div>
            )}
            {iv.responseNote && <div className="mut" style={{ fontSize: 12.5 }}>Your note: {iv.responseNote}</div>}
          </div>
        );
      })}
    </div>
  );
}
