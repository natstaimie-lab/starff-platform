'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, KPIStat } from '@/components/ui';
import * as Ic from '@/components/icons';

type Inv = { id: string; number: string; total: string; status: string; periodEnd: string };
const gbp = (n: number) => '£' + Number(n).toLocaleString();
const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

export default function ReportsPage() {
  const [inv, setInv] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { apiFetch<Inv[]>('/client/invoices').then(setInv).catch(() => {}).finally(() => setLoading(false)); }, []);

  const total = inv.reduce((a, i) => a + Number(i.total), 0);
  const paid = inv.filter((i) => i.status === 'PAID').reduce((a, i) => a + Number(i.total), 0);
  const outstanding = inv.filter((i) => ['SENT', 'OVERDUE'].includes(i.status)).reduce((a, i) => a + Number(i.total), 0);
  const max = Math.max(1, ...inv.map((i) => Number(i.total)));
  const bars = [...inv].reverse();

  return (
    <>
      <div className="g4">
        <KPIStat label="Total Spend" value={gbp(total)} icon={<Ic.PoundSterling width={22} />} tone="info" />
        <KPIStat label="Paid" value={gbp(paid)} icon={<Ic.Receipt width={22} />} tone="success" />
        <KPIStat label="Outstanding" value={gbp(outstanding)} icon={<Ic.AlertCircle width={22} />} tone="accent" />
        <KPIStat label="Invoices" value={String(inv.length)} icon={<Ic.BarChart width={22} />} tone="info" />
      </div>
      <Card title="Spend by invoice">
        {loading ? <p className="mut">Loading…</p> : inv.length === 0 ? <p className="mut">No invoices yet.</p> : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 200, padding: '10px 4px' }}>
            {bars.map((i) => (
              <div key={i.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{gbp(Number(i.total))}</div>
                <div title={i.number} style={{ width: '100%', maxWidth: 48, height: `${(Number(i.total) / max) * 130}px`, background: i.status === 'OVERDUE' ? 'var(--error-500)' : 'var(--blue-500)', borderRadius: '6px 6px 0 0' }} />
                <div className="mut" style={{ fontSize: 11 }}>{fmt(i.periodEnd)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
