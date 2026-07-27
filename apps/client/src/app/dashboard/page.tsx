'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, KPIStat, Badge, Avatar, DataTable, type Column } from '@/components/ui';
import * as Ic from '@/components/icons';

type Overview = { activeBookings: number; workersOnSiteToday: number; timesheetsPending: number; spendMtd: number };
type Job = { id: string; title: string; status: string; site?: string; filled: number; total: number; reviewNote?: string | null };
type Sub = { id: string; status: string };
type TS = { id: string; hoursWorked?: string; candidate: { firstName: string; lastName: string }; shift: { startAt: string; job: { title: string } } };
type Inv = { id: string; number: string; total: string; status: string; periodEnd: string };
type Loc = { id: string; name: string; address: string; workers: number };

const jobTone: Record<string, string> = { FILLED: 'success', OPEN: 'warning', DRAFT: 'neutral', CLOSED: 'neutral', CANCELLED: 'error' };
const jobLabel: Record<string, string> = { FILLED: 'Confirmed', OPEN: 'Pending', DRAFT: 'Draft', CLOSED: 'Closed', CANCELLED: 'Cancelled' };
const invTone: Record<string, string> = { PAID: 'success', SENT: 'info', OVERDUE: 'error', DRAFT: 'neutral', VOID: 'neutral' };
const gbp = (v: string | number) => '£' + Number(v).toLocaleString();
const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export default function ClientDashboard() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [ts, setTs] = useState<TS[]>([]);
  const [invs, setInvs] = useState<Inv[]>([]);
  const [locs, setLocs] = useState<Loc[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    apiFetch<Overview>('/client/overview').then(setOv).catch(() => {});
    apiFetch<Job[]>('/client/jobs').then(setJobs).catch(() => {});
    apiFetch<Sub[]>('/client/submissions').then(setSubs).catch(() => {});
    apiFetch<TS[]>('/client/timesheets').then((t) => setTs(t.slice(0, 4))).catch(() => {});
    apiFetch<Inv[]>('/client/invoices').then((i) => setInvs(i.slice(0, 4))).catch(() => {});
    apiFetch<Loc[]>('/client/locations').then(setLocs).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  // ── Needs attention: things this client should act on now ──
  const plural = (n: number) => (n === 1 ? '' : 's');
  const toReview = subs.filter((s) => s.status === 'SUBMITTED_TO_CLIENT').length;
  const needInfo = jobs.filter((j) => j.status === 'UNDER_REVIEW').length;
  const toApprove = ov?.timesheetsPending ?? 0;
  const attention: { icon: string; text: string; href: string; action: string; urgent?: boolean }[] = [];
  if (toReview) attention.push({ icon: '👥', text: `${toReview} candidate${plural(toReview)} ready for you to review`, href: '/dashboard/submissions', action: 'Review', urgent: true });
  if (needInfo) attention.push({ icon: '💬', text: `${needInfo} request${plural(needInfo)} need more information`, href: '/dashboard/bookings', action: 'Respond' });
  if (toApprove) attention.push({ icon: '⏱️', text: `${toApprove} timesheet${plural(toApprove)} awaiting your approval`, href: '/dashboard/timesheets', action: 'Approve' });

  async function approve(id: string) {
    setBusy(id);
    try { await apiFetch(`/client/timesheets/${id}/approve`, { method: 'PATCH' }); load(); }
    finally { setBusy(null); }
  }

  const kpis = [
    { label: 'Active Bookings', value: String(ov?.activeBookings ?? '—'), icon: <Ic.Calendar width={22} />, tone: 'accent' as const },
    { label: 'Workers On Site Today', value: String(ov?.workersOnSiteToday ?? '—'), icon: <Ic.HardHat width={22} />, tone: 'info' as const },
    { label: 'Timesheets Pending', value: String(ov?.timesheetsPending ?? '—'), icon: <Ic.Clock width={22} />, tone: 'info' as const },
    { label: 'Spend (MTD)', value: ov ? gbp(ov.spendMtd) : '—', icon: <Ic.PoundSterling width={22} />, tone: 'success' as const },
  ];

  const bookCols: Column<Job>[] = [
    { key: 'role', header: 'Role', render: (r) => <span className="nm">{r.title}</span> },
    { key: 'site', header: 'Location', render: (r) => <span className="dim">{r.site ?? '—'}</span> },
    { key: 'filled', header: 'Filled', align: 'right', render: (r) => <span className="mono">{r.filled}/{r.total}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={(jobTone[r.status] ?? 'neutral') as any}>{jobLabel[r.status] ?? r.status}</Badge> },
  ];

  return (
    <>
      {attention.length > 0 && (
        <div className="card card-pad" style={{ borderLeft: '3px solid var(--orange-500)' }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Needs your attention</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {attention.map((a, i) => (
              <div key={i} className="fx ac" style={{ gap: 10, justifyContent: 'space-between' }}>
                <span className="fx ac" style={{ gap: 9, fontSize: 13.5 }}><span style={{ fontSize: 16 }}>{a.icon}</span>{a.text}</span>
                <Link href={a.href} className={a.urgent ? 'btn-primary' : 'btn-outline'} style={{ textDecoration: 'none', height: 30, display: 'inline-flex', alignItems: 'center', padding: '0 12px', fontSize: 12.5, whiteSpace: 'nowrap' }}>{a.action}</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="g4">
        {kpis.map((k) => <KPIStat key={k.label} label={k.label} value={k.value} icon={k.icon} tone={k.tone} />)}
      </div>

      <div className="gmid">
        <Card title="Active Bookings" action={<Link href="/dashboard/bookings" className="link">View all</Link>}>
          {jobs.length ? <DataTable columns={bookCols} rows={jobs.slice(0, 5)} /> : <p className="mut" style={{ fontSize: 13.5 }}>No bookings yet. Use “Book Staff” to raise your first request.</p>}
        </Card>

        <Card title="Timesheets to Approve" subtitle={`${ts.length} awaiting your approval`} action={<Link href="/dashboard/timesheets" className="link">View all</Link>}>
          {ts.length === 0 ? <p className="mut" style={{ fontSize: 13.5 }}>Nothing to approve right now.</p> : ts.map((t) => (
            <div key={t.id} className="tsrow">
              <Avatar name={`${t.candidate.firstName} ${t.candidate.lastName}`} size={34} />
              <div className="f1">
                <div className="tsnm">{t.candidate.firstName} {t.candidate.lastName}</div>
                <div className="tsdt">{t.shift.job.title} · {fmt(t.shift.startAt)}</div>
              </div>
              <span className="tshr">{t.hoursWorked ?? '—'} hrs</span>
              <button className="btn-outline" style={{ height: 32 }} disabled={busy === t.id} onClick={() => approve(t.id)}>{busy === t.id ? '…' : 'Approve'}</button>
            </div>
          ))}
        </Card>
      </div>

      <div className="gbot">
        <Card title="Recent Invoices" action={<Link href="/dashboard/invoices" className="link">View all</Link>}>
          {invs.length === 0 ? <p className="mut" style={{ fontSize: 13.5 }}>No invoices yet.</p> : invs.map((i) => (
            <div key={i.id} className="invrow">
              <div className="f1"><div className="invno">{i.number}</div><div className="invdt">{fmt(i.periodEnd)}</div></div>
              <span className="invamt">{gbp(i.total)}</span>
              <Badge tone={(invTone[i.status] ?? 'neutral') as any}>{i.status}</Badge>
            </div>
          ))}
        </Card>

        <Card title="Messages" subtitle="Your Starff consultant">
          <div className="msg">
            <Avatar name="Tom Bailey" size={34} />
            <div className="f1">
              <div className="fx ac jb"><span className="msgn">Tom Bailey</span><span className="fs11 mut">09:42</span></div>
              <div className="msgt">Morning — your bookings for this week are confirmed. Let me know if you need extra cover.</div>
            </div>
          </div>
          <p className="mut" style={{ fontSize: 12, marginTop: 10 }}>Live messaging is coming soon.</p>
        </Card>

        <Card title="Company Locations" action={<Link href="/dashboard/locations" className="link">Manage</Link>}>
          {locs.length === 0 ? <p className="mut" style={{ fontSize: 13.5 }}>No sites on file.</p> : locs.map((l) => (
            <div key={l.id} className="locrow">
              <span className="locic"><Ic.MapPin width={18} /></span>
              <div className="f1"><div className="locnm">{l.name}</div><div className="locad">{l.address || '—'}</div></div>
              <span className="fs12 mut nowrap">{l.workers} on site</span>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
