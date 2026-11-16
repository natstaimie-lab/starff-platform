'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, Badge } from '@/components/ui';
import { Field, TextInput, Button } from '@/components/Modal';
import { STAGE_LABEL, STAGE_TONE, type Stage, apiError, fmtDate, fmtDateTime } from '@/lib/leads';

type DraftLead = {
  id: string; companyName: string; contactName: string | null; contactRole: string | null; contactEmail: string | null; contactPhone: string | null;
  stage: Stage; sector: string | null; city: string | null; nextActionAt: string | null; lastActivityAt: string | null;
};
type Draft = {
  id: string; leadId: string; status: 'PENDING' | 'SENT' | 'SKIPPED' | 'STALE'; forDay: string; trigger: string;
  subject: string; body: string; callScript: string | null; reasoning: string | null; warnings: string[] | null; nextFollowUpDays: number;
  decidedAt: string | null; skipReason: string | null; createdAt: string; lead: DraftLead; leadChanged: boolean;
};
type Summary = { pending: number; draftedToday: number; dailyCap: number; dueWithEmail: number; dueNoEmail: number; running: boolean; autodraft: boolean; configured: boolean };
type Edit = { subject: string; body: string; followUp: string; busy: boolean; error: string };

/** n working days (Mon–Fri) from today, as yyyy-mm-dd. */
function workingDaysFromNow(n: number) {
  const d = new Date();
  let left = n;
  while (left > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) left--; }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DONE_LABEL: Record<Draft['status'], string> = { PENDING: 'Waiting', SENT: 'Sent', SKIPPED: 'Skipped', STALE: 'Out of date' };
const DONE_TONE: Record<Draft['status'], 'neutral' | 'success' | 'warning' | 'info'> = { PENDING: 'info', SENT: 'success', SKIPPED: 'neutral', STALE: 'warning' };

export default function ApprovalsPage() {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [done, setDone] = useState<Draft[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [sum, setSum] = useState<Summary | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [running, setRunning] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try {
      const [d, s] = await Promise.all([apiFetch<Draft[]>('/ai-sales/drafts'), apiFetch<Summary>('/ai-sales/summary')]);
      setDrafts(d); setSum(s); setError('');
      setEdits((prev) => {
        const next: Record<string, Edit> = {};
        for (const x of d) next[x.id] = prev[x.id] ?? { subject: x.subject, body: x.body, followUp: workingDaysFromNow(x.nextFollowUpDays), busy: false, error: '' };
        return next;
      });
      if (!s.running && poll.current) { clearInterval(poll.current); poll.current = null; }
    } catch (e) { setError(apiError(e, 'Could not load the approvals queue')); }
  };
  const loadDone = () => apiFetch<Draft[]>('/ai-sales/drafts?status=done').then(setDone).catch(() => setDone([]));

  useEffect(() => {
    load();
    return () => { if (poll.current) clearInterval(poll.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (showDone) loadDone(); }, [showDone]);

  function startPolling() {
    if (poll.current) clearInterval(poll.current);
    poll.current = setInterval(load, 5000);
  }

  async function runNow() {
    setRunning(true); setToast('');
    try {
      const r = await apiFetch<{ started: boolean; message: string }>('/ai-sales/run', { method: 'POST', body: '{}' });
      setToast(r.message);
      if (r.started) startPolling();
      await load();
    } catch (e) { setToast(apiError(e, 'Could not start the AI salesperson')); } finally { setRunning(false); }
  }

  const setE = (id: string, patch: Partial<Edit>) => setEdits((all) => ({ ...all, [id]: { ...all[id], ...patch } }));

  async function send(d: Draft) {
    const e = edits[d.id];
    if (!e.subject.trim() || !e.body.trim()) { setE(d.id, { error: 'Add a subject and a message.' }); return; }
    if (!confirm(`Send this email to ${d.lead.contactEmail}?`)) return;
    setE(d.id, { busy: true, error: '' });
    try {
      const body: Record<string, string> = { subject: e.subject.trim(), body: e.body.trim() };
      if (e.followUp) body.nextActionAt = e.followUp;
      await apiFetch(`/ai-sales/drafts/${d.id}/send`, { method: 'POST', body: JSON.stringify(body) });
      setToast(`Sent to ${d.lead.contactEmail} (${d.lead.companyName}).`);
      await load(); if (showDone) loadDone();
    } catch (err) { setE(d.id, { busy: false, error: apiError(err, 'Could not send') }); }
  }

  async function skip(d: Draft, days: number | null) {
    setE(d.id, { busy: true, error: '' });
    try {
      const body: Record<string, string> = {};
      if (days) body.nextActionAt = workingDaysFromNow(days);
      await apiFetch(`/ai-sales/drafts/${d.id}/skip`, { method: 'POST', body: JSON.stringify(body) });
      setToast(days ? `Skipped. ${d.lead.companyName} comes back on ${fmtDate(body.nextActionAt)}.` : `Skipped ${d.lead.companyName}.`);
      await load(); if (showDone) loadDone();
    } catch (err) { setE(d.id, { busy: false, error: apiError(err, 'Could not skip') }); }
  }

  const runLabel = sum?.running || running ? 'Drafting…' : "Draft today's list now";
  const room = sum ? Math.max(0, sum.dailyCap - sum.draftedToday) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title="AI approvals"
        subtitle="Follow-ups the AI salesperson has written for today's leads. Nothing goes out until you press Send."
        action={<Button disabled={running || !!sum?.running || !sum?.configured || room === 0} onClick={runNow}>{runLabel}</Button>}
      >
        {sum && (
          <div className="ai-q-stats">
            <span><b>{sum.pending}</b> waiting</span>
            <span><b>{sum.draftedToday}</b> of {sum.dailyCap} drafted today</span>
            <span><b>{sum.dueWithEmail}</b> due with an email, not drafted yet</span>
            {sum.dueNoEmail > 0 && <span><b>{sum.dueNoEmail}</b> due with no email. <Link href="/dashboard/leads/today" className="link">Call them or add one</Link></span>}
          </div>
        )}
        <p className="dim" style={{ margin: '8px 0 0', fontSize: 12.5 }}>
          {!sum?.configured ? 'The AI is off: the API server has no Anthropic key.'
            : sum.autodraft ? 'Drafts are made automatically every weekday at 07:30 for leads due that day.'
              : 'The automatic 07:30 run is off on this server. Use the button to draft now.'}
        </p>
        {toast && <p role="status" className="ai-ok" style={{ margin: '10px 0 0' }}>{toast}</p>}
        {error && <p role="alert" className="lead-error">{error}</p>}
      </Card>

      {drafts === null ? <p className="dim">Loading…</p> : drafts.length === 0 ? (
        <Card><p className="dim" style={{ margin: 0 }}>Nothing waiting. {sum?.running ? 'The AI is writing drafts now. They appear here as they\'re ready.' : 'New drafts arrive at 07:30 on weekdays, or press "Draft today\'s list now".'}</p></Card>
      ) : drafts.map((d) => {
        const e = edits[d.id];
        if (!e) return null;
        const warnings = d.warnings ?? [];
        return (
          <Card key={d.id}
            title={d.lead.companyName}
            subtitle={[d.lead.contactName && `${d.lead.contactName}${d.lead.contactRole ? `, ${d.lead.contactRole}` : ''}`, d.lead.sector, d.lead.city, `drafted ${fmtDateTime(d.createdAt)}`].filter(Boolean).join(' · ')}
            action={<div className="fx ac" style={{ gap: 8 }}><Badge tone={STAGE_TONE[d.lead.stage]}>{STAGE_LABEL[d.lead.stage]}</Badge><Link href={`/dashboard/leads/${d.lead.id}`} className="link" style={{ fontSize: 12.5 }}>Open lead</Link></div>}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {d.leadChanged && <p className="cv-warn">Something was logged on this lead after the draft was written. Check the lead before sending.</p>}
              {d.reasoning && <p className="dim" style={{ margin: 0, fontSize: 13 }}><b>Why this angle:</b> {d.reasoning}</p>}
              {warnings.map((w) => <p key={w} className="cv-warn">{w}</p>)}
              <Field label="Subject"><TextInput value={e.subject} maxLength={200} onChange={(ev) => setE(d.id, { subject: ev.target.value })} /></Field>
              <Field label={`Email to ${d.lead.contactEmail ?? '(no email)'}`}>
                <textarea className="lead-textarea" rows={8} maxLength={10000} value={e.body} onChange={(ev) => setE(d.id, { body: ev.target.value })} />
              </Field>
              <p className="dim" style={{ margin: 0, fontSize: 12 }}>Your name, the landline and an unsubscribe line are added at the bottom automatically.</p>
              {d.callScript && (
                <details><summary className="link" style={{ cursor: 'pointer', fontSize: 13 }}>Prefer to call?{d.lead.contactPhone ? ` ${d.lead.contactPhone}` : ''} Call script</summary>
                  <p className="lead-act-body">{d.callScript}</p></details>
              )}
              <div className="ai-q-foot">
                <Field label="Next follow-up if no reply"><TextInput type="date" value={e.followUp} onChange={(ev) => setE(d.id, { followUp: ev.target.value })} /></Field>
                <div className="fx ac" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <Button disabled={e.busy || !d.lead.contactEmail} onClick={() => send(d)}>{e.busy ? 'Working…' : 'Send email'}</Button>
                  <Button variant="outline" disabled={e.busy} onClick={() => skip(d, 5)}>Skip, try next week</Button>
                  <Button variant="outline" disabled={e.busy} onClick={() => skip(d, null)}>Skip</Button>
                </div>
              </div>
              {e.error && <p role="alert" className="lead-error">{e.error}</p>}
            </div>
          </Card>
        );
      })}

      <div>
        <button className="link" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 13 }} onClick={() => setShowDone(!showDone)}>
          {showDone ? 'Hide' : 'Show'} the last 7 days (sent, skipped, out of date)
        </button>
      </div>
      {showDone && (
        <Card title="Last 7 days">
          {done === null ? <p className="dim">Loading…</p> : done.length === 0 ? <p className="dim" style={{ margin: 0 }}>Nothing yet.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl" style={{ width: '100%' }}>
                <thead><tr><th>Lead</th><th>Subject</th><th>Result</th><th>When</th></tr></thead>
                <tbody>
                  {done.map((d) => (
                    <tr key={d.id}>
                      <td><Link href={`/dashboard/leads/${d.lead.id}`} className="link">{d.lead.companyName}</Link></td>
                      <td>{d.subject}</td>
                      <td><Badge tone={DONE_TONE[d.status]}>{DONE_LABEL[d.status]}</Badge>{d.skipReason ? <span className="dim" style={{ fontSize: 12 }}> {d.skipReason}</span> : null}</td>
                      <td className="dim">{d.decidedAt ? fmtDateTime(d.decidedAt) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
