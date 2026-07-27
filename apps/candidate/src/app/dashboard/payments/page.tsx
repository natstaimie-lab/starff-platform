'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui';

type TS = { id: string; status: string; hoursWorked?: string; shift: { startAt: string; payRate: string; job: { title: string; client: { name: string } } } };
type Me = { timesheets: TS[] };

const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const earn = (t: TS) => Number(t.hoursWorked ?? 0) * Number(t.shift.payRate ?? 0);
const gbp = (n: number) => '£' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PaymentsPage() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { apiFetch<Me>('/me').then(setMe).catch(() => {}); }, []);

  const paid = (me?.timesheets ?? []).filter((t) => ['APPROVED', 'INVOICED', 'PAID'].includes(t.status));
  const pending = (me?.timesheets ?? []).filter((t) => t.status === 'SUBMITTED');
  const total = paid.reduce((a, t) => a + earn(t), 0);
  const pendingTotal = pending.reduce((a, t) => a + earn(t), 0);

  return (
    <>
      <div className="g3">
        <Card title="Approved earnings"><div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{gbp(total)}</div><div className="mut" style={{ fontSize: 12.5 }}>{paid.length} approved timesheet{paid.length === 1 ? '' : 's'}</div></Card>
        <Card title="Awaiting approval"><div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{gbp(pendingTotal)}</div><div className="mut" style={{ fontSize: 12.5 }}>{pending.length} pending</div></Card>
        <Card title="Total hours"><div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{(me?.timesheets ?? []).reduce((a, t) => a + Number(t.hoursWorked ?? 0), 0).toFixed(1)}</div><div className="mut" style={{ fontSize: 12.5 }}>logged all-time</div></Card>
      </div>
      <Card title="Payment history">
        {!me ? <p className="mut">Loading…</p> : paid.length === 0 ? (
          <p className="mut" style={{ fontSize: 13.5 }}>No payments yet. Once your submitted timesheets are approved, your earnings show here.</p>
        ) : paid.map((t) => (
          <div key={t.id} className="payrow">
            <div className="f1"><div style={{ fontWeight: 700, fontSize: 13.5 }}>{t.shift.job.client.name}</div><div className="mut" style={{ fontSize: 12 }}>{t.shift.job.title} · {fmt(t.shift.startAt)} · {t.hoursWorked} hrs</div></div>
            <span className="payv">{gbp(earn(t))}</span>
          </div>
        ))}
      </Card>
    </>
  );
}
