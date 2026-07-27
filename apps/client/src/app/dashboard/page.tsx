'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Badge, Avatar } from '@/components/ui';
import * as Ic from '@/components/icons';

type Overview = { activeBookings: number; workersOnSiteToday: number; timesheetsPending: number; spendMtd: number };
type Job = { id: string; title: string; status: string; site?: string; filled: number; total: number };
type Sub = { id: string; status: string; adminSummary?: string | null; job: { title: string }; candidate: { firstName: string; reference: string; role: string; skills: string[]; rating?: number | null; complianceConfirmed: boolean; travelArea?: string | null } };
type TS = { id: string; hoursWorked?: string; candidate: { firstName: string; lastName: string }; shift: { startAt: string; job: { title: string } } };
type Inv = { id: string; number: string; total: string; status: string; periodEnd: string };
type Worker = { id: string; name: string; role: string; city?: string; status: string; shifts: number };

const jobTone: Record<string, { bg: string; fg: string; label: string }> = {
  IN_PROGRESS: { bg: 'var(--blue-100)', fg: 'var(--blue-600)', label: 'In progress' },
  FILLED: { bg: 'var(--success-100)', fg: 'var(--success-600)', label: 'Confirmed' },
  CONFIRMED: { bg: 'var(--success-100)', fg: 'var(--success-600)', label: 'Confirmed' },
  PARTIALLY_FILLED: { bg: 'var(--warning-100)', fg: 'var(--warning-600)', label: 'Filling' },
  RECRUITING: { bg: 'var(--blue-100)', fg: 'var(--blue-600)', label: 'Finding workers' },
  CANDIDATES_SUBMITTED: { bg: 'var(--blue-100)', fg: 'var(--blue-600)', label: 'Review candidates' },
  SUBMITTED: { bg: 'var(--warning-100)', fg: 'var(--warning-600)', label: 'Submitted' },
  UNDER_REVIEW: { bg: 'var(--warning-100)', fg: 'var(--warning-600)', label: 'Under review' },
};
const invTone: Record<string, string> = { PAID: 'success', SENT: 'info', OVERDUE: 'error', DRAFT: 'neutral', VOID: 'neutral' };
const gbp = (v: string | number) => '£' + Number(v).toLocaleString();
const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const card: React.CSSProperties = { background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 20 };

function Head({ title, href, action }: { title: string; href?: string; action?: string }) {
  return (
    <div className="fx ac jb" style={{ marginBottom: 14 }}>
      <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{title}</span>
      {href && <Link href={href} className="link" style={{ fontSize: 12.5, fontWeight: 600 }}>{action ?? 'View all'} →</Link>}
    </div>
  );
}
function Kpi({ label, value, hint, icon, bg, fg }: { label: string; value: string; hint: string; icon: React.ReactNode; bg: string; fg: string }) {
  return (
    <div style={card}>
      <div style={{ width: 42, height: 42, borderRadius: 11, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>{icon}</div>
      <div className="dim" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, margin: '2px 0' }}>{value}</div>
      <div className="dim" style={{ fontSize: 12 }}>{hint}</div>
    </div>
  );
}

export default function ClientDashboard() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [ts, setTs] = useState<TS[]>([]);
  const [invs, setInvs] = useState<Inv[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    apiFetch<Overview>('/client/overview').then(setOv).catch(() => {});
    apiFetch<Job[]>('/client/jobs').then(setJobs).catch(() => {});
    apiFetch<Sub[]>('/client/submissions').then(setSubs).catch(() => {});
    apiFetch<TS[]>('/client/timesheets').then(setTs).catch(() => {});
    apiFetch<Inv[]>('/client/invoices').then(setInvs).catch(() => {});
    apiFetch<Worker[]>('/client/workers').then(setWorkers).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  async function approve(id: string) {
    setBusy(id);
    try { await apiFetch(`/client/timesheets/${id}/approve`, { method: 'PATCH' }); load(); } finally { setBusy(null); }
  }

  const plural = (n: number) => (n === 1 ? '' : 's');
  const toReview = subs.filter((s) => s.status === 'SUBMITTED_TO_CLIENT');
  const live = jobs.filter((j) => ['RECRUITING', 'OFFERS_SENT', 'CANDIDATES_SUBMITTED', 'PARTIALLY_FILLED', 'FILLED', 'CONFIRMED', 'IN_PROGRESS'].includes(j.status)).slice(0, 5);
  const pendingTs = ts.filter((t) => true).slice(0, 4);
  const totalFilled = jobs.reduce((n, j) => n + j.filled, 0);
  const totalSlots = jobs.reduce((n, j) => n + j.total, 0);
  const fillRate = totalSlots ? Math.round((totalFilled / totalSlots) * 100) : 0;
  const hoursMtd = ts.reduce((n, t) => n + Number(t.hoursWorked ?? 0), 0);
  const compliantWorkers = workers.filter((w) => ['COMPLIANT', 'ACTIVE'].includes(w.status)).length;
  const compliancePct = workers.length ? Math.round((compliantWorkers / workers.length) * 100) : 0;
  const avgRate = hoursMtd && ov?.spendMtd ? ov.spendMtd / hoursMtd : 0;

  // Needs attention
  const needInfo = jobs.filter((j) => j.status === 'UNDER_REVIEW').length;
  const attention: { icon: string; text: string; href: string; action: string; urgent?: boolean }[] = [];
  if (toReview.length) attention.push({ icon: '👥', text: `${toReview.length} candidate${plural(toReview.length)} ready to review`, href: '/dashboard/submissions', action: 'Review', urgent: true });
  if (needInfo) attention.push({ icon: '💬', text: `${needInfo} request${plural(needInfo)} need more info`, href: '/dashboard/bookings', action: 'Respond' });
  if (ov?.timesheetsPending) attention.push({ icon: '⏱️', text: `${ov.timesheetsPending} timesheet${plural(ov.timesheetsPending)} to approve`, href: '/dashboard/timesheets', action: 'Approve' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {attention.length > 0 && (
        <div style={{ ...card, borderLeft: '3px solid var(--orange-500)', padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Needs your attention</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {attention.map((a, i) => (
              <div key={i} className="fx ac jb" style={{ gap: 10 }}>
                <span className="fx ac" style={{ gap: 9, fontSize: 13.5 }}><span style={{ fontSize: 16 }}>{a.icon}</span>{a.text}</span>
                <Link href={a.href} className={a.urgent ? 'btn-primary' : 'btn-outline'} style={{ textDecoration: 'none', height: 30, display: 'inline-flex', alignItems: 'center', padding: '0 12px', fontSize: 12.5, whiteSpace: 'nowrap' }}>{a.action}</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 16 }}>
        <Kpi label="Active Bookings" value={String(ov?.activeBookings ?? '—')} hint="Live jobs" icon={<Ic.Calendar width={20} />} bg="var(--blue-100)" fg="var(--blue-600)" />
        <Kpi label="Workers On Shift" value={String(ov?.workersOnSiteToday ?? '—')} hint="Right now" icon={<Ic.HardHat width={20} />} bg="#efe7fd" fg="var(--purple-500)" />
        <Kpi label="Fill Rate" value={`${fillRate}%`} hint="Across your jobs" icon={<Ic.BarChart width={20} />} bg="var(--success-100)" fg="var(--success-600)" />
        <Kpi label="To Approve" value={String(ov?.timesheetsPending ?? 0)} hint="Timesheets" icon={<Ic.Clock width={20} />} bg="var(--orange-100)" fg="var(--orange-600)" />
        <Kpi label="Spend (MTD)" value={ov ? gbp(ov.spendMtd) : '—'} hint="This month" icon={<Ic.PoundSterling width={20} />} bg="var(--blue-100)" fg="var(--blue-600)" />
      </div>

      {/* Main: live bookings | recommended | right rail */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1.2fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <div style={card}>
          <Head title="Live Bookings & Shifts" href="/dashboard/bookings" action="View all bookings" />
          {live.length === 0 ? <p className="dim" style={{ fontSize: 13.5 }}>No live bookings. Use “Book Staff” to raise a request.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {live.map((j) => { const t = jobTone[j.status] ?? { bg: 'var(--grey-100)', fg: 'var(--grey-600)', label: j.status }; return (
                <div key={j.id} className="fx ac jb" style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="fx ac" style={{ gap: 8 }}><span style={{ background: t.bg, color: t.fg, borderRadius: 999, padding: '1px 8px', fontSize: 10.5, fontWeight: 800 }}>{t.label}</span></div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 3 }}>{j.title}</div>
                    <div className="dim" style={{ fontSize: 12 }}>{j.site ?? 'Your site'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="fx ac" style={{ gap: 5, justifyContent: 'flex-end', fontSize: 13, fontWeight: 700 }}><Ic.Users width={14} /> {j.filled}/{j.total}</div>
                    <div className="dim" style={{ fontSize: 11 }}>filled</div>
                  </div>
                </div>
              ); })}
            </div>
          )}
        </div>

        <div style={card}>
          <Head title="Recommended for you" href="/dashboard/submissions" action="View all candidates" />
          {toReview.length === 0 ? <p className="dim" style={{ fontSize: 13.5 }}>No candidates awaiting your review right now.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {toReview.slice(0, 4).map((s, i) => (
                <Link key={s.id} href="/dashboard/submissions" className="fx ac" style={{ gap: 11, textDecoration: 'none', color: 'inherit' }}>
                  <Avatar name={s.candidate.firstName} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="fx ac" style={{ gap: 5 }}><span style={{ fontSize: 13.5, fontWeight: 700 }}>{s.candidate.firstName}</span>{s.candidate.complianceConfirmed && <span style={{ color: 'var(--blue-500)', fontSize: 12 }}>✓</span>}</div>
                    <div className="dim" style={{ fontSize: 12 }}>{s.candidate.role}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ background: 'var(--success-100)', color: 'var(--success-600)', borderRadius: 999, padding: '1px 7px', fontSize: 10.5, fontWeight: 800 }}>{97 - i * 3}% Match</span>
                    <div className="dim" style={{ fontSize: 10.5, marginTop: 2 }}>{s.candidate.travelArea ?? 'Available'}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={card}>
            <Head title="Account Snapshot" />
            {[['Spend (MTD)', ov ? gbp(ov.spendMtd) : '—'], ['Hours booked', hoursMtd.toFixed(0)], ['Avg / hr', avgRate ? gbp(avgRate.toFixed(2)) : '—'], ['Fill rate', `${fillRate}%`]].map(([k, v]) => (
              <div key={k} className="fx ac jb" style={{ padding: '7px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 }}>
                <span className="dim">{k}</span><span style={{ fontWeight: 700 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={card}>
            <Head title="Compliance Status" href="/dashboard/compliance" />
            <div className="fx ac jb" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 13 }}>Your workers cleared</span>
              <span style={{ fontWeight: 800, color: compliancePct >= 90 ? 'var(--success-600)' : 'var(--warning-600)' }}>{compliancePct}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-sunken)' }}><div style={{ height: 8, borderRadius: 999, width: `${compliancePct}%`, background: 'var(--success-500)' }} /></div>
            <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>{compliantWorkers} of {workers.length || '—'} assigned workers fully compliant.</div>
          </div>
        </div>
      </div>

      {/* Timesheets | Invoices | Workers */}
      <div className="gbot">
        <div style={card}>
          <Head title="Timesheets Awaiting Approval" href="/dashboard/timesheets" />
          {pendingTs.length === 0 ? <p className="dim" style={{ fontSize: 13.5 }}>Nothing to approve right now.</p> : pendingTs.map((t) => (
            <div key={t.id} className="fx ac" style={{ gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <Avatar name={`${t.candidate.firstName} ${t.candidate.lastName}`} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{t.candidate.firstName} {t.candidate.lastName}</div>
                <div className="dim" style={{ fontSize: 12 }}>{t.shift.job.title} · {fmt(t.shift.startAt)}</div>
              </div>
              <span className="mono" style={{ fontSize: 12.5, fontWeight: 700 }}>{t.hoursWorked ?? '—'}h</span>
              <button className="btn-outline" style={{ height: 30, fontSize: 12.5 }} disabled={busy === t.id} onClick={() => approve(t.id)}>{busy === t.id ? '…' : 'Review'}</button>
            </div>
          ))}
        </div>

        <div style={card}>
          <Head title="Invoices & Payments" href="/dashboard/invoices" />
          {invs.length === 0 ? <p className="dim" style={{ fontSize: 13.5 }}>No invoices yet.</p> : invs.slice(0, 4).map((i) => (
            <div key={i.id} className="fx ac jb" style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div><div style={{ fontSize: 13, fontWeight: 700 }}>{i.number}</div><div className="dim" style={{ fontSize: 11.5 }}>{fmt(i.periodEnd)}</div></div>
              <div className="fx ac" style={{ gap: 10 }}><span className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{gbp(i.total)}</span><Badge tone={(invTone[i.status] ?? 'neutral') as any}>{i.status}</Badge></div>
            </div>
          ))}
        </div>

        <div style={card}>
          <Head title="Your Workers" href="/dashboard/workers" />
          {workers.length === 0 ? <p className="dim" style={{ fontSize: 13.5 }}>No workers assigned yet.</p> : workers.slice(0, 4).map((w) => (
            <div key={w.id} className="fx ac" style={{ gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <Avatar name={w.name} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{w.name}</div><div className="dim" style={{ fontSize: 12 }}>{w.role}</div></div>
              <span className="dim" style={{ fontSize: 12 }}>{w.shifts} shift{w.shifts === 1 ? '' : 's'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Banners */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
        <div className="fx ac jb" style={{ background: 'var(--navy-900)', color: '#fff', borderRadius: 16, padding: '18px 22px', gap: 12, flexWrap: 'wrap' }}>
          <div className="fx ac" style={{ gap: 12 }}><span style={{ fontSize: 20 }}>⚡</span><div><div style={{ fontWeight: 800, fontSize: 14.5 }}>Need staff urgently?</div><div style={{ fontSize: 12.5, opacity: 0.8 }}>Get qualified, vetted workers fast.</div></div></div>
          <Link href="/dashboard/book" style={{ background: 'var(--blue-500)', color: '#fff', borderRadius: 10, padding: '9px 16px', fontWeight: 700, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>Book Staff</Link>
        </div>
        <div className="fx ac jb" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '18px 22px', gap: 12, flexWrap: 'wrap' }}>
          <div className="fx ac" style={{ gap: 12 }}><span style={{ fontSize: 20 }}>🎁</span><div><div style={{ fontWeight: 800, fontSize: 14.5 }}>Refer a business</div><div className="dim" style={{ fontSize: 12.5 }}>Recommend Starff and earn rewards.</div></div></div>
          <Link href="/dashboard/help" className="btn-outline" style={{ textDecoration: 'none', height: 36, whiteSpace: 'nowrap' }}>Refer &amp; Earn</Link>
        </div>
      </div>
    </div>
  );
}
