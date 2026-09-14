'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, Avatar, Badge, DataTable, type Column } from '@/components/ui';
import { Modal, Field, TextInput, SelectInput, Button } from '@/components/Modal';
import * as Ic from '@/components/icons';

type Client = {
  id: string;
  name: string;
  industry?: string;
  companyRegNo?: string | null;
  addressLine1?: string | null;
  city?: string;
  postcode?: string | null;
  billingEmail?: string | null;
  paymentTerms?: number | null;
  agreementAccepted?: boolean;
  signatureName?: string | null;
  registrationSource?: string | null;
  submittedAt?: string | null;
  status: string;
  contacts: { firstName: string; lastName: string; isPrimary: boolean }[];
  _count: { jobs: number; sites: number };
};

const statusTone: Record<string, string> = { ACTIVE: 'success', LEAD: 'info', PROSPECT: 'warning', ON_HOLD: 'warning', CLOSED: 'neutral' };
const SOURCE_LABEL: Record<string, string> = { WEBSITE: 'Website', MOBILE: 'Mobile app', PORTAL: 'Portal', ADMIN: 'Admin' };
const empty = { name: '', industry: '', city: '', billingEmail: '', status: 'ACTIVE', contactFirstName: '', contactLastName: '', contactEmail: '' };

// Same 5-section rule as the API's client onboarding progress.
function clientProgressPct(c: Client): number {
  const sections = [
    !!(c.industry && c.companyRegNo),
    !!(c.addressLine1 && c.city && c.postcode),
    !!(c.billingEmail && c.paymentTerms != null),
    (c._count?.sites ?? 0) > 0,
    c.agreementAccepted === true && !!c.signatureName,
  ];
  return Math.round((sections.filter(Boolean).length / sections.length) * 100);
}

export default function ClientsPage() {
  const [rows, setRows] = useState<Client[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = () => apiFetch<Client[]>('/clients').then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/clients', { method: 'POST', body: JSON.stringify(form) });
      setOpen(false); setForm(empty); await load();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }

  const cols: Column<Client>[] = [
    { key: 'name', header: 'Company', render: (r) => <Link href={`/dashboard/clients/${r.id}`} className="namecell" style={{ textDecoration: 'none', color: 'inherit' }}><Avatar name={r.name} size={30} /><span className="nm" style={{ color: 'var(--text-link)' }}>{r.name}</span></Link> },
    { key: 'industry', header: 'Industry', render: (r) => <span className="dim">{r.industry ?? '—'}</span> },
    { key: 'city', header: 'Location', render: (r) => <span className="dim">{r.city ?? '—'}</span> },
    { key: 'contact', header: 'Primary contact', render: (r) => { const c = r.contacts.find((x) => x.isPrimary) ?? r.contacts[0]; return <span className="dim">{c ? `${c.firstName} ${c.lastName}` : '—'}</span>; } },
    { key: 'source', header: 'Source', render: (r) => <span className="dim">{r.registrationSource ? SOURCE_LABEL[r.registrationSource] ?? r.registrationSource : '—'}</span> },
    {
      key: 'onboarding', header: 'Onboarding',
      render: (r) => {
        const pct = clientProgressPct(r);
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
    { key: 'status', header: 'Status', render: (r) => <Badge tone={(statusTone[r.status] ?? 'neutral') as any}>{r.status}</Badge> },
  ];

  return (
    <Card
      title="Client Accounts"
      action={
        <button className="aibtn" style={{ background: 'var(--blue-500)', color: '#fff', border: 'none' }} onClick={() => setOpen(true)}>
          <Ic.Plus width={16} /> Add Client
        </button>
      }
    >
      {error ? <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>
        : loading ? <p className="dim">Loading…</p>
        : rows.length === 0 ? <p className="dim">No clients yet.</p>
        : <DataTable columns={cols} rows={rows} />}

      {open && (
        <Modal
          title="Add Client"
          subtitle="Create a new client organisation"
          onClose={() => setOpen(false)}
          footer={<>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>{saving ? 'Saving…' : 'Create client'}</Button>
          </>}
        >
          <Field label="Company name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Logistics" /></Field>
          <Field label="Industry"><TextInput value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="Logistics" /></Field>
          <Field label="City"><TextInput value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Birmingham" /></Field>
          <Field label="Billing email"><TextInput type="email" value={form.billingEmail} onChange={(e) => setForm({ ...form, billingEmail: e.target.value })} placeholder="accounts@acme.co.uk" /></Field>
          <Field label="Status">
            <SelectInput value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {['LEAD', 'PROSPECT', 'ACTIVE', 'ON_HOLD', 'CLOSED'].map((s) => <option key={s} value={s}>{s}</option>)}
            </SelectInput>
          </Field>

          <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '6px 0 2px', paddingTop: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 2 }}>Primary contact <span className="dim" style={{ fontWeight: 500 }}>(optional)</span></div>
            <p className="dim" style={{ fontSize: 12.5, margin: '0 0 10px' }}>Add a contact email and we'll email them a secure invite to the client portal (set-password link included).</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="First name"><TextInput value={form.contactFirstName} onChange={(e) => setForm({ ...form, contactFirstName: e.target.value })} placeholder="Rachel" /></Field>
            <Field label="Last name"><TextInput value={form.contactLastName} onChange={(e) => setForm({ ...form, contactLastName: e.target.value })} placeholder="Turner" /></Field>
          </div>
          <Field label="Contact email"><TextInput type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="rachel@acme.co.uk" /></Field>
        </Modal>
      )}
    </Card>
  );
}
