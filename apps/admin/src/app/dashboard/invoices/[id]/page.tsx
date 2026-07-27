'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, Badge } from '@/components/ui';
import * as Ic from '@/components/icons';

type Line = {
  id: string; description: string; hours: string; rate: string; amount: string;
  timesheet?: { hoursWorked?: string | null; candidate?: { firstName: string; lastName: string }; shift?: { startAt: string; endAt: string; job?: { title: string } } } | null;
};
type Invoice = {
  id: string; number: string; status: string; periodStart: string; periodEnd: string; dueDate?: string | null;
  subtotal: string; vat: string; total: string; createdAt: string;
  client: { name: string; billingEmail?: string | null; addressLine1?: string | null; city?: string | null; postcode?: string | null; paymentTerms?: number | null };
  lines: Line[];
};

const tone: Record<string, string> = { PAID: 'success', SENT: 'info', OVERDUE: 'error', DRAFT: 'neutral', VOID: 'neutral' };
const gbp = (v: string | number) => '£' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 });
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => apiFetch<Invoice>(`/invoices/${id}`).then(setInv).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  async function act(action: 'send' | 'paid' | 'void', confirmMsg: string) {
    if (!confirm(confirmMsg)) return;
    setBusy(true);
    try { await apiFetch(`/invoices/${id}/${action}`, { method: 'PATCH' }); await load(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }

  if (error) return <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>;
  if (!inv) return <p className="dim">Loading…</p>;

  const s = inv.status;
  const lineName = (l: Line) => l.timesheet?.candidate ? `${l.timesheet.candidate.firstName} ${l.timesheet.candidate.lastName}` : l.description;
  const lineSub = (l: Line) => [l.timesheet?.shift?.job?.title, l.timesheet?.shift ? fmt(l.timesheet.shift.startAt) : null].filter(Boolean).join(' · ') || l.description;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link href="/dashboard/invoices" className="link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>← Back to invoices</Link>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 16 }}>
        <Card title={`Invoice ${inv.number}`} subtitle={`${fmt(inv.periodStart)} – ${fmt(inv.periodEnd)}`} action={<Badge tone={(tone[s] ?? 'neutral') as any}>{s}</Badge>}>
          <div className="twrap" style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ width: '100%' }}>
              <thead><tr>
                <th style={{ textAlign: 'left' }}>Line</th>
                <th style={{ textAlign: 'right' }}>Hours</th>
                <th style={{ textAlign: 'right' }}>Rate</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr></thead>
              <tbody>
                {inv.lines.length === 0 ? (
                  <tr><td colSpan={4} className="dim" style={{ padding: '12px 0' }}>No line items on this invoice.</td></tr>
                ) : inv.lines.map((l) => (
                  <tr key={l.id}>
                    <td><div className="nm">{lineName(l)}</div><div className="sub2">{lineSub(l)}</div></td>
                    <td style={{ textAlign: 'right' }} className="mono">{Number(l.hours).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }} className="mono">{gbp(l.rate)}</td>
                    <td style={{ textAlign: 'right' }} className="mono">{gbp(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14, marginLeft: 'auto', maxWidth: 260 }}>
            <div className="fx jb" style={{ fontSize: 13.5 }}><span className="dim">Subtotal</span><span className="mono">{gbp(inv.subtotal)}</span></div>
            <div className="fx jb" style={{ fontSize: 13.5 }}><span className="dim">VAT</span><span className="mono">{gbp(inv.vat)}</span></div>
            <div className="fx jb" style={{ fontSize: 16, fontWeight: 800, borderTop: '1px solid var(--border-subtle)', paddingTop: 6 }}><span>Total</span><span className="mono">{gbp(inv.total)}</span></div>
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Bill to">
            <div style={{ fontWeight: 700, fontSize: 15 }}>{inv.client.name}</div>
            <div className="dim" style={{ fontSize: 13, marginTop: 4 }}>{[inv.client.addressLine1, inv.client.city, inv.client.postcode].filter(Boolean).join(', ') || '—'}</div>
            <div className="dim" style={{ fontSize: 13, marginTop: 2 }}>{inv.client.billingEmail ?? '—'}</div>
            <div className="dim" style={{ fontSize: 12.5, marginTop: 8 }}>Payment terms: {inv.client.paymentTerms != null ? `${inv.client.paymentTerms} days` : '—'}</div>
          </Card>

          <Card title="Details">
            <div className="fx jb" style={{ padding: '7px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13.5 }}><span className="dim">Issued</span><span>{fmt(inv.createdAt)}</span></div>
            <div className="fx jb" style={{ padding: '7px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13.5 }}><span className="dim">Period</span><span>{fmt(inv.periodStart)} – {fmt(inv.periodEnd)}</span></div>
            <div className="fx jb" style={{ padding: '7px 0', fontSize: 13.5 }}><span className="dim">Due</span><span>{fmt(inv.dueDate)}</span></div>
          </Card>

          <Card title="Decision">
            {s === 'DRAFT' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button disabled={busy} onClick={() => act('send', `Approve and send invoice ${inv.number} (${gbp(inv.total)}) to ${inv.client.name}?`)} className="aibtn" style={{ background: 'var(--success-500)', color: '#fff', border: 'none', width: '100%', justifyContent: 'center' }}><Ic.Check width={16} /> Approve &amp; send</button>
                <button disabled={busy} onClick={() => act('void', `Void invoice ${inv.number}? This cancels it.`)} style={{ background: 'var(--surface-card)', color: 'var(--error-600)', border: '1px solid var(--border-subtle)', fontWeight: 700, fontSize: 13, padding: '9px 12px', borderRadius: 10, cursor: 'pointer' }}>Reject / Void</button>
              </div>
            )}
            {(s === 'SENT' || s === 'OVERDUE') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="dim" style={{ fontSize: 13, marginBottom: 2 }}>Sent to the client{inv.dueDate ? `, due ${fmt(inv.dueDate)}` : ''}.</div>
                <button disabled={busy} onClick={() => act('paid', `Mark invoice ${inv.number} as paid? This also settles its timesheets.`)} className="aibtn" style={{ background: 'var(--success-500)', color: '#fff', border: 'none', width: '100%', justifyContent: 'center' }}><Ic.Check width={16} /> Mark as paid</button>
                <button disabled={busy} onClick={() => act('void', `Void invoice ${inv.number}?`)} style={{ background: 'var(--surface-card)', color: 'var(--error-600)', border: '1px solid var(--border-subtle)', fontWeight: 700, fontSize: 13, padding: '9px 12px', borderRadius: 10, cursor: 'pointer' }}>Void</button>
              </div>
            )}
            {s === 'PAID' && <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--success-600)', display: 'flex', alignItems: 'center', gap: 6 }}><Ic.Check width={16} /> Paid</p>}
            {s === 'VOID' && <p className="dim" style={{ fontSize: 14 }}>This invoice was voided.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
