'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Card, Badge } from '@/components/ui';
import { Modal, Field, TextInput, SelectInput, Button } from '@/components/Modal';
import {
  STAGES, STAGE_LABEL, STAGE_TONE, SOURCE_LABEL, ACTIVITY_LABEL, QUOTE_LABEL, QUOTE_TONE, type LeadDetail, type Stage,
  apiError, fmtDate, fmtDateTime, gbp, isDue, quoteExpired, toDateInput,
} from '@/lib/leads';

const LOG_TYPES = ['CALL', 'EMAIL', 'NOTE', 'MEETING'] as const;
type LogForm = { type: (typeof LOG_TYPES)[number]; direction: 'outbound' | 'inbound'; subject: string; body: string; outcome: string; nextActionAt: string };
const EMPTY_LOG: LogForm = { type: 'CALL', direction: 'outbound', subject: '', body: '', outcome: '', nextActionAt: '' };

type ClientMatch = {
  clientId: string; reasons: ('email' | 'company')[]; name: string; status: string; city: string | null; postcode: string | null;
  archived: boolean; primaryContact: string | null; contacts: number;
};
type ConvertForm = {
  quoteId: string; firstName: string; lastName: string; email: string; phone: string; sendInvite: boolean; error: string;
  /** Possible existing clients from the duplicate check; null while checking. */
  matches: ClientMatch[] | null; checkedEmail: string;
  /** '' = not chosen yet, 'new' = create a new client anyway, otherwise the existing client's id. */
  choice: string;
};
type ConvertResult = { clientId: string; clientCreated: boolean; invited: boolean; quoteNumber: string | null; ratesCopied: number };

type AiDraft = { configured: true; subject: string; body: string; callScript: string; nextFollowUpDays: number; reasoning: string; warnings: string[] };
type AiState = {
  instructions: string; busy: boolean; error: string; sending: boolean; sentTo: string;
  draft: AiDraft | null; subject: string; body: string; followUp: string;
};
const EMPTY_AI: AiState = { instructions: '', busy: false, error: '', sending: false, sentTo: '', draft: null, subject: '', body: '', followUp: '' };

/** n working days (Mon–Fri) from today, as yyyy-mm-dd. */
function workingDaysFromNow(n: number) {
  const d = new Date();
  let left = n;
  while (left > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) left--; }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type EditForm = { companyName: string; contactName: string; contactEmail: string; contactPhone: string; contactRole: string; sector: string; city: string; postcode: string; estimatedValue: string; nextActionAt: string; notes: string };

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [error, setError] = useState('');
  const [log, setLog] = useState<LogForm>({ ...EMPTY_LOG });
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState('');
  const [stageForm, setStageForm] = useState<{ stage: Stage; reason: string; note: string } | null>(null);
  const [stageBusy, setStageBusy] = useState(false);
  const [stageError, setStageError] = useState('');
  const [edit, setEdit] = useState<EditForm | null>(null);
  const [conv, setConv] = useState<ConvertForm | null>(null);
  const [convBusy, setConvBusy] = useState(false);
  const [converted, setConverted] = useState<ConvertResult | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');
  const [ai, setAi] = useState<AiState>({ ...EMPTY_AI });

  const load = () => apiFetch<LeadDetail>(`/leads/${id}`).then(setLead).catch((e) => setError(apiError(e, 'Could not load this lead')));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function saveLog() {
    setLogging(true); setLogError('');
    try {
      const body: Record<string, unknown> = { type: log.type };
      if (log.type === 'CALL' || log.type === 'EMAIL') body.direction = log.direction;
      for (const k of ['subject', 'body', 'outcome', 'nextActionAt'] as const) if (log[k].trim()) body[k] = log[k].trim();
      await apiFetch(`/leads/${id}/activities`, { method: 'POST', body: JSON.stringify(body) });
      setLog({ ...EMPTY_LOG, type: log.type });
      await load();
    } catch (e) { setLogError(apiError(e, 'Could not save the activity')); } finally { setLogging(false); }
  }

  async function saveStage() {
    if (!stageForm) return;
    setStageBusy(true); setStageError('');
    try {
      const body: Record<string, string> = { stage: stageForm.stage };
      if (stageForm.reason.trim()) body.reason = stageForm.reason.trim();
      if (stageForm.note.trim()) body.note = stageForm.note.trim();
      const updated = await apiFetch<LeadDetail>(`/leads/${id}/stage`, { method: 'PATCH', body: JSON.stringify(body) });
      setLead(updated); setStageForm(null);
    } catch (e) { setStageError(apiError(e, 'Could not change the stage')); } finally { setStageBusy(false); }
  }

  async function draftWithAi() {
    setAi((a) => ({ ...a, busy: true, error: '', sentTo: '' }));
    try {
      const r = await apiFetch<AiDraft | { configured: false; message: string }>(`/leads/${id}/ai-draft`, {
        method: 'POST', body: JSON.stringify(ai.instructions.trim() ? { instructions: ai.instructions.trim() } : {}),
      });
      if (!r.configured) { setAi((a) => ({ ...a, busy: false, error: r.message })); return; }
      setAi((a) => ({ ...a, busy: false, draft: r, subject: r.subject, body: r.body, followUp: workingDaysFromNow(r.nextFollowUpDays) }));
    } catch (e) { setAi((a) => ({ ...a, busy: false, error: apiError(e, 'The AI could not write a draft') })); }
  }

  async function sendAiDraft() {
    if (!ai.draft || !lead?.contactEmail) return;
    if (!confirm(`Send this email to ${lead.contactEmail}?`)) return;
    setAi((a) => ({ ...a, sending: true, error: '' }));
    try {
      const edited = ai.subject.trim() !== ai.draft.subject || ai.body.trim() !== ai.draft.body;
      const body: Record<string, unknown> = { subject: ai.subject.trim(), body: ai.body.trim(), aiDrafted: true, edited };
      if (ai.followUp) body.nextActionAt = ai.followUp;
      const r = await apiFetch<{ to: string }>(`/leads/${id}/email`, { method: 'POST', body: JSON.stringify(body) });
      setAi({ ...EMPTY_AI, sentTo: r.to });
      await load();
    } catch (e) { setAi((a) => ({ ...a, sending: false, error: apiError(e, 'Could not send the email') })); }
  }

  function openEdit() {
    if (!lead) return;
    setEditError('');
    setEdit({
      companyName: lead.companyName, contactName: lead.contactName ?? '', contactEmail: lead.contactEmail ?? '',
      contactPhone: lead.contactPhone ?? '', contactRole: lead.contactRole ?? '', sector: lead.sector ?? '', city: lead.city ?? '',
      postcode: lead.postcode ?? '', estimatedValue: lead.estimatedValue ? String(Number(lead.estimatedValue)) : '',
      nextActionAt: toDateInput(lead.nextActionAt), notes: lead.notes ?? '',
    });
  }

  async function saveEdit() {
    if (!edit) return;
    if (!edit.companyName.trim()) { setEditError('Company name can\'t be empty.'); return; }
    setEditBusy(true); setEditError('');
    try {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(edit)) {
        if (k === 'estimatedValue' || k === 'nextActionAt') { if (v.trim()) body[k] = k === 'estimatedValue' ? Number(v) : v; }
        else body[k] = v.trim(); // empty string clears the field
      }
      if (body.contactEmail === '') delete body.contactEmail; // email validator rejects ''
      await apiFetch(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setEdit(null); await load();
    } catch (e) { setEditError(apiError(e, 'Could not save')); } finally { setEditBusy(false); }
  }

  function openConvert() {
    if (!lead) return;
    const [first, ...rest] = (lead.contactName ?? '').trim().split(/\s+/);
    const accepted = lead.quotes.filter((q) => q.status === 'ACCEPTED');
    const email = lead.contactEmail ?? '';
    setConv({ quoteId: accepted[0]?.id ?? '', firstName: first ?? '', lastName: rest.join(' '), email, phone: lead.contactPhone ?? '', sendInvite: true, error: '', matches: lead.client ? [] : null, checkedEmail: email, choice: '' });
    if (!lead.client) checkDuplicates(email);
  }

  /** Duplicate check: existing clients with this login email or the same company name. */
  async function checkDuplicates(email: string) {
    try {
      const r = await apiFetch<{ matches: ClientMatch[] }>(`/leads/${id}/convert-check${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`);
      setConv((c) => c && { ...c, matches: r.matches, checkedEmail: email, choice: r.matches.some((m) => m.clientId === c.choice) ? c.choice : '' });
    } catch {
      setConv((c) => c && { ...c, matches: [], checkedEmail: email });
    }
  }

  async function doConvert() {
    if (!conv) return;
    if (!conv.firstName.trim() || !conv.lastName.trim() || !conv.email.trim()) { setConv({ ...conv, error: 'Add the contact\'s first name, last name and email. They get the portal login.' }); return; }
    if (conv.matches === null) return;
    if (conv.matches.length && !conv.choice) { setConv({ ...conv, error: 'Choose the existing client, or confirm this is a new client.' }); return; }
    setConvBusy(true);
    try {
      const body: Record<string, unknown> = {
        contactFirstName: conv.firstName.trim(), contactLastName: conv.lastName.trim(), contactEmail: conv.email.trim(), sendInvite: conv.sendInvite,
      };
      if (conv.phone.trim()) body.contactPhone = conv.phone.trim();
      if (conv.quoteId) body.quoteId = conv.quoteId;
      if (conv.choice === 'new') body.createNew = true;
      else if (conv.choice) body.clientId = conv.choice;
      const r = await apiFetch<ConvertResult>(`/leads/${id}/convert`, { method: 'POST', body: JSON.stringify(body) });
      setConv(null); setConverted(r);
      await load();
    } catch (e) {
      // The duplicate check can find a match that appeared since the box opened.
      const raw = String((e as Error)?.message ?? '');
      const json = raw.match(/\{.*\}$/s);
      let matches: ClientMatch[] | undefined;
      if (json) { try { matches = JSON.parse(json[0]).matches; } catch { /* not JSON */ } }
      setConv({ ...conv, ...(matches ? { matches, choice: '' } : {}), error: apiError(e, 'Could not convert') });
    } finally { setConvBusy(false); }
  }

  async function toggleArchive() {
    if (!lead) return;
    const archived = !lead.archivedAt;
    if (archived && !confirm(`Archive ${lead.companyName}? It will be hidden from the leads list. You can restore it later.`)) return;
    try {
      await apiFetch(`/leads/${id}/archive`, { method: 'PATCH', body: JSON.stringify({ archived }) });
      if (archived) router.push('/dashboard/leads'); else await load();
    } catch (e) { alert(apiError(e, 'Could not archive')); }
  }

  if (error) return <Card><p className="lead-error">{error}</p><Link href="/dashboard/leads" className="link">← Back to leads</Link></Card>;
  if (!lead) return <p className="dim">Loading…</p>;

  const setL = (k: keyof LogForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setLog({ ...log, [k]: e.target.value });
  const setE = (k: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEdit({ ...edit!, [k]: e.target.value });
  const row = (label: string, value: React.ReactNode) => (
    <div className="lead-row"><span className="dim">{label}</span><span>{value || '—'}</span></div>
  );

  return (
    <>
      {conv && (() => {
        const accepted = lead.quotes.filter((q) => q.status === 'ACCEPTED');
        const setC = (k: keyof ConvertForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setConv({ ...conv, [k]: e.target.value, error: '' });
        return (
          <Modal title={`Convert ${lead.companyName} to a client`} width={560} onClose={() => !convBusy && setConv(null)}
            subtitle={lead.client ? `Uses the existing client record: ${lead.client.name}` : conv.matches === null ? 'Checking for an existing client…' : conv.matches.length ? 'Possible existing client found. Choose below' : 'No existing client found. Creates a new client record'}
            footer={<><Button variant="outline" disabled={convBusy} onClick={() => setConv(null)}>Cancel</Button><Button disabled={convBusy || conv.matches === null || (conv.matches.length > 0 && !conv.choice)} onClick={doConvert}>{convBusy ? 'Converting…' : conv.choice && conv.choice !== 'new' ? 'Convert to this client' : 'Convert to client'}</Button></>}>
            {!!conv.matches?.length && (
              <fieldset className="cv-dupes">
                <legend>Is this one of your existing clients?</legend>
                {conv.matches.map((m) => (
                  <label key={m.clientId} className={`cv-dupe ${conv.choice === m.clientId ? 'is-on' : ''}`}>
                    <input type="radio" name="cv-choice" checked={conv.choice === m.clientId} onChange={() => setConv({ ...conv, choice: m.clientId, error: '' })} />
                    <span>
                      <b>{m.name}</b> <span className="dim">· {m.status.toLowerCase()}{m.archived ? ' · archived' : ''}{m.city ? ` · ${m.city}` : ''}</span>
                      <span className="cv-why">{m.reasons.includes('email') ? `${conv.checkedEmail} is already on this client` : 'Same company name'}{m.reasons.length > 1 ? ' and same name' : ''}{m.primaryContact ? ` · contact ${m.primaryContact}` : ''}</span>
                    </span>
                    <Link href={`/dashboard/clients/${m.clientId}`} className="link" target="_blank" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>View</Link>
                  </label>
                ))}
                <label className={`cv-dupe ${conv.choice === 'new' ? 'is-on' : ''}`}>
                  <input type="radio" name="cv-choice" checked={conv.choice === 'new'} onChange={() => setConv({ ...conv, choice: 'new', error: '' })} />
                  <span><b>No, it&apos;s a new client</b><span className="cv-why">Creates a separate client record for {lead.companyName}</span></span>
                </label>
              </fieldset>
            )}
            <ol className="cv-steps">
              <li>{lead.client || (conv.choice && conv.choice !== 'new') ? 'Links the lead to the existing client.' : 'Creates the client (status Prospect until you approve their onboarding).'}</li>
              <li>Sets up a client-portal login for the contact below{conv.sendInvite ? ' and emails them the activation link' : ''}.</li>
              <li>{conv.quoteId ? 'Copies the accepted quote\'s rates as their agreed rates.' : 'No agreed rates copied (no accepted quote chosen).'}</li>
              <li>Marks the lead Won.</li>
            </ol>
            <Field label="Agreed rates from">
              <SelectInput value={conv.quoteId} onChange={setC('quoteId')}>
                {accepted.map((q) => <option key={q.id} value={q.id}>{q.number}{q.title ? ` · ${q.title}` : ''} · £{Number(q.total).toLocaleString('en-GB', { minimumFractionDigits: 2 })}{q._count ? ` · ${q._count.lines} ${q._count.lines === 1 ? 'role' : 'roles'}` : ''}</option>)}
                <option value="">No quote, don&apos;t copy rates</option>
              </SelectInput>
            </Field>
            {accepted.length === 0 && (
              <p className="cv-warn">This lead has no accepted quote. To copy agreed rates, mark the quote <b>Accepted</b> in <Link href="/dashboard/quotes/saved" className="link">Saved quotes</Link> first, or convert without rates.</p>
            )}
            <div className="lead-grid2">
              <Field label="Contact first name"><TextInput value={conv.firstName} onChange={setC('firstName')} maxLength={100} /></Field>
              <Field label="Contact last name"><TextInput value={conv.lastName} onChange={setC('lastName')} maxLength={100} /></Field>
              <Field label="Login email"><TextInput type="email" value={conv.email} onChange={setC('email')} onBlur={() => { if (!lead.client && conv.email.trim() !== conv.checkedEmail.trim()) checkDuplicates(conv.email); }} /></Field>
              <Field label="Phone (optional)"><TextInput value={conv.phone} onChange={setC('phone')} maxLength={50} /></Field>
            </div>
            <label className="cv-check">
              <input type="checkbox" checked={conv.sendInvite} onChange={(e) => setConv({ ...conv, sendInvite: e.target.checked })} />
              Email the client-portal invite now
            </label>
            {conv.error && <p role="alert" className="lead-error">{conv.error}</p>}
          </Modal>
        );
      })()}

      {stageForm && (
        <Modal title={`Move to ${STAGE_LABEL[stageForm.stage]}`} subtitle={`${lead.companyName} is ${STAGE_LABEL[lead.stage]} now`} onClose={() => !stageBusy && setStageForm(null)}
          footer={<><Button variant="outline" disabled={stageBusy} onClick={() => setStageForm(null)}>Cancel</Button><Button disabled={stageBusy} onClick={saveStage}>{stageBusy ? 'Saving…' : 'Change stage'}</Button></>}>
          {stageForm.stage === 'LOST' && (
            <Field label="Why was it lost?"><TextInput value={stageForm.reason} maxLength={500} autoFocus placeholder="e.g. Went with another agency" onChange={(e) => setStageForm({ ...stageForm, reason: e.target.value })} /></Field>
          )}
          <Field label="Note (optional)">
            <textarea className="lead-textarea" rows={3} maxLength={4000} value={stageForm.note} onChange={(e) => setStageForm({ ...stageForm, note: e.target.value })} />
          </Field>
          {lead.client?.status === 'LEAD' && stageForm.stage !== 'NEW' && stageForm.stage !== 'LOST' && (
            <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>The linked client <b>{lead.client.name}</b> will move from Lead to Prospect.</p>
          )}
          {stageError && <p role="alert" className="lead-error">{stageError}</p>}
        </Modal>
      )}

      {edit && (
        <Modal title="Edit lead" width={560} onClose={() => !editBusy && setEdit(null)}
          footer={<><Button variant="outline" disabled={editBusy} onClick={() => setEdit(null)}>Cancel</Button><Button disabled={editBusy} onClick={saveEdit}>{editBusy ? 'Saving…' : 'Save'}</Button></>}>
          <Field label="Company name"><TextInput value={edit.companyName} onChange={setE('companyName')} maxLength={200} /></Field>
          <div className="lead-grid2">
            <Field label="Contact name"><TextInput value={edit.contactName} onChange={setE('contactName')} maxLength={200} /></Field>
            <Field label="Job title"><TextInput value={edit.contactRole} onChange={setE('contactRole')} maxLength={200} /></Field>
            <Field label="Email"><TextInput type="email" value={edit.contactEmail} onChange={setE('contactEmail')} /></Field>
            <Field label="Phone"><TextInput value={edit.contactPhone} onChange={setE('contactPhone')} maxLength={50} /></Field>
            <Field label="Sector"><TextInput value={edit.sector} onChange={setE('sector')} maxLength={100} /></Field>
            <Field label="Rough value (£ / month)"><TextInput type="number" min={0} value={edit.estimatedValue} onChange={setE('estimatedValue')} /></Field>
            <Field label="Town / city"><TextInput value={edit.city} onChange={setE('city')} maxLength={100} /></Field>
            <Field label="Postcode"><TextInput value={edit.postcode} onChange={setE('postcode')} maxLength={20} /></Field>
          </div>
          <Field label="Follow up on"><TextInput type="date" value={edit.nextActionAt} onChange={setE('nextActionAt')} /></Field>
          <Field label="Notes"><textarea className="lead-textarea" rows={4} maxLength={4000} value={edit.notes} onChange={setE('notes')} /></Field>
          {editError && <p role="alert" className="lead-error">{editError}</p>}
        </Modal>
      )}

      <div style={{ marginBottom: 12 }}><Link href="/dashboard/leads" className="link">← All leads</Link></div>

      {converted && (
        <div role="status" className="cv-done">
          <div>
            <b>Converted.</b> {converted.clientCreated ? 'New client created' : 'Linked to the existing client'}
            {converted.invited ? ', portal invite emailed' : ', portal login set up (invite not emailed)'}
            {converted.ratesCopied ? `, ${converted.ratesCopied} agreed ${converted.ratesCopied === 1 ? 'rate' : 'rates'} copied from ${converted.quoteNumber}` : converted.quoteNumber ? `, agreed rates from ${converted.quoteNumber} were already on file` : ', no agreed rates copied'}.
          </div>
          <Link href={`/dashboard/clients/${converted.clientId}`} className="aibtn" style={{ textDecoration: 'none' }}>Open client →</Link>
        </div>
      )}

      <div className="lead-layout">
        <div className="lead-side">
          <Card
            title={lead.companyName}
            subtitle={`${SOURCE_LABEL[lead.source] ?? lead.source}${lead.createdByAi ? ' (AI)' : ''} · added ${fmtDate(lead.createdAt)}`}
            action={<Badge tone={STAGE_TONE[lead.stage]}>{STAGE_LABEL[lead.stage]}</Badge>}
          >
            {lead.archivedAt && <p className="dim" style={{ marginTop: 0 }}>Archived {fmtDate(lead.archivedAt)}.</p>}
            <Field label="Stage">
              <SelectInput aria-label="Change stage" value="" onChange={(e) => { if (e.target.value) { setStageError(''); setStageForm({ stage: e.target.value as Stage, reason: '', note: '' }); } }}>
                <option value="">Move to…</option>
                {STAGES.filter((s) => s !== lead.stage).map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
              </SelectInput>
            </Field>
            {lead.stage === 'LOST' && lead.lostReason && <p className="dim" style={{ fontSize: 13 }}>Lost: {lead.lostReason}</p>}
            <div className="lead-rows">
              {row('Contact', lead.contactName && `${lead.contactName}${lead.contactRole ? `, ${lead.contactRole}` : ''}`)}
              {row('Email', lead.contactEmail && <a className="link" href={`mailto:${lead.contactEmail}`}>{lead.contactEmail}</a>)}
              {row('Phone', lead.contactPhone && <a className="link" href={`tel:${lead.contactPhone}`}>{lead.contactPhone}</a>)}
              {row('Sector', lead.sector)}
              {row('Location', [lead.city, lead.postcode].filter(Boolean).join(' '))}
              {row('Value / month', lead.estimatedValue && gbp(lead.estimatedValue))}
              {row('Follow up', lead.nextActionAt && (isDue(lead) ? <Badge tone="warning">Due {fmtDate(lead.nextActionAt)}</Badge> : fmtDate(lead.nextActionAt)))}
              {row('Client', lead.client && <Link className="link" href={`/dashboard/clients/${lead.client.id}`}>{lead.client.name} ({lead.client.status.toLowerCase()})</Link>)}
              {row('Enquiry', lead.enquiry && `Website form, ${fmtDate(lead.enquiry.createdAt)}`)}
            </div>
            {lead.notes && <p style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, marginBottom: 0 }}>{lead.notes}</p>}
            <div className="fx ac" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              {!(lead.stage === 'WON' && lead.client) && !lead.archivedAt && <Button onClick={openConvert}>Convert to client</Button>}
              <Button variant="outline" onClick={openEdit}>Edit details</Button>
              <Button variant="outline" onClick={toggleArchive}>{lead.archivedAt ? 'Restore' : 'Archive'}</Button>
            </div>
          </Card>
        </div>

        <div className="lead-main">
          {!lead.archivedAt && lead.stage !== 'WON' && (
            <Card title="AI salesperson" subtitle="Drafts the next follow-up from this lead's history. Nothing is sent until you press Send."
              action={!ai.draft ? <Button disabled={ai.busy} onClick={draftWithAi}>{ai.busy ? 'Writing…' : 'Draft follow-up'}</Button> : undefined}>
              {ai.sentTo && <p role="status" className="ai-ok">Sent to {ai.sentTo} and logged below.</p>}
              {!ai.draft ? (
                <Field label="Steer it (optional)">
                  <TextInput value={ai.instructions} maxLength={1000} placeholder="e.g. mention Christmas cover, or they asked about 5 pickers in Dagenham"
                    onChange={(e) => setAi({ ...ai, instructions: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && !ai.busy) draftWithAi(); }} />
                </Field>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {ai.draft.reasoning && <p className="dim" style={{ margin: 0, fontSize: 13 }}><b>Why this angle:</b> {ai.draft.reasoning}</p>}
                  {ai.draft.warnings.map((w) => <p key={w} className="cv-warn" style={{ margin: 0 }}>{w}</p>)}
                  <Field label="Subject"><TextInput value={ai.subject} maxLength={200} onChange={(e) => setAi({ ...ai, subject: e.target.value })} /></Field>
                  <Field label={`Email to ${lead.contactEmail ?? '(no email on file)'}`}>
                    <textarea className="lead-textarea" rows={9} maxLength={10000} value={ai.body} onChange={(e) => setAi({ ...ai, body: e.target.value })} />
                  </Field>
                  <p className="dim" style={{ margin: 0, fontSize: 12 }}>Your name, the landline and an unsubscribe line are added at the bottom automatically.</p>
                  {ai.draft.callScript && (
                    <details><summary className="link" style={{ cursor: 'pointer', fontSize: 13 }}>Prefer to call? Call script</summary>
                      <p className="lead-act-body">{ai.draft.callScript}</p></details>
                  )}
                  <Field label="Next follow-up if no reply"><TextInput type="date" value={ai.followUp} onChange={(e) => setAi({ ...ai, followUp: e.target.value })} /></Field>
                  {ai.error && <p role="alert" className="lead-error">{ai.error}</p>}
                  <div className="fx ac" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <Button disabled={ai.sending || !lead.contactEmail || !ai.subject.trim() || !ai.body.trim()} onClick={sendAiDraft}>{ai.sending ? 'Sending…' : 'Send email'}</Button>
                    <Button variant="outline" disabled={ai.busy || ai.sending} onClick={() => setAi({ ...ai, draft: null })}>Redo with new steer</Button>
                    <Button variant="outline" disabled={ai.sending} onClick={() => setAi({ ...EMPTY_AI })}>Discard</Button>
                  </div>
                </div>
              )}
              {!ai.draft && ai.error && <p role="alert" className="lead-error">{ai.error}</p>}
            </Card>
          )}

          <Card
            title="Quotes"
            subtitle={lead.quotes.length ? `${lead.quotes.length} for this lead, newest first` : 'No quotes for this lead yet'}
            action={<Link href={`/dashboard/quotes?lead=${lead.id}`} className="aibtn" style={{ textDecoration: 'none' }}>+ Create quote</Link>}
          >
            {lead.quotes.length === 0 ? (
              <p className="dim" style={{ margin: 0 }}>Create quote opens the calculator with {lead.companyName}&apos;s details filled in. Saving brings you back here.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl" style={{ width: '100%' }}>
                  <thead><tr><th>Quote</th><th>Status</th><th>Valid until</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Profit</th><th /></tr></thead>
                  <tbody>
                    {lead.quotes.map((q) => (
                      <tr key={q.id}>
                        <td><div style={{ fontWeight: 700 }}>{q.number}</div>{q.title && <div className="dim" style={{ fontSize: 12 }}>{q.title}</div>}</td>
                        <td>{quoteExpired(q) ? <Badge tone="warning">Expired</Badge> : <Badge tone={QUOTE_TONE[q.status]}>{QUOTE_LABEL[q.status]}</Badge>}</td>
                        <td>{fmtDate(q.validUntil)}</td>
                        <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>£{Number(q.total).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>£{Number(q.profit).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {q.status === 'DRAFT'
                            ? <Link href={`/dashboard/quotes?edit=${q.id}`} className="link" style={{ fontSize: 12.5 }}>Edit draft</Link>
                            : <Link href="/dashboard/quotes/saved" className="link" style={{ fontSize: 12.5 }}>Saved quotes</Link>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Log activity" subtitle="Record a call, email, note or meeting">
            <div className="fx ac" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }} role="tablist">
              {LOG_TYPES.map((t) => (
                <button key={t} role="tab" aria-selected={log.type === t} onClick={() => setLog({ ...log, type: t })} className="aibtn"
                  style={{ height: 32, padding: '0 12px', fontSize: 12.5, background: log.type === t ? 'var(--blue-500)' : 'var(--surface-card)', color: log.type === t ? '#fff' : 'var(--text-secondary)', border: log.type === t ? 'none' : '1px solid var(--border-subtle)' }}>
                  {ACTIVITY_LABEL[t]}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="lead-grid2">
                {(log.type === 'CALL' || log.type === 'EMAIL') && (
                  <Field label="Direction">
                    <SelectInput value={log.direction} onChange={setL('direction')}>
                      <option value="outbound">We contacted them</option>
                      <option value="inbound">They contacted us</option>
                    </SelectInput>
                  </Field>
                )}
                <Field label={log.type === 'EMAIL' ? 'Subject' : 'Summary'}><TextInput value={log.subject} onChange={setL('subject')} maxLength={300} /></Field>
              </div>
              <Field label="Details"><textarea className="lead-textarea" rows={4} maxLength={20000} value={log.body} onChange={setL('body')} /></Field>
              <div className="lead-grid2">
                <Field label="Outcome"><TextInput value={log.outcome} onChange={setL('outcome')} maxLength={300} placeholder="e.g. No answer, wants a quote" /></Field>
                <Field label="Next follow-up (optional)"><TextInput type="date" value={log.nextActionAt} onChange={setL('nextActionAt')} /></Field>
              </div>
              {logError && <p role="alert" className="lead-error">{logError}</p>}
              <div><Button disabled={logging} onClick={saveLog}>{logging ? 'Saving…' : `Save ${ACTIVITY_LABEL[log.type].toLowerCase()}`}</Button></div>
            </div>
          </Card>

          <Card title="Activity" subtitle={`${lead.activities.length} ${lead.activities.length === 1 ? 'entry' : 'entries'}, newest first`}>
            {lead.enquiry?.message && (
              <div className="lead-act">
                <div className="lead-act-head"><Badge tone="neutral">Website enquiry</Badge><span className="dim">{fmtDateTime(lead.enquiry.createdAt)}</span></div>
                <p className="lead-act-body">{lead.enquiry.message}</p>
              </div>
            )}
            {lead.activities.length === 0 && !lead.enquiry?.message ? <p className="dim">Nothing logged yet.</p> : lead.activities.map((a) => (
              <div key={a.id} className="lead-act">
                <div className="lead-act-head">
                  <Badge tone={a.type === 'STAGE_CHANGE' ? 'info' : 'neutral'}>{ACTIVITY_LABEL[a.type] ?? a.type}</Badge>
                  {a.type === 'STAGE_CHANGE' && a.meta?.from && a.meta?.to
                    ? <b>{STAGE_LABEL[a.meta.from as Stage] ?? a.meta.from} → {STAGE_LABEL[a.meta.to as Stage] ?? a.meta.to}</b>
                    : a.subject && <b>{a.subject}</b>}
                  {a.direction && <span className="dim">{a.direction === 'inbound' ? 'from them' : 'by us'}</span>}
                  {a.byAi && <span className="dim">· AI</span>}
                  <span className="dim" style={{ marginLeft: 'auto' }}>{fmtDateTime(a.occurredAt)}</span>
                </div>
                {a.outcome && <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{a.type === 'STAGE_CHANGE' ? 'Reason: ' : 'Outcome: '}{a.outcome}</div>}
                {a.body && <p className="lead-act-body">{a.body}</p>}
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
