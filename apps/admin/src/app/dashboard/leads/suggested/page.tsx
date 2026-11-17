'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, Badge } from '@/components/ui';
import { Button } from '@/components/Modal';
import { apiError, fmtDateTime } from '@/lib/leads';

type Suggestion = {
  id: string; status: 'PENDING' | 'ACCEPTED' | 'REJECTED'; weekKey: string; trigger: string;
  companyName: string; domain: string | null; website: string | null; companyLinkedin: string | null; companyPhone: string | null;
  employees: number | null; city: string | null;
  contactName: string | null; contactRole: string | null; contactEmail: string | null; emailStatus: string | null; contactLinkedin: string | null;
  reason: string | null; leadId: string | null; decidedAt: string | null; rejectReason: string | null; createdAt: string;
};
type Summary = {
  pending: number; thisWeek: number; weeklyCap: number; weekKey: string; configured: boolean; autorun: boolean; running: boolean;
  lastRun: { at: string; trigger: string; made: number; checked: number; credits: number; message: string } | null;
};

const ext = (url: string) => (url.startsWith('http') ? url : `https://${url}`);

export default function SuggestedLeadsPage() {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [done, setDone] = useState<Suggestion[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [sum, setSum] = useState<Summary | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try {
      const [s, list] = await Promise.all([apiFetch<Summary>('/prospecting/summary'), apiFetch<Suggestion[]>('/prospecting/suggestions')]);
      setSum(s); setItems(list); setError('');
      if (!s.running && poll.current) {
        clearInterval(poll.current); poll.current = null;
        if (s.lastRun) setToast(s.lastRun.message);
      }
    } catch (e) { setError(apiError(e, 'Could not load suggested leads')); }
  };
  const loadDone = () => apiFetch<Suggestion[]>('/prospecting/suggestions?status=done').then(setDone).catch(() => setDone([]));

  useEffect(() => {
    load();
    return () => { if (poll.current) clearInterval(poll.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (showDone) loadDone(); }, [showDone]);

  async function runNow() {
    setStarting(true); setToast('');
    try {
      const r = await apiFetch<{ started: boolean; message: string }>('/prospecting/run', { method: 'POST', body: '{}' });
      setToast(r.message);
      if (r.started) { if (poll.current) clearInterval(poll.current); poll.current = setInterval(load, 4000); }
      await load();
    } catch (e) { setToast(apiError(e, 'Could not start')); } finally { setStarting(false); }
  }

  async function decide(s: Suggestion, action: 'accept' | 'reject') {
    let body = '{}';
    if (action === 'reject') {
      const reason = prompt(`Why not ${s.companyName}? (optional; they won't be suggested again)`);
      if (reason === null) return;
      body = JSON.stringify(reason.trim() ? { reason: reason.trim() } : {});
    }
    setBusy((b) => ({ ...b, [s.id]: true }));
    try {
      const r = await apiFetch<{ leadId?: string }>(`/prospecting/suggestions/${s.id}/${action}`, { method: 'POST', body });
      setToast(action === 'accept' ? `${s.companyName} is now a lead, due today.` : `Rejected ${s.companyName}.`);
      if (action === 'accept' && r.leadId) setToast(`${s.companyName} added to Leads (due today, so the AI will draft a first email).`);
      await load(); if (showDone) loadDone();
    } catch (e) { setToast(apiError(e, action === 'accept' ? 'Could not accept' : 'Could not reject')); }
    finally { setBusy((b) => ({ ...b, [s.id]: false })); }
  }

  const room = sum ? Math.max(0, sum.weeklyCap - sum.thisWeek) : 0;
  const working = starting || !!sum?.running;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title="Suggested leads"
        subtitle="London companies advertising warehouse jobs, with their Ops / Site / Warehouse manager, found through Apollo. Accept to add them to Leads."
        action={<Button disabled={working || !sum?.configured || room === 0} onClick={runNow}>{working ? 'Searching…' : 'Find leads now'}</Button>}
      >
        {sum && (
          <div className="ai-q-stats">
            <span><b>{sum.pending}</b> waiting</span>
            <span><b>{sum.thisWeek}</b> of {sum.weeklyCap} found this week</span>
            {sum.lastRun && <span>Last search {fmtDateTime(sum.lastRun.at)}: {sum.lastRun.message} (about {sum.lastRun.credits} Apollo credit{sum.lastRun.credits === 1 ? '' : 's'})</span>}
          </div>
        )}
        <p className="dim" style={{ margin: '8px 0 0', fontSize: 12.5 }}>
          {!sum?.configured ? 'Prospecting is off: the API server has no Apollo API key.'
            : sum.autorun ? `New suggestions arrive every Monday at 07:00, up to ${sum.weeklyCap} a week to control Apollo credits.`
              : `The automatic Monday run is off on this server. Use the button (up to ${sum.weeklyCap} a week).`}
        </p>
        {toast && <p role="status" className="ai-ok" style={{ margin: '10px 0 0' }}>{toast}</p>}
        {error && <p role="alert" className="lead-error">{error}</p>}
      </Card>

      {items === null ? <p className="dim">Loading…</p> : items.length === 0 ? (
        <Card><p className="dim" style={{ margin: 0 }}>{working ? 'Searching Apollo now. Suggestions appear here as they are found.' : 'Nothing waiting. New suggestions arrive on Monday mornings, or press "Find leads now".'}</p></Card>
      ) : items.map((s) => (
        <Card key={s.id}
          title={s.companyName}
          subtitle={[s.city, s.employees ? `~${s.employees} staff` : null, s.domain, `found ${fmtDateTime(s.createdAt)}`].filter(Boolean).join(' · ')}
          action={<Badge tone="info">Suggested</Badge>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 14 }}>
              <b>{s.contactName ?? 'Name not found'}</b>{s.contactRole ? `, ${s.contactRole}` : ''}
              <div className="dim" style={{ fontSize: 13, marginTop: 2 }}>
                {s.contactEmail ? <>{s.contactEmail}{s.emailStatus && s.emailStatus !== 'verified' ? ` (${s.emailStatus})` : ''}</> : 'No email found. You can still accept and call the switchboard.'}
                {s.companyPhone ? ` · ${s.companyPhone}` : ''}
              </div>
            </div>
            {s.reason && <p className="dim" style={{ margin: 0, fontSize: 13 }}><b>Why:</b> {s.reason}</p>}
            <div className="fx ac" style={{ gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
              {s.website && <a className="link" href={ext(s.website)} target="_blank" rel="noreferrer">Website</a>}
              {s.companyLinkedin && <a className="link" href={ext(s.companyLinkedin)} target="_blank" rel="noreferrer">Company LinkedIn</a>}
              {s.contactLinkedin && <a className="link" href={ext(s.contactLinkedin)} target="_blank" rel="noreferrer">Contact LinkedIn</a>}
            </div>
            <div className="fx ac" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Button disabled={busy[s.id]} onClick={() => decide(s, 'accept')}>{busy[s.id] ? 'Working…' : 'Accept, add to Leads'}</Button>
              <Button variant="outline" disabled={busy[s.id]} onClick={() => decide(s, 'reject')}>Reject</Button>
            </div>
          </div>
        </Card>
      ))}

      <div>
        <button className="link" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 13 }} onClick={() => setShowDone(!showDone)}>
          {showDone ? 'Hide' : 'Show'} the last 30 days (accepted, rejected)
        </button>
      </div>
      {showDone && (
        <Card title="Last 30 days">
          {done === null ? <p className="dim">Loading…</p> : done.length === 0 ? <p className="dim" style={{ margin: 0 }}>Nothing yet.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl" style={{ width: '100%' }}>
                <thead><tr><th>Company</th><th>Contact</th><th>Result</th><th>When</th></tr></thead>
                <tbody>
                  {done.map((s) => (
                    <tr key={s.id}>
                      <td>{s.leadId ? <Link href={`/dashboard/leads/${s.leadId}`} className="link">{s.companyName}</Link> : s.companyName}</td>
                      <td>{[s.contactName, s.contactRole].filter(Boolean).join(', ')}</td>
                      <td><Badge tone={s.status === 'ACCEPTED' ? 'success' : 'neutral'}>{s.status === 'ACCEPTED' ? 'Accepted' : 'Rejected'}</Badge>{s.rejectReason ? <span className="dim" style={{ fontSize: 12 }}> {s.rejectReason}</span> : null}</td>
                      <td className="dim">{s.decidedAt ? fmtDateTime(s.decidedAt) : ''}</td>
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
