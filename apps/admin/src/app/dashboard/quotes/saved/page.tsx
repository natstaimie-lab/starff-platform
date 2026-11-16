'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import { Card, Badge } from '@/components/ui';
import { Modal, Field, TextInput, Button } from '@/components/Modal';

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

type EmailDraft = { to: string[]; subject: string; message: string; from: string; replyTo: string; senderEmail: string | null };
type SendForm = { quote: Quote; to: string; cc: string; subject: string; message: string; from: string; replyTo: string; senderEmail: string | null };
const splitEmails = (s: string) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

const gbp = (v: string | number) => '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function SavedQuotesPage() {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [send, setSend] = useState<SendForm | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [toast, setToast] = useState('');

  const load = () => apiFetch<Quote[]>('/quotes').then(setQuotes).catch((e) => setError(e?.message || 'Could not load quotes'));
  useEffect(() => { load(); }, []);

  async function changeStatus(q: Quote, status: string) {
    setBusy(q.id);
    try {
      const updated = await apiFetch<Quote>(`/quotes/${q.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setQuotes((qs) => qs!.map((x) => (x.id === q.id ? updated : x)));
    } catch (e: any) { alert(e?.message || 'Could not change the status'); } finally { setBusy(null); }
  }

  /** Opens the PDF in a new tab (fetched with the login token, as the API needs it). */
  async function viewPdf(q: Quote) {
    const tab = window.open('', '_blank');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/quotes/${q.id}/pdf`, { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } });
      if (!res.ok) throw new Error('Could not make the PDF.');
      const url = URL.createObjectURL(await res.blob());
      if (tab) tab.location.href = url; else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) { tab?.close(); alert(e?.message || 'Could not make the PDF.'); }
  }

  async function openSend(q: Quote) {
    setSendError('');
    try {
      const d = await apiFetch<EmailDraft>(`/quotes/${q.id}/email-draft`);
      setSend({ quote: q, to: d.to.join(', '), cc: '', subject: d.subject, message: d.message, from: d.from, replyTo: d.replyTo, senderEmail: d.senderEmail });
    } catch (e: any) { alert(e?.message || 'Could not prepare the email'); }
  }

  async function doSend() {
    if (!send) return;
    const to = splitEmails(send.to);
    if (!to.length) { setSendError('Add at least one email address.'); return; }
    setSending(true); setSendError('');
    try {
      const updated = await apiFetch<Quote & { emailedTo: string[] }>(`/quotes/${send.quote.id}/send`, {
        method: 'POST',
        body: JSON.stringify({ to, cc: splitEmails(send.cc), subject: send.subject, message: send.message }),
      });
      setQuotes((qs) => qs!.map((x) => (x.id === updated.id ? updated : x)));
      setSend(null);
      setToast(`${updated.number} emailed to ${updated.emailedTo.join(', ')}`);
      setTimeout(() => setToast(''), 6000);
    } catch (e: any) {
      const m = String(e?.message || 'Could not send');
      const json = m.match(/\{.*\}$/);
      let msg = m;
      if (json) { try { msg = JSON.parse(json[0]).message ?? m; } catch { /* keep raw */ } }
      setSendError(Array.isArray(msg) ? msg.join(' ') : msg);
    } finally { setSending(false); }
  }

  const shown = (quotes ?? []).filter((q) => !filter || (filter === 'EXPIRED' ? q.expired : q.status === filter && !q.expired));
  const count = (s: string) => (quotes ?? []).filter((q) => (s === 'EXPIRED' ? q.expired : q.status === s && !q.expired)).length;

  const pill = (value: string, label: string) => (
    <button key={value} onClick={() => setFilter(value)} className="aibtn" style={{ height: 32, padding: '0 12px', fontSize: 12.5, background: filter === value ? 'var(--blue-500)' : 'var(--surface-card)', color: filter === value ? '#fff' : 'var(--text-secondary)', border: filter === value ? 'none' : '1px solid var(--border-subtle)' }}>
      {label}{value && quotes ? ` (${count(value)})` : ''}
    </button>
  );

  return (
    <>
    {toast && <div role="status" style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 1100, background: 'var(--ink-900, #0B1F3A)', color: '#fff', padding: '12px 16px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, boxShadow: '0 10px 30px rgba(11,31,58,.25)' }}>✓ {toast}</div>}
    {send && (
      <Modal
        title={`Email ${send.quote.number} to the client`}
        subtitle="The branded PDF is attached. You get a copy, and replies come to you."
        width={560}
        onClose={() => !sending && setSend(null)}
        footer={<>
          <Button variant="outline" onClick={() => viewPdf(send.quote)}>Preview PDF</Button>
          <Button variant="outline" disabled={sending} onClick={() => setSend(null)}>Cancel</Button>
          <Button disabled={sending} onClick={doSend}>{sending ? 'Sending…' : 'Send quote'}</Button>
        </>}
      >
        <Field label="To"><TextInput value={send.to} onChange={(e) => setSend({ ...send, to: e.target.value })} placeholder="name@company.co.uk" /></Field>
        <Field label="Cc (optional)"><TextInput value={send.cc} onChange={(e) => setSend({ ...send, cc: e.target.value })} placeholder="Separate several with commas" /></Field>
        <Field label="Subject"><TextInput value={send.subject} maxLength={200} onChange={(e) => setSend({ ...send, subject: e.target.value })} /></Field>
        <Field label="Message">
          <textarea value={send.message} rows={8} maxLength={5000} onChange={(e) => setSend({ ...send, message: e.target.value })}
            style={{ width: '100%', padding: 10, border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.5, background: 'var(--surface-card)', color: 'var(--text-primary)' }} />
        </Field>
        <div className="dim" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          From <b>{send.from}</b> · replies to <b>{send.replyTo}</b>{send.senderEmail ? <> · copy to <b>{send.senderEmail}</b></> : null}
          <br />Sending marks the quote as <b>Sent</b>.
        </div>
        {sendError && <p role="alert" style={{ color: 'var(--error-600, #c0392b)', fontSize: 13.5, margin: 0 }}>{sendError}</p>}
      </Modal>
    )}
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
                          <div className="fx ac" style={{ gap: 14, flexWrap: 'wrap' }}>
                            {q.status === 'DRAFT'
                              ? <Link href={`/dashboard/quotes?edit=${q.id}`} className="link" style={{ fontWeight: 600, fontSize: 13 }}>Edit draft</Link>
                              : <span className="dim" style={{ fontSize: 12.5 }}>Move back to Draft to edit</span>}
                            <button className="link" style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }} onClick={() => viewPdf(q)}>View PDF</button>
                            {(q.status === 'DRAFT' || q.status === 'SENT') && !q.expired && (
                              <button className="aibtn" style={{ height: 34, background: 'var(--blue-500)', color: '#fff', border: 'none' }} onClick={() => openSend(q)}>
                                {q.status === 'SENT' ? 'Email again' : 'Email to client'}
                              </button>
                            )}
                          </div>
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
    </>
  );
}
