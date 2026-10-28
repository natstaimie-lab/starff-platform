'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, Avatar, Badge, ComplianceBadge, DataTable, type Column } from '@/components/ui';
import { Modal, Field, TextInput, Button } from '@/components/Modal';
import * as Ic from '@/components/icons';

type Doc = { type: string };
type Candidate = {
  id: string; firstName: string; lastName: string; status: string; headline?: string; city?: string;
  phone?: string; postcode?: string; dateOfBirth?: string; nationalInsurance?: string;
  emergencyName?: string; emergencyPhone?: string;
  bankAccountName?: string; bankSortCode?: string; bankAccountNumber?: string;
  healthDeclaration?: boolean; consentGdpr?: boolean; agreementAccepted?: boolean; signatureName?: string;
  registrationSource?: string | null; submittedAt?: string | null; preferredSectors?: string[];
  documents?: Doc[]; _count?: { availability: number; employmentHistory: number; references: number };
};
const empty = { firstName: '', lastName: '', headline: '', city: '', postcode: '', phone: '', email: '', sendInvite: false };

// Canonical sectors (kept in sync with apps/api/src/common/sectors.ts).
const SECTORS = [
  'Warehouse & Logistics', 'Driving & Delivery', 'Construction & Trades',
  'Industrial & Manufacturing', 'Security', 'Cleaning', 'Hospitality & Catering',
  'Events',
];

const SOURCE_LABEL: Record<string, string> = { WEBSITE: 'Website', MOBILE: 'Mobile app', PORTAL: 'Portal', ADMIN: 'Admin' };

// Same 15-section rule as the API's registration progress
// (apps/api/src/registration/registration.service.ts), computed client-side
// from the fields the candidates list already returns — so the % here matches
// what the candidate sees on their own onboarding checklist.
function progressPct(c: Candidate): number {
  const hasDoc = (t: string) => c.documents?.some((d) => d.type === t) ?? false;
  const sections = [
    (c.preferredSectors?.length ?? 0) > 0,
    !!(c.phone && c.city && c.postcode),
    !!(c.dateOfBirth && c.nationalInsurance),
    !!(c.emergencyName && c.emergencyPhone),
    !!(c.bankAccountName && c.bankSortCode && c.bankAccountNumber),
    (c._count?.employmentHistory ?? 0) > 0,
    (c._count?.references ?? 0) > 0,
    hasDoc('RIGHT_TO_WORK'),
    hasDoc('ID'),
    hasDoc('SELFIE'),
    hasDoc('CV'),
    (c._count?.availability ?? 0) > 0,
    c.healthDeclaration === true,
    c.consentGdpr === true,
    c.agreementAccepted === true && !!c.signatureName,
  ];
  const done = sections.filter(Boolean).length;
  return Math.round((done / sections.length) * 100);
}

export default function CandidatesPage() {
  const [rows, setRows] = useState<Candidate[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [chasing, setChasing] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [sectorFilter, setSectorFilter] = useState('');

  const load = () => apiFetch<Candidate[]>('/candidates').then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  // Nudge everyone who registered but never finished (same rules as the daily
  // auto-reminder: 24h+ old, not submitted, capped at 3, one per 48h).
  async function chaseIncomplete() {
    setChasing(true);
    try {
      const { reminded } = await apiFetch<{ reminded: number }>('/registration/reminders/run', { method: 'POST' });
      alert(reminded > 0
        ? `Sent ${reminded} reminder${reminded === 1 ? '' : 's'} to workers who haven't finished registering.`
        : 'No reminders to send right now — everyone eligible has been nudged recently (or has finished).');
    } catch (e: any) {
      alert(e?.message || 'Could not send reminders.');
    } finally { setChasing(false); }
  }

  // Notify candidates still missing the required selfie: screening get an
  // "add your selfie" ask, new/incomplete get a "finish registration" nudge.
  // Idempotent — re-running skips anyone already told.
  async function requestSelfies() {
    if (!confirm('Email candidates who still need a selfie?\n\n• Screening candidates get an "add your selfie" message.\n• New/incomplete candidates get a "finish your registration" message (which now includes the selfie).\n\nAnyone already notified is skipped.')) return;
    setNotifying(true);
    try {
      const r = await apiFetch<{ selfie: number; complete: number; skipped: number }>('/registration/notify-incomplete', { method: 'POST' });
      const total = r.selfie + r.complete;
      alert(total > 0
        ? `Sent ${total} message${total === 1 ? '' : 's'}:\n• ${r.selfie} selfie ask (screening)\n• ${r.complete} finish-registration (new)\n${r.skipped ? `\n${r.skipped} skipped (already notified or no email).` : ''}`
        : `No one to notify — everyone eligible has been told already${r.skipped ? ` (${r.skipped} skipped)` : ''}.`);
    } catch (e: any) {
      alert(e?.message || 'Could not send.');
    } finally { setNotifying(false); }
  }

  async function save() {
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    setSaving(true);
    try {
      const body: any = { firstName: form.firstName, lastName: form.lastName, headline: form.headline, city: form.city, postcode: form.postcode, phone: form.phone };
      if (form.email.trim()) { body.email = form.email.trim(); body.sendInvite = form.sendInvite; }
      await apiFetch('/candidates', { method: 'POST', body: JSON.stringify(body) });
      setOpen(false); setForm(empty); await load();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }

  const cols: Column<Candidate>[] = [
    { key: 'name', header: 'Candidate', render: (r) => <Link href={`/dashboard/candidates/${r.id}`} className="namecell" style={{ textDecoration: 'none', color: 'inherit' }}><Avatar name={`${r.firstName} ${r.lastName}`} size={30} /><span className="nm" style={{ color: 'var(--text-link)' }}>{r.firstName} {r.lastName}</span></Link> },
    { key: 'lookingFor', header: 'Looking for', render: (r) => (
      (r.preferredSectors && r.preferredSectors.length)
        ? <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{r.preferredSectors.map((s) => (
            <span key={s} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'var(--blue-100, #e7efff)', color: 'var(--blue-700, #1d4ed8)', whiteSpace: 'nowrap' }}>{s}</span>
          ))}</span>
        : <span className="dim">{r.headline ?? '—'}</span>
    ) },
    { key: 'source', header: 'Source', render: (r) => <span className="dim">{r.registrationSource ? SOURCE_LABEL[r.registrationSource] ?? r.registrationSource : '—'}</span> },
    {
      key: 'progress', header: 'Registration',
      render: (r) => {
        const pct = progressPct(r);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 110 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--surface-sunken)' }}>
              <div style={{ height: 6, width: `${pct}%`, borderRadius: 999, background: pct === 100 ? 'var(--success-500)' : 'var(--orange-500)' }} />
            </div>
            <span className="dim" style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
          </div>
        );
      },
    },
    { key: 'review', header: 'Review', render: (r) => r.submittedAt ? <Badge tone="warning">Awaiting review</Badge> : <span className="dim">—</span> },
    { key: 'status', header: 'Compliance', render: (r) => <ComplianceBadge status={r.status.toLowerCase()} /> },
  ];

  return (
    <Card
      title="Candidates"
      action={
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)} style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-card)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, padding: '7px 10px', borderRadius: 8, cursor: 'pointer' }} title="Filter by what they're looking for">
            <option value="">All sectors</option>
            {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="aibtn" style={{ background: 'var(--surface-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-strong)' }} onClick={chaseIncomplete} disabled={chasing} title="Email everyone who registered but hasn't finished">
            <Ic.Bell width={15} /> {chasing ? 'Sending…' : 'Chase incomplete'}
          </button>
          <button className="aibtn" style={{ background: 'var(--surface-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-strong)' }} onClick={requestSelfies} disabled={notifying} title="Email candidates still missing a selfie (screening: add selfie; new: finish registration)">
            <Ic.User width={15} /> {notifying ? 'Sending…' : 'Request selfies'}
          </button>
          <button className="aibtn" style={{ background: 'var(--blue-500)', color: '#fff', border: 'none' }} onClick={() => setOpen(true)}>
            <Ic.Plus width={16} /> Add Candidate
          </button>
        </span>
      }
    >
      {(() => {
        const shown = sectorFilter ? rows.filter((r) => r.preferredSectors?.includes(sectorFilter)) : rows;
        return error ? <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>
          : loading ? <p className="dim">Loading…</p>
          : rows.length === 0 ? <p className="dim">No candidates yet.</p>
          : shown.length === 0 ? <p className="dim">No candidates looking for {sectorFilter}.</p>
          : <DataTable columns={cols} rows={shown} />;
      })()}

      {open && (
        <Modal
          title="Add Candidate"
          subtitle="Create a new candidate record"
          onClose={() => setOpen(false)}
          footer={<>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.firstName.trim() || !form.lastName.trim()}>{saving ? 'Saving…' : 'Add candidate'}</Button>
          </>}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="First name"><TextInput value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Jordan" /></Field>
            <Field label="Last name"><TextInput value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Smith" /></Field>
          </div>
          <Field label="Headline / role"><TextInput value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="Warehouse Operative" /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="City"><TextInput value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Birmingham" /></Field>
            <Field label="Postcode"><TextInput value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} placeholder="B1 1AA" /></Field>
          </div>
          <Field label="Phone"><TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="07700 900000" /></Field>
          <Field label="Email (optional)"><TextInput type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jordan@email.com" /></Field>
          {form.email.trim() && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, cursor: 'pointer', background: 'var(--surface-sunken)', padding: '10px 12px', borderRadius: 10 }}>
              <input type="checkbox" checked={form.sendInvite} onChange={(e) => setForm({ ...form, sendInvite: e.target.checked })} style={{ marginTop: 2 }} />
              <span>Email them a portal invite now<br /><span className="dim" style={{ fontSize: 12 }}>They'll get a link to set a password and access their worker portal. Leave unticked to just record them — you can invite from their profile later.</span></span>
            </label>
          )}
        </Modal>
      )}
    </Card>
  );
}
