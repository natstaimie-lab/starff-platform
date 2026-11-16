'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, Badge } from '@/components/ui';
import { Modal, Field, TextInput, Button } from '@/components/Modal';
import { ACTIVITY_LABEL, STAGE_LABEL, STAGE_TONE, type Lead, apiError, fmtDate, gbp } from '@/lib/leads';

type TodayLead = Lead & { lastActivity: { type: string; subject: string | null; outcome: string | null; occurredAt: string } | null };
type Today = { overdue: TodayLead[]; today: TodayLead[]; upcoming: TodayLead[]; later: TodayLead[]; none: TodayLead[] };
type GroupKey = keyof Today;

const GROUPS: { key: GroupKey; title: string; hint: string; open: boolean }[] = [
  { key: 'overdue', title: 'Overdue', hint: 'Follow-up date has passed', open: true },
  { key: 'today', title: 'Due today', hint: 'Chase these today', open: true },
  { key: 'none', title: 'No follow-up set', hint: 'Open leads with no next step. Give each one a date so nobody slips through', open: true },
  { key: 'upcoming', title: 'Next 7 days', hint: 'Coming up this week', open: false },
  { key: 'later', title: 'Later', hint: 'More than a week away', open: false },
];

/** yyyy-mm-dd, `days` from today in the browser's (UK) time zone. */
const dayFromNow = (days: number) => {
  const d = new Date(); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type LogForm = { lead: TodayLead; type: 'CALL' | 'EMAIL' | 'NOTE'; outcome: string; body: string; next: string; error: string };

export default function TodayPage() {
  const [data, setData] = useState<Today | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Record<GroupKey, boolean>>(() => Object.fromEntries(GROUPS.map((g) => [g.key, g.open])) as Record<GroupKey, boolean>);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [log, setLog] = useState<LogForm | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => apiFetch<Today>('/leads/today').then((d) => { setData(d); setError(''); }).catch((e) => setError(apiError(e, 'Could not load follow-ups')));
  useEffect(() => { load(); }, []);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 5000); };

  /** Move the follow-up date (snooze) without logging anything. */
  async function setNext(l: TodayLead, date: string, label: string) {
    setBusy(l.id);
    try {
      await apiFetch(`/leads/${l.id}`, { method: 'PATCH', body: JSON.stringify({ nextActionAt: date }) });
      flash(`${l.companyName}: follow up ${label}`);
      await load();
    } catch (e) { flash(apiError(e, 'Could not change the date')); } finally { setBusy(null); }
  }

  async function saveLog() {
    if (!log) return;
    if (!log.outcome.trim() && !log.body.trim()) { setLog({ ...log, error: 'Say what happened (outcome or details).' }); return; }
    setSaving(true);
    try {
      const body: Record<string, string> = { type: log.type };
      if (log.outcome.trim()) body.outcome = log.outcome.trim();
      if (log.body.trim()) body.body = log.body.trim();
      if (log.next) body.nextActionAt = log.next;
      await apiFetch(`/leads/${log.lead.id}/activities`, { method: 'POST', body: JSON.stringify(body) });
      if (!log.next) await apiFetch(`/leads/${log.lead.id}`, { method: 'PATCH', body: JSON.stringify({ clearNextAction: true }) });
      flash(`${ACTIVITY_LABEL[log.type]} logged for ${log.lead.companyName}`);
      setLog(null);
      await load();
    } catch (e) { setLog({ ...log, error: apiError(e, 'Could not save') }); } finally { setSaving(false); }
  }

  const counts = data ? { overdue: data.overdue.length, today: data.today.length, none: data.none.length } : null;
  const toDo = counts ? counts.overdue + counts.today : 0;

  const row = (l: TodayLead, group: GroupKey) => (
    <li key={l.id} className="td-row">
      <div className="td-main">
        <div className="fx ac" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link href={`/dashboard/leads/${l.id}`} className="td-name">{l.companyName}</Link>
          <Badge tone={STAGE_TONE[l.stage]}>{STAGE_LABEL[l.stage]}</Badge>
          {l.estimatedValue && <span className="dim mono" style={{ fontSize: 12 }}>{gbp(l.estimatedValue)}/mo</span>}
        </div>
        <div className="td-contact">
          {l.contactName && <span>{l.contactName}</span>}
          {l.contactPhone && <a className="link" href={`tel:${l.contactPhone.replace(/\s+/g, '')}`}>{l.contactPhone}</a>}
          {l.contactEmail && <a className="link" href={`mailto:${l.contactEmail}`}>{l.contactEmail}</a>}
        </div>
        <div className="dim td-last">
          {l.lastActivity
            ? <>Last: {ACTIVITY_LABEL[l.lastActivity.type] ?? l.lastActivity.type}{l.lastActivity.subject ? ` · ${l.lastActivity.subject}` : ''}{l.lastActivity.outcome ? ` · ${l.lastActivity.outcome}` : ''} ({fmtDate(l.lastActivity.occurredAt)})</>
            : 'Nothing logged yet'}
        </div>
      </div>
      <div className="td-side">
        {group === 'none'
          ? <span className="dim" style={{ fontSize: 12.5 }}>No date</span>
          : <span className={group === 'overdue' ? 'td-due is-over' : 'td-due'}>{group === 'today' ? 'Today' : fmtDate(l.nextActionAt)}</span>}
        <div className="td-actions">
          <button className="td-btn is-primary" disabled={busy === l.id} onClick={() => setLog({ lead: l, type: 'CALL', outcome: '', body: '', next: dayFromNow(2), error: '' })}>Log</button>
          <button className="td-btn" disabled={busy === l.id} onClick={() => setNext(l, dayFromNow(1), 'tomorrow')} title="Move the follow-up to tomorrow">Tomorrow</button>
          <button className="td-btn" disabled={busy === l.id} onClick={() => setNext(l, dayFromNow(7), 'in a week')} title="Move the follow-up a week out">+1 week</button>
        </div>
      </div>
    </li>
  );

  return (
    <>
      {toast && <div role="status" className="pb-toast">{toast}</div>}

      {log && (
        <Modal title={`Log for ${log.lead.companyName}`} subtitle={[log.lead.contactName, log.lead.contactPhone].filter(Boolean).join(' · ') || undefined}
          onClose={() => !saving && setLog(null)}
          footer={<><Button variant="outline" disabled={saving} onClick={() => setLog(null)}>Cancel</Button><Button disabled={saving} onClick={saveLog}>{saving ? 'Saving…' : 'Save'}</Button></>}>
          <div className="fx ac" style={{ gap: 8 }} role="radiogroup" aria-label="Type">
            {(['CALL', 'EMAIL', 'NOTE'] as const).map((t) => (
              <button key={t} role="radio" aria-checked={log.type === t} onClick={() => setLog({ ...log, type: t })} className={`pb-choice ${log.type === t ? 'is-on' : ''}`}>{ACTIVITY_LABEL[t]}</button>
            ))}
          </div>
          <Field label="Outcome"><TextInput autoFocus value={log.outcome} maxLength={300} placeholder="e.g. No answer, wants a quote, call back Thursday" onChange={(e) => setLog({ ...log, outcome: e.target.value, error: '' })} /></Field>
          <Field label="Details (optional)"><textarea className="lead-textarea" rows={3} maxLength={20000} value={log.body} onChange={(e) => setLog({ ...log, body: e.target.value, error: '' })} /></Field>
          <Field label="Next follow-up">
            <TextInput type="date" value={log.next} onChange={(e) => setLog({ ...log, next: e.target.value })} />
          </Field>
          <div className="fx ac" style={{ gap: 6, flexWrap: 'wrap', marginTop: -6 }}>
            {[['Tomorrow', 1], ['In 2 days', 2], ['Next week', 7], ['In 2 weeks', 14]].map(([label, n]) => (
              <button key={label} className="td-btn" onClick={() => setLog({ ...log, next: dayFromNow(n as number) })}>{label}</button>
            ))}
            <button className="td-btn" onClick={() => setLog({ ...log, next: '' })}>No follow-up</button>
          </div>
          {!log.next && <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>The lead will move to “No follow-up set”.</p>}
          {log.error && <p role="alert" className="lead-error">{log.error}</p>}
        </Modal>
      )}

      <div className="pb-bar">
        <div className="fx ac" style={{ gap: 8 }}>
          <Link href="/dashboard/leads" className="pb-tab">List</Link>
          <Link href="/dashboard/leads/board" className="pb-tab">Board</Link>
          <span className="pb-tab is-on" aria-current="page">Today</span>
        </div>
        {counts && <span className="dim" style={{ fontSize: 13 }}>{toDo === 0 ? 'Nothing due. Nice.' : `${toDo} to chase today`}{counts.none ? ` · ${counts.none} with no follow-up` : ''}</span>}
      </div>

      {error ? <p className="lead-error">{error}</p> : !data ? <p className="dim">Loading…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {GROUPS.map((g) => {
            const rows = data[g.key];
            if (rows.length === 0 && (g.key === 'later' || g.key === 'upcoming' || g.key === 'none')) return null;
            return (
              <Card key={g.key}
                title={`${g.title} (${rows.length})`}
                subtitle={g.hint}
                action={rows.length > 0 ? <button className="link" style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit', fontSize: 13 }} aria-expanded={open[g.key]} onClick={() => setOpen({ ...open, [g.key]: !open[g.key] })}>{open[g.key] ? 'Hide' : 'Show'}</button> : undefined}>
                {rows.length === 0
                  ? <p className="dim" style={{ margin: 0 }}>{g.key === 'overdue' ? 'Nothing overdue.' : 'Nothing due today.'}</p>
                  : open[g.key] && <ul className="td-list">{rows.map((l) => row(l, g.key))}</ul>}
              </Card>
            );
          })}
          <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>Won, lost and archived leads aren&apos;t shown. Add new prospects from the <Link href="/dashboard/leads" className="link">Leads list</Link> so everyone you&apos;re chasing is here.</p>
        </div>
      )}
    </>
  );
}
