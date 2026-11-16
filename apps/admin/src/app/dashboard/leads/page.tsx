'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Card, Badge } from '@/components/ui';
import { Modal, Field, TextInput, Button } from '@/components/Modal';
import { STAGES, STAGE_LABEL, STAGE_TONE, SOURCE_LABEL, type Lead, type Stage, apiError, fmtDate, gbp, isDue } from '@/lib/leads';

type Summary = { counts: Record<Stage, number>; followUpsDue: number };
type NewLead = { companyName: string; contactName: string; contactEmail: string; contactPhone: string; sector: string; city: string; estimatedValue: string; nextActionAt: string; notes: string };
const EMPTY: NewLead = { companyName: '', contactName: '', contactEmail: '', contactPhone: '', sector: '', city: '', estimatedValue: '', nextActionAt: '', notes: '' };

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [stage, setStage] = useState<string>(''); // '' = open leads, 'DUE', 'ALL', or a stage
  const [q, setQ] = useState('');
  const [form, setForm] = useState<NewLead | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = () => {
    const params = new URLSearchParams();
    if (STAGES.includes(stage as Stage)) params.set('stage', stage);
    if (stage === 'DUE') params.set('due', 'true');
    if (q.trim()) params.set('q', q.trim());
    apiFetch<Lead[]>(`/leads${params.size ? `?${params}` : ''}`)
      .then((rows) => { setLeads(rows); setError(''); })
      .catch((e) => setError(apiError(e, 'Could not load leads')));
    apiFetch<Summary>('/leads/summary').then(setSummary).catch(() => {});
  };
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
    /* eslint-disable-next-line */
  }, [stage, q]);

  // "Open" hides won and lost so the list is what still needs work.
  const shown = (leads ?? []).filter((l) => stage !== '' || (l.stage !== 'WON' && l.stage !== 'LOST'));
  const openCount = summary ? STAGES.filter((s) => s !== 'WON' && s !== 'LOST').reduce((n, s) => n + summary.counts[s], 0) : null;

  async function create() {
    if (!form) return;
    if (!form.companyName.trim()) { setFormError('Add the company name.'); return; }
    setSaving(true); setFormError('');
    try {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(form)) if (v.trim()) body[k] = v.trim();
      if (body.estimatedValue !== undefined) body.estimatedValue = Number(body.estimatedValue);
      const lead = await apiFetch<Lead>('/leads', { method: 'POST', body: JSON.stringify(body) });
      router.push(`/dashboard/leads/${lead.id}`);
    } catch (e) { setFormError(apiError(e, 'Could not add the lead')); } finally { setSaving(false); }
  }

  const pill = (value: string, label: string, n?: number | null) => (
    <button key={value} onClick={() => setStage(value)} className="aibtn" style={{ height: 32, padding: '0 12px', fontSize: 12.5, background: stage === value ? 'var(--blue-500)' : 'var(--surface-card)', color: stage === value ? '#fff' : 'var(--text-secondary)', border: stage === value ? 'none' : '1px solid var(--border-subtle)' }}>
      {label}{n != null ? ` (${n})` : ''}
    </button>
  );
  const set = (k: keyof NewLead) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form!, [k]: e.target.value });

  return (
    <>
      {form && (
        <Modal title="Add a lead" subtitle="A company you want to win as a client" width={560} onClose={() => !saving && setForm(null)}
          footer={<><Button variant="outline" disabled={saving} onClick={() => setForm(null)}>Cancel</Button><Button disabled={saving} onClick={create}>{saving ? 'Adding…' : 'Add lead'}</Button></>}>
          <Field label="Company name"><TextInput value={form.companyName} onChange={set('companyName')} maxLength={200} autoFocus /></Field>
          <div className="lead-grid2">
            <Field label="Contact name"><TextInput value={form.contactName} onChange={set('contactName')} maxLength={200} /></Field>
            <Field label="Email"><TextInput type="email" value={form.contactEmail} onChange={set('contactEmail')} /></Field>
            <Field label="Phone"><TextInput value={form.contactPhone} onChange={set('contactPhone')} maxLength={50} /></Field>
            <Field label="Sector"><TextInput value={form.sector} onChange={set('sector')} maxLength={100} placeholder="e.g. Warehouse & Logistics" /></Field>
            <Field label="Town / city"><TextInput value={form.city} onChange={set('city')} maxLength={100} /></Field>
            <Field label="Rough value (£ / month)"><TextInput type="number" min={0} value={form.estimatedValue} onChange={set('estimatedValue')} /></Field>
          </div>
          <Field label="Follow up on"><TextInput type="date" value={form.nextActionAt} onChange={set('nextActionAt')} /></Field>
          <Field label="Notes">
            <textarea value={form.notes} onChange={set('notes')} rows={3} maxLength={4000} className="lead-textarea" />
          </Field>
          {formError && <p role="alert" className="lead-error">{formError}</p>}
        </Modal>
      )}

      <div className="lead-kpis">
        {STAGES.map((s) => (
          <button key={s} onClick={() => setStage(s)} className="lead-kpi" aria-pressed={stage === s}>
            <span className="kpi-label">{STAGE_LABEL[s]}</span>
            <span className="kpi-value" style={{ fontSize: 24 }}>{summary ? summary.counts[s] : '—'}</span>
          </button>
        ))}
      </div>

      <Card
        title="Leads"
        subtitle="Companies you're working to win. Website enquiries can be turned into leads from the Enquiries page."
        action={<div className="fx ac" style={{ gap: 8 }}>
          <Link href="/dashboard/leads/today" className="pb-tab">Today</Link>
          <Link href="/dashboard/leads/board" className="pb-tab">Board view</Link>
          <button className="aibtn" onClick={() => { setFormError(''); setForm({ ...EMPTY }); }}>+ Add lead</button>
        </div>}
      >
        <div className="fx ac" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {pill('', 'Open', openCount)}
          {pill('DUE', 'Follow-up due', summary?.followUpsDue)}
          {STAGES.map((s) => pill(s, STAGE_LABEL[s]))}
          {pill('ALL', 'All')}
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company, contact or email" aria-label="Search leads" className="lead-search" />
        </div>

        {error ? <p className="lead-error">{error}</p>
          : !leads ? <p className="dim">Loading…</p>
          : shown.length === 0 ? <p className="dim">{q || stage ? 'No leads match.' : 'No open leads yet. Add one, or turn a website enquiry into a lead.'}</p>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl" style={{ width: '100%' }}>
                <thead>
                  <tr><th>Company</th><th>Stage</th><th>Source</th><th>Follow up</th><th>Last activity</th><th style={{ textAlign: 'right' }}>Value / mo</th></tr>
                </thead>
                <tbody>
                  {shown.map((l) => (
                    <tr key={l.id} onClick={() => router.push(`/dashboard/leads/${l.id}`)} style={{ cursor: 'pointer' }}>
                      <td>
                        <Link href={`/dashboard/leads/${l.id}`} className="link" style={{ fontWeight: 700 }} onClick={(e) => e.stopPropagation()}>{l.companyName}</Link>
                        <div className="dim" style={{ fontSize: 12 }}>{[l.contactName, l.contactEmail].filter(Boolean).join(' · ') || '—'}</div>
                      </td>
                      <td><Badge tone={STAGE_TONE[l.stage]}>{STAGE_LABEL[l.stage]}</Badge></td>
                      <td className="dim" style={{ fontSize: 12.5 }}>{SOURCE_LABEL[l.source] ?? l.source}{l.createdByAi ? ' ✦' : ''}</td>
                      <td>{isDue(l) ? <Badge tone="warning">Due {fmtDate(l.nextActionAt)}</Badge> : fmtDate(l.nextActionAt)}</td>
                      <td className="dim">{fmtDate(l.lastActivityAt)}{l._count ? ` · ${l._count.activities}` : ''}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{l.estimatedValue ? gbp(l.estimatedValue) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>

    </>
  );
}
