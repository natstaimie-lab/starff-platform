'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, Avatar, ComplianceBadge } from '@/components/ui';
import * as Ic from '@/components/icons';

type Me = {
  id: string; firstName: string; lastName: string; status: string;
  headline?: string; phone?: string;
  dateOfBirth?: string | null; nationalInsurance?: string | null;
  addressLine1?: string | null; addressLine2?: string | null; city?: string | null; postcode?: string | null;
  emergencyName?: string | null; emergencyPhone?: string | null; emergencyRelationship?: string | null;
  bankAccountName?: string | null; bankSortCode?: string | null; bankAccountNumber?: string | null;
};

const FIELDS = [
  'headline', 'phone', 'dateOfBirth', 'nationalInsurance',
  'addressLine1', 'addressLine2', 'city', 'postcode',
  'emergencyName', 'emergencyPhone', 'emergencyRelationship',
  'bankAccountName', 'bankSortCode', 'bankAccountNumber',
] as const;
type FieldKey = (typeof FIELDS)[number];
type Form = Record<FieldKey, string>;

const blank: Form = FIELDS.reduce((a, k) => ({ ...a, [k]: '' }), {} as Form);

export default function ProfilePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Me>('/me').then((m) => {
      setMe(m);
      const next = { ...blank };
      for (const k of FIELDS) {
        const v = (m as any)[k];
        next[k] = k === 'dateOfBirth' && v ? String(v).slice(0, 10) : (v ?? '');
      }
      setForm(next);
    }).catch((e) => setError(e.message));
  }, []);

  function set(k: FieldKey, v: string) { setForm((f) => ({ ...f, [k]: v })); setSaved(false); }

  async function save() {
    if (!me) return;
    setSaving(true); setSaved(false); setError('');
    try {
      const body: Record<string, string> = {};
      for (const k of FIELDS) {
        if (k === 'dateOfBirth') {
          if (form.dateOfBirth) body.dateOfBirth = new Date(form.dateOfBirth).toISOString();
        } else {
          body[k] = form[k];
        }
      }
      await apiFetch(`/candidates/${me.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setSaved(true);
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }

  if (error && !me) return <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>;
  if (!me) return <p className="mut">Loading…</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
      <Card title="Personal details" subtitle="Your basic information — used across your bookings and payslips.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <Avatar name={`${me.firstName} ${me.lastName}`} size={52} />
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{me.firstName} {me.lastName}</div>
            <div style={{ marginTop: 4 }}><ComplianceBadge status={me.status.toLowerCase()} /></div>
          </div>
        </div>
        <Grid>
          <Input label="Headline / role" value={form.headline} onChange={(v) => set('headline', v)} placeholder="Warehouse Operative" />
          <Input label="Phone" value={form.phone} onChange={(v) => set('phone', v)} placeholder="07700 900000" />
          <Input label="Date of birth" type="date" value={form.dateOfBirth} onChange={(v) => set('dateOfBirth', v)} />
          <Input label="National Insurance number" value={form.nationalInsurance} onChange={(v) => set('nationalInsurance', v)} placeholder="QQ 12 34 56 C" />
        </Grid>
      </Card>

      <Card title="Address">
        <Grid>
          <Input label="Address line 1" value={form.addressLine1} onChange={(v) => set('addressLine1', v)} full />
          <Input label="Address line 2" value={form.addressLine2} onChange={(v) => set('addressLine2', v)} full />
          <Input label="City" value={form.city} onChange={(v) => set('city', v)} />
          <Input label="Postcode" value={form.postcode} onChange={(v) => set('postcode', v)} />
        </Grid>
      </Card>

      <Card title="Emergency contact" subtitle="Someone we can reach if there’s a problem on shift.">
        <Grid>
          <Input label="Full name" value={form.emergencyName} onChange={(v) => set('emergencyName', v)} />
          <Input label="Phone" value={form.emergencyPhone} onChange={(v) => set('emergencyPhone', v)} />
          <Input label="Relationship" value={form.emergencyRelationship} onChange={(v) => set('emergencyRelationship', v)} placeholder="e.g. Partner, Parent" full />
        </Grid>
      </Card>

      <Card title="Bank details" subtitle="Where we’ll pay you. Held securely and only visible to you and payroll.">
        <Grid>
          <Input label="Account holder name" value={form.bankAccountName} onChange={(v) => set('bankAccountName', v)} full />
          <Input label="Sort code" value={form.bankSortCode} onChange={(v) => set('bankSortCode', v)} placeholder="00-00-00" />
          <Input label="Account number" value={form.bankAccountNumber} onChange={(v) => set('bankAccountNumber', v)} placeholder="12345678" />
        </Grid>
      </Card>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', bottom: 0, padding: '12px 0' }}>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save details'}</button>
        {saved && <span style={{ color: 'var(--success-600)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}><Ic.Check width={15} /> Saved</span>}
        {error && <span style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</span>}
      </div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>{children}</div>;
}

function Input({ label, value, onChange, placeholder, type = 'text', full = false }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; full?: boolean;
}) {
  return (
    <label style={{ display: 'block', gridColumn: full ? '1 / -1' : undefined }}>
      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>{label}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 14, outline: 'none' }}
      />
    </label>
  );
}
