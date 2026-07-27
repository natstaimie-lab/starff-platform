'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, KPIStat, Badge, ComplianceBadge, Avatar, DataTable, type Column } from '@/components/ui';
import { AreaChart, DonutChart } from '@/components/charts';
import * as Ic from '@/components/icons';

// Colours for the (live) Overview trend series, in the order the API returns them.
const SERIES_COLORS = ['#8b5cf6', 'var(--blue-500)', 'var(--orange-500)', 'var(--success-500)'];
type Stats ={ candidates: number; workers: number; clients: number; bookings: number; timesheets: number; revenue: number; pendingTimesheets: number; newEnquiries: number; complianceAttention: number };
type Compliance = { compliant: number; active: number; screening: number; awaiting: number; inactive: number; rejected: number; total: number; clearedPct: number };
type Trends = { labels: string[]; series: { name: string; data: number[] }[] };
type Cand = { id: string; firstName: string; lastName: string; status: string; headline?: string };
type Job = { id: string; title: string; status: string; client: { name: string } };
type WF = {
  counts: { awaitingApproval: number; responsesToReview: number; readyToSubmit: number; awaitingClient: number; clientAccepted: number; alternativesRequested: number; placements: number; recruiting: number; toRefill: number; upcomingShifts: number; reliabilityConcerns: number };
  awaitingApprovalJobs: { id: string; title: string; openings: number; status: string; submittedAt?: string | null; client: { name: string } }[];
  readyToBook: { id: string; candidate: { firstName: string; lastName: string }; job: { id: string; title: string; client: { name: string } } }[];
  upcomingShifts: { id: string; startAt: string; status: string; candidate: { firstName: string; lastName: string }; job: { id: string; title: string; client: { name: string } } }[];
  reliabilityConcerns: { candidateId: string; name: string; points: number; level: string }[];
};
type Alert = { type: string; severity: 'high' | 'medium' | 'low'; message: string; candidateId: string | null; shiftId: string | null; jobId: string | null; occurredAt: string };

const money = (n: number) => '£' + n.toLocaleString();
const num = (n?: number) => (n === undefined ? '—' : n.toLocaleString());

const jobTone: Record<string, string> = { FILLED: 'success', OPEN: 'warning', DRAFT: 'neutral', CLOSED: 'neutral', CANCELLED: 'error' };
const jobLabel: Record<string, string> = { FILLED: 'Confirmed', OPEN: 'Open', DRAFT: 'Draft', CLOSED: 'Closed', CANCELLED: 'Cancelled' };

export default function DashboardHome() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [cands, setCands] = useState<Cand[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [wf, setWf] = useState<WF | null>(null);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [comp, setComp] = useState<Compliance | null>(null);
  const [trends, setTrends] = useState<Trends | null>(null);

  useEffect(() => {
    apiFetch<Stats>('/stats/overview').then(setStats).catch(() => {});
    apiFetch<Cand[]>('/candidates').then((c) => setCands(c.slice(0, 5))).catch(() => {});
    apiFetch<Job[]>('/jobs').then(setJobs).catch(() => {});
    apiFetch<WF>('/stats/workflow').then(setWf).catch(() => {});
    apiFetch<{ alerts: Alert[] }>('/stats/alerts').then((r) => setAlerts(r.alerts)).catch(() => {});
    apiFetch<Compliance>('/stats/compliance').then(setComp).catch(() => {});
    apiFetch<Trends>('/stats/trends').then(setTrends).catch(() => {});
  }, []);

  // Live compliance breakdown (candidate status) → donut segments.
  const donut = comp ? [
    { label: 'Compliant', value: comp.compliant, color: 'var(--success-500)' },
    { label: 'Active', value: comp.active, color: 'var(--blue-500)' },
    { label: 'In screening', value: comp.screening, color: 'var(--warning-500)' },
    { label: 'Awaiting checks', value: comp.awaiting, color: 'var(--orange-500)' },
    { label: 'Inactive / rejected', value: comp.inactive + comp.rejected, color: 'var(--grey-400)' },
  ].filter((s) => s.value > 0) : [];
  // Live weekly activity → area series (attach colours in API order).
  const areaSeries = trends ? trends.series.map((s, i) => ({ ...s, color: SERIES_COLORS[i % SERIES_COLORS.length] })) : [];

  const recentJobs = jobs.slice(0, 5);

  // ── Needs attention: everything waiting on the admin, newest-action first ──
  const pl = (n: number) => (n === 1 ? '' : 's');
  const attention: { icon: string; text: string; href: string; action: string; urgent?: boolean }[] = [];
  if (wf) {
    const c = wf.counts;
    if (c.awaitingApproval) attention.push({ icon: '📋', text: `${c.awaitingApproval} job request${pl(c.awaitingApproval)} to review`, href: '/dashboard/bookings?status=SUBMITTED,UNDER_REVIEW', action: 'Review', urgent: true });
    if (c.clientAccepted) attention.push({ icon: '✅', text: `${c.clientAccepted} client-accepted candidate${pl(c.clientAccepted)} to confirm`, href: '/dashboard/bookings?status=CANDIDATES_SUBMITTED', action: 'Confirm', urgent: true });
    if (c.readyToSubmit) attention.push({ icon: '📤', text: `${c.readyToSubmit} interested candidate${pl(c.readyToSubmit)} ready to submit to client`, href: '/dashboard/bookings?status=RECRUITING,OFFERS_SENT', action: 'Submit' });
    if (c.alternativesRequested) attention.push({ icon: '🔄', text: `${c.alternativesRequested} alternative${pl(c.alternativesRequested)} requested by clients`, href: '/dashboard/bookings', action: 'Review' });
    if (c.toRefill) attention.push({ icon: '🔁', text: `${c.toRefill} replacement${pl(c.toRefill)} to fill`, href: '/dashboard/bookings', action: 'Fill' });
    if (c.reliabilityConcerns) attention.push({ icon: '⚠️', text: `${c.reliabilityConcerns} worker${pl(c.reliabilityConcerns)} with reliability concerns`, href: '/dashboard/candidates', action: 'Review' });
  }
  if (stats) {
    if (stats.pendingTimesheets) attention.push({ icon: '⏱️', text: `${stats.pendingTimesheets} timesheet${pl(stats.pendingTimesheets)} to approve`, href: '/dashboard/timesheets', action: 'Approve' });
    if (stats.newEnquiries) attention.push({ icon: '📨', text: `${stats.newEnquiries} new website enquir${stats.newEnquiries === 1 ? 'y' : 'ies'}`, href: '/dashboard/enquiries', action: 'View' });
  }
  const ALERT_ICON: Record<string, React.ReactNode> = {
    RUNNING_LATE: <Ic.Clock width={18} />, REPORTED_ABSENT: <Ic.AlertCircle width={18} />,
    NOT_ACKNOWLEDGED: <Ic.User width={18} />, NO_CHECK_IN: <Ic.AlertCircle width={18} />,
    TIMESHEET_OUTSTANDING: <Ic.Clock width={18} />, DOC_EXPIRING: <Ic.FileText width={18} />,
  };

  const kpis = [
    { label: 'Total Candidates', value: num(stats?.candidates), icon: <Ic.Users width={22} />, tone: 'info' as const },
    { label: 'Active Workers', value: num(stats?.workers), icon: <Ic.HardHat width={22} />, tone: 'accent' as const },
    { label: 'Clients', value: num(stats?.clients), icon: <Ic.Building width={22} />, tone: 'info' as const },
    { label: 'Active Bookings', value: num(stats?.bookings), icon: <Ic.Calendar width={22} />, tone: 'success' as const },
    { label: 'Timesheets', value: num(stats?.timesheets), icon: <Ic.Clock width={22} />, tone: 'info' as const },
    { label: 'Revenue (MTD)', value: stats ? money(stats.revenue) : '—', icon: <Ic.PoundSterling width={22} />, tone: 'success' as const },
  ];

  const candCols: Column<Cand>[] = [
    { key: 'name', header: 'Candidate', render: (r) => <div className="namecell"><Avatar name={`${r.firstName} ${r.lastName}`} size={26} /><span className="nm">{r.firstName} {r.lastName}</span></div> },
    { key: 'role', header: 'Role', render: (r) => <span className="dim">{r.headline ?? '—'}</span> },
    { key: 'status', header: 'Status', render: (r) => <ComplianceBadge status={r.status.toLowerCase()} /> },
  ];
  const jobCols: Column<Job>[] = [
    { key: 'client', header: 'Client', render: (r) => <span className="nm">{r.client?.name}</span> },
    { key: 'role', header: 'Role', render: (r) => <span className="dim">{r.title}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={(jobTone[r.status] ?? 'neutral') as any}>{jobLabel[r.status] ?? r.status}</Badge> },
  ];

  // Real insights derived from live stats — each links to where you act on it.
  const insights: { bg: string; fg: string; icon: React.ReactNode; text: string; action: string; href: string }[] = [];
  if (stats) {
    const needsCompliance = Math.max(0, stats.candidates - stats.workers);
    if (needsCompliance > 0) insights.push({ bg: 'var(--warning-100)', fg: 'var(--warning-600)', icon: <Ic.Shield width={16} />, text: `${needsCompliance} candidate${needsCompliance === 1 ? '' : 's'} need compliance checks before they can work.`, action: 'Review compliance', href: '/dashboard/compliance' });
    if (stats.pendingTimesheets > 0) insights.push({ bg: 'var(--info-100)', fg: 'var(--blue-500)', icon: <Ic.Clock width={16} />, text: `${stats.pendingTimesheets} timesheet${stats.pendingTimesheets === 1 ? '' : 's'} awaiting your approval.`, action: 'Approve now', href: '/dashboard/timesheets' });
    if (stats.newEnquiries > 0) insights.push({ bg: 'var(--success-100)', fg: 'var(--success-600)', icon: <Ic.FileText width={16} />, text: `${stats.newEnquiries} new website enquir${stats.newEnquiries === 1 ? 'y' : 'ies'} to follow up.`, action: 'View enquiries', href: '/dashboard/enquiries' });
    if (stats.bookings > 0) insights.push({ bg: 'var(--orange-100)', fg: 'var(--orange-600)', icon: <Ic.Calendar width={16} />, text: `${stats.bookings} active booking${stats.bookings === 1 ? '' : 's'} on your books.`, action: 'View bookings', href: '/dashboard/bookings' });
  }

  return (
    <>
      <div className="samplebar">
        <Ic.AlertCircle width={16} />
        Every figure on this dashboard — KPIs, the workflow queues, the activity trend, compliance ring &amp; alerts — is <b style={{ margin: '0 3px' }}>live from your database</b>.
      </div>

      <div className="g6">
        {kpis.map((k) => (
          <KPIStat key={k.label} label={k.label} value={k.value} icon={k.icon} tone={k.tone} />
        ))}
      </div>

      {/* Needs your attention — the compact action list (mirrors the worker/client dashboards). */}
      <div style={{ marginTop: 20 }}>
        <Card title="Needs your attention" action={<Link href="/dashboard/bookings" className="link">All bookings →</Link>}>
          {!wf ? <p className="dim">Loading…</p>
            : attention.length === 0 ? <p className="dim" style={{ fontSize: 13.5 }}>You&apos;re all caught up — nothing needs your attention right now. ✓</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {attention.map((a, i) => (
                  <div key={i} className="fx ac jb" style={{ gap: 10 }}>
                    <span className="fx ac" style={{ gap: 9, fontSize: 13.5 }}><span style={{ fontSize: 16 }}>{a.icon}</span>{a.text}</span>
                    <Link href={a.href} style={{ textDecoration: 'none', height: 30, display: 'inline-flex', alignItems: 'center', padding: '0 13px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', background: a.urgent ? 'var(--blue-500)' : 'var(--surface-card)', color: a.urgent ? '#fff' : 'var(--text-secondary)', border: a.urgent ? 'none' : '1px solid var(--border-subtle)' }}>{a.action}</Link>
                  </div>
                ))}
              </div>
            )}
        </Card>
      </div>

      {/* Action queues — the drill-down lists behind the summary above. */}
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: '26px 0 12px' }}>Action queues</h2>
      <div className="gbot">
        <Card title="Awaiting approval" subtitle="New client requests to review" action={<Link href="/dashboard/bookings?status=SUBMITTED" className="link">View all</Link>}>
          {!wf ? <p className="dim">Loading…</p>
            : wf.awaitingApprovalJobs.length === 0 ? <p className="dim">Nothing awaiting approval. ✓</p>
            : wf.awaitingApprovalJobs.map((j) => (
              <div key={j.id} className="fx ac jb" style={{ padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div><div className="nm">{j.title}</div><div className="sub2">{j.client.name} · {j.openings} worker{j.openings === 1 ? '' : 's'}</div></div>
                <Link href={`/dashboard/bookings/${j.id}`} className="link" style={{ fontWeight: 600, fontSize: 13 }}>Review →</Link>
              </div>
            ))}
        </Card>

        <Card title="Ready to confirm" subtitle="Client accepted — book them in" action={<Link href="/dashboard/bookings?status=CANDIDATES_SUBMITTED" className="link">View all</Link>}>
          {!wf ? <p className="dim">Loading…</p>
            : wf.readyToBook.length === 0 ? <p className="dim">No client-accepted candidates waiting.</p>
            : wf.readyToBook.map((a) => (
              <div key={a.id} className="fx ac jb" style={{ padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div><div className="nm">{a.candidate.firstName} {a.candidate.lastName}</div><div className="sub2">{a.job.title} · {a.job.client.name}</div></div>
                <Link href={`/dashboard/bookings/${a.job.id}`} className="link" style={{ fontWeight: 600, fontSize: 13 }}>Confirm →</Link>
              </div>
            ))}
        </Card>

        <Card title="Reliability concerns" subtitle="Workers to keep an eye on" action={<Link href="/dashboard/candidates" className="link">Candidates</Link>}>
          {!wf ? <p className="dim">Loading…</p>
            : wf.reliabilityConcerns.length === 0 ? <p className="dim">No candidates at medium or high concern. ✓</p>
            : wf.reliabilityConcerns.map((c) => (
              <div key={c.candidateId} className="fx ac jb" style={{ padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <Link href={`/dashboard/candidates/${c.candidateId}`} className="nm" style={{ color: 'var(--blue-500)' }}>{c.name}</Link>
                <Badge tone={(c.level === 'HIGH' ? 'error' : 'warning') as any}>{c.level === 'HIGH' ? 'High concern' : 'Medium concern'}</Badge>
              </div>
            ))}
        </Card>
      </div>

      <div className="gbot" style={{ marginTop: 16 }}>
        <Card title="Upcoming shifts (7 days)" action={<Link href="/dashboard/bookings" className="link">View all</Link>}>
          {!wf ? <p className="dim">Loading…</p>
            : wf.upcomingShifts.length === 0 ? <p className="dim">No shifts booked in the next 7 days.</p>
            : wf.upcomingShifts.map((s) => (
              <div key={s.id} className="fx ac jb" style={{ padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div><div className="nm">{s.candidate.firstName} {s.candidate.lastName}</div><div className="sub2">{s.job.title} · {s.job.client.name}</div></div>
                <span className="dim" style={{ fontSize: 12.5 }}>{new Date(s.startAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, {new Date(s.startAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
        </Card>
      </div>

      <div className="gmid">
        <Card title="Overview" subtitle="New records per week (last 7 weeks)">
          {!trends ? <p className="dim">Loading…</p> : areaSeries.every((s) => s.data.every((n) => n === 0)) ? (
            <p className="dim" style={{ fontSize: 13.5 }}>No activity recorded in the last 7 weeks yet.</p>
          ) : (
            <>
              <div className="legrow">
                {areaSeries.map((s) => (
                  <div key={s.name} className="legcol">
                    <span className="legl"><span className="legdot" style={{ background: s.color }} />{s.name}</span>
                    <span className="legv">{s.data.reduce((a, b) => a + b, 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <AreaChart labels={trends.labels} series={areaSeries} height={210} />
            </>
          )}
        </Card>

        <Card title="Compliance Overview">
          {!comp ? <p className="dim">Loading…</p> : comp.total === 0 ? (
            <p className="dim" style={{ fontSize: 13.5 }}>No candidates yet.</p>
          ) : (
            <DonutChart segments={donut} centerValue={`${comp.clearedPct}%`} centerLabel="Cleared" />
          )}
          <Link href="/dashboard/compliance" className="link" style={{ display: 'block', textAlign: 'center', marginTop: 12, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '8px' }}>
            View Compliance Dashboard
          </Link>
        </Card>

        <Card title="Operational alerts" subtitle="For your review — the system never acts automatically">
          {!alerts ? <p className="dim">Loading…</p>
            : alerts.length === 0 ? <p className="dim" style={{ fontSize: 13.5 }}>All clear — no operational alerts right now. ✓</p>
            : alerts.slice(0, 10).map((a, i) => (
              <div key={i} className="fx ac" style={{ gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: a.severity === 'high' ? 'var(--error-600)' : a.severity === 'medium' ? 'var(--orange-600)' : 'var(--text-tertiary)', flexShrink: 0 }}>{ALERT_ICON[a.type] ?? <Ic.AlertCircle width={18} />}</span>
                <span style={{ flex: 1, fontSize: 13 }}>
                  {a.candidateId
                    ? <Link href={`/dashboard/candidates/${a.candidateId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{a.message}</Link>
                    : a.message}
                </span>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: a.severity === 'high' ? 'var(--error-600)' : a.severity === 'medium' ? 'var(--orange-600)' : 'var(--text-tertiary)' }}>{a.severity}</span>
              </div>
            ))}
          {alerts && alerts.length > 10 && <p className="dim" style={{ fontSize: 12, marginTop: 8 }}>+ {alerts.length - 10} more</p>}
        </Card>
      </div>

      <div className="gbot">
        <Card title="Recent Candidate Registrations" action={<Link href="/dashboard/candidates" className="link">View all</Link>}>
          {cands.length ? <DataTable columns={candCols} rows={cands} /> : <p className="dim">No candidates yet.</p>}
        </Card>

        <Card title="Recent Job Bookings" action={<Link href="/dashboard/bookings" className="link">View all</Link>}>
          {recentJobs.length ? <DataTable columns={jobCols} rows={recentJobs} /> : <p className="dim">No bookings yet.</p>}
        </Card>

        <Card title="AI Assistant" action={<Link href="/dashboard/ai" className="link">Open assistant</Link>}>
          <div className="dim" style={{ fontSize: 13, marginBottom: 12 }}>Hello Admin, here are today&apos;s insights.</div>
          {insights.length === 0 ? (
            <div className="dim" style={{ fontSize: 13.5 }}>You&apos;re all caught up — nothing needs attention right now.</div>
          ) : insights.map((it, i) => (
            <div key={i} className="insight">
              <span className="insight-ic" style={{ background: it.bg, color: it.fg }}>{it.icon}</span>
              <div className="insight-body">
                {it.text}
                <Link href={it.href} className="insight-act">{it.action}</Link>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
