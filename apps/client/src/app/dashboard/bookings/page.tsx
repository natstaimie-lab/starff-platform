'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, Badge, DataTable, type Column } from '@/components/ui';
import { Modal, Button } from '@/components/Modal';
import * as Ic from '@/components/icons';

type Job = { id: string; title: string; status: string; site?: string; filled: number; total: number; reviewNote?: string | null };
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type Detail = Record<string, any>;
const EDITABLE = ['SUBMITTED', 'UNDER_REVIEW'];
const tone: Record<string, string> = {
  DRAFT: 'neutral', OPEN: 'warning', SUBMITTED: 'warning', UNDER_REVIEW: 'warning', APPROVED: 'info',
  RECRUITING: 'info', OFFERS_SENT: 'info', CANDIDATES_SUBMITTED: 'info', PARTIALLY_FILLED: 'warning',
  FILLED: 'success', CONFIRMED: 'success', IN_PROGRESS: 'info', COMPLETED: 'success', CLOSED: 'neutral', CANCELLED: 'error',
};
const label: Record<string, string> = {
  DRAFT: 'Draft', OPEN: 'Pending', SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under review', APPROVED: 'Approved',
  RECRUITING: 'Finding workers', OFFERS_SENT: 'Finding workers', CANDIDATES_SUBMITTED: 'Candidates ready to review',
  PARTIALLY_FILLED: 'Partially filled', FILLED: 'Fully filled', CONFIRMED: 'Confirmed', IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed', CLOSED: 'Closed', CANCELLED: 'Cancelled',
};
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const gbp = (v: unknown) => (v == null ? '—' : '£' + Number(v).toFixed(2));
const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export default function BookingsPage() {
  const [rows, setRows] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openTitle, setOpenTitle] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const load = () => apiFetch<Job[]>('/client/jobs').then(setRows).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  function view(r: Job) {
    setOpenId(r.id); setOpenTitle(r.title); setDetail(null); setNote(''); setSent(false);
    apiFetch<Detail>(`/client/jobs/${r.id}`).then(setDetail).catch(() => {});
  }
  function close() { setOpenId(null); setDetail(null); }
  async function requestChange() {
    if (!openId || !note.trim()) return;
    setSending(true);
    try { await apiFetch(`/client/jobs/${openId}/request-change`, { method: 'POST', body: JSON.stringify({ note }) }); setSent(true); setNote(''); }
    catch (e: any) { alert(e.message); } finally { setSending(false); }
  }

  const needInfo = rows.filter((r) => r.status === 'UNDER_REVIEW' && r.reviewNote);

  const cols: Column<Job>[] = [
    { key: 'role', header: 'Role', render: (r) => <span className="nm">{r.title}</span> },
    { key: 'site', header: 'Location', render: (r) => <span className="dim">{r.site ?? '—'}</span> },
    { key: 'filled', header: 'Filled', align: 'right', render: (r) => <span className="mono">{r.filled}/{r.total}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={(tone[r.status] ?? 'neutral') as any}>{label[r.status] ?? r.status}</Badge> },
    { key: 'action', header: '', align: 'right', render: (r) => (
      <span className="fx ac" style={{ gap: 12, justifyContent: 'flex-end' }}>
        {EDITABLE.includes(r.status) && <Link href={`/dashboard/book?id=${r.id}`} className="link" style={{ fontWeight: 600, fontSize: 13 }}>{r.status === 'UNDER_REVIEW' ? 'Respond' : 'Edit'}</Link>}
        <button onClick={() => view(r)} className="link" style={{ fontWeight: 600, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>View →</button>
      </span>
    ) },
  ];

  const editable = detail && EDITABLE.includes(String(detail.status));

  return (
    <>
      {needInfo.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {needInfo.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 'var(--radius-lg)', background: 'var(--warning-100, #fdf3d8)', border: '1px solid #f6dd9e' }}>
              <span style={{ fontSize: 18 }}>💬</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: 'var(--warning-600, #a9700a)' }}>Starff needs more info on “{r.title}”</div>
                <div className="dim" style={{ fontSize: 13 }}>{r.reviewNote}</div>
              </div>
              <Link href={`/dashboard/book?id=${r.id}`} className="btn-primary" style={{ textDecoration: 'none', height: 34, whiteSpace: 'nowrap' }}>Respond</Link>
            </div>
          ))}
        </div>
      )}
      <Card title="My Bookings" action={<Link href="/dashboard/book" className="btn-primary" style={{ textDecoration: 'none', height: 34 }}><Ic.Plus width={16} /> Book Staff</Link>}>
        {loading ? <p className="mut">Loading…</p> : rows.length === 0 ? <p className="mut">No bookings yet.</p> : <DataTable columns={cols} rows={rows} />}
      </Card>

      {openId && (
        <Modal title={openTitle} subtitle="Booking detail" onClose={close} width={540}>
          {!detail ? <p className="dim">Loading…</p> : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <Row k="Status" v={<Badge tone={(tone[detail.status] ?? 'neutral') as any}>{label[detail.status] ?? detail.status}</Badge>} />
                <Row k="Sector" v={detail.sector ?? '—'} />
                <Row k="Workers" v={String(detail.openings ?? '—')} />
                <Row k="Charge rate / hr" v={gbp(detail.chargeRate)} />
                {(detail.recurrenceDays?.length ?? 0) > 0 ? (
                  <>
                    <Row k="Pattern" v={detail.openEnded ? 'Ongoing (until further notice)' : 'Recurring'} />
                    <Row k="Repeats on" v={(detail.recurrenceDays as number[]).map((d) => DAYS[d]).join(', ')} />
                    <Row k="Daily time" v={detail.shiftStartTime && detail.shiftEndTime ? `${detail.shiftStartTime}–${detail.shiftEndTime}` : '—'} />
                    <Row k="Runs" v={detail.openEnded ? `${dt(detail.startDate)} → ongoing` : `${dt(detail.startDate)} → ${dt(detail.endDate)}`} />
                  </>
                ) : (
                  <>
                    <Row k="Start" v={detail.startDate ? new Date(detail.startDate).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'} />
                    <Row k="Finish" v={detail.endDate ? new Date(detail.endDate).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'} />
                  </>
                )}
                <Row k="Breaks" v={detail.breakInfo ?? '—'} />
                <Row k="PPE" v={detail.ppe ?? '—'} />
                <Row k="Uniform" v={detail.uniform ?? '—'} />
                <Row k="Reporting" v={detail.reportingContact ?? '—'} />
                <Row k="On arrival" v={detail.reportingInstructions ?? '—'} />
                <Row k="Site info" v={detail.siteInstructions ?? '—'} />
                <Row k="Requirements" v={detail.requiredQualifications ?? '—'} />
                <Row k="Notes" v={detail.notes ?? '—'} />
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14, marginTop: 4 }}>
                {editable ? (
                  <div className="fx ac jb" style={{ gap: 10 }}>
                    <span className="dim" style={{ fontSize: 13 }}>This request is still with Starff — you can still edit it directly.</span>
                    <Link href={`/dashboard/book?id=${openId}`} className="btn-primary" style={{ textDecoration: 'none', height: 34 }}>Edit request</Link>
                  </div>
                ) : sent ? (
                  <div style={{ color: 'var(--success-600)', fontWeight: 600, fontSize: 13.5 }}>✓ Change request sent to Starff — they’ll be in touch.</div>
                ) : (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Need to change something?</div>
                    <p className="dim" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 8 }}>This booking is being worked on, so changes go through Starff. Describe what you need and they’ll action it.</p>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Please move Friday’s shift to Saturday, or add one more worker." style={{ width: '100%', height: 72, padding: '9px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 13.5, outline: 'none', fontFamily: 'inherit' }} />
                    <div className="fx" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                      <Button onClick={requestChange} disabled={sending || !note.trim()}>{sending ? 'Sending…' : 'Request a change'}</Button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span className="dim" style={{ minWidth: 120, fontSize: 12.5, fontWeight: 600 }}>{k}</span>
      <span style={{ flex: 1, fontSize: 13.5 }}>{v}</span>
    </div>
  );
}
