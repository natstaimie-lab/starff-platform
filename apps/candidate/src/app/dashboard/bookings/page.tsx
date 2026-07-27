'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, Badge } from '@/components/ui';
import * as Ic from '@/components/icons';

type Addr = { name?: string | null; addressLine1?: string | null; city?: string | null; postcode?: string | null };
type Shift = {
  id: string; startAt: string; endAt: string; status: string; payRate: string; breakMinutes?: number; notes?: string | null;
  job: {
    title: string; ppe?: string | null; uniform?: string | null; breakInfo?: string | null;
    reportingContact?: string | null; reportingInstructions?: string | null; siteInstructions?: string | null;
    client: { name: string } & Addr;
  };
  site?: Addr | null;
};

const tone: Record<string, string> = { ASSIGNED: 'info', CONFIRMED: 'success', IN_PROGRESS: 'info', COMPLETED: 'success', CANCELLED: 'error', NO_SHOW: 'error', OPEN: 'warning' };
const statusLabel: Record<string, string> = { ASSIGNED: 'Booked', CONFIRMED: 'Confirmed', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled', NO_SHOW: 'No show' };
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const hhmm = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const fullAddress = (s: Shift): string => {
  const a = s.site && (s.site.addressLine1 || s.site.postcode) ? s.site : s.job.client;
  return [a.name, a.addressLine1, a.city, a.postcode].filter(Boolean).join(', ') || 'Address to be confirmed';
};
const mapsUrl = (addr: string) => `https://maps.google.com/?q=${encodeURIComponent(addr)}`;

export default function BookingsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  const load = () => apiFetch<{ shifts: Shift[] }>('/me').then((me) => setShifts(me.shifts ?? [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function act(id: string, action: 'acknowledge' | 'check-in' | 'check-out' | 'report-late') {
    setBusy(id + action);
    try { await apiFetch(`/me/shifts/${id}/${action}`, { method: 'POST' }); await load(); }
    catch (e: any) { alert(e.message); } finally { setBusy(null); }
  }

  if (loading) return <p className="mut">Loading…</p>;
  if (shifts.length === 0) return <Card><p className="mut" style={{ padding: 8 }}>You have no bookings yet. Accept a shift offer from your dashboard to get started.</p></Card>;

  const now = Date.now();
  const upcoming = shifts.filter((s) => new Date(s.startAt).getTime() >= now && s.status !== 'CANCELLED');
  const past = shifts.filter((s) => new Date(s.startAt).getTime() < now || s.status === 'CANCELLED');
  const list = tab === 'upcoming' ? upcoming : past;
  const segBtn = (t: 'upcoming' | 'past'): React.CSSProperties => ({
    flex: 1, padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 700,
    background: tab === t ? 'var(--surface-card)' : 'transparent', color: tab === t ? 'var(--text-primary)' : 'var(--text-secondary)',
    boxShadow: tab === t ? '0 1px 3px rgba(11,31,58,.08)' : 'none',
  });

  return (
    <>
      <div style={{ display: 'inline-flex', gap: 4, background: 'var(--surface-sunken)', padding: 4, borderRadius: 10, marginBottom: 16 }}>
        <button onClick={() => setTab('upcoming')} style={segBtn('upcoming')}>Upcoming ({upcoming.length})</button>
        <button onClick={() => setTab('past')} style={segBtn('past')}>Past ({past.length})</button>
      </div>

      {list.length === 0 ? (
        <Card><p className="mut" style={{ padding: 8 }}>{tab === 'upcoming' ? 'No upcoming shifts booked.' : 'No past shifts yet.'}</p></Card>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
      {list.map((s) => {
        const d = new Date(s.startAt);
        return (
          <div key={s.id} className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="fx jb ac">
              <div className="fx ac" style={{ gap: 12 }}>
                <div style={{ width: 52, height: 52, borderRadius: 'var(--radius-md)', background: 'var(--orange-100)', color: 'var(--orange-600)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <b style={{ fontSize: 19, lineHeight: 1 }}>{d.getDate()}</b>
                  <span style={{ fontSize: 10, fontWeight: 700 }}>{MONTHS[d.getMonth()]}</span>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{s.job.title}</div>
                  <div className="mut" style={{ fontSize: 13 }}>{s.job.client.name}{s.site?.city ? ` · ${s.site.city}` : ''}</div>
                </div>
              </div>
              <Badge tone={(tone[s.status] ?? 'neutral') as any}>{statusLabel[s.status] ?? s.status}</Badge>
            </div>
            <div className="shmeta" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0, gap: 20 }}>
              <span className="fx ac mut" style={{ gap: 5, fontSize: 12.5 }}><Ic.Calendar width={15} /> {d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span className="fx ac mut" style={{ gap: 5, fontSize: 12.5 }}><Ic.Clock width={15} /> {hhmm(s.startAt)}–{hhmm(s.endAt)}</span>
              <span className="fx ac mut" style={{ gap: 5, fontSize: 12.5 }}><Ic.PoundSterling width={15} /> £{Number(s.payRate).toFixed(2)}/hr</span>
            </div>

            {/* Where & what the worker needs to know */}
            <div style={{ background: 'var(--surface-sunken, #f4f6fa)', borderRadius: 'var(--radius-md)', padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div className="fx" style={{ gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 15, marginTop: 1, flexShrink: 0 }}>📍</span>
                <div>
                  <div style={{ fontWeight: 600 }}>{fullAddress(s)}</div>
                  <a href={mapsUrl(fullAddress(s))} target="_blank" rel="noreferrer" className="link" style={{ fontSize: 12 }}>Open in maps →</a>
                </div>
              </div>
              {s.job.reportingContact && <Detail k="Report to" v={s.job.reportingContact} />}
              {s.job.reportingInstructions && <Detail k="On arrival" v={s.job.reportingInstructions} />}
              {s.job.siteInstructions && <Detail k="Site info" v={s.job.siteInstructions} />}
              {s.job.ppe && <Detail k="PPE" v={s.job.ppe} />}
              {s.job.uniform && <Detail k="Uniform" v={s.job.uniform} />}
              {(s.job.breakInfo || s.breakMinutes) && <Detail k="Breaks" v={s.job.breakInfo ?? `${s.breakMinutes} min`} />}
            </div>
            {(s.status === 'ASSIGNED' || s.status === 'CONFIRMED' || s.status === 'IN_PROGRESS') && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {s.status === 'ASSIGNED' && <button className="btn-primary" disabled={!!busy} onClick={() => act(s.id, 'acknowledge')}>Confirm I&apos;ll attend</button>}
                {s.status === 'CONFIRMED' && <button className="btn-primary" disabled={!!busy} onClick={() => act(s.id, 'check-in')}>Check in</button>}
                {s.status === 'IN_PROGRESS' && <button className="btn-primary" disabled={!!busy} onClick={() => act(s.id, 'check-out')}>Check out</button>}
                {(s.status === 'ASSIGNED' || s.status === 'CONFIRMED') && <button className="btn-outline" disabled={!!busy} onClick={() => act(s.id, 'report-late')}>Running late</button>}
              </div>
            )}
          </div>
        );
      })}
      </div>
      )}
    </>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div className="fx" style={{ gap: 8, alignItems: 'flex-start' }}>
      <span className="mut" style={{ minWidth: 66, fontSize: 12.5 }}>{k}</span>
      <span style={{ flex: 1 }}>{v}</span>
    </div>
  );
}
