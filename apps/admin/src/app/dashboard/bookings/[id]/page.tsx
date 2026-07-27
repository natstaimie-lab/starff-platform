'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, Badge } from '@/components/ui';
import { Modal, Field, TextInput, Button } from '@/components/Modal';
import * as Ic from '@/components/icons';

// ISO → value for <input type="datetime-local"> (local time, no seconds).
const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const DAYS = [{ n: 1, l: 'Mon' }, { n: 2, l: 'Tue' }, { n: 3, l: 'Wed' }, { n: 4, l: 'Thu' }, { n: 5, l: 'Fri' }, { n: 6, l: 'Sat' }, { n: 0, l: 'Sun' }];
const dayNames = (days: number[]) => DAYS.filter((d) => days.includes(d.n)).map((d) => d.l).join(', ');
// How many shifts booking one worker will generate (mirrors the API's builder).
const occurrenceCount = (startDate?: string | null, endDate?: string | null, days?: number[] | null): number => {
  if (!days || days.length === 0 || !startDate || !endDate) return 1;
  const set = new Set(days);
  const cur = new Date(startDate); cur.setHours(0, 0, 0, 0);
  const last = new Date(endDate); last.setHours(0, 0, 0, 0);
  let n = 0, guard = 0;
  while (cur <= last && guard++ < 400) { if (set.has(cur.getDay())) n++; cur.setDate(cur.getDate() + 1); }
  return n;
};

type Contact = { firstName: string; lastName: string; email: string; phone?: string | null; isPrimary: boolean };
type Rec = {
  candidateId: string; name: string; headline: string | null; city: string | null;
  status: string; available: boolean; score: number; reasons: string[];
  missingRequirements: string[]; conflict: boolean; pipelineStatus: string | null;
  reliabilityLevel: 'LOW' | 'WATCH' | 'MEDIUM' | 'HIGH';
};
const RELIABILITY: Record<string, { tone: string; label: string }> = {
  LOW: { tone: 'success', label: 'Reliable' }, WATCH: { tone: 'info', label: 'Watch' },
  MEDIUM: { tone: 'warning', label: 'Medium concern' }, HIGH: { tone: 'error', label: 'High concern' },
};
type Analysis = {
  aiEnhanced: boolean; summary: string; mandatory: string[]; preferred: string[];
  skills: string[]; requiredDocuments: string[]; requiredQualifications: string[];
  suitableSectors: string[]; suitableExperience: string[]; location: string;
  availability: string; clientPreferences: string[];
};
type Excluded = { candidateId: string; name: string; headline: string | null; city: string | null; status: string; reasons: string[]; pipelineStatus: string | null };
type Job = {
  id: string; title: string; description?: string | null; status: string; openings: number;
  payRate: string; chargeRate: string; startDate?: string | null; endDate?: string | null;
  recurrenceDays?: number[]; shiftStartTime?: string | null; shiftEndTime?: string | null; openEnded?: boolean;
  sector?: string | null; ppe?: string | null; uniform?: string | null; siteInstructions?: string | null;
  reportingContact?: string | null; reportingInstructions?: string | null;
  requiredQualifications?: string | null; experienceRequirements?: string | null;
  transportRequirements?: string | null; clientRequirements?: string | null; bookingUrgency?: string | null;
  breakInfo?: string | null; notes?: string | null;
  distributionMode?: string | null; submittedAt?: string | null; approvedAt?: string | null; reviewNote?: string | null;
  client: { id: string; name: string; city?: string | null; contacts: Contact[] };
  site?: { name: string } | null;
  shifts: { id: string; status: string }[];
  applications: App[];
  _count: { shifts: number; applications: number };
};
type App = {
  id: string; status: string; matchScore?: number | null;
  respondedAt?: string | null; candidateResponseNote?: string | null;
  clientDecisionNote?: string | null; adminSummary?: string | null;
  invitedAt?: string | null; offerOpenedAt?: string | null; responseDeadline?: string | null;
  candidate: { id: string; firstName: string; lastName: string; rating?: number | null; status: string };
};
function offerDelivery(a: App): string | null {
  if (a.status === 'WITHDRAWN') return 'Offer withdrawn';
  if (a.status !== 'INVITED') return null;
  if (a.responseDeadline && new Date(a.responseDeadline) < new Date()) return 'Expired — no response';
  if (a.offerOpenedAt) return 'Delivered · opened, awaiting reply';
  if (a.invitedAt) return 'Delivered · not opened yet';
  return null;
}

const tone: Record<string, string> = {
  DRAFT: 'neutral', OPEN: 'warning', SUBMITTED: 'warning', UNDER_REVIEW: 'warning', APPROVED: 'info',
  RECRUITING: 'info', OFFERS_SENT: 'info', CANDIDATES_SUBMITTED: 'info', PARTIALLY_FILLED: 'warning',
  FILLED: 'success', CONFIRMED: 'success', IN_PROGRESS: 'info', COMPLETED: 'success', CLOSED: 'neutral', CANCELLED: 'error',
};
const label: Record<string, string> = {
  DRAFT: 'Draft', OPEN: 'Open', SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under review', APPROVED: 'Approved',
  RECRUITING: 'Matching candidates', OFFERS_SENT: 'Offers sent', CANDIDATES_SUBMITTED: 'Awaiting client approval',
  PARTIALLY_FILLED: 'Partially filled', FILLED: 'Fully filled', CONFIRMED: 'Confirmed', IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed', CLOSED: 'Closed', CANCELLED: 'Cancelled',
};
const appTone: Record<string, string> = {
  INVITED: 'warning', INTERESTED: 'success', UNAVAILABLE: 'neutral', INFO_REQUESTED: 'info', DECLINED: 'neutral',
  SUBMITTED_TO_CLIENT: 'info', CLIENT_ACCEPTED: 'success', CLIENT_REJECTED: 'error', ALTERNATIVE_REQUESTED: 'warning', BOOKED: 'success', REPLACED: 'neutral',
};
const appLabel: Record<string, string> = {
  INVITED: 'Invited', INTERESTED: 'Interested', UNAVAILABLE: 'Unavailable', INFO_REQUESTED: 'Asked for info', DECLINED: 'Declined',
  SUBMITTED_TO_CLIENT: 'Submitted to client', CLIENT_ACCEPTED: 'Client accepted', CLIENT_REJECTED: 'Client rejected', ALTERNATIVE_REQUESTED: 'Alternative requested', BOOKED: 'Booked', REPLACED: 'Replaced',
};
const gbp = (v?: string | number | null) => (v == null || v === '' ? '—' : '£' + Number(v).toFixed(2));

const CHIP_STYLE: Record<string, React.CSSProperties> = {
  mand: { background: 'var(--orange-100)', color: 'var(--orange-600)' },
  pref: { background: 'var(--info-100, #e6f0ff)', color: 'var(--blue-500)' },
  doc: { background: 'var(--surface-sunken)', color: 'var(--text-secondary)' },
};
function ChipList({ label, items, tone }: { label: string; items: string[]; tone: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="dim" style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {items.map((it, i) => <span key={i} style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 999, fontWeight: 600, ...CHIP_STYLE[tone] }}>{it}</span>)}
      </div>
    </div>
  );
}
const dt = (s?: string | null) => (s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const fmt = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const [j, setJ] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState('');
  const [charge, setCharge] = useState('');
  const [mode, setMode] = useState('assisted');
  const [recs, setRecs] = useState<Rec[] | null>(null);
  const [excluded, setExcluded] = useState<Excluded[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deadline, setDeadline] = useState('');
  const [inviting, setInviting] = useState(false);
  const [subSel, setSubSel] = useState<Set<string>>(new Set());
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [ef, setEf] = useState<Record<string, string>>({});
  const [efRecurring, setEfRecurring] = useState(false);
  const [efDays, setEfDays] = useState<number[]>([]);
  const [efOpenEnded, setEfOpenEnded] = useState(false);
  const [extending, setExtending] = useState(false);

  async function extendSchedule() {
    if (!j) return;
    setExtending(true);
    try {
      const r = await apiFetch<{ shiftsCreated: number; workers: number; through: string | null }>(`/applications/jobs/${j.id}/extend-recurring`, { method: 'POST' });
      alert(r.shiftsCreated > 0
        ? `Added ${r.shiftsCreated} shift${r.shiftsCreated === 1 ? '' : 's'} across ${r.workers} worker${r.workers === 1 ? '' : 's'}${r.through ? `, through ${new Date(r.through).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}.`
        : 'No new shifts needed — the schedule is already generated ahead.');
      await load();
    } catch (e: any) { alert(e.message); } finally { setExtending(false); }
  }

  const [ending, setEnding] = useState(false);
  async function endJob() {
    if (!j) return;
    if (!confirm('End this recurring job? Upcoming shifts will be cancelled (workers notified) and the job closed. Completed shifts and timesheets are kept.')) return;
    setEnding(true);
    try {
      const r = await apiFetch<{ cancelledShifts: number }>(`/jobs/${j.id}/end`, { method: 'POST' });
      alert(`Job ended. ${r.cancelledShifts} upcoming shift${r.cancelledShifts === 1 ? '' : 's'} cancelled.`);
      await load();
    } catch (e: any) { alert(e.message); } finally { setEnding(false); }
  }

  function openEdit() {
    if (!j) return;
    const days = j.recurrenceDays ?? [];
    setEfRecurring(days.length > 0);
    setEfDays(days);
    setEfOpenEnded(!!j.openEnded);
    setEf({
      title: j.title ?? '', sector: j.sector ?? '', openings: String(j.openings ?? 1),
      payRate: String(j.payRate ?? ''), chargeRate: String(j.chargeRate ?? ''),
      startDate: toLocalInput(j.startDate), endDate: toLocalInput(j.endDate),
      shiftStartTime: j.shiftStartTime ?? '', shiftEndTime: j.shiftEndTime ?? '',
      breakInfo: j.breakInfo ?? '', requiredQualifications: j.requiredQualifications ?? '',
      experienceRequirements: j.experienceRequirements ?? '', bookingUrgency: j.bookingUrgency ?? 'Standard',
      ppe: j.ppe ?? '', uniform: j.uniform ?? '', transportRequirements: j.transportRequirements ?? '',
      clientRequirements: j.clientRequirements ?? '',
      reportingContact: j.reportingContact ?? '', reportingInstructions: j.reportingInstructions ?? '',
      siteInstructions: j.siteInstructions ?? '', notes: j.notes ?? '',
    });
    setEditing(true);
  }
  const toggleEfDay = (n: number) => setEfDays((ds) => (ds.includes(n) ? ds.filter((d) => d !== n) : [...ds, n]));

  async function saveEdit() {
    if (efRecurring && (efDays.length === 0 || !ef.shiftStartTime || !ef.shiftEndTime)) {
      alert('For a recurring job, pick at least one day and set the daily start and finish time.');
      return;
    }
    setSavingEdit(true);
    try {
      await apiFetch(`/jobs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: ef.title, sector: ef.sector || undefined, openings: Number(ef.openings) || 1,
          payRate: Number(ef.payRate), chargeRate: Number(ef.chargeRate),
          startDate: ef.startDate ? new Date(ef.startDate).toISOString() : undefined,
          endDate: efRecurring && efOpenEnded ? undefined : (ef.endDate ? new Date(ef.endDate).toISOString() : undefined),
          recurrenceDays: efRecurring ? efDays : [],
          shiftStartTime: efRecurring ? ef.shiftStartTime : null,
          shiftEndTime: efRecurring ? ef.shiftEndTime : null,
          openEnded: efRecurring ? efOpenEnded : false,
          breakInfo: ef.breakInfo || undefined, requiredQualifications: ef.requiredQualifications || undefined,
          experienceRequirements: ef.experienceRequirements || undefined, bookingUrgency: ef.bookingUrgency || undefined,
          ppe: ef.ppe || undefined, uniform: ef.uniform || undefined,
          transportRequirements: ef.transportRequirements || undefined, clientRequirements: ef.clientRequirements || undefined,
          reportingContact: ef.reportingContact || undefined,
          reportingInstructions: ef.reportingInstructions || undefined, siteInstructions: ef.siteInstructions || undefined,
          notes: ef.notes || undefined,
        }),
      });
      setEditing(false);
      await load();
    } catch (e: any) { alert(e.message); } finally { setSavingEdit(false); }
  }

  const RECRUITING_STAGES = ['APPROVED', 'RECRUITING', 'OFFERS_SENT', 'CANDIDATES_SUBMITTED', 'PARTIALLY_FILLED'];

  const loadRecs = () => {
    setRecsLoading(true);
    apiFetch<{ recommendations: Rec[]; excluded: Excluded[] }>(`/jobs/${id}/recommendations`)
      .then((r) => { setRecs(r.recommendations); setExcluded(r.excluded ?? []); setSelected(new Set()); })
      .catch((e) => setError(e.message))
      .finally(() => setRecsLoading(false));
  };
  async function inviteOne(candidateId: string) {
    try {
      await apiFetch(`/jobs/${id}/invite`, { method: 'POST', body: JSON.stringify({ candidateIds: [candidateId] }) });
      await load();
    } catch (e: any) { alert(e.message); }
  }
  const toggle = (cid: string) => setSelected((s) => { const n = new Set(s); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });
  async function invite() {
    if (selected.size === 0) return;
    setInviting(true);
    try {
      await apiFetch(`/jobs/${id}/invite`, {
        method: 'POST',
        body: JSON.stringify({ candidateIds: [...selected], responseDeadline: deadline ? new Date(deadline).toISOString() : undefined }),
      });
      await load(); // refreshes job + recs (pipeline status updates)
    } catch (e: any) { alert(e.message); } finally { setInviting(false); }
  }
  const toggleSub = (appId: string) => setSubSel((s) => { const n = new Set(s); n.has(appId) ? n.delete(appId) : n.add(appId); return n; });
  async function submitToClient() {
    if (subSel.size === 0) return;
    setSubmitting(true);
    try {
      const picked: Record<string, string> = {};
      for (const aid of subSel) if (summaries[aid]?.trim()) picked[aid] = summaries[aid].trim();
      await apiFetch(`/jobs/${id}/submit-to-client`, {
        method: 'POST',
        body: JSON.stringify({ applicationIds: [...subSel], summaries: picked }),
      });
      setSubSel(new Set());
      await load();
    } catch (e: any) { alert(e.message); } finally { setSubmitting(false); }
  }
  async function confirmBooking(appId: string) {
    setBooking(appId);
    try {
      await apiFetch(`/applications/${appId}/book`, { method: 'POST' });
      await load();
    } catch (e: any) { alert(e.message); } finally { setBooking(null); }
  }
  async function withdrawOffer(appId: string) {
    if (!confirm('Withdraw this offer? The candidate will be notified.')) return;
    setBooking(appId);
    try { await apiFetch(`/applications/${appId}/withdraw`, { method: 'POST' }); await load(); }
    catch (e: any) { alert(e.message); } finally { setBooking(null); }
  }
  async function replaceWorker(appId: string) {
    const reason = window.prompt('Reason for replacing this worker (optional):') ?? undefined;
    if (reason === undefined) return; // cancelled
    setBooking(appId);
    try {
      await apiFetch(`/applications/${appId}/replace`, { method: 'POST', body: JSON.stringify({ reason }) });
      await load();
    } catch (e: any) { alert(e.message); } finally { setBooking(null); }
  }
  const load = () =>
    apiFetch<Job>(`/jobs/${id}`)
      .then((job) => {
        setJ(job);
        setPay(String(job.payRate ?? ''));
        setCharge(String(job.chargeRate ?? ''));
        setMode(job.distributionMode ?? 'assisted');
        if (RECRUITING_STAGES.includes(job.status)) loadRecs();
      })
      .catch((e) => setError(e.message));
  useEffect(() => { load(); apiFetch<Analysis>(`/jobs/${id}/analysis`).then(setAnalysis).catch(() => {}); }, [id]);

  async function approve() {
    setBusy(true);
    try {
      await apiFetch(`/jobs/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ payRate: Number(pay), chargeRate: Number(charge), distributionMode: mode }),
      });
      await load();
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }
  async function reject() {
    const note = window.prompt('Reason for rejecting this request (sent to the client):') ?? undefined;
    if (note === undefined) return;
    setBusy(true);
    try { await apiFetch(`/jobs/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }); await load(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }
  async function requestInfo() {
    const note = window.prompt('What extra information is needed? (sent to the client):') ?? undefined;
    if (note === undefined || !note.trim()) return;
    setBusy(true);
    try { await apiFetch(`/jobs/${id}/request-info`, { method: 'POST', body: JSON.stringify({ note }) }); await load(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }

  if (error) return <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>;
  if (!j) return <p className="dim">Loading…</p>;

  const primary = j.client.contacts.find((c) => c.isPrimary) ?? j.client.contacts[0];
  const booked = j.shifts.filter((s) => s.status !== 'OPEN' && s.status !== 'CANCELLED').length;
  const awaitingReview = j.status === 'SUBMITTED' || j.status === 'UNDER_REVIEW';

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="fx jb" style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13.5, gap: 16 }}>
      <span className="dim" style={{ flexShrink: 0 }}>{k}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span>
    </div>
  );
  const inp = { width: '100%', height: 38, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 14 } as React.CSSProperties;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link href="/dashboard/bookings" className="link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>← Back to bookings</Link>

      {editing && (
        <Modal
          title="Edit job"
          subtitle="Amend the job details — changes are audited"
          onClose={() => setEditing(false)}
          footer={<>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={savingEdit || !ef.title?.trim()}>{savingEdit ? 'Saving…' : 'Save changes'}</Button>
          </>}
        >
          <Field label="Role / title"><TextInput value={ef.title} onChange={(e) => setEf({ ...ef, title: e.target.value })} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Sector"><TextInput value={ef.sector} onChange={(e) => setEf({ ...ef, sector: e.target.value })} /></Field>
            <Field label="Workers needed"><TextInput type="number" value={ef.openings} onChange={(e) => setEf({ ...ef, openings: e.target.value })} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Pay rate / hr (£)"><TextInput type="number" value={ef.payRate} onChange={(e) => setEf({ ...ef, payRate: e.target.value })} /></Field>
            <Field label="Charge rate / hr (£)"><TextInput type="number" value={ef.chargeRate} onChange={(e) => setEf({ ...ef, chargeRate: e.target.value })} /></Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '9px 11px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', background: efRecurring ? 'var(--blue-50, #eef4ff)' : 'transparent' }}>
            <input type="checkbox" checked={efRecurring} onChange={(e) => setEfRecurring(e.target.checked)} style={{ width: 16, height: 16 }} />
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>Recurring / ongoing shift</span>
          </label>
          {!efRecurring ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Shift start"><TextInput type="datetime-local" value={ef.startDate} onChange={(e) => setEf({ ...ef, startDate: e.target.value })} /></Field>
              <Field label="Shift finish"><TextInput type="datetime-local" value={ef.endDate} onChange={(e) => setEf({ ...ef, endDate: e.target.value })} /></Field>
            </div>
          ) : (
            <>
              <Field label="Repeats on">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {DAYS.map((d) => {
                    const on = efDays.includes(d.n);
                    return (
                      <button type="button" key={d.n} onClick={() => toggleEfDay(d.n)}
                        style={{ padding: '6px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                          border: on ? '1px solid var(--blue-500)' : '1px solid var(--border-strong)',
                          background: on ? 'var(--blue-500)' : 'var(--surface-card)', color: on ? '#fff' : 'var(--text-secondary)' }}>
                        {d.l}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Daily start time"><TextInput type="time" value={ef.shiftStartTime} onChange={(e) => setEf({ ...ef, shiftStartTime: e.target.value })} /></Field>
                <Field label="Daily finish time"><TextInput type="time" value={ef.shiftEndTime} onChange={(e) => setEf({ ...ef, shiftEndTime: e.target.value })} /></Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: efOpenEnded ? '1fr' : '1fr 1fr', gap: 12 }}>
                <Field label="Runs from"><TextInput type="date" value={(ef.startDate || '').slice(0, 10)} onChange={(e) => setEf({ ...ef, startDate: e.target.value })} /></Field>
                {!efOpenEnded && <Field label="Runs until"><TextInput type="date" value={(ef.endDate || '').slice(0, 10)} onChange={(e) => setEf({ ...ef, endDate: e.target.value })} /></Field>}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
                <input type="checkbox" checked={efOpenEnded} onChange={(e) => setEfOpenEnded(e.target.checked)} style={{ width: 15, height: 15 }} />
                <span style={{ fontSize: 13 }}>Until further notice (ongoing, no end date)</span>
              </label>
              <p className="dim" style={{ fontSize: 12, margin: 0 }}>
                {efOpenEnded
                  ? 'Ongoing — booking generates 6 weeks of shifts, rolling. Use “Extend schedule” to add more.'
                  : `Booking a worker will create ${occurrenceCount(ef.startDate, ef.endDate, efDays)} shift(s) — one per selected day in range.`}
              </p>
            </>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Breaks"><TextInput value={ef.breakInfo} onChange={(e) => setEf({ ...ef, breakInfo: e.target.value })} /></Field>
            <Field label="Booking urgency">
              <select value={ef.bookingUrgency} onChange={(e) => setEf({ ...ef, bookingUrgency: e.target.value })} style={{ width: '100%', height: 38, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 14 }}>
                {['Standard', 'Urgent', 'Emergency'].map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Required skills / quals / licences"><TextInput value={ef.requiredQualifications} onChange={(e) => setEf({ ...ef, requiredQualifications: e.target.value })} /></Field>
          <Field label="Experience required"><TextInput value={ef.experienceRequirements} onChange={(e) => setEf({ ...ef, experienceRequirements: e.target.value })} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="PPE"><TextInput value={ef.ppe} onChange={(e) => setEf({ ...ef, ppe: e.target.value })} /></Field>
            <Field label="Uniform / dress code"><TextInput value={ef.uniform} onChange={(e) => setEf({ ...ef, uniform: e.target.value })} /></Field>
          </div>
          <Field label="Transport requirements"><TextInput value={ef.transportRequirements} onChange={(e) => setEf({ ...ef, transportRequirements: e.target.value })} /></Field>
          <Field label="Client-specific requirements"><TextInput value={ef.clientRequirements} onChange={(e) => setEf({ ...ef, clientRequirements: e.target.value })} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Reporting contact"><TextInput value={ef.reportingContact} onChange={(e) => setEf({ ...ef, reportingContact: e.target.value })} /></Field>
            <Field label="Reporting instructions"><TextInput value={ef.reportingInstructions} onChange={(e) => setEf({ ...ef, reportingInstructions: e.target.value })} /></Field>
          </div>
          <Field label="Site instructions"><TextInput value={ef.siteInstructions} onChange={(e) => setEf({ ...ef, siteInstructions: e.target.value })} /></Field>
          <Field label="Additional notes"><TextInput value={ef.notes} onChange={(e) => setEf({ ...ef, notes: e.target.value })} /></Field>
        </Modal>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 16 }}>
        {/* Left — request detail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <div className="fx ac jb" style={{ gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{j.title}</div>
                <div className="dim" style={{ fontSize: 13 }}>{j.client.name}{j.site?.name ? ` · ${j.site.name}` : j.client.city ? ` · ${j.client.city}` : ''}</div>
              </div>
              <div className="fx ac" style={{ gap: 10 }}>
                <Badge tone={(tone[j.status] ?? 'neutral') as any}>{label[j.status] ?? j.status}</Badge>
                {j.openEnded && ['PARTIALLY_FILLED', 'FILLED', 'CONFIRMED', 'IN_PROGRESS'].includes(j.status) && (
                  <button onClick={extendSchedule} disabled={extending} className="aibtn" style={{ border: 'none', background: 'var(--orange-100)', color: 'var(--orange-600)', fontWeight: 700 }}>{extending ? 'Extending…' : 'Extend schedule'}</button>
                )}
                {(j.recurrenceDays?.length ?? 0) > 0 && !['CLOSED', 'CANCELLED', 'COMPLETED'].includes(j.status) && (
                  <button onClick={endJob} disabled={ending} className="aibtn" style={{ border: 'none', background: 'var(--error-100)', color: 'var(--error-600)', fontWeight: 700 }}>{ending ? 'Ending…' : 'End job'}</button>
                )}
                {j.status !== 'CANCELLED' && j.status !== 'COMPLETED' && (
                  <button onClick={openEdit} className="aibtn" style={{ border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', color: 'var(--text-secondary)', fontWeight: 700 }}>Edit</button>
                )}
              </div>
            </div>
          </Card>

          {analysis && (
            <Card title="AI job analysis" subtitle="Structured matching profile — Starff decides, this is a guide" action={<Badge tone={(analysis.aiEnhanced ? 'accent' : 'neutral') as any}>{analysis.aiEnhanced ? 'AI' : 'Auto'}</Badge>}>
              <p style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 12 }}>{analysis.summary}</p>
              <ChipList label="Must have" items={analysis.mandatory} tone="mand" />
              <ChipList label="Preferred" items={analysis.preferred} tone="pref" />
              <ChipList label="Required documents" items={analysis.requiredDocuments} tone="doc" />
              <ChipList label="Suitable sectors" items={analysis.suitableSectors} tone="doc" />
              <ChipList label="Suitable experience" items={analysis.suitableExperience} tone="pref" />
              {analysis.clientPreferences.length > 0 && <ChipList label="Client preferences" items={analysis.clientPreferences} tone="doc" />}
            </Card>
          )}

          <Card title="Job request">
            <Row k="Sector" v={j.sector ?? '—'} />
            <Row k="Booking urgency" v={j.bookingUrgency ? <Badge tone={(j.bookingUrgency === 'Emergency' ? 'error' : j.bookingUrgency === 'Urgent' ? 'warning' : 'neutral') as any}>{j.bookingUrgency}</Badge> : '—'} />
            <Row k="Workers required" v={j.openings} />
            {j.recurrenceDays && j.recurrenceDays.length > 0 ? (
              <>
                <Row k="Pattern" v={<Badge tone={j.openEnded ? 'warning' : 'info'}>{j.openEnded ? 'Ongoing (until further notice)' : 'Recurring'}</Badge>} />
                <Row k="Repeats on" v={dayNames(j.recurrenceDays)} />
                <Row k="Daily time" v={j.shiftStartTime && j.shiftEndTime ? `${j.shiftStartTime}–${j.shiftEndTime}` : '—'} />
                <Row k="Runs" v={j.openEnded ? `${dt(j.startDate)} → ongoing` : `${dt(j.startDate)} → ${dt(j.endDate)}`} />
                {j.openEnded
                  ? <Row k="Schedule" v={<span className="dim" style={{ fontSize: 12.5 }}>Shifts generated 6 weeks ahead, rolling — use “Extend schedule” to add more.</span>} />
                  : <Row k="Shifts per worker" v={<b>{occurrenceCount(j.startDate, j.endDate, j.recurrenceDays)}</b>} />}
              </>
            ) : (
              <>
                <Row k="Shift start" v={dt(j.startDate)} />
                <Row k="Shift finish" v={dt(j.endDate)} />
              </>
            )}
            <Row k="Breaks" v={j.breakInfo ?? '—'} />
            <Row k="Pay rate / hr" v={gbp(j.payRate)} />
            <Row k="Charge rate / hr" v={gbp(j.chargeRate)} />
            {j.description && <Row k="Description" v={j.description} />}
          </Card>

          <Card title="Requirements & instructions">
            <Row k="Required skills / quals / licences" v={j.requiredQualifications ?? '—'} />
            <Row k="Experience required" v={j.experienceRequirements ?? '—'} />
            <Row k="PPE" v={j.ppe ?? '—'} />
            <Row k="Uniform / dress code" v={j.uniform ?? '—'} />
            <Row k="Transport" v={j.transportRequirements ?? '—'} />
            <Row k="Client-specific" v={j.clientRequirements ?? '—'} />
            <Row k="Reporting contact" v={j.reportingContact ?? '—'} />
            <Row k="Reporting instructions" v={j.reportingInstructions ?? '—'} />
            <Row k="Site instructions" v={j.siteInstructions ?? '—'} />
            <Row k="Additional notes" v={j.notes ?? '—'} />
          </Card>

          <Card title="Client contact">
            {primary ? (
              <>
                <Row k="Name" v={`${primary.firstName} ${primary.lastName}`} />
                <Row k="Email" v={primary.email} />
                <Row k="Phone" v={primary.phone ?? '—'} />
              </>
            ) : <p className="dim" style={{ fontSize: 13.5 }}>No contact on file.</p>}
          </Card>
        </div>

        {/* Right — review + pipeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Admin review">
            {awaitingReview ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Badge tone="warning">Awaiting review</Badge>
                  {j.submittedAt && <span className="dim" style={{ fontSize: 12.5 }}>submitted {fmt(j.submittedAt)}</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <label style={{ fontSize: 12.5 }}><span className="dim">Pay / hr (£)</span><input type="number" step="0.01" value={pay} onChange={(e) => setPay(e.target.value)} style={inp} /></label>
                  <label style={{ fontSize: 12.5 }}><span className="dim">Charge / hr (£)</span><input type="number" step="0.01" value={charge} onChange={(e) => setCharge(e.target.value)} style={inp} /></label>
                </div>
                <label style={{ fontSize: 12.5, display: 'block', marginBottom: 12 }}><span className="dim">Distribution</span>
                  <select value={mode} onChange={(e) => setMode(e.target.value)} style={inp}>
                    <option value="assisted">Assisted matching</option>
                    <option value="manual">Manual selection</option>
                  </select>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button disabled={busy} onClick={approve} className="aibtn" style={{ background: 'var(--success-500)', color: '#fff', border: 'none', width: '100%', justifyContent: 'center' }}><Ic.Check width={16} /> Approve &amp; start recruiting</button>
                  <button disabled={busy} onClick={requestInfo} style={{ background: 'var(--orange-100)', color: 'var(--orange-600)', border: 'none', fontWeight: 700, fontSize: 13, padding: '9px 12px', borderRadius: 10, cursor: 'pointer' }}>Request more information</button>
                  <button disabled={busy} onClick={reject} style={{ background: 'var(--surface-card)', color: 'var(--error-600)', border: '1px solid var(--border-subtle)', fontWeight: 700, fontSize: 13, padding: '9px 12px', borderRadius: 10, cursor: 'pointer' }}>Reject request</button>
                </div>
              </>
            ) : (
              <p className="dim" style={{ fontSize: 13.5 }}>
                {j.status === 'CANCELLED' ? 'This request was rejected / cancelled.' : `Approved ${fmt(j.approvedAt)}. Distribution: ${j.distributionMode ?? '—'}.`}
              </p>
            )}
            {j.reviewNote && <p className="dim" style={{ fontSize: 12.5, marginTop: 10 }}>Note: {j.reviewNote}</p>}
          </Card>

          <Card title="Recruitment pipeline">
            <Row k="Workers required" v={j.openings} />
            <Row k="Booked" v={booked} />
            <Row k="Candidates in pipeline" v={j._count.applications} />
            <p className="dim" style={{ fontSize: 12.5, marginTop: 10 }}>
              {awaitingReview
                ? 'Approve the request to begin candidate matching and invitations.'
                : 'Recommended candidates are ranked below. You choose who to invite.'}
            </p>
          </Card>
        </div>
      </div>

      {/* Candidate recommendations — admin picks who to invite */}
      {RECRUITING_STAGES.includes(j.status) && (
        <Card
          title="Recommended candidates"
          subtitle="Ranked by suitability from live candidate data — Starff decides who to invite"
          action={<button className="aibtn" onClick={loadRecs} disabled={recsLoading}>{recsLoading ? 'Scoring…' : 'Refresh'}</button>}
        >
          {recsLoading && !recs ? <p className="dim">Scoring candidates…</p>
            : !recs || recs.length === 0 ? <p className="dim" style={{ fontSize: 13.5 }}>No candidates to recommend yet.</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* invite action bar */}
                <div className="fx ac jb" style={{ gap: 12, flexWrap: 'wrap', padding: '2px 0 10px' }}>
                  <span className="dim" style={{ fontSize: 13 }}>{selected.size} selected</span>
                  <div className="fx ac" style={{ gap: 8 }}>
                    <label className="dim" style={{ fontSize: 12.5 }}>Respond by <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ height: 34, padding: '0 8px', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 13, marginLeft: 6 }} /></label>
                    <button className="aibtn" style={{ background: 'var(--blue-500)', color: '#fff', border: 'none' }} disabled={inviting || selected.size === 0} onClick={invite}>{inviting ? 'Inviting…' : `Invite ${selected.size || ''} selected`.trim()}</button>
                  </div>
                </div>
                {recs.map((r) => (
                  <div key={r.candidateId} style={{ display: 'grid', gridTemplateColumns: '28px 48px minmax(0,1fr)', gap: 12, alignItems: 'start', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <input type="checkbox" checked={selected.has(r.candidateId)} onChange={() => toggle(r.candidateId)} style={{ marginTop: 4, width: 16, height: 16, cursor: 'pointer' }} />
                    {/* score dial */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: r.conflict ? 'var(--error-600)' : r.score >= 70 ? 'var(--success-600)' : r.score >= 45 ? 'var(--orange-600)' : 'var(--text-tertiary)' }}>{r.score}</div>
                      <div className="dim" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>score</div>
                    </div>
                    <div>
                      <div className="fx ac jb" style={{ gap: 8 }}>
                        <div>
                          <Link href={`/dashboard/candidates/${r.candidateId}`} className="nm" style={{ color: 'var(--blue-500)' }}>{r.name}</Link>
                          <span className="dim" style={{ fontSize: 12.5 }}> · {r.headline ?? '—'}{r.city ? ` · ${r.city}` : ''}</span>
                        </div>
                        <div className="fx ac" style={{ gap: 6 }}>
                          {r.reliabilityLevel !== 'LOW' && <Badge tone={(RELIABILITY[r.reliabilityLevel]?.tone) as any}>{RELIABILITY[r.reliabilityLevel]?.label}</Badge>}
                          {r.pipelineStatus
                            ? <Badge tone="info">{label[r.pipelineStatus] ?? r.pipelineStatus.replace(/_/g, ' ').toLowerCase()}</Badge>
                            : r.conflict ? <Badge tone="error">Conflict</Badge> : null}
                        </div>
                      </div>
                      {/* score bar */}
                      <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-sunken)', margin: '8px 0' }}>
                        <div style={{ height: 6, width: `${r.score}%`, borderRadius: 999, background: r.conflict ? 'var(--error-500)' : r.score >= 70 ? 'var(--success-500)' : 'var(--orange-500)' }} />
                      </div>
                      {r.reasons.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                          {r.reasons.map((rn, i) => <span key={i} style={{ fontSize: 11.5, background: 'var(--success-100)', color: 'var(--success-600)', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>{rn}</span>)}
                        </div>
                      )}
                      {r.missingRequirements.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {r.missingRequirements.map((m, i) => <span key={i} style={{ fontSize: 11.5, background: 'var(--orange-100)', color: 'var(--orange-600)', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>⚠ {m}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <p className="dim" style={{ fontSize: 12, marginTop: 4 }}>Ranked from eligible candidates. Select and invite them; they confirm availability before you submit anyone to the client.</p>
              </div>
            )}

          {/* Transparent eligibility filtering — who was excluded and why */}
          {excluded.length > 0 && (
            <details style={{ marginTop: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13.5 }}>Excluded from shortlist ({excluded.length}) — and why</summary>
              <p className="dim" style={{ fontSize: 12, margin: '6px 0 10px' }}>These candidates were filtered out for this job. They are not rejected or removed — you can still invite anyone here as an override.</p>
              {excluded.map((e) => (
                <div key={e.candidateId} className="fx ac jb" style={{ padding: '9px 0', borderBottom: '1px solid var(--border-subtle)', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <Link href={`/dashboard/candidates/${e.candidateId}`} className="nm" style={{ color: 'var(--blue-500)' }}>{e.name}</Link>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
                      {e.reasons.map((r, i) => <span key={i} style={{ fontSize: 11, background: 'var(--error-50, #fdecec)', color: 'var(--error-600)', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>{r}</span>)}
                    </div>
                  </div>
                  {!e.pipelineStatus && <button onClick={() => inviteOne(e.candidateId)} style={{ border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12, padding: '4px 10px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}>Invite anyway</button>}
                </div>
              ))}
            </details>
          )}
        </Card>
      )}

      {/* Candidate pipeline — responses, submit-to-client, client decisions */}
      {j.applications.length > 0 && (
        <Card
          title="Candidate pipeline"
          subtitle="Invited candidates, their responses, and client decisions — you submit and confirm"
          action={
            <button className="aibtn" style={{ background: 'var(--blue-500)', color: '#fff', border: 'none' }} disabled={submitting || subSel.size === 0} onClick={submitToClient}>
              {submitting ? 'Submitting…' : `Submit ${subSel.size || ''} to client`.trim()}
            </button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {j.applications.map((a) => {
              const canSubmit = a.status === 'INTERESTED';
              return (
                <div key={a.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div className="fx ac jb" style={{ gap: 10 }}>
                    <div className="fx ac" style={{ gap: 10 }}>
                      {canSubmit && <input type="checkbox" checked={subSel.has(a.id)} onChange={() => toggleSub(a.id)} style={{ width: 16, height: 16, cursor: 'pointer' }} />}
                      <div>
                        <Link href={`/dashboard/candidates/${a.candidate.id}`} className="nm" style={{ color: 'var(--blue-500)' }}>{a.candidate.firstName} {a.candidate.lastName}</Link>
                        <span className="dim" style={{ fontSize: 12.5 }}>{a.matchScore != null ? ` · match ${a.matchScore}` : ''}{a.candidate.rating != null ? ` · ★ ${a.candidate.rating.toFixed(1)}` : ''}</span>
                      </div>
                    </div>
                    <Badge tone={(appTone[a.status] ?? 'neutral') as any}>{appLabel[a.status] ?? a.status}</Badge>
                  </div>
                  {offerDelivery(a) && <div className="dim" style={{ fontSize: 12, marginTop: 3 }}>📨 {offerDelivery(a)}</div>}
                  {a.candidateResponseNote && <div className="dim" style={{ fontSize: 12.5, marginTop: 4 }}>Candidate: “{a.candidateResponseNote}”</div>}
                  {a.clientDecisionNote && <div className="dim" style={{ fontSize: 12.5, marginTop: 4 }}>Client: “{a.clientDecisionNote}”</div>}
                  {['INVITED', 'INTERESTED', 'UNAVAILABLE', 'INFO_REQUESTED', 'SUBMITTED_TO_CLIENT'].includes(a.status) && (
                    <button disabled={booking === a.id} onClick={() => withdrawOffer(a.id)} style={{ marginTop: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 11.5, padding: '3px 9px', borderRadius: 8, cursor: 'pointer' }}>Withdraw offer</button>
                  )}
                  {a.status === 'CLIENT_ACCEPTED' && (
                    <button className="aibtn" style={{ background: 'var(--success-500)', color: '#fff', border: 'none', marginTop: 8 }} disabled={booking === a.id} onClick={() => confirmBooking(a.id)}>
                      <Ic.Check width={15} /> {booking === a.id ? 'Confirming…' : 'Confirm booking'}
                    </button>
                  )}
                  {a.status === 'BOOKED' && (
                    <div className="fx ac" style={{ gap: 12, marginTop: 6 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--success-600)', fontWeight: 600 }}>✓ Placement confirmed</span>
                      <button disabled={booking === a.id} onClick={() => replaceWorker(a.id)} style={{ background: 'transparent', color: 'var(--error-600)', border: '1px solid var(--border-subtle)', fontWeight: 700, fontSize: 12, padding: '4px 10px', borderRadius: 8, cursor: 'pointer' }}>{booking === a.id ? 'Replacing…' : 'Replace worker'}</button>
                    </div>
                  )}
                  {a.status === 'REPLACED' && <div className="dim" style={{ fontSize: 12.5, marginTop: 6 }}>Replaced — vacancy re-opened for a new candidate.</div>}
                  {canSubmit && subSel.has(a.id) && (
                    <input
                      value={summaries[a.id] ?? ''}
                      onChange={(e) => setSummaries((s) => ({ ...s, [a.id]: e.target.value }))}
                      placeholder="Short note to the client about this candidate (optional)"
                      style={{ width: '100%', height: 34, marginTop: 8, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 13 }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <p className="dim" style={{ fontSize: 12, marginTop: 10 }}>Only candidates who confirmed interest can be submitted. Client acceptance still returns here for you to confirm the final booking.</p>
        </Card>
      )}
    </div>
  );
}
