'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, Avatar, ComplianceBadge, Badge, DataTable, type Column } from '@/components/ui';
import { Modal } from '@/components/Modal';

type Worker = { id: string; name: string; role: string; city?: string; status: string; shifts: number };
type WorkerDetail = {
  firstName: string;
  reference: string;
  role: string;
  experience: string | null;
  skills: string[];
  qualifications: string[];
  availability: string[];
  travelArea: string | null;
  complianceConfirmed: boolean;
  rating: number | null;
  withYou: {
    totalShifts: number;
    completedShifts: number;
    roles: string[];
    nextShift: { startAt: string; endAt: string; role: string; status: string } | null;
  };
  attendance: {
    hoursApproved: number;
    timesheetsApproved: number;
    timesheetsPending: number;
    noShows: number;
    lateArrivals: number;
    onTimeRate: number | null;
  };
};

const hhmm = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayLabel = (d: string) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const shiftTone: Record<string, string> = { ASSIGNED: 'info', CONFIRMED: 'success', IN_PROGRESS: 'info' };

export default function WorkersPage() {
  const [rows, setRows] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openName, setOpenName] = useState('');
  const [detail, setDetail] = useState<WorkerDetail | null>(null);
  const [dLoading, setDLoading] = useState(false);
  const [dError, setDError] = useState('');

  useEffect(() => { apiFetch<Worker[]>('/client/workers').then(setRows).catch(() => {}).finally(() => setLoading(false)); }, []);

  function view(w: Worker) {
    setOpenId(w.id); setOpenName(w.name); setDetail(null); setDError(''); setDLoading(true);
    apiFetch<WorkerDetail>(`/client/workers/${w.id}`)
      .then(setDetail)
      .catch((e) => setDError(e.message))
      .finally(() => setDLoading(false));
  }
  function close() { setOpenId(null); setDetail(null); setDError(''); }

  const cols: Column<Worker>[] = [
    { key: 'name', header: 'Worker', render: (r) => <div className="namecell"><Avatar name={r.name} size={30} /><div><div className="nm">{r.name}</div><div className="sub2">{r.role}</div></div></div> },
    { key: 'city', header: 'Location', render: (r) => <span className="dim">{r.city ?? '—'}</span> },
    { key: 'shifts', header: 'Shifts', align: 'right', render: (r) => <span className="mono">{r.shifts}</span> },
    { key: 'status', header: 'Compliance', render: (r) => <ComplianceBadge status={r.status.toLowerCase()} /> },
    { key: 'action', header: '', align: 'right', render: (r) => <button className="link" style={{ fontWeight: 600, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => view(r)}>View →</button> },
  ];

  return (
    <>
      <Card title="Assigned Workers" subtitle="Workers booked to your sites — tap a worker for more detail">
        {loading ? <p className="mut">Loading…</p> : rows.length === 0 ? <p className="mut">No workers assigned to your bookings yet.</p> : <DataTable columns={cols} rows={rows} />}
      </Card>

      {openId && (
        <Modal title={openName} subtitle="Worker profile" onClose={close} width={520}>
          {dLoading ? <p className="dim">Loading…</p>
            : dError ? <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{dError}</p>
            : detail ? <WorkerCard d={detail} /> : null}
        </Modal>
      )}
    </>
  );
}

function WorkerCard({ d }: { d: WorkerDetail }) {
  const wy = d.withYou;
  const a = d.attendance;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name={d.firstName} size={46} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{d.firstName} <span className="dim" style={{ fontWeight: 500, fontSize: 13 }}>· {d.reference}</span></div>
          <div className="dim" style={{ fontSize: 13 }}>{d.role}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {d.complianceConfirmed && <Badge tone="success">Compliance confirmed</Badge>}
          {d.rating != null && <span className="dim" style={{ fontSize: 12.5 }}>★ {d.rating.toFixed(1)} / 5</span>}
        </div>
      </div>

      <Row k="Experience" v={d.experience ?? '—'} />
      <Row k="Skills" v={d.skills.length ? d.skills.join(', ') : '—'} />
      <Row k="Qualifications" v={d.qualifications.length ? d.qualifications.join(', ') : '—'} />
      <Row k="Availability" v={d.availability.length ? d.availability.join(', ') : '—'} />
      <Row k="General area" v={d.travelArea ?? '—'} />

      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14, marginTop: 2 }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>With your company</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Stat n={wy.totalShifts} label="Shifts booked" />
          <Stat n={wy.completedShifts} label="Completed" />
        </div>
        {wy.roles.length > 0 && <div style={{ marginTop: 10 }}><Row k="Roles" v={wy.roles.join(', ')} /></div>}
        {wy.nextShift ? (
          <div style={{ marginTop: 10, padding: '11px 13px', borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken, #f4f6fa)' }}>
            <div className="dim" style={{ fontSize: 12, marginBottom: 3 }}>Next shift with you</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>{dayLabel(wy.nextShift.startAt)}</span>
              <span className="dim" style={{ fontSize: 13 }}>{hhmm(wy.nextShift.startAt)}–{hhmm(wy.nextShift.endAt)}</span>
              <span className="dim" style={{ fontSize: 13 }}>· {wy.nextShift.role}</span>
              <Badge tone={(shiftTone[wy.nextShift.status] ?? 'neutral') as any}>{wy.nextShift.status === 'ASSIGNED' ? 'Booked' : wy.nextShift.status === 'IN_PROGRESS' ? 'On shift' : 'Confirmed'}</Badge>
            </div>
          </div>
        ) : <p className="dim" style={{ fontSize: 13, marginTop: 8 }}>No upcoming shifts booked with you.</p>}
      </div>

      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14, marginTop: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>Timesheets &amp; attendance</span>
          {a.onTimeRate != null && (
            <Badge tone={(a.onTimeRate >= 90 ? 'success' : a.onTimeRate >= 70 ? 'warning' : 'error') as any}>{a.onTimeRate}% on time</Badge>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          <Stat n={a.hoursApproved} label="Hours approved" />
          <Stat n={a.timesheetsApproved} label="Timesheets approved" />
          {a.timesheetsPending > 0 && <Stat n={a.timesheetsPending} label="Awaiting approval" />}
        </div>
        <Row k="Late arrivals" v={String(a.lateArrivals)} />
        <Row k="No-shows" v={String(a.noShows)} />
        {a.timesheetsPending > 0 && <p className="dim" style={{ fontSize: 12, marginTop: 6 }}>You have {a.timesheetsPending} timesheet{a.timesheetsPending === 1 ? '' : 's'} from this worker awaiting your approval.</p>}
      </div>

      <p className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>Starff shares only what you need to manage the booking. Personal contact and identity details stay with Starff.</p>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span className="dim" style={{ minWidth: 110, fontSize: 12.5, fontWeight: 600 }}>{k}</span>
      <span style={{ flex: 1, fontSize: 13.5 }}>{v}</span>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ flex: 1, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken, #f4f6fa)' }}>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{n}</div>
      <div className="dim" style={{ fontSize: 12 }}>{label}</div>
    </div>
  );
}
