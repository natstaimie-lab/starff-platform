'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, Avatar } from '@/components/ui';

type TS = { id: string; hoursWorked?: string; candidate: { firstName: string; lastName: string }; shift: { startAt: string; job: { title: string } } };
const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export default function TimesheetsPage() {
  const [rows, setRows] = useState<TS[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => apiFetch<TS[]>('/client/timesheets').then(setRows).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function approve(id: string) {
    setBusy(id);
    try { await apiFetch(`/client/timesheets/${id}/approve`, { method: 'PATCH' }); load(); } finally { setBusy(null); }
  }

  return (
    <Card title="Timesheets to Approve" subtitle={`${rows.length} awaiting your approval`}>
      {loading ? <p className="mut">Loading…</p> : rows.length === 0 ? <p className="mut">Nothing to approve right now. 🎉</p> : rows.map((t) => (
        <div key={t.id} className="tsrow">
          <Avatar name={`${t.candidate.firstName} ${t.candidate.lastName}`} size={36} />
          <div className="f1">
            <div className="tsnm">{t.candidate.firstName} {t.candidate.lastName}</div>
            <div className="tsdt">{t.shift.job.title} · {fmt(t.shift.startAt)}</div>
          </div>
          <span className="tshr">{t.hoursWorked ?? '—'} hrs</span>
          <button className="btn-primary" style={{ height: 34 }} disabled={busy === t.id} onClick={() => approve(t.id)}>{busy === t.id ? '…' : 'Approve'}</button>
        </div>
      ))}
    </Card>
  );
}
