'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, Badge, DataTable, type Column } from '@/components/ui';
import { Modal, Field, TextInput, SelectInput, Button } from '@/components/Modal';
import * as Ic from '@/components/icons';

type Job = {
  id: string;
  title: string;
  status: string;
  sector?: string | null;
  bookingUrgency?: string | null;
  payRate: string;
  chargeRate: string;
  openings: number;
  client: { name: string; city?: string };
  site?: { name: string };
  _count: { shifts: number; applications: number };
};
type ClientOpt = { id: string; name: string };

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
const gbp = (v: string | number) => '£' + Number(v).toFixed(2);
const empty = { clientId: '', title: '', payRate: '', chargeRate: '', openings: '1', status: 'OPEN' };

export default function BookingsPage() {
  const [rows, setRows] = useState<Job[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  // Honour a ?status= deep-link from the dashboard pipeline (e.g. ?status=SUBMITTED).
  const initialStatus = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('status') ?? '') : '';
  const [filters, setFilters] = useState({ status: initialStatus, clientId: '', urgency: '', q: '' });

  const load = () => apiFetch<Job[]>('/jobs').then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  useEffect(() => {
    load();
    apiFetch<ClientOpt[]>('/clients').then((cs) => setClients(cs.map((c) => ({ id: c.id, name: c.name })))).catch(() => {});
  }, []);

  async function save() {
    if (!form.clientId || !form.title.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/jobs', {
        method: 'POST',
        body: JSON.stringify({ clientId: form.clientId, title: form.title, payRate: Number(form.payRate), chargeRate: Number(form.chargeRate), openings: Number(form.openings), status: form.status }),
      });
      setOpen(false); setForm(empty); await load();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }

  const cols: Column<Job>[] = [
    { key: 'client', header: 'Client', render: (r) => <span className="nm">{r.client?.name}</span> },
    { key: 'role', header: 'Role', render: (r) => <div><Link href={`/dashboard/bookings/${r.id}`} className="nm" style={{ color: 'var(--blue-500)' }}>{r.title}</Link><div className="sub2">{r.site?.name ?? r.client?.city ?? ''}</div></div> },
    { key: 'pay', header: 'Pay / hr', align: 'right', render: (r) => <span className="mono">{gbp(r.payRate)}</span> },
    { key: 'charge', header: 'Charge / hr', align: 'right', render: (r) => <span className="mono">{gbp(r.chargeRate)}</span> },
    { key: 'openings', header: 'Openings', align: 'right', render: (r) => <span className="mono">{r.openings}</span> },
    { key: 'shifts', header: 'Shifts', align: 'right', render: (r) => <span className="dim">{r._count.shifts}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={(tone[r.status] ?? 'neutral') as any}>{label[r.status] ?? r.status}</Badge> },
    { key: 'action', header: '', align: 'right', render: (r) => <Link href={`/dashboard/bookings/${r.id}`} className="btn-link" style={{ color: 'var(--blue-500)', fontWeight: 600, fontSize: 13 }}>{(r.status === 'SUBMITTED' || r.status === 'UNDER_REVIEW') ? 'Review →' : 'Open →'}</Link> },
  ];

  const sectors = [...new Set(rows.map((r) => r.sector).filter(Boolean))] as string[];
  const filtered = rows.filter((r) =>
    (!filters.status || filters.status.split(',').includes(r.status)) &&
    (!filters.clientId || clients.find((c) => c.id === filters.clientId)?.name === r.client?.name) &&
    (!filters.urgency || (r.bookingUrgency ?? 'Standard') === filters.urgency) &&
    (!filters.q || `${r.title} ${r.client?.name} ${r.sector ?? ''}`.toLowerCase().includes(filters.q.toLowerCase())),
  );
  const fsel = { height: 34, padding: '0 8px', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 13, background: 'var(--surface-card)' } as React.CSSProperties;

  return (
    <Card
      title="Job Bookings"
      action={
        <button className="aibtn" style={{ background: 'var(--blue-500)', color: '#fff', border: 'none' }} onClick={() => setOpen(true)}>
          <Ic.Plus width={16} /> Create Booking
        </button>
      }
    >
      <div className="fx ac" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Search role, client, sector…" style={{ ...fsel, flex: 1, minWidth: 160 }} />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} style={fsel}>
          <option value="">All statuses</option>
          {Object.keys(label).filter((k) => k !== 'OPEN').map((s) => <option key={s} value={s}>{label[s]}</option>)}
        </select>
        <select value={filters.clientId} onChange={(e) => setFilters({ ...filters, clientId: e.target.value })} style={fsel}>
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filters.urgency} onChange={(e) => setFilters({ ...filters, urgency: e.target.value })} style={fsel}>
          <option value="">All urgency</option>
          {['Standard', 'Urgent', 'Emergency'].map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        {(filters.q || filters.status || filters.clientId || filters.urgency) && (
          <button onClick={() => setFilters({ status: '', clientId: '', urgency: '', q: '' })} style={{ ...fsel, cursor: 'pointer', color: 'var(--text-secondary)' }}>Clear</button>
        )}
      </div>
      {filters.status.includes(',') && (
        <div className="fx ac" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <span className="dim" style={{ fontSize: 12.5 }}>Pipeline stage:</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--blue-100, #e7efff)', color: 'var(--blue-600, #1d4ed8)', borderRadius: 999, padding: '4px 10px', fontSize: 12.5, fontWeight: 600 }}>
            {filters.status.split(',').map((s) => label[s] ?? s).join(' · ')}
            <button onClick={() => setFilters({ ...filters, status: '' })} aria-label="Clear stage" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700, lineHeight: 1 }}>✕</button>
          </span>
        </div>
      )}
      {error ? <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>
        : loading ? <p className="dim">Loading…</p>
        : rows.length === 0 ? <p className="dim">No bookings yet.</p>
        : filtered.length === 0 ? <p className="dim">No bookings match these filters.</p>
        : <DataTable columns={cols} rows={filtered} />}

      {open && (
        <Modal
          title="Create Job Booking"
          subtitle="Raise a new staffing request"
          onClose={() => setOpen(false)}
          footer={<>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.clientId || !form.title.trim()}>{saving ? 'Saving…' : 'Create booking'}</Button>
          </>}
        >
          <Field label="Client">
            <SelectInput value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
              <option value="">Select a client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="Role / title"><TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Warehouse Operative" /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Pay rate / hr"><TextInput type="number" value={form.payRate} onChange={(e) => setForm({ ...form, payRate: e.target.value })} placeholder="13.50" /></Field>
            <Field label="Charge rate / hr"><TextInput type="number" value={form.chargeRate} onChange={(e) => setForm({ ...form, chargeRate: e.target.value })} placeholder="19.50" /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Openings"><TextInput type="number" value={form.openings} onChange={(e) => setForm({ ...form, openings: e.target.value })} /></Field>
            <Field label="Status">
              <SelectInput value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {['DRAFT', 'OPEN', 'FILLED', 'CLOSED'].map((s) => <option key={s} value={s}>{s}</option>)}
              </SelectInput>
            </Field>
          </div>
        </Modal>
      )}
    </Card>
  );
}
