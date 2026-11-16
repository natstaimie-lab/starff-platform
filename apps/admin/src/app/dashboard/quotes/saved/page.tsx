'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, Badge } from '@/components/ui';

type QuoteLine = {
  id: string; description: string; payRate: string; chargeRate: string; hoursPerShift: string;
  shifts: number; temps: number; shiftType: string; totalHours: string; total: string; profit: string;
};
type Quote = {
  id: string; number: string; status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED'; expired: boolean;
  client: { id: string; name: string } | null; prospectName: string | null;
  contactName: string | null; contactEmail: string | null; title: string | null; notes: string | null;
  validUntil: string; total: string; profit: string; createdAt: string; lines: QuoteLine[];
};

const STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED'] as const;
const LABEL: Record<string, string> = { DRAFT: 'Draft', SENT: 'Sent', ACCEPTED: 'Accepted', DECLINED: 'Declined' };
const TONE: Record<string, 'neutral' | 'info' | 'success' | 'error' | 'warning'> = { DRAFT: 'neutral', SENT: 'info', ACCEPTED: 'success', DECLINED: 'error' };
/** Status changes the API allows (mirrors NEXT in quotes.service.ts). */
const NEXT: Record<string, string[]> = { DRAFT: ['SENT', 'ACCEPTED', 'DECLINED'], SENT: ['DRAFT', 'ACCEPTED', 'DECLINED'], ACCEPTED: ['SENT'], DECLINED: ['SENT'] };

const gbp = (v: string | number) => '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function SavedQuotesPage() {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => apiFetch<Quote[]>('/quotes').then(setQuotes).catch((e) => setError(e?.message || 'Could not load quotes'));
  useEffect(() => { load(); }, []);

  async function changeStatus(q: Quote, status: string) {
    setBusy(q.id);
    try {
      const updated = await apiFetch<Quote>(`/quotes/${q.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setQuotes((qs) => qs!.map((x) => (x.id === q.id ? updated : x)));
    } catch (e: any) { alert(e?.message || 'Could not change the status'); } finally { setBusy(null); }
  }

  const shown = (quotes ?? []).filter((q) => !filter || (filter === 'EXPIRED' ? q.expired : q.status === filter && !q.expired));
  const count = (s: string) => (quotes ?? []).filter((q) => (s === 'EXPIRED' ? q.expired : q.status === s && !q.expired)).length;

  const pill = (value: string, label: string) => (
    <button key={value} onClick={() => setFilter(value)} className="aibtn" style={{ height: 32, padding: '0 12px', fontSize: 12.5, background: filter === value ? 'var(--blue-500)' : 'var(--surface-card)', color: filter === value ? '#fff' : 'var(--text-secondary)', border: filter === value ? 'none' : '1px solid var(--border-subtle)' }}>
      {label}{value && quotes ? ` (${count(value)})` : ''}
    </button>
  );

  return (
    <Card
      title="Saved quotes"
      subtitle="A draft or sent quote shows as expired once its valid-until date has passed"
      action={<Link href="/dashboard/quotes" className="aibtn" style={{ textDecoration: 'none' }}>+ New quote</Link>}
    >
      <div className="fx ac" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {pill('', 'All')}
        {STATUSES.map((s) => pill(s, LABEL[s]))}
        {pill('EXPIRED', 'Expired')}
      </div>
      {error ? <p style={{ color: 'var(--error-600, #c0392b)' }}>{error}</p>
        : !quotes ? <p className="dim">Loading…</p>
        : shown.length === 0 ? <p className="dim">No quotes here yet. Build one in the <Link href="/dashboard/quotes" className="link">quote calculator</Link>.</p>
        : (
          <table className="tbl" style={{ width: '100%' }}>
            <thead>
              <tr><th>Quote</th><th>Company</th><th>Status</th><th>Valid until</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Profit</th><th>Change status</th></tr>
            </thead>
            <tbody>
              {shown.map((q) => (
                <Fragment key={q.id}>
                  <tr onClick={() => setOpen(open === q.id ? null : q.id)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{open === q.id ? '▾' : '▸'} {q.number}</div>
                      {q.title && <div className="dim" style={{ fontSize: 12 }}>{q.title}</div>}
                    </td>
                    <td>
                      {q.client ? <Link href={`/dashboard/clients/${q.client.id}`} className="link" onClick={(e) => e.stopPropagation()}>{q.client.name}</Link> : <span>{q.prospectName} <span className="dim" style={{ fontSize: 12 }}>(prospect)</span></span>}
                      {q.contactName && <div className="dim" style={{ fontSize: 12 }}>{q.contactName}</div>}
                    </td>
                    <td>{q.expired ? <Badge tone="warning">Expired</Badge> : <Badge tone={TONE[q.status]}>{LABEL[q.status]}</Badge>}</td>
                    <td>{fmtDate(q.validUntil)}</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{gbp(q.total)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{gbp(q.profit)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select aria-label={`Change status of ${q.number}`} value="" disabled={busy === q.id} onChange={(e) => e.target.value && changeStatus(q, e.target.value)} style={{ height: 32, border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 13, padding: '0 8px', background: 'var(--surface-card)' }}>
                        <option value="">{busy === q.id ? 'Saving…' : 'Move to…'}</option>
                        {NEXT[q.status].map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                      </select>
                    </td>
                  </tr>
                  {open === q.id && (
                    <tr>
                      <td colSpan={7} style={{ background: 'var(--surface-sunken)', whiteSpace: 'normal' }}>
                        <table style={{ width: '100%', fontSize: 13 }}>
                          <tbody>
                            {q.lines.map((l) => (
                              <tr key={l.id}>
                                <td style={{ fontWeight: 600, padding: '4px 0' }}>{l.description}</td>
                                <td className="dim">{l.temps} × {l.shifts} × {Number(l.hoursPerShift)}h · {l.shiftType.replace('_', ' ')}</td>
                                <td className="mono" style={{ textAlign: 'right' }}>pay {gbp(l.payRate)}</td>
                                <td className="mono" style={{ textAlign: 'right' }}>charge {gbp(l.chargeRate)}/hr</td>
                                <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{gbp(l.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="fx ac jb" style={{ marginTop: 10, gap: 12, flexWrap: 'wrap' }}>
                          <span className="dim" style={{ fontSize: 12.5 }}>
                            Created {fmtDate(q.createdAt)}{q.contactEmail ? ` · ${q.contactEmail}` : ''}{q.notes ? ` · ${q.notes}` : ''}
                          </span>
                          {q.status === 'DRAFT'
                            ? <Link href={`/dashboard/quotes?edit=${q.id}`} className="link" style={{ fontWeight: 600, fontSize: 13 }}>Edit draft →</Link>
                            : <span className="dim" style={{ fontSize: 12.5 }}>Move back to Draft to edit</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
    </Card>
  );
}
