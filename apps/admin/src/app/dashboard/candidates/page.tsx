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
  registrationSource?: string | null; submittedAt?: string | null;
  documents?: Doc[]; _count?: { availability: number; employmentHistory: number; references: number };
};
const empty = { firstName: '', lastName: '', headline: '', city: '', phone: '', email: '' };

const SOURCE_LABEL: Record<string, string> = { WEBSITE: 'Website', MOBILE: 'Mobile app', PORTAL: 'Portal', ADMIN: 'Admin' };

// Same 6-section rule as the API's registration progress, computed client-side
// from the fields the candidates list already returns.
function progressPct(c: Candidate): number {
  const hasDoc = (t: string) => c.documents?.some((d) => d.type === t) ?? false;
  const sections = [
    !!(c.phone && c.city && c.postcode),
    !!(c.dateOfBirth && c.nationalInsurance),
    !!(c.emergencyName && c.emergencyPhone),
    !!(c.bankAccountName && c.bankSortCode && c.bankAccountNumber),
    (c._count?.employmentHistory ?? 0) > 0,
    (c._count?.references ?? 0) > 0,
    hasDoc('RIGHT_TO_WORK'),
    hasDoc('ID'),
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

  const load = () => apiFetch<Candidate[]>('/candidates').then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function save() {
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    setSaving(true);
    try {
      const body: any = { firstName: form.firstName, lastName: form.lastName, headline: form.headline, city: form.city, phone: form.phone };
      if (form.email.trim()) body.email = form.email;
      await apiFetch('/candidates', { method: 'POST', body: JSON.stringify(body) });
      setOpen(false); setForm(empty); await load();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }

  const cols: Column<Candidate>[] = [
    { key: 'name', header: 'Candidate', render: (r) => <Link href={`/dashboard/candidates/${r.id}`} className="namecell" style={{ textDecoration: 'none', color: 'inherit' }}><Avatar name={`${r.firstName} ${r.lastName}`} size={30} /><span className="nm" style={{ color: 'var(--text-link)' }}>{r.firstName} {r.lastName}</span></Link> },
    { key: 'headline', header: 'Headline', render: (r) => <span className="dim">{r.headline ?? '—'}</span> },
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
        <button className="aibtn" style={{ background: 'var(--blue-500)', color: '#fff', border: 'none' }} onClick={() => setOpen(true)}>
          <Ic.Plus width={16} /> Add Candidate
        </button>
      }
    >
      {error ? <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>
        : loading ? <p className="dim">Loading…</p>
        : rows.length === 0 ? <p className="dim">No candidates yet.</p>
        : <DataTable columns={cols} rows={rows} />}

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
            <Field label="Phone"><TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="07700 900000" /></Field>
          </div>
          <Field label="Email (optional)"><TextInput type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jordan@email.com" /></Field>
        </Modal>
      )}
    </Card>
  );
}
