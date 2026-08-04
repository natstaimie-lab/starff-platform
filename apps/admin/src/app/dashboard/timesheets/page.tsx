'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, KPIStat, Badge, Avatar, DataTable, type Column } from '@/components/ui';
import { Modal, Button } from '@/components/Modal';
import * as Ic from '@/components/icons';

type Timesheet = {
  id: string;
  status: string;
  hoursWorked?: string | null;
  clockIn?: string | null;
  clockOut?: string | null;
  breakMinutes?: number | null;
  rejectReason?: string | null;
  candidate: { firstName: string; lastName: string };
  shift: { startAt: string; endAt: string; payRate: string; chargeRate: string; job: { title: string; client: { id: string; name: string } } };
};

const tone: Record<string, string> = { SUBMITTED: 'warning', APPROVED: 'success', REJECTED: 'error', DRAFT: 'neutral', INVOICED: 'info', PAID: 'success' };
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtTime = (d?: string | null) => (d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—');
const gbp = (v?: string | number | null) => (v == null ? '—' : '£' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 }));

export default function TimesheetsPage() {
  const [rows, setRows] = useState<Timesheet[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Timesheet | null>(null);
  const [reason, setReason] = useState('');
  const [filter, setFilter] = useState<string | null>(null);

  const load = () => apiFetch<Timesheet[]>('/timesheets').then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  function open(t: Timesheet) { setSel(t); setReason(t.rejectReason ?? ''); }

  async function decide(action: 'approve' | 'reject') {
    if (!sel) return;
    if (action === 'reject' && !reason.trim()) { alert('Please add a reason so the worker knows what to fix.'); return; }
    setBusy(true);
    try {
      await apiFetch(`/timesheets/${sel.id}/${action}`, { method: 'PATCH', body: action === 'reject' ? JSON.stringify({ reason: reason.trim() }) : undefined });
      setSel(null); await load();
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }

  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const kpis = [
    { label: 'Total', value: rows.length, icon: <Ic.Clock width={22} />, tone: 'info' as const, status: null as string | null, ring: 'var(--blue-500)' },
    { label: 'Pending', value: count('SUBMITTED'), icon: <Ic.AlertCircle width={22} />, tone: 'accent' as const, status: 'SUBMITTED', ring: 'var(--orange-500)' },
    { label: 'Approved', value: count('APPROVED'), icon: <Ic.ClipboardCheck width={22} />, tone: 'success' as const, status: 'APPROVED', ring: 'var(--success-500)' },
    { label: 'Rejected', value: count('REJECTED'), icon: <Ic.FileText width={22} />, tone: 'accent' as const, status: 'REJECTED', ring: 'var(--error-500)' },
  ];

  // Clicking a KPI card narrows the table to that status; click again (or Total) to clear.
  const displayed = filter ? rows.filter((r) => r.status === filter) : rows;
  const selLabel = kpis.find((k) => k.status && k.status === filter)?.label;

  const tsCols: Column<Timesheet>[] = [
    { key: 'name', header: 'Worker', render: (r) => <div className="namecell"><Avatar name={`${r.candidate.firstName} ${r.candidate.lastName}`} size={28} /><span className="nm">{r.candidate.firstName} {r.candidate.lastName}</span></div> },
    { key: 'role', header: 'Role', render: (r) => <span className="dim">{r.shift.job.title}</span> },
    { key: 'client', header: 'Client', render: (r) => <span className="dim">{r.shift.job.client.name}</span> },
    { key: 'date', header: 'Date', render: (r) => <span className="dim">{fmtDate(r.shift.startAt)}</span> },
    { key: 'hours', header: 'Hours', align: 'right', render: (r) => <span className="mono">{r.hoursWorked ?? '—'}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={(tone[r.status] ?? 'neutral') as any}>{r.status}</Badge> },
    { key: 'act', header: '', align: 'right', render: (r) => (
      <button onClick={() => open(r)} style={{ border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12, padding: '5px 12px', borderRadius: 8, cursor: 'pointer' }}>
        {r.status === 'SUBMITTED' ? 'Review' : 'View'}
      </button>
    ) },
  ];

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="fx jb" style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13.5 }}><span className="dim">{k}</span><span style={{ fontWeight: 600 }}>{v}</span></div>
  );
  const pay = sel && sel.hoursWorked != null ? Number(sel.hoursWorked) * Number(sel.shift.payRate) : null;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 6 }}>
        {kpis.map((k) => {
          const on = filter === k.status;
          return (
            <button
              key={k.label}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(on ? null : k.status)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: 0, border: 'none', background: 'none', cursor: 'pointer',
                borderRadius: 'var(--radius-lg)', transition: 'box-shadow .12s, transform .12s',
                transform: on ? 'translateY(-1px)' : 'none',
                boxShadow: on ? `0 0 0 2px ${k.ring}, 0 6px 16px rgba(11,31,58,.12)` : 'none',
              }}
            >
              <KPIStat label={k.label} value={String(k.value)} icon={k.icon} tone={k.tone} />
            </button>
          );
        })}
      </div>
      <p className="dim" style={{ fontSize: 12, margin: '0 0 16px' }}>Click a card to filter the list — click it again (or Total) to clear.</p>

      {error ? <Card><p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p></Card>
        : loading ? <Card><p className="dim">Loading…</p></Card>
        : (
          <Card
            title={selLabel ? `${selLabel} timesheets — ${displayed.length}` : 'Timesheets'}
            subtitle="Approve or reject submitted hours"
            action={filter ? <button onClick={() => setFilter(null)} className="link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}>Clear filter ✕</button> : undefined}
          >
            {rows.length === 0 ? <p className="dim">No timesheets yet.</p>
              : displayed.length === 0 ? <p className="dim">No {selLabel?.toLowerCase()} timesheets.</p>
              : <DataTable columns={tsCols} rows={displayed} />}
          </Card>
        )}

      {sel && (
        <Modal
          title={`${sel.candidate.firstName} ${sel.candidate.lastName} — timesheet`}
          subtitle={`${sel.shift.job.title} · ${sel.shift.job.client.name}`}
          onClose={() => setSel(null)}
          footer={sel.status === 'SUBMITTED' ? (
            <>
              <Button variant="outline" onClick={() => decide('reject')} disabled={busy}>Reject</Button>
              <Button onClick={() => decide('approve')} disabled={busy}>{busy ? 'Saving…' : 'Approve'}</Button>
            </>
          ) : <Button variant="outline" onClick={() => setSel(null)}>Close</Button>}
        >
          <div style={{ marginBottom: 8 }}><Badge tone={(tone[sel.status] ?? 'neutral') as any}>{sel.status}</Badge></div>
          <Row k="Shift date" v={fmtDate(sel.shift.startAt)} />
          <Row k="Scheduled" v={`${fmtTime(sel.shift.startAt)} – ${fmtTime(sel.shift.endAt)}`} />
          <Row k="Clocked" v={sel.clockIn ? `${fmtTime(sel.clockIn)} – ${fmtTime(sel.clockOut)}` : '—'} />
          <Row k="Break" v={sel.breakMinutes != null ? `${sel.breakMinutes} min` : '—'} />
          <Row k="Hours worked" v={sel.hoursWorked ?? '—'} />
          <Row k="Pay rate" v={`${gbp(sel.shift.payRate)} / hr`} />
          <Row k="Pay due" v={<strong>{gbp(pay)}</strong>} />
          {sel.status === 'REJECTED' && sel.rejectReason && <Row k="Rejected because" v={sel.rejectReason} />}

          {sel.status === 'SUBMITTED' && (
            <label style={{ display: 'block', marginTop: 14 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Reason (required if rejecting)</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Hours don't match the rota — please resubmit."
                style={{ width: '100%', minHeight: 60, padding: 10, border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical' }} />
            </label>
          )}
        </Modal>
      )}
    </>
  );
}
