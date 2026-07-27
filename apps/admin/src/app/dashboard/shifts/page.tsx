'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Badge } from '@/components/ui';
import * as Ic from '@/components/icons';

type Shift = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  job: { title: string; client: { name: string } };
  site?: { name: string };
  candidate?: { firstName: string; lastName: string };
};

const tone: Record<string, string> = {
  OPEN: 'warning', ASSIGNED: 'info', CONFIRMED: 'success', IN_PROGRESS: 'info',
  COMPLETED: 'success', CANCELLED: 'error', NO_SHOW: 'error',
};
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const hhmm = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function ShiftCard({ s }: { s: Shift }) {
  const d = new Date(s.startAt);
  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="fx jb ac">
        <div className="fx ac" style={{ gap: 12 }}>
          <div style={{ width: 52, height: 52, borderRadius: 'var(--radius-md)', background: 'var(--orange-100)', color: 'var(--orange-600)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <b style={{ fontSize: 19, lineHeight: 1 }}>{d.getDate()}</b>
            <span style={{ fontSize: 10, fontWeight: 700 }}>{MONTHS[d.getMonth()]}</span>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{s.job.title}</div>
            <div className="dim" style={{ fontSize: 13 }}>{s.site?.name ?? s.job.client.name}</div>
          </div>
        </div>
        <Badge tone={(tone[s.status] ?? 'neutral') as any}>{s.status}</Badge>
      </div>
      <div className="smeta" style={{ display: 'flex', gap: 16, fontSize: 12.5, color: 'var(--text-secondary)' }}>
        <span className="fx ac" style={{ gap: 5 }}><Ic.Clock width={15} /> {hhmm(s.startAt)}–{hhmm(s.endAt)}</span>
        <span className="fx ac" style={{ gap: 5 }}><Ic.HardHat width={15} /> {s.candidate ? `${s.candidate.firstName} ${s.candidate.lastName}` : 'Unassigned'}</span>
        <span className="fx ac" style={{ gap: 5 }}><Ic.Building width={15} /> {s.job.client.name}</span>
      </div>
    </div>
  );
}

export default function ShiftsPage() {
  const [rows, setRows] = useState<Shift[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Shift[]>('/shifts').then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  if (error) return <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>;
  if (loading) return <p className="dim">Loading…</p>;
  if (!rows.length) return <p className="dim">No shifts scheduled yet.</p>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
      {rows.map((s) => <ShiftCard key={s.id} s={s} />)}
    </div>
  );
}
