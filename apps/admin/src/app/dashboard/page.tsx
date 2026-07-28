'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Badge, Avatar } from '@/components/ui';
import * as Ic from '@/components/icons';

type Stats = { candidates: number; workers: number; clients: number; bookings: number; timesheets: number; revenue: number; pendingTimesheets: number; newEnquiries: number; complianceAttention: number };
type Compliance = { compliant: number; active: number; screening: number; awaiting: number; inactive: number; rejected: number; total: number; clearedPct: number };
type Job = { id: string; title: string; status: string; openings?: number; client: { name: string }; _count?: { shifts: number; applications: number } };
type WF = {
  counts: { awaitingApproval: number; responsesToReview: number; readyToSubmit: number; awaitingClient: number; clientAccepted: number; alternativesRequested: number; placements: number; recruiting: number; toRefill: number; upcomingShifts: number; reliabilityConcerns: number };
  awaitingApprovalJobs: { id: string; title: string; openings: number; status: string; submittedAt?: string | null; client: { name: string } }[];
  readyToBook: { id: string; candidate: { firstName: string; lastName: string }; job: { id: string; title: string; client: { name: string } } }[];
  upcomingShifts: { id: string; startAt: string; status: string; candidate: { firstName: string; lastName: string }; job: { id: string; title: string; client: { name: string } } }[];
  reliabilityConcerns: { candidateId: string; name: string; points: number; level: string }[];
};
type Alert = { type: string; severity: 'high' | 'medium' | 'low'; message: string; candidateId: string | null; shiftId: string | null; jobId: string | null; occurredAt: string };
type TopMatch = { candidateId: string; name: string; headline: string | null; score: number; available: boolean; reason: string | null; pipelineStatus: string | null; jobId: string; jobTitle: string };
type Reliability = { avgRating: number | null; ratingCount: number; metrics: { label: string; pct: number | null; detail: string }[]; concerns: number };

const money = (n: number) => '£' + n.toLocaleString();
const num = (n?: number) => (n === undefined ? '—' : n.toLocaleString());

// Jobs still consuming recruiter effort (not terminal states).
const ACTIVE_JOB = new Set(['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'RECRUITING', 'CANDIDATES_SUBMITTED', 'PARTIALLY_FILLED', 'OPEN', 'OFFERS_SENT']);
const FILLED_JOB = new Set(['FILLED', 'COMPLETED']);
const NEEDS_STAFF = new Set(['RECRUITING', 'PARTIALLY_FILLED', 'OPEN', 'CANDIDATES_SUBMITTED', 'OFFERS_SENT']);

const shiftTone: Record<string, { bg: string; fg: string; label: string }> = {
  CONFIRMED: { bg: 'var(--success-100)', fg: 'var(--success-600)', label: 'Confirmed' },
  ASSIGNED: { bg: 'var(--blue-100)', fg: 'var(--blue-600)', label: 'Assigned' },
  IN_PROGRESS: { bg: 'var(--success-100)', fg: 'var(--success-600)', label: 'In progress' },
  COMPLETED: { bg: 'var(--grey-100)', fg: 'var(--grey-600)', label: 'Completed' },
  OPEN: { bg: 'var(--orange-100)', fg: 'var(--orange-600)', label: 'Open' },
};

function Kpi({ label, value, hint, icon, bg }: { label: string; value: string; hint: string; icon: React.ReactNode; bg: string }) {
  return (
    <div style={{ ...cardStyle, padding: 18, display: 'flex', alignItems: 'center', gap: 15 }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="dim" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: 27, fontWeight: 800, lineHeight: 1.05, margin: '3px 0' }}>{value}</div>
        <div className="dim" style={{ fontSize: 12 }}>{hint}</div>
      </div>
    </div>
  );
}

function SectionHead({ title, href, action }: { title: string; href?: string; action?: string }) {
  return (
    <div className="fx ac jb" style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{title}</div>
      {href && <Link href={href} className="link" style={{ fontSize: 12.5, fontWeight: 600 }}>{action ?? 'View all'} →</Link>}
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 22 };
const fmtTime = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const fmtDay = (d: string) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export default function DashboardHome() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [wf, setWf] = useState<WF | null>(null);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [comp, setComp] = useState<Compliance | null>(null);
  const [matches, setMatches] = useState<TopMatch[] | null>(null);
  const [rel, setRel] = useState<Reliability | null>(null);
  const [now, setNow] = useState<string>('');

  useEffect(() => {
    apiFetch<Stats>('/stats/overview').then(setStats).catch(() => {});
    apiFetch<Job[]>('/jobs').then(setJobs).catch(() => {});
    apiFetch<WF>('/stats/workflow').then(setWf).catch(() => {});
    apiFetch<{ alerts: Alert[] }>('/stats/alerts').then((r) => setAlerts(r.alerts)).catch(() => {});
    apiFetch<Compliance>('/stats/compliance').then(setComp).catch(() => {});
    apiFetch<TopMatch[]>('/matching/top?limit=5').then(setMatches).catch(() => setMatches([]));
    apiFetch<Reliability>('/stats/reliability').then(setRel).catch(() => {});
    setNow(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
  }, []);

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // ── Derived, real figures ──
  const activeJobs = jobs.filter((j) => ACTIVE_JOB.has(j.status)).length;
  const requireStaff = jobs.filter((j) => NEEDS_STAFF.has(j.status)).length;
  const fillDenom = jobs.filter((j) => j.status !== 'DRAFT' && j.status !== 'CANCELLED').length;
  const fillRate = fillDenom ? Math.round((jobs.filter((j) => FILLED_JOB.has(j.status)).length / fillDenom) * 100) : 0;
  const recentJobs = jobs.slice(0, 4);

  const compRows = comp ? [
    { label: 'Cleared / Compliant', value: comp.compliant },
    { label: 'Active', value: comp.active },
    { label: 'In screening', value: comp.screening },
    { label: 'Awaiting checks', value: comp.awaiting },
    { label: 'Inactive / rejected', value: comp.inactive + comp.rejected },
  ] : [];

  const ALERT_ICON: Record<string, React.ReactNode> = {
    RUNNING_LATE: <Ic.Clock width={16} />, REPORTED_ABSENT: <Ic.AlertCircle width={16} />,
    NOT_ACKNOWLEDGED: <Ic.User width={16} />, NO_CHECK_IN: <Ic.AlertCircle width={16} />,
    TIMESHEET_OUTSTANDING: <Ic.Clock width={16} />, DOC_EXPIRING: <Ic.FileText width={16} />,
  };

  // ── AI Assistant: real, actionable insights derived from live data ──
  const insights: { bg: string; fg: string; icon: React.ReactNode; text: string; action: string; href: string }[] = [];
  if (wf) {
    const c = wf.counts;
    if (c.awaitingApproval) insights.push({ bg: 'var(--info-100)', fg: 'var(--blue-500)', icon: <Ic.FileText width={16} />, text: `${c.awaitingApproval} client request${c.awaitingApproval === 1 ? '' : 's'} waiting for your review.`, action: 'Review requests', href: '/dashboard/bookings?status=SUBMITTED' });
    if (c.clientAccepted) insights.push({ bg: 'var(--success-100)', fg: 'var(--success-600)', icon: <Ic.Check width={16} />, text: `${c.clientAccepted} client-accepted candidate${c.clientAccepted === 1 ? '' : 's'} ready to confirm.`, action: 'Confirm bookings', href: '/dashboard/bookings?status=CANDIDATES_SUBMITTED' });
  }
  if (matches && matches.length) insights.push({ bg: '#efe7fd', fg: 'var(--purple-500)', icon: <Ic.Sparkle width={16} />, text: `I've matched ${matches.length} strong candidate${matches.length === 1 ? '' : 's'} to your open jobs — top score ${matches[0].score}%.`, action: 'Shortlist now', href: `/dashboard/bookings/${matches[0].jobId}` });
  if (stats) {
    if (stats.pendingTimesheets) insights.push({ bg: 'var(--orange-100)', fg: 'var(--orange-600)', icon: <Ic.Clock width={16} />, text: `${stats.pendingTimesheets} timesheet${stats.pendingTimesheets === 1 ? '' : 's'} awaiting your approval.`, action: 'Approve now', href: '/dashboard/timesheets' });
    const needsCompliance = comp ? comp.screening + comp.awaiting : 0;
    if (needsCompliance) insights.push({ bg: 'var(--warning-100)', fg: 'var(--warning-600)', icon: <Ic.Shield width={16} />, text: `${needsCompliance} candidate${needsCompliance === 1 ? '' : 's'} still need compliance checks before they can work.`, action: 'Review compliance', href: '/dashboard/compliance' });
    if (stats.newEnquiries) insights.push({ bg: 'var(--info-100)', fg: 'var(--blue-500)', icon: <Ic.Message width={16} />, text: `${stats.newEnquiries} new website enquir${stats.newEnquiries === 1 ? 'y' : 'ies'} to follow up.`, action: 'View enquiries', href: '/dashboard/enquiries' });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Greeting */}
      <div className="fx ac jb" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Welcome back, Admin <span style={{ fontWeight: 400 }}>👋</span></h1>
          <p className="dim" style={{ fontSize: 13.5, margin: '4px 0 0' }}>Here&apos;s what&apos;s happening with your workforce today.</p>
        </div>
        <div className="fx ac" style={{ gap: 8, background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 600 }}>
          <Ic.Calendar width={16} /> {today}
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 16 }}>
        <Kpi label="Active Jobs" value={num(activeJobs || undefined)} hint={`${requireStaff} require staff`} icon={<Ic.Briefcase width={24} />} bg="var(--blue-500)" />
        <Kpi label="Available Workers" value={num(stats?.workers)} hint="Ready for work" icon={<Ic.Users width={24} />} bg="var(--success-500)" />
        <Kpi label="Booked Shifts" value={num(wf?.counts.upcomingShifts)} hint="Next 7 days" icon={<Ic.Calendar width={24} />} bg="var(--orange-500)" />
        <Kpi label="Fill Rate" value={jobs.length ? `${fillRate}%` : '—'} hint="Across your jobs" icon={<Ic.TrendUp width={24} />} bg="var(--purple-500)" />
        <Kpi label="Revenue (MTD)" value={stats ? money(stats.revenue) : '—'} hint="This month" icon={<Ic.PoundSterling width={24} />} bg="var(--navy-900)" />
      </div>

      {/* Row 2: candidates | live shifts | client requests */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1.1fr) minmax(0, 1fr)', gap: 16 }}>
        {/* AI Matching — top recommendations */}
        <div style={cardStyle}>
          <SectionHead title="AI Matching — Top Recommendations" href="/dashboard/bookings" action="View all matches" />
          {!matches ? <p className="dim" style={{ fontSize: 13.5 }}>Loading…</p>
            : matches.length === 0 ? <p className="dim" style={{ fontSize: 13.5 }}>No open jobs to match candidates against right now.</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {matches.map((m) => (
                  <div key={m.candidateId} className="fx ac" style={{ gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <Avatar name={m.name} size={40} />
                    <div style={{ minWidth: 0, flex: 1.3 }}>
                      <div className="fx ac" style={{ gap: 5 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{m.name}</span>
                        {(m.pipelineStatus === 'BOOKED' || m.pipelineStatus === 'CLIENT_ACCEPTED') && <span style={{ color: 'var(--blue-500)', fontSize: 12 }}>✓</span>}
                      </div>
                      <div className="dim" style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.headline ?? m.jobTitle}</div>
                    </div>
                    <div style={{ width: 92, flexShrink: 0 }}>
                      <div className="dim" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Match</div>
                      <div className="fx ac" style={{ gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--success-600)' }}>{m.score}%</span>
                        <span style={{ flex: 1, height: 5, borderRadius: 999, background: 'var(--surface-sunken)' }}><span style={{ display: 'block', height: 5, borderRadius: 999, width: `${m.score}%`, background: 'var(--success-500)' }} /></span>
                      </div>
                    </div>
                    <div style={{ width: 66, flexShrink: 0, textAlign: 'center' }}>
                      <div className="dim" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Avail.</div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: m.available ? 'var(--success-600)' : 'var(--text-tertiary)' }}>{m.available ? 'Now' : '—'}</span>
                    </div>
                    <Link href={`/dashboard/bookings/${m.jobId}`} className="btn-outline" style={{ height: 30, fontSize: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', padding: '0 12px', flexShrink: 0 }}>Shortlist</Link>
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Live shifts today */}
        <div style={cardStyle}>
          <SectionHead title="Live Shifts — Next 7 Days" href="/dashboard/shifts" action="View schedule" />
          {!wf ? <p className="dim" style={{ fontSize: 13.5 }}>Loading…</p>
            : wf.upcomingShifts.length === 0 ? <p className="dim" style={{ fontSize: 13.5 }}>No shifts booked in the next 7 days.</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {wf.upcomingShifts.slice(0, 6).map((s) => { const t = shiftTone[s.status] ?? { bg: 'var(--grey-100)', fg: 'var(--grey-600)', label: s.status }; return (
                  <div key={s.id} className="fx" style={{ gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div className="dim mono" style={{ fontSize: 12, fontWeight: 700, width: 38, flexShrink: 0, paddingTop: 1 }}>{fmtTime(s.startAt)}</div>
                    <span style={{ width: 9, height: 9, borderRadius: 999, background: t.fg, flexShrink: 0, marginTop: 4 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="fx ac jb" style={{ gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{s.job.title}</span>
                        <span style={{ background: t.bg, color: t.fg, borderRadius: 999, padding: '1px 8px', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>{t.label}</span>
                      </div>
                      <div className="dim" style={{ fontSize: 12 }}>{s.job.client.name} · {s.candidate.firstName} {s.candidate.lastName}</div>
                    </div>
                  </div>
                ); })}
              </div>
            )}
        </div>

        {/* Client requests */}
        <div style={cardStyle}>
          <SectionHead title="Client Requests" href="/dashboard/bookings?status=SUBMITTED" action="View all" />
          {!wf ? <p className="dim" style={{ fontSize: 13.5 }}>Loading…</p>
            : wf.awaitingApprovalJobs.length === 0 ? <p className="dim" style={{ fontSize: 13.5 }}>No new requests to review. ✓</p>
            : wf.awaitingApprovalJobs.slice(0, 5).map((j) => (
              <Link key={j.id} href={`/dashboard/bookings/${j.id}`} className="fx ac jb" style={{ gap: 10, padding: '11px 0', borderBottom: '1px solid var(--border-subtle)', textDecoration: 'none', color: 'inherit' }}>
                <div className="fx ac" style={{ gap: 11, minWidth: 0 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800, fontSize: 13, color: 'var(--text-secondary)' }}>{j.client.name.slice(0, 2).toUpperCase()}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{j.client.name}</div>
                    <div className="dim" style={{ fontSize: 12 }}>{j.openings} × {j.title}</div>
                  </div>
                </div>
                <span style={{ background: 'var(--warning-100)', color: 'var(--warning-600)', borderRadius: 999, padding: '2px 9px', fontSize: 10.5, fontWeight: 800, flexShrink: 0 }}>Pending</span>
              </Link>
            ))}
          {wf && wf.awaitingApprovalJobs.length > 0 && (
            <Link href="/dashboard/bookings?status=SUBMITTED" className="link" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 11.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase' }}>View all requests</Link>
          )}
        </div>
      </div>

      {/* AI Assistant — today's insights */}
      <div style={cardStyle}>
        <div className="fx ac jb" style={{ marginBottom: 14 }}>
          <div className="fx ac" style={{ gap: 9 }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: '#efe7fd', color: 'var(--purple-500)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic.Sparkle width={17} /></span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>AI Assistant</div>
              <div className="dim" style={{ fontSize: 11.5 }}>Hello Admin, here&apos;s what needs your attention today.</div>
            </div>
          </div>
          <Link href="/dashboard/ai" className="link" style={{ fontSize: 12.5, fontWeight: 600 }}>Open assistant →</Link>
        </div>
        {!wf || !stats ? <p className="dim" style={{ fontSize: 13.5 }}>Loading…</p>
          : insights.length === 0 ? <p className="dim" style={{ fontSize: 13.5 }}>You&apos;re all caught up — nothing needs attention right now. ✓</p>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {insights.map((it, i) => (
                <div key={i} className="insight" style={{ marginTop: 0 }}>
                  <span className="insight-ic" style={{ background: it.bg, color: it.fg }}>{it.icon}</span>
                  <div className="insight-body">
                    {it.text}
                    <Link href={it.href} className="insight-act">{it.action} →</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* Row 3: compliance | cleared donut | recent bookings | alerts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
        {/* Compliance checklist */}
        <div style={cardStyle}>
          <SectionHead title="Compliance Overview" href="/dashboard/compliance" />
          {!comp ? <p className="dim" style={{ fontSize: 13.5 }}>Loading…</p>
            : comp.total === 0 ? <p className="dim" style={{ fontSize: 13.5 }}>No candidates yet.</p>
            : compRows.map((r) => { const pct = comp.total ? Math.round((r.value / comp.total) * 100) : 0; return (
              <div key={r.label} className="fx ac jb" style={{ gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="fx ac" style={{ gap: 9, fontSize: 13 }}><Ic.Check width={15} style={{ color: 'var(--success-600)' }} />{r.label}</span>
                <span className="fx ac" style={{ gap: 10 }}><span className="dim mono" style={{ fontSize: 12 }}>{r.value}/{comp.total}</span><span style={{ fontWeight: 800, fontSize: 12.5, color: 'var(--success-600)' }}>{pct}%</span></span>
              </div>
            ); })}
        </div>

        {/* Worker reliability */}
        <div style={cardStyle}>
          <SectionHead title="Worker Reliability" href="/dashboard/candidates" action="View all" />
          {!rel ? <p className="dim" style={{ fontSize: 13.5 }}>Loading…</p> : (
            <>
              <div className="fx" style={{ flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
                {(() => {
                  const r = rel.avgRating; const pct = r != null ? (r / 5) * 360 : 0; const full = r != null ? Math.round(r) : 0;
                  return (
                    <div style={{ width: 110, height: 110, borderRadius: '50%', background: r != null ? `conic-gradient(var(--success-500) ${pct}deg, var(--surface-sunken) 0)` : 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 86, height: 86, borderRadius: '50%', background: 'var(--surface-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                        <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{r != null ? r.toFixed(1) : '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--orange-500)', letterSpacing: 1, lineHeight: 1 }}>{'★'.repeat(full)}{'☆'.repeat(5 - full)}</div>
                        <div className="dim" style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', lineHeight: 1.1 }}>Avg rating</div>
                      </div>
                    </div>
                  );
                })()}
                <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>{rel.ratingCount} rated worker{rel.ratingCount === 1 ? '' : 's'}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {rel.metrics.map((m) => (
                  <div key={m.label}>
                    <div className="fx ac jb" style={{ marginBottom: 4 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{m.label}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: m.pct == null ? 'var(--text-tertiary)' : m.pct >= 80 ? 'var(--success-600)' : m.pct >= 50 ? 'var(--orange-600)' : 'var(--error-600)' }}>{m.pct == null ? '—' : `${m.pct}%`}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-sunken)' }}><div style={{ height: 6, borderRadius: 999, width: `${m.pct ?? 0}%`, background: m.pct != null && m.pct >= 80 ? 'var(--success-500)' : m.pct != null && m.pct >= 50 ? 'var(--orange-500)' : 'var(--error-500)' }} /></div>
                    <div className="dim" style={{ fontSize: 10.5, marginTop: 2 }}>{m.detail}</div>
                  </div>
                ))}
              </div>
              {rel.concerns > 0 && <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--warning-600)', fontWeight: 600 }}>⚠ {rel.concerns} worker{rel.concerns === 1 ? '' : 's'} at medium/high concern</div>}
            </>
          )}
        </div>

        {/* Recent bookings */}
        <div style={cardStyle}>
          <SectionHead title="Recent Bookings" href="/dashboard/bookings" />
          {recentJobs.length === 0 ? <p className="dim" style={{ fontSize: 13.5 }}>No bookings yet.</p>
            : recentJobs.map((j) => (
              <Link key={j.id} href={`/dashboard/bookings/${j.id}`} className="fx ac jb" style={{ gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{j.title}</div>
                  <div className="dim" style={{ fontSize: 12 }}>{j.client.name}{j._count ? ` · ${j._count.shifts} shift${j._count.shifts === 1 ? '' : 's'}` : ''}</div>
                </div>
                <Badge tone={(FILLED_JOB.has(j.status) ? 'success' : NEEDS_STAFF.has(j.status) ? 'warning' : 'neutral') as 'success' | 'warning' | 'neutral'}>{j.status.replace(/_/g, ' ').toLowerCase()}</Badge>
              </Link>
            ))}
        </div>

        {/* Operational alerts */}
        <div style={cardStyle}>
          <SectionHead title="Operational Alerts" />
          {!alerts ? <p className="dim" style={{ fontSize: 13.5 }}>Loading…</p>
            : alerts.length === 0 ? <p className="dim" style={{ fontSize: 13.5 }}>All clear — no alerts right now. ✓</p>
            : alerts.slice(0, 6).map((a, i) => (
              <div key={i} className="fx ac" style={{ gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: a.severity === 'high' ? 'var(--error-600)' : a.severity === 'medium' ? 'var(--orange-600)' : 'var(--text-tertiary)', flexShrink: 0 }}>{ALERT_ICON[a.type] ?? <Ic.AlertCircle width={16} />}</span>
                <span style={{ flex: 1, fontSize: 12.5 }}>{a.candidateId ? <Link href={`/dashboard/candidates/${a.candidateId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{a.message}</Link> : a.message}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Status bar */}
      <div className="card card-pad fx ac jb" style={{ gap: 16, flexWrap: 'wrap' }}>
        <span className="fx ac" style={{ gap: 8, fontSize: 13, fontWeight: 600 }}><span style={{ width: 9, height: 9, borderRadius: 999, background: 'var(--success-500)' }} /> All systems operational</span>
        <div className="fx ac" style={{ gap: 28, flexWrap: 'wrap' }}>
          <span className="fx ac" style={{ gap: 8, fontSize: 13 }}><Ic.Users width={16} /> <span className="dim">Active workers</span> <b>{num(stats?.workers)}</b></span>
          <span className="fx ac" style={{ gap: 8, fontSize: 13 }}><Ic.Briefcase width={16} /> <span className="dim">Active jobs</span> <b>{num(activeJobs || undefined)}</b></span>
          <span className="fx ac" style={{ gap: 8, fontSize: 13 }}><Ic.Building width={16} /> <span className="dim">Clients</span> <b>{num(stats?.clients)}</b></span>
          <span className="dim" style={{ fontSize: 12 }}>Updated {now}</span>
        </div>
      </div>
    </div>
  );
}
