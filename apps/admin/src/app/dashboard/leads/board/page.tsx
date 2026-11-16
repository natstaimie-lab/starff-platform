'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Badge } from '@/components/ui';
import { Modal, Field, TextInput, Button } from '@/components/Modal';
import { STAGE_LABEL, type Lead, type Stage, apiError, fmtDate, gbp, isDue } from '@/lib/leads';

/**
 * Pipeline board. Five columns over the LeadStage enum: Qualified leads sit in
 * the Contacted column (with a tag), and Won and Lost share the last column.
 * Drag a card to another column, or use its "Move to…" menu (keyboard/touch).
 */
type ColumnId = 'new' | 'contacted' | 'quoted' | 'ready' | 'closed';
const COLUMNS: { id: ColumnId; title: string; stages: Stage[]; target?: Stage }[] = [
  { id: 'new', title: 'New', stages: ['NEW'], target: 'NEW' },
  { id: 'contacted', title: 'Contacted', stages: ['CONTACTED', 'QUALIFIED'], target: 'CONTACTED' },
  { id: 'quoted', title: 'Quote sent', stages: ['QUOTED'], target: 'QUOTED' },
  { id: 'ready', title: 'Ready to close', stages: ['READY_TO_CLOSE'], target: 'READY_TO_CLOSE' },
  { id: 'closed', title: 'Won / Lost', stages: ['WON', 'LOST'] }, // asks which
];
const MOVE_OPTIONS: Stage[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED', 'READY_TO_CLOSE', 'WON', 'LOST'];
const CLOSED_SHOWN = 20;

const columnOf = (s: Stage) => COLUMNS.find((c) => c.stages.includes(s))!.id;

export default function PipelineBoardPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<ColumnId | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [close, setClose] = useState<{ lead: Lead; stage: 'WON' | 'LOST'; reason: string; error: string } | null>(null);
  const [showAllClosed, setShowAllClosed] = useState(false);

  const load = () => apiFetch<Lead[]>('/leads').then((r) => { setLeads(r); setError(''); }).catch((e) => setError(apiError(e, 'Could not load leads')));
  useEffect(() => { load(); }, []);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 5000); };

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (leads ?? []).filter((l) => !term || [l.companyName, l.contactName, l.contactEmail].some((v) => v?.toLowerCase().includes(term)));
  }, [leads, q]);

  /** Change stage on the server; the card moves straight away and moves back if it fails. */
  async function move(lead: Lead, stage: Stage, reason?: string) {
    if (lead.stage === stage) return true;
    const before = lead.stage;
    setBusy(lead.id);
    setLeads((ls) => ls!.map((l) => (l.id === lead.id ? { ...l, stage } : l)));
    try {
      const body: Record<string, string> = { stage };
      if (reason) body.reason = reason;
      const updated = await apiFetch<Lead>(`/leads/${lead.id}/stage`, { method: 'PATCH', body: JSON.stringify(body) });
      setLeads((ls) => ls!.map((l) => (l.id === lead.id ? { ...l, ...updated, client: updated.client, _count: l._count } : l)));
      flash(`${lead.companyName} moved to ${STAGE_LABEL[stage]}`);
      return true;
    } catch (e) {
      setLeads((ls) => ls!.map((l) => (l.id === lead.id ? { ...l, stage: before } : l)));
      flash(apiError(e, 'Could not move the lead'));
      return false;
    } finally { setBusy(null); }
  }

  /** Route a requested stage: Won/Lost go through the confirm box (Lost needs a reason). */
  function request(lead: Lead, stage: Stage) {
    if (stage === lead.stage) return;
    if (stage === 'WON' || stage === 'LOST') { setClose({ lead, stage, reason: '', error: '' }); return; }
    move(lead, stage);
  }

  function dropOn(col: (typeof COLUMNS)[number]) {
    const lead = leads?.find((l) => l.id === dragId);
    setDragId(null); setOver(null);
    if (!lead || columnOf(lead.stage) === col.id) return;
    if (col.target) move(lead, col.target);
    else setClose({ lead, stage: 'WON', reason: '', error: '' });
  }

  async function confirmClose() {
    if (!close) return;
    if (close.stage === 'LOST' && !close.reason.trim()) { setClose({ ...close, error: 'Say why it was lost.' }); return; }
    const ok = await move(close.lead, close.stage, close.stage === 'LOST' ? close.reason.trim() : undefined);
    if (ok) setClose(null);
  }

  return (
    <>
      {toast && <div role="status" className="pb-toast">{toast}</div>}

      {close && (
        <Modal title={`Close ${close.lead.companyName}`} subtitle="Did we win it?" onClose={() => busy !== close.lead.id && setClose(null)}
          footer={<><Button variant="outline" onClick={() => setClose(null)}>Cancel</Button><Button disabled={busy === close.lead.id} onClick={confirmClose}>{busy === close.lead.id ? 'Saving…' : `Mark ${close.stage === 'WON' ? 'Won' : 'Lost'}`}</Button></>}>
          <div className="fx ac" style={{ gap: 8 }} role="radiogroup" aria-label="Outcome">
            {(['WON', 'LOST'] as const).map((s) => (
              <button key={s} role="radio" aria-checked={close.stage === s} onClick={() => setClose({ ...close, stage: s, error: '' })} className={`pb-choice ${close.stage === s ? (s === 'WON' ? 'is-won' : 'is-lost') : ''}`}>
                {s === 'WON' ? 'Won' : 'Lost'}
              </button>
            ))}
          </div>
          {close.stage === 'LOST' && (
            <Field label="Why was it lost?"><TextInput autoFocus value={close.reason} maxLength={500} placeholder="e.g. Went with another agency" onChange={(e) => setClose({ ...close, reason: e.target.value, error: '' })} /></Field>
          )}
          {close.stage === 'WON' && <p className="dim" style={{ fontSize: 13, margin: 0 }}>Marking it Won doesn&apos;t set up their client account. Do that from Clients when you&apos;re ready.</p>}
          {close.error && <p role="alert" className="lead-error">{close.error}</p>}
        </Modal>
      )}

      <div className="pb-bar">
        <div className="fx ac" style={{ gap: 8 }}>
          <Link href="/dashboard/leads" className="pb-tab">List</Link>
          <span className="pb-tab is-on" aria-current="page">Board</span>
        </div>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company, contact or email" aria-label="Search leads" className="lead-search" />
      </div>
      <p className="dim" style={{ fontSize: 13, margin: '0 0 12px' }}>Drag a card to another column to change its stage, or use the menu on the card.</p>

      {error ? <p className="lead-error">{error}</p> : !leads ? <p className="dim">Loading…</p> : (
        <div className="pb-board">
          {COLUMNS.map((col) => {
            let cards = shown.filter((l) => col.stages.includes(l.stage));
            cards = col.id === 'closed'
              ? [...cards].sort((a, b) => +new Date(b.stageChangedAt) - +new Date(a.stageChangedAt))
              : [...cards].sort((a, b) => (+new Date(a.nextActionAt ?? 8.64e15)) - (+new Date(b.nextActionAt ?? 8.64e15)));
            const total = cards.reduce((n, l) => n + (l.stage !== 'LOST' && l.estimatedValue ? Number(l.estimatedValue) : 0), 0);
            const hidden = col.id === 'closed' && !showAllClosed ? Math.max(0, cards.length - CLOSED_SHOWN) : 0;
            if (hidden) cards = cards.slice(0, CLOSED_SHOWN);
            return (
              <section key={col.id} aria-label={col.title}
                className={`pb-col ${over === col.id ? 'is-over' : ''}`}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setOver(col.id); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
                onDrop={(e) => { e.preventDefault(); dropOn(col); }}>
                <header className="pb-col-head">
                  <span className="pb-col-title">{col.title}</span>
                  <span className="pb-count">{shown.filter((l) => col.stages.includes(l.stage)).length}</span>
                  {total > 0 && <span className="dim pb-total">{gbp(total)}/mo</span>}
                </header>
                <div className="pb-cards">
                  {cards.length === 0 && <div className="pb-empty">{dragId ? 'Drop here' : 'Nothing here'}</div>}
                  {cards.map((l) => (
                    <article key={l.id} draggable={busy !== l.id}
                      onDragStart={(e) => { setDragId(l.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', l.id); }}
                      onDragEnd={() => { setDragId(null); setOver(null); }}
                      className={`pb-card ${dragId === l.id ? 'is-dragging' : ''} ${busy === l.id ? 'is-busy' : ''}`}>
                      <div className="fx ac jb" style={{ gap: 6 }}>
                        <Link href={`/dashboard/leads/${l.id}`} className="pb-name">{l.companyName}</Link>
                        {l.stage === 'QUALIFIED' && <Badge tone="info">Qualified</Badge>}
                        {l.stage === 'WON' && <Badge tone="success">Won</Badge>}
                        {l.stage === 'LOST' && <Badge tone="error">Lost</Badge>}
                      </div>
                      {l.contactName && <div className="dim pb-line">{l.contactName}</div>}
                      {l.stage === 'LOST' && l.lostReason && <div className="dim pb-line">{l.lostReason}</div>}
                      <div className="pb-meta">
                        {l.estimatedValue && <span className="mono">{gbp(l.estimatedValue)}/mo</span>}
                        {isDue(l) ? <Badge tone="warning">Due {fmtDate(l.nextActionAt)}</Badge> : l.nextActionAt && l.stage !== 'WON' && l.stage !== 'LOST' ? <span className="dim">Follow up {fmtDate(l.nextActionAt)}</span> : null}
                        {l.createdByAi && <span className="dim" title="Added by the AI salesperson">AI</span>}
                      </div>
                      <select aria-label={`Move ${l.companyName} to`} value="" disabled={busy === l.id} className="pb-move"
                        onChange={(e) => e.target.value && request(l, e.target.value as Stage)}>
                        <option value="">{busy === l.id ? 'Saving…' : 'Move to…'}</option>
                        {MOVE_OPTIONS.filter((s) => s !== l.stage).map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                      </select>
                    </article>
                  ))}
                  {hidden > 0 && <button className="pb-more" onClick={() => setShowAllClosed(true)}>Show {hidden} older</button>}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {leads && leads.length === 0 && !error && (
        <p className="dim" style={{ marginTop: 12 }}>No leads yet. <button className="link" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' }} onClick={() => router.push('/dashboard/leads')}>Add one from the list</button>, or turn a website enquiry into a lead.</p>
      )}
    </>
  );
}
