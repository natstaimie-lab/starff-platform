'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, Badge } from '@/components/ui';

type Shift = { id: string; startAt: string; endAt: string; status: string; job: { title: string; client: { name: string } } };
type TS = { id: string; shiftId: string; status: string; hoursWorked?: string; shift: { startAt: string; job: { title: string; client: { name: string } } } };
type Me = { shifts: Shift[]; timesheets: TS[] };

const tone: Record<string, string> = { SUBMITTED: 'warning', APPROVED: 'success', REJECTED: 'error', DRAFT: 'neutral', INVOICED: 'info', PAID: 'success' };
const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export default function TimesheetsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => apiFetch<Me>('/me').then(setMe).catch(() => {});
  useEffect(() => { load(); }, []);

  async function submit(shiftId: string) {
    setBusy(shiftId);
    try { await apiFetch(`/me/timesheets/${shiftId}`, { method: 'POST' }); await load(); } finally { setBusy(null); }
  }

  const timesheets = me?.timesheets ?? [];
  const submittedShiftIds = new Set(timesheets.map((t) => t.shiftId));
  const toSubmit = (me?.shifts ?? []).filter((s) => s.status === 'COMPLETED' && !submittedShiftIds.has(s.id));

  return (
    <>
      <Card title="Ready to submit" subtitle="Completed shifts awaiting your hours">
        {!me ? <p className="mut">Loading…</p> : toSubmit.length === 0 ? (
          <p className="mut" style={{ fontSize: 13.5 }}>Nothing to submit right now. Completed shifts appear here so you can log your hours.</p>
        ) : toSubmit.map((s) => (
          <div key={s.id} className="tsline">
            <span className="mut">{fmt(s.startAt)}</span>
            <span>{s.job.title} · {s.job.client.name}</span>
            <button className="btn-primary" style={{ height: 32 }} disabled={busy === s.id} onClick={() => submit(s.id)}>{busy === s.id ? '…' : 'Submit hours'}</button>
          </div>
        ))}
      </Card>

      <Card title="My Timesheets">
        {!me ? <p className="mut">Loading…</p> : timesheets.length === 0 ? (
          <p className="mut" style={{ fontSize: 13.5 }}>No timesheets yet.</p>
        ) : timesheets.map((t) => (
          <div key={t.id} className="tsline">
            <span className="mut">{fmt(t.shift.startAt)}</span>
            <span>{t.shift.job.title} · {t.shift.job.client.name}</span>
            <span className="tsv">{t.hoursWorked ?? '—'} hrs</span>
            <Badge tone={(tone[t.status] ?? 'neutral') as any}>{t.status}</Badge>
          </div>
        ))}
      </Card>
    </>
  );
}
