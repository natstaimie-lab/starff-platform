'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, ComplianceBadge } from '@/components/ui';
import { complianceChecks } from '@/lib/compliance';

type Doc = { type: string; status: string };
type Shift = { id: string; startAt: string; endAt: string; status: string; payRate: string; job: { title: string; client: { name: string } }; site?: { name: string; city?: string } };
type TS = { id: string; status: string; hoursWorked?: string; shift: { startAt: string; job: { title: string; client: { name: string } } } };
type Me = { firstName: string; lastName: string; status: string; documents: Doc[]; availability: { dayOfWeek: number }[]; shifts: Shift[]; timesheets: TS[] };
type Offer = { id: string; status: string; job: { title: string; startDate: string | null; location: string | null; payRate: string | number } };

const DAYNAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hhmm = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayLabel = (d: string) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export default function Dashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);

  const load = () => {
    apiFetch<Me>('/me').then(setMe).catch(() => {});
    // Shift offers = jobs Starff has offered this worker, awaiting their response.
    apiFetch<Offer[]>('/me/invitations')
      .then((all) => setOffers(all.filter((o) => o.status === 'INVITED')))
      .catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const { checks, done: compliantN, total: checksTotal, pct: compliancePct, cleared } = complianceChecks(me?.status, me?.documents ?? []);

  // week strip: today + next 6 days
  const availSet = new Set((me?.availability ?? []).map((a) => a.dayOfWeek));
  // Fixed Mon→Sun strip so it mirrors the Availability editor exactly (same
  // days highlighted, same order) — 0=Sun in the data, ordered Mon-first here.
  const week = [1, 2, 3, 4, 5, 6, 0].map((dn) => ({ dn: DAYNAMES[dn], on: availSet.has(dn) }));

  const now = Date.now();
  const nextShift = (me?.shifts ?? [])
    .filter((s) => new Date(s.startAt).getTime() >= now && ['ASSIGNED', 'CONFIRMED', 'IN_PROGRESS'].includes(s.status))
    .sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt))[0];

  const thisWeekTs = (me?.timesheets ?? []).slice(0, 4);

  return (
    <>
      {!cleared && compliancePct < 100 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 'var(--radius-lg)', background: 'var(--warning-100)', border: '1px solid #f6dd9e' }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--warning-600)' }}>Complete your compliance checks</div>
            <div className="mut" style={{ fontSize: 13 }}>Upload your documents so you can start receiving shift offers without interruption.</div>
          </div>
          <Link href="/dashboard/documents" className="btn-outline" style={{ marginLeft: 'auto', textDecoration: 'none' }}>Upload documents</Link>
        </div>
      )}

      <div className="g3">
        <Card title="Compliance Status">
          <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-sunken)', marginBottom: 4 }}>
            <div style={{ height: 8, width: `${compliancePct}%`, borderRadius: 999, background: cleared || compliancePct === 100 ? 'var(--success-500)' : 'var(--orange-500)' }} />
          </div>
          <div className="mut" style={{ fontSize: 12.5, marginBottom: 10 }}>{cleared ? 'Cleared to work by Starff' : `${compliantN} of ${checksTotal} checks complete`}</div>
          {checks.map((c) => (
            <div key={c.label} className="crow"><span className="clabel">{c.label}</span><ComplianceBadge status={c.status} /></div>
          ))}
        </Card>

        <Card title="My Availability" action={<Link href="/dashboard/availability" className="link">Edit</Link>}>
          <div className="week">
            {week.map((d, i) => (
              <div key={i} className={`day ${d.on ? 'on' : ''}`}><div className="dn">{d.dn}</div><div className="dd">{d.on ? '✓' : '—'}</div></div>
            ))}
          </div>
          <div className="mt16 fs13 mut">You&apos;re available {availSet.size} day{availSet.size === 1 ? '' : 's'} a week. Keep this up to date so Starff offers you matching shifts.</div>
        </Card>

        <Card title="Next Shift">
          {nextShift ? (
            <>
              <div className="shiftbox">
                <div className="shl">{dayLabel(nextShift.startAt)}</div>
                <div className="shr">{nextShift.job.title}</div>
                <div className="shd">{nextShift.job.client.name}{nextShift.site?.city ? ` · ${nextShift.site.city}` : ''}</div>
                <div className="shmeta">
                  <div><div className="shk">Shift</div><div className="shv">{hhmm(nextShift.startAt)} - {hhmm(nextShift.endAt)}</div></div>
                  <div><div className="shk">Rate</div><div className="shv">£{Number(nextShift.payRate).toFixed(2)} / hr</div></div>
                </div>
              </div>
              <Link href="/dashboard/bookings" className="btn-outline" style={{ marginTop: 12, width: '100%', textDecoration: 'none' }}>View Booking Details</Link>
            </>
          ) : (
            <p className="mut" style={{ fontSize: 13.5 }}>No upcoming shifts yet. Respond to a shift offer and Starff will confirm your booking.</p>
          )}
        </Card>
      </div>

      <div className="g3">
        <Card title="Shift Offers" action={<Link href="/dashboard/offers" className="link">View all</Link>}>
          {offers.length === 0 ? (
            <p className="mut" style={{ fontSize: 13.5 }}>No shift offers right now. We&apos;ll notify you when Starff offers you a shift.</p>
          ) : (
            <div className="fx col gap12">
              {offers.map((o) => (
                <div key={o.id} className="offer">
                  <div className="fx ac jb">
                    <span className="orole">{o.job.title}</span>
                    <span className="badge badge-warning">Respond</span>
                  </div>
                  <div className="ometa">
                    <span>{o.job.location ?? 'Location TBC'}</span>
                    <span>{o.job.startDate ? dayLabel(o.job.startDate) : 'Date TBC'}</span>
                    <span className="orate">£{Number(o.job.payRate).toFixed(2)} / hr</span>
                  </div>
                  <div className="fx gap8">
                    <Link href="/dashboard/offers" className="btn-primary" style={{ flex: 1, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>View &amp; respond</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="This Week's Timesheet">
          {thisWeekTs.length === 0 ? (
            <p className="mut" style={{ fontSize: 13.5 }}>No hours logged yet. Your timesheet fills in as you complete shifts.</p>
          ) : (
            <>
              {thisWeekTs.map((t) => (
                <div key={t.id} className="tsline">
                  <span className="mut">{dayLabel(t.shift.startAt)}</span>
                  <span>{t.shift.job.client.name}</span>
                  <span className="tsv">{t.hoursWorked ?? '—'}</span>
                </div>
              ))}
              <Link href="/dashboard/timesheets" className="btn-primary" style={{ marginTop: 12, width: '100%', textDecoration: 'none' }}>View Timesheets</Link>
            </>
          )}
        </Card>

        <Card title="Payments" action={<Link href="/dashboard/payments" className="link">History</Link>}>
          <div className="shiftbox">
            <div className="shl">Next pay</div>
            <div className="shr" style={{ fontFamily: 'var(--font-mono)' }}>£0.00</div>
            <div className="shd">Payments appear here once your timesheets are approved.</div>
          </div>
        </Card>
      </div>
    </>
  );
}
