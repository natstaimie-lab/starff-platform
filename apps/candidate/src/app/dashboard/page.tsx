'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { ComplianceBadge } from '@/components/ui';
import { complianceChecks } from '@/lib/compliance';

type Doc = { type: string; status: string; expiryDate?: string | null };
type Shift = { id: string; startAt: string; endAt: string; status: string; payRate: string; breakMinutes?: number; checkInAt?: string | null; job: { title: string; client: { name: string } }; site?: { name: string; city?: string } };
type TS = { id: string; shiftId?: string; status: string; hoursWorked?: string; shift: { startAt: string; payRate?: string; job: { title: string; client: { name: string } } } };
type Me = { firstName: string; lastName: string; status: string; headline?: string | null; city?: string | null; rating?: number | null; createdAt?: string; documents: Doc[]; availability: { dayOfWeek: number }[]; shifts: Shift[]; timesheets: TS[] };
type Offer = { id: string; status: string; job: { title: string; startDate: string | null; location: string | null; payRate: string | number; client?: { name: string } } };

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const hhmm = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const gbp = (n: number) => '£' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusTone: Record<string, { bg: string; fg: string; label: string }> = {
  ASSIGNED: { bg: 'var(--blue-100)', fg: 'var(--blue-600)', label: 'Booked' },
  CONFIRMED: { bg: 'var(--success-100)', fg: 'var(--success-600)', label: 'Confirmed' },
  IN_PROGRESS: { bg: 'var(--blue-100)', fg: 'var(--blue-600)', label: 'On shift' },
  COMPLETED: { bg: 'var(--grey-100)', fg: 'var(--grey-600)', label: 'Completed' },
  CANCELLED: { bg: 'var(--error-100)', fg: 'var(--error-600)', label: 'Cancelled' },
};

function Head({ title, href, action }: { title: string; href?: string; action?: string }) {
  return (
    <div className="fx ac jb" style={{ marginBottom: 14 }}>
      <span style={{ fontSize: 15, fontWeight: 800 }}>{title}</span>
      {href && <Link href={href} className="link" style={{ fontSize: 13, fontWeight: 600 }}>{action ?? 'View all'}</Link>}
    </div>
  );
}
const card: React.CSSProperties = { background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 20 };

export default function Dashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);

  const load = () => {
    apiFetch<Me>('/me').then(setMe).catch(() => {});
    apiFetch<Offer[]>('/me/invitations').then((all) => setOffers(all.filter((o) => o.status === 'INVITED'))).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const { checks, cleared, pct: compliancePct } = complianceChecks(me?.status, me?.documents ?? []);
  const now = Date.now();

  // Availability month calendar (real days highlighted).
  const availSet = new Set((me?.availability ?? []).map((a) => a.dayOfWeek));
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const startPad = (first.getDay() + 6) % 7; // Mon-first
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  // Upcoming shifts.
  const upcoming = (me?.shifts ?? [])
    .filter((s) => new Date(s.startAt).getTime() >= now && s.status !== 'CANCELLED')
    .sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt)).slice(0, 3);

  // Earnings — real, from approved/paid timesheets.
  const billable = (me?.timesheets ?? []).filter((t) => ['APPROVED', 'INVOICED', 'PAID'].includes(t.status) && t.hoursWorked != null);
  const earnOf = (t: TS) => Number(t.hoursWorked) * Number(t.shift.payRate ?? 0);
  const thisMonth = billable.filter((t) => { const d = new Date(t.shift.startAt); return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(); });
  const monthEarnings = thisMonth.reduce((n, t) => n + earnOf(t), 0);
  const hoursWorked = thisMonth.reduce((n, t) => n + Number(t.hoursWorked), 0);
  const avgRate = hoursWorked ? monthEarnings / hoursWorked : 0;
  // 4-month bar series.
  const series = [3, 2, 1, 0].map((back) => {
    const d = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const total = billable.filter((t) => { const s = new Date(t.shift.startAt); return s.getMonth() === d.getMonth() && s.getFullYear() === d.getFullYear(); }).reduce((n, t) => n + earnOf(t), 0);
    return { label: MON[d.getMonth()], total };
  });
  const seriesMax = Math.max(1, ...series.map((s) => s.total));

  // Score — a real-ish gamification metric from live signals (placeholder scale).
  const completed = (me?.shifts ?? []).filter((s) => s.status === 'COMPLETED').length;
  const verifiedDocs = (me?.documents ?? []).filter((d) => d.status === 'VERIFIED').length;
  const score = 500 + completed * 150 + verifiedDocs * 200 + Math.round((me?.rating ?? 0) * 250) + (cleared ? 500 : 0);
  const scoreBand = score >= 4000 ? 'Excellent' : score >= 2500 ? 'Great' : score >= 1200 ? 'Good' : 'Getting started';

  const memberSince = me?.createdAt ? `${MON[new Date(me.createdAt).getMonth()]} ${new Date(me.createdAt).getFullYear()}` : '—';
  const initials = `${me?.firstName?.[0] ?? ''}${me?.lastName?.[0] ?? ''}`.toUpperCase();

  // ── Needs your attention — everything waiting on the worker, most urgent first ──
  const pl = (n: number) => (n === 1 ? '' : 's');
  const submittedShiftIds = new Set((me?.timesheets ?? []).map((t) => t.shiftId).filter(Boolean));
  const needTimesheet = (me?.shifts ?? []).filter((s) => s.status === 'COMPLETED' && !submittedShiftIds.has(s.id));
  const rejectedTs = (me?.timesheets ?? []).filter((t) => t.status === 'REJECTED');
  const expiringDocs = (me?.documents ?? []).filter((d) => {
    if (!d.expiryDate) return false;
    const t = new Date(d.expiryDate).getTime();
    return t > now && t < now + 30 * 86400000;
  });
  const attention: { icon: string; text: string; href: string; action: string; urgent?: boolean }[] = [];
  if (offers.length) attention.push({ icon: '📩', text: `${offers.length} shift offer${pl(offers.length)} waiting for your response`, href: '/dashboard/offers', action: 'Respond', urgent: true });
  if (rejectedTs.length) attention.push({ icon: '⚠️', text: `${rejectedTs.length} timesheet${pl(rejectedTs.length)} rejected — please resubmit`, href: '/dashboard/bookings', action: 'Fix', urgent: true });
  if (needTimesheet.length) attention.push({ icon: '⏱️', text: `${needTimesheet.length} completed shift${pl(needTimesheet.length)} need${needTimesheet.length === 1 ? 's' : ''} a timesheet`, href: '/dashboard/bookings', action: 'Submit' });
  if (me && !cleared) attention.push({ icon: '📄', text: 'Compliance incomplete — upload your documents to get more offers', href: '/dashboard/documents', action: 'Upload', urgent: true });
  else if (expiringDocs.length) attention.push({ icon: '📄', text: `${expiringDocs.length} document${pl(expiringDocs.length)} expiring soon`, href: '/dashboard/documents', action: 'Renew' });
  if (me && availSet.size === 0) attention.push({ icon: '📅', text: 'Add your availability so Starff can offer you shifts', href: '/dashboard/availability', action: 'Set' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Needs your attention */}
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

      {/* Row 1 — profile · matches · availability */}
      <div className="g3">
        {/* Profile */}
        <div style={card}>
          <div className="fx ac" style={{ gap: 14, marginBottom: 14 }}>
            <div style={{ width: 58, height: 58, borderRadius: '50%', background: 'var(--navy-900)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, flexShrink: 0 }}>{initials || '👤'}</div>
            <div style={{ flex: 1 }}>
              <div className="fx ac" style={{ gap: 8 }}>
                <span style={{ fontSize: 17, fontWeight: 800 }}>{me ? `${me.firstName} ${me.lastName}` : '…'}</span>
                {cleared && <span className="fx ac" style={{ gap: 3, background: 'var(--blue-100)', color: 'var(--blue-600)', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>✓ Verified</span>}
              </div>
              <div className="dim" style={{ fontSize: 13 }}>{me?.headline ?? 'Temporary worker'}</div>
              <div className="dim" style={{ fontSize: 12.5, marginTop: 2 }}>📍 {me?.city ?? 'UK'}</div>
            </div>
          </div>
          <div className="fx" style={{ gap: 20, padding: '12px 0', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
            <div><div className="dim" style={{ fontSize: 11.5 }}>Member since</div><div style={{ fontWeight: 700, fontSize: 14 }}>{memberSince}</div></div>
            <div style={{ flex: 1 }}>
              <div className="fx ac jb"><span className="dim" style={{ fontSize: 11.5 }}>Profile strength</span><span style={{ fontSize: 12, fontWeight: 700 }}>{compliancePct}%</span></div>
              <div style={{ height: 7, borderRadius: 999, background: 'var(--surface-sunken)', marginTop: 5 }}><div style={{ height: 7, borderRadius: 999, width: `${compliancePct}%`, background: 'var(--success-500)' }} /></div>
            </div>
          </div>
          <div style={{ marginTop: 12, background: 'var(--surface-sunken)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 13 }}>{cleared ? 'You’re fully compliant — keep your availability up to date to get more offers.' : 'Complete your compliance checks to start receiving more shift offers.'}</div>
            <Link href={cleared ? '/dashboard/availability' : '/dashboard/documents'} className="link" style={{ fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6 }}>{cleared ? 'Update availability' : 'Upload documents'} →</Link>
          </div>
        </div>

        {/* Top job matches */}
        <div style={card}>
          <Head title="Top Job Matches for You" href="/dashboard/offers" action="View all jobs" />
          {offers.length === 0 ? (
            <p className="dim" style={{ fontSize: 13.5 }}>No new matches right now. We’ll notify you when Starff offers you a shift.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {offers.slice(0, 3).map((o, i) => (
                <div key={o.id} className="fx ac" style={{ gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: 'var(--grey-600)', flexShrink: 0 }}>{(o.job.client?.name ?? o.job.title).slice(0, 2).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{o.job.title}</div>
                    <div className="dim" style={{ fontSize: 12 }}>{o.job.client?.name ?? 'Starff'}{o.job.location ? ` · ${o.job.location}` : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>£{Number(o.job.payRate).toFixed(2)}<span className="dim" style={{ fontSize: 11 }}>/hr</span></div>
                    <span style={{ background: 'var(--success-100)', color: 'var(--success-600)', borderRadius: 999, padding: '1px 7px', fontSize: 10.5, fontWeight: 800 }}>{98 - i * 3}% Match</span>
                  </div>
                </div>
              ))}
              <Link href="/dashboard/offers" className="btn-primary" style={{ textDecoration: 'none', justifyContent: 'center', marginTop: 4 }}>View All Job Matches</Link>
            </div>
          )}
        </div>

        {/* Availability calendar */}
        <div style={card}>
          <Head title="Availability" href="/dashboard/availability" action="Edit" />
          <div className="fx ac jb" style={{ marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{MON[today.getMonth()]} {today.getFullYear()}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i} className="dim" style={{ fontSize: 10.5, fontWeight: 700, padding: 2 }}>{d}</div>)}
            {cells.map((n, i) => {
              if (n === null) return <div key={i} />;
              const dow = new Date(today.getFullYear(), today.getMonth(), n).getDay();
              const avail = availSet.has(dow);
              const isToday = n === today.getDate();
              return (
                <div key={i} style={{ padding: '5px 0', borderRadius: 8, fontSize: 12, position: 'relative', fontWeight: isToday ? 800 : 500, background: isToday ? 'var(--blue-500)' : 'transparent', color: isToday ? '#fff' : 'var(--text-primary)' }}>
                  {n}
                  {avail && !isToday && <span style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: 999, background: 'var(--success-500)' }} />}
                </div>
              );
            })}
          </div>
          <div className="fx ac" style={{ gap: 8, marginTop: 12, fontSize: 12.5 }}>
            <span style={{ color: 'var(--success-600)' }}>●</span>
            <span className="dim">{availSet.size ? `Available ${availSet.size} day${availSet.size === 1 ? '' : 's'} a week` : 'Set your availability to get offers'}</span>
          </div>
        </div>
      </div>

      {/* Row 2 — upcoming shifts · earnings · documents */}
      <div className="g3">
        {/* Upcoming shifts */}
        <div style={card}>
          <Head title="Upcoming Shifts" href="/dashboard/bookings" />
          {upcoming.length === 0 ? (
            <p className="dim" style={{ fontSize: 13.5 }}>No upcoming shifts booked yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {upcoming.map((s) => {
                const d = new Date(s.startAt); const st = statusTone[s.status] ?? statusTone.ASSIGNED;
                return (
                  <div key={s.id} className="fx ac" style={{ gap: 12 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 10, background: 'var(--surface-sunken)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--orange-500)' }}>{MON[d.getMonth()].toUpperCase()}</span>
                      <span style={{ fontSize: 17, fontWeight: 800, lineHeight: 1 }}>{d.getDate()}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{s.job.title}</div>
                      <div className="dim" style={{ fontSize: 12 }}>{s.job.client.name}{s.site?.city ? ` · ${s.site.city}` : ''}</div>
                      <div className="dim" style={{ fontSize: 11.5, marginTop: 1 }}>🕒 {hhmm(s.startAt)}–{hhmm(s.endAt)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>£{Number(s.payRate).toFixed(2)}<span className="dim" style={{ fontSize: 11 }}>/hr</span></div>
                      <span style={{ background: st.bg, color: st.fg, borderRadius: 999, padding: '1px 8px', fontSize: 10.5, fontWeight: 800 }}>{st.label}</span>
                    </div>
                  </div>
                );
              })}
              <Link href="/dashboard/bookings" className="link" style={{ fontSize: 13, fontWeight: 700, textAlign: 'center', marginTop: 2 }}>View All Bookings</Link>
            </div>
          )}
        </div>

        {/* Earnings */}
        <div style={card}>
          <Head title="Earnings Overview" href="/dashboard/payments" action="View full summary" />
          <div style={{ fontSize: 26, fontWeight: 800 }}>{gbp(monthEarnings)}</div>
          <div className="dim" style={{ fontSize: 12.5, marginBottom: 12 }}>Total earnings this month</div>
          <div className="fx" style={{ alignItems: 'flex-end', gap: 10, height: 90, marginBottom: 14 }}>
            {series.map((s, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ height: `${Math.max(6, Math.round((s.total / seriesMax) * 78))}px`, borderRadius: 6, background: i === series.length - 1 ? 'var(--blue-500)' : 'var(--blue-100)' }} />
                <div className="dim" style={{ fontSize: 10.5, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div className="fx" style={{ gap: 8 }}>
            {[['Hours', hoursWorked.toFixed(1)], ['Shifts', String(thisMonth.length)], ['Avg / hr', gbp(avgRate)]].map(([k, v]) => (
              <div key={k} style={{ flex: 1, background: 'var(--surface-sunken)', borderRadius: 10, padding: '9px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{v}</div>
                <div className="dim" style={{ fontSize: 11 }}>{k}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Documents & compliance */}
        <div style={card}>
          <Head title="Documents & Compliance" href="/dashboard/compliance" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {checks.map((c) => (
              <div key={c.type} className="fx ac jb" style={{ padding: '7px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: 13.5 }}>{c.label}</span>
                <ComplianceBadge status={c.status} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3 — score · feedback · help */}
      <div className="g3">
        {/* Improve your score */}
        <div style={card}>
          <Head title="Improve Your Score" />
          <div className="fx" style={{ gap: 18, alignItems: 'center' }}>
            <div style={{ width: 86, height: 86, flexShrink: 0, borderRadius: '50%', background: `conic-gradient(var(--success-500) ${Math.min(100, Math.round(score / 60))}%, var(--surface-sunken) 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'var(--surface-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 1 }}>
                <span style={{ fontSize: 17, fontWeight: 800, lineHeight: 1 }}>{score.toLocaleString()}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--success-600)', lineHeight: 1 }}>{scoreBand}</span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[['Complete additional training', '+250'], ['Work 10 more shifts', '+500'], ['Get a 5-star rating', '+300']].map(([t, p]) => (
                <div key={t} className="fx ac jb" style={{ padding: '6px 0', fontSize: 12.5, gap: 8 }}>
                  <span>{t}</span>
                  <span style={{ color: 'var(--success-600)', fontWeight: 700, whiteSpace: 'nowrap' }}>{p} pts</span>
                </div>
              ))}
            </div>
          </div>
          <div className="dim" style={{ fontSize: 11, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>Scoring &amp; rewards are being rolled out — figures shown are indicative.</div>
        </div>

        {/* Latest feedback */}
        <div style={card}>
          <Head title="Latest Feedback" />
          {me?.rating != null ? (
            <div>
              <div className="fx ac" style={{ gap: 4, fontSize: 16 }}>{'★'.repeat(Math.round(me.rating))}<span className="dim" style={{ fontSize: 13, marginLeft: 4 }}>{me.rating.toFixed(1)} / 5</span></div>
              <p style={{ fontSize: 13.5, marginTop: 10 }}>Great feedback from the clients you’ve worked with — keep it up!</p>
            </div>
          ) : (
            <p className="dim" style={{ fontSize: 13.5 }}>No feedback yet. Complete shifts to start building your rating and reviews.</p>
          )}
        </div>

        {/* Need help */}
        <div style={card}>
          <Head title="Need Help?" />
          {[['Browse Help Centre', '/dashboard/help'], ['Message Support', '/dashboard/messages'], ['Report an Issue', '/dashboard/help']].map(([t, href]) => (
            <Link key={t} href={href} className="fx ac jb" style={{ padding: '11px 0', borderBottom: '1px solid var(--border-subtle)', textDecoration: 'none', color: 'inherit' }}>
              <span style={{ fontSize: 13.5 }}>{t}</span>
              <span className="dim">→</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Refer banner */}
      <div className="fx ac jb" style={{ background: 'var(--navy-900)', color: '#fff', borderRadius: 16, padding: '18px 24px', flexWrap: 'wrap', gap: 12 }}>
        <div className="fx ac" style={{ gap: 12 }}>
          <span style={{ fontSize: 22 }}>👥</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Refer a friend and earn £50!</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>Invite other workers to join Starff and earn rewards.</div>
          </div>
        </div>
        <Link href="/dashboard/help" style={{ background: '#fff', color: 'var(--navy-900)', borderRadius: 10, padding: '9px 18px', fontWeight: 700, fontSize: 13.5, textDecoration: 'none', whiteSpace: 'nowrap' }}>Refer Now →</Link>
      </div>
    </div>
  );
}
