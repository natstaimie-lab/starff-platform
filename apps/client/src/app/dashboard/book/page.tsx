'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui';

type Loc = { id: string; name: string };
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type JobDetail = Record<string, any>;
const empty = {
  title: '', sector: '', payRate: '', chargeRate: '', openings: '1', siteId: '',
  startDate: '', endDate: '', breakInfo: '', ppe: '', uniform: '', requiredQualifications: '',
  experienceRequirements: '', transportRequirements: '', clientRequirements: '', bookingUrgency: 'Standard',
  reportingContact: '', reportingInstructions: '', siteInstructions: '', notes: '', responseNote: '',
};
const DAYS = [{ n: 1, l: 'Mon' }, { n: 2, l: 'Tue' }, { n: 3, l: 'Wed' }, { n: 4, l: 'Thu' }, { n: 5, l: 'Fri' }, { n: 6, l: 'Sat' }, { n: 0, l: 'Sun' }];
const str = (v: string | number | null | undefined) => (v == null ? '' : String(v));
// ISO → the local `YYYY-MM-DDTHH:mm` a datetime-local input expects.
const toLocalInput = (iso: string | number | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function BookStaffPage() {
  const router = useRouter();
  const [locs, setLocs] = useState<Loc[]>([]);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Recurring / ongoing pattern (weekdays + a daily time window).
  const [recurring, setRecurring] = useState(false);
  const [recDays, setRecDays] = useState<number[]>([]);
  const [dailyStart, setDailyStart] = useState('');
  const [dailyEnd, setDailyEnd] = useState('');
  const [openEnded, setOpenEnded] = useState(false); // until further notice (no end date)

  useEffect(() => {
    apiFetch<Loc[]>('/client/locations').then(setLocs).catch(() => {});
    // Edit mode when the URL carries ?id= — load that request and pre-fill.
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) return;
    setEditId(id);
    setLoading(true);
    apiFetch<JobDetail>(`/client/jobs/${id}`)
      .then((j) => {
        setReviewNote(j.reviewNote ? String(j.reviewNote) : null);
        setForm({
          title: str(j.title), sector: str(j.sector), payRate: str(j.payRate), chargeRate: str(j.chargeRate),
          openings: str(j.openings) || '1', siteId: str(j.siteId),
          startDate: toLocalInput(j.startDate), endDate: toLocalInput(j.endDate),
          breakInfo: str(j.breakInfo), ppe: str(j.ppe), uniform: str(j.uniform),
          requiredQualifications: str(j.requiredQualifications), experienceRequirements: str(j.experienceRequirements),
          transportRequirements: str(j.transportRequirements), clientRequirements: str(j.clientRequirements),
          bookingUrgency: str(j.bookingUrgency) || 'Standard', reportingContact: str(j.reportingContact),
          reportingInstructions: str(j.reportingInstructions), siteInstructions: str(j.siteInstructions),
          notes: str(j.notes), responseNote: '',
        });
        const days = Array.isArray(j.recurrenceDays) ? (j.recurrenceDays as number[]) : [];
        if (days.length > 0) {
          setRecurring(true);
          setRecDays(days);
          setDailyStart(str(j.shiftStartTime));
          setDailyEnd(str(j.shiftEndTime));
          setOpenEnded(!!j.openEnded);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function toggleDay(n: number) {
    setRecDays((ds) => (ds.includes(n) ? ds.filter((d) => d !== n) : [...ds, n]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (recurring && (recDays.length === 0 || !dailyStart || !dailyEnd)) {
      setError('For a recurring shift, pick at least one day and set the daily start and finish time.');
      return;
    }
    if (recurring && !openEnded && !form.endDate) {
      setError('Set an end date, or tick "Until further notice" for an ongoing shift.');
      return;
    }
    setSaving(true); setError('');
    const recurringOpenEnded = recurring && openEnded;
    const payload = {
      title: form.title,
      payRate: Number(form.payRate),
      chargeRate: Number(form.chargeRate),
      openings: Number(form.openings),
      siteId: form.siteId || undefined,
      sector: form.sector || undefined,
      startDate: form.startDate || undefined,
      // Open-ended recurring jobs have no fixed end date.
      endDate: recurringOpenEnded ? undefined : (form.endDate || undefined),
      recurrenceDays: recurring ? recDays : [],
      shiftStartTime: recurring ? dailyStart : undefined,
      shiftEndTime: recurring ? dailyEnd : undefined,
      openEnded: recurringOpenEnded,
      breakInfo: form.breakInfo || undefined,
      ppe: form.ppe || undefined,
      uniform: form.uniform || undefined,
      requiredQualifications: form.requiredQualifications || undefined,
      experienceRequirements: form.experienceRequirements || undefined,
      transportRequirements: form.transportRequirements || undefined,
      clientRequirements: form.clientRequirements || undefined,
      bookingUrgency: form.bookingUrgency || undefined,
      reportingContact: form.reportingContact || undefined,
      reportingInstructions: form.reportingInstructions || undefined,
      siteInstructions: form.siteInstructions || undefined,
      notes: form.notes || undefined,
      ...(editId ? { responseNote: form.responseNote || undefined } : {}),
    };
    try {
      await apiFetch(editId ? `/client/jobs/${editId}` : '/client/jobs', {
        method: editId ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      setDone(true);
      setTimeout(() => router.push('/dashboard/bookings'), 900);
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }

  const input = { width: '100%', height: 40, padding: '0 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 14, outline: 'none' } as React.CSSProperties;
  const label = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 } as React.CSSProperties;

  const subhead = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)', margin: '6px 0 -2px' } as React.CSSProperties;

  return (
    <div style={{ maxWidth: 620 }}>
      <Card
        title={editId ? 'Edit staffing request' : 'Book Staff'}
        subtitle={editId ? 'Update your request and resubmit it to Starff for review' : 'Submit a staffing request — Starff will review it and source suitable workers'}
      >
        {done ? (
          <p style={{ color: 'var(--success-600)', fontWeight: 600 }}>✓ {editId ? 'Request updated and resubmitted' : 'Request submitted for review'} — taking you to My Bookings…</p>
        ) : loading ? (
          <p className="mut">Loading your request…</p>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {reviewNote && (
              <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--warning-100, #fdf3d8)', border: '1px solid #f6dd9e' }}>
                <span style={{ fontSize: 16 }}>💬</span>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--warning-600, #a9700a)', fontSize: 13.5 }}>Starff asked for more information</div>
                  <div style={{ fontSize: 13, marginTop: 2 }}>{reviewNote}</div>
                </div>
              </div>
            )}
            <p style={subhead}>The role</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label><span style={label}>Role needed</span><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Warehouse Operative" style={input} /></label>
              <label><span style={label}>Sector</span><input value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} placeholder="Logistics" style={input} /></label>
            </div>
            <label><span style={label}>Location</span>
              <select value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })} style={input}>
                <option value="">No specific site</option>
                {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label><span style={label}>Workers needed</span><input type="number" min={1} value={form.openings} onChange={(e) => setForm({ ...form, openings: e.target.value })} style={input} /></label>
              <label><span style={label}>Charge rate / hr (£)</span><input type="number" step="0.01" required value={form.chargeRate} onChange={(e) => setForm({ ...form, chargeRate: e.target.value })} placeholder="19.50" style={input} /></label>
            </div>
            <label><span style={label}>Pay rate to worker / hr (£)</span><input type="number" step="0.01" required value={form.payRate} onChange={(e) => setForm({ ...form, payRate: e.target.value })} placeholder="13.50" style={input} /></label>

            <p style={subhead}>Shift</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', background: recurring ? 'var(--blue-50, #eef4ff)' : 'transparent' }}>
              <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} style={{ width: 16, height: 16 }} />
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>Recurring / ongoing shift <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>— repeats on set days over a date range</span></span>
            </label>

            {!recurring ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label><span style={label}>Start date &amp; time</span><input type="datetime-local" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={input} /></label>
                <label><span style={label}>Finish date &amp; time</span><input type="datetime-local" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} style={input} /></label>
              </div>
            ) : (
              <>
                <div>
                  <span style={label}>Repeats on</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {DAYS.map((d) => {
                      const on = recDays.includes(d.n);
                      return (
                        <button type="button" key={d.n} onClick={() => toggleDay(d.n)}
                          style={{ padding: '7px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            border: on ? '1px solid var(--blue-500)' : '1px solid var(--border-strong)',
                            background: on ? 'var(--blue-500)' : 'var(--surface-card)', color: on ? '#fff' : 'var(--text-secondary)' }}>
                          {d.l}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label><span style={label}>Daily start time</span><input type="time" value={dailyStart} onChange={(e) => setDailyStart(e.target.value)} style={input} /></label>
                  <label><span style={label}>Daily finish time</span><input type="time" value={dailyEnd} onChange={(e) => setDailyEnd(e.target.value)} style={input} /></label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: openEnded ? '1fr' : '1fr 1fr', gap: 12 }}>
                  <label><span style={label}>Runs from</span><input type="date" value={form.startDate.slice(0, 10)} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={input} /></label>
                  {!openEnded && <label><span style={label}>Runs until</span><input type="date" value={form.endDate.slice(0, 10)} onChange={(e) => setForm({ ...form, endDate: e.target.value })} style={input} /></label>}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
                  <input type="checkbox" checked={openEnded} onChange={(e) => setOpenEnded(e.target.checked)} style={{ width: 15, height: 15 }} />
                  <span style={{ fontSize: 13 }}>Until further notice <span style={{ color: 'var(--text-muted)' }}>— ongoing, no fixed end date</span></span>
                </label>
                <p className="mut" style={{ fontSize: 12, margin: 0, color: 'var(--text-muted)' }}>
                  {openEnded
                    ? 'Starff books an ongoing placement and keeps generating shifts week by week until you or Starff end it.'
                    : 'Starff will create one shift for each selected day between these dates — each with its own check-in and timesheet.'}
                </p>
              </>
            )}
            <label><span style={label}>Breaks</span><input value={form.breakInfo} onChange={(e) => setForm({ ...form, breakInfo: e.target.value })} placeholder="30 min unpaid" style={input} /></label>

            <p style={subhead}>Requirements &amp; instructions</p>
            <label><span style={label}>Booking urgency</span>
              <select value={form.bookingUrgency} onChange={(e) => setForm({ ...form, bookingUrgency: e.target.value })} style={input}>
                {['Standard', 'Urgent', 'Emergency'].map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <label><span style={label}>Required skills / qualifications / licences</span><input value={form.requiredQualifications} onChange={(e) => setForm({ ...form, requiredQualifications: e.target.value })} placeholder="FLT counterbalance licence" style={input} /></label>
            <label><span style={label}>Experience required</span><input value={form.experienceRequirements} onChange={(e) => setForm({ ...form, experienceRequirements: e.target.value })} placeholder="6+ months warehouse experience" style={input} /></label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label><span style={label}>PPE required</span><input value={form.ppe} onChange={(e) => setForm({ ...form, ppe: e.target.value })} placeholder="Hi-vis, steel-toe boots" style={input} /></label>
              <label><span style={label}>Uniform / dress code</span><input value={form.uniform} onChange={(e) => setForm({ ...form, uniform: e.target.value })} placeholder="Black trousers, own boots" style={input} /></label>
            </div>
            <label><span style={label}>Transport requirements</span><input value={form.transportRequirements} onChange={(e) => setForm({ ...form, transportRequirements: e.target.value })} placeholder="Own transport required — no public transport nearby" style={input} /></label>
            <label><span style={label}>Client-specific requirements</span><input value={form.clientRequirements} onChange={(e) => setForm({ ...form, clientRequirements: e.target.value })} placeholder="Must pass site induction" style={input} /></label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label><span style={label}>Reporting contact</span><input value={form.reportingContact} onChange={(e) => setForm({ ...form, reportingContact: e.target.value })} placeholder="Site supervisor name" style={input} /></label>
              <label><span style={label}>Reporting instructions</span><input value={form.reportingInstructions} onChange={(e) => setForm({ ...form, reportingInstructions: e.target.value })} placeholder="Report to gate 3 reception" style={input} /></label>
            </div>
            <label><span style={label}>Site instructions</span><textarea value={form.siteInstructions} onChange={(e) => setForm({ ...form, siteInstructions: e.target.value })} placeholder="Parking, access, on-site rules…" style={{ ...input, height: 64, padding: '8px 12px' }} /></label>
            <label><span style={label}>Additional notes</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ ...input, height: 64, padding: '8px 12px' }} /></label>

            {editId && (
              <label><span style={label}>Reply to Starff <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></span>
                <textarea value={form.responseNote} onChange={(e) => setForm({ ...form, responseNote: e.target.value })} placeholder="Let Starff know what you've changed or answered" style={{ ...input, height: 64, padding: '8px 12px' }} /></label>
            )}

            {error && <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>}
            <button className="btn-primary" disabled={saving} style={{ alignSelf: 'flex-start' }}>{saving ? (editId ? 'Resubmitting…' : 'Submitting…') : editId ? 'Resubmit request' : 'Submit request'}</button>
          </form>
        )}
      </Card>
    </div>
  );
}
