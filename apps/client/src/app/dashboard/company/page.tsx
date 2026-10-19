'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui';
import * as Ic from '@/components/icons';

type Client = {
  name: string; industry?: string | null; companyRegNo?: string | null;
  addressLine1?: string | null; city?: string | null; postcode?: string | null;
  billingEmail?: string | null; paymentTerms?: number | null;
  agreementAccepted?: boolean; signatureName?: string | null; signedAt?: string | null;
};
type Loc = { id: string; name: string; city?: string | null; postcode?: string | null };
type Contact = { id: string; firstName: string; lastName: string; email: string; jobTitle?: string | null; isPrimary: boolean };

const inputStyle: React.CSSProperties = { width: '100%', height: 40, padding: '0 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 14, outline: 'none' };
const errStyle: React.CSSProperties = { color: 'var(--error-600)', fontSize: 12, marginTop: 4 };
const emailBad = (v: string) => !!v.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
// Render the lightweight markdown the API serves (# headings, - bullets, "a | b" rows).
function renderTerms(text: string) {
  return text.split('\n').map((raw, i) => {
    const line = raw.trimEnd();
    if (!line) return <div key={i} style={{ height: 6 }} />;
    if (line.startsWith('### ')) return <div key={i} style={{ fontWeight: 700, fontSize: 13, marginTop: 8 }}>{line.slice(4)}</div>;
    if (line.startsWith('## ')) return <div key={i} style={{ fontWeight: 800, fontSize: 14, marginTop: 12 }}>{line.slice(3)}</div>;
    if (line.startsWith('# ')) return <div key={i} style={{ fontWeight: 800, fontSize: 15, marginTop: 4 }}>{line.slice(2)}</div>;
    if (line.startsWith('- ')) return <div key={i} style={{ display: 'flex', gap: 8, marginTop: 3 }}><span>•</span><span>{line.slice(2)}</span></div>;
    if (line.includes(' | ')) { const cells = line.split(' | '); return <div key={i} style={{ display: 'flex', gap: 10, marginTop: 3 }}><span style={{ fontWeight: 600, minWidth: 150 }}>{cells[0]}</span><span>{cells.slice(1).join(' ')}</span></div>; }
    return <p key={i} style={{ margin: '4px 0' }}>{line}</p>;
  });
}

export default function CompanySetupPage() {
  const [c, setC] = useState<Client | null>(null);
  const [profile, setProfile] = useState({ name: '', industry: '', companyRegNo: '', addressLine1: '', city: '', postcode: '', billingEmail: '', paymentTerms: '' });
  const [locs, setLocs] = useState<Loc[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [locForm, setLocForm] = useState({ name: '', city: '', postcode: '' });
  const [conForm, setConForm] = useState({ firstName: '', lastName: '', email: '', jobTitle: '' });
  const [agree, setAgree] = useState(false);
  const [signature, setSignature] = useState('');
  const [savingP, setSavingP] = useState(false);
  const [savedP, setSavedP] = useState(false);
  const [savingA, setSavingA] = useState(false);
  const [savedA, setSavedA] = useState(false);
  const [error, setError] = useState('');
  const [terms, setTerms] = useState<{ version: string; text: string } | null>(null);

  const load = () => {
    apiFetch<{ client: Client }>('/client/me').then(({ client }) => {
      setC(client);
      setProfile({
        name: client.name ?? '', industry: client.industry ?? '', companyRegNo: client.companyRegNo ?? '',
        addressLine1: client.addressLine1 ?? '', city: client.city ?? '', postcode: client.postcode ?? '',
        billingEmail: client.billingEmail ?? '', paymentTerms: client.paymentTerms != null ? String(client.paymentTerms) : '',
      });
      setAgree(!!client.agreementAccepted);
      setSignature(client.signatureName ?? '');
    }).catch((e) => setError(e.message));
    apiFetch<Loc[]>('/client/locations').then(setLocs).catch(() => {});
    apiFetch<Contact[]>('/client/contacts').then(setContacts).catch(() => {});
    apiFetch<{ version: string; text: string }>('/client/terms').then(setTerms).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  async function saveProfile() {
    if (emailBad(profile.billingEmail)) { setError('Enter a valid billing email.'); return; }
    setSavingP(true); setSavedP(false); setError('');
    try {
      const body: any = { ...profile };
      body.paymentTerms = profile.paymentTerms ? Number(profile.paymentTerms) : undefined;
      await apiFetch('/client/profile', { method: 'PATCH', body: JSON.stringify(body) });
      setSavedP(true);
    } catch (e: any) { setError(e.message); } finally { setSavingP(false); }
  }
  async function addLoc() {
    if (!locForm.name.trim()) return;
    try { await apiFetch('/client/locations', { method: 'POST', body: JSON.stringify(locForm) }); setLocForm({ name: '', city: '', postcode: '' }); load(); }
    catch (e: any) { setError(e.message); }
  }
  async function delLoc(id: string) { setLocs((l) => l.filter((x) => x.id !== id)); try { await apiFetch(`/client/locations/${id}`, { method: 'DELETE' }); } catch { load(); } }
  async function addCon() {
    if (!conForm.firstName.trim() || emailBad(conForm.email) || !conForm.email.trim()) return;
    try { await apiFetch('/client/contacts', { method: 'POST', body: JSON.stringify(conForm) }); setConForm({ firstName: '', lastName: '', email: '', jobTitle: '' }); load(); }
    catch (e: any) { setError(e.message); }
  }
  async function delCon(id: string) { try { await apiFetch(`/client/contacts/${id}`, { method: 'DELETE' }); load(); } catch (e: any) { setError(e.message); } }
  async function saveAgreement() {
    setSavingA(true); setSavedA(false); setError('');
    try { const updated = await apiFetch<Client>('/client/agreement', { method: 'PUT', body: JSON.stringify({ agreementAccepted: agree, signatureName: signature }) }); setC(updated); setSavedA(true); }
    catch (e: any) { setError(e.message); } finally { setSavingA(false); }
  }

  if (error && !c) return <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>;
  if (!c) return <p className="mut">Loading…</p>;
  const fmt = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const P = (k: keyof typeof profile) => ({ value: profile[k], onChange: (e: any) => { setProfile({ ...profile, [k]: e.target.value }); setSavedP(false); }, style: inputStyle });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
      {error && <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>}

      <Card title="Company profile" subtitle="Your company and billing details.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <Field label="Company name"><input {...P('name')} /></Field>
          <Field label="Industry / sector"><input {...P('industry')} placeholder="e.g. Logistics" /></Field>
          <Field label="Company registration no."><input {...P('companyRegNo')} placeholder="Companies House number" /></Field>
          <Field label="Billing email"><input {...P('billingEmail')} placeholder="accounts@company.co.uk" />{emailBad(profile.billingEmail) ? <p style={errStyle}>Enter a valid email.</p> : null}</Field>
          <Field label="Address line 1" full><input {...P('addressLine1')} /></Field>
          <Field label="City"><input {...P('city')} /></Field>
          <Field label="Postcode"><input value={profile.postcode} onChange={(e) => { setProfile({ ...profile, postcode: e.target.value.toUpperCase() }); setSavedP(false); }} style={inputStyle} /></Field>
          <Field label="Payment terms (days)"><input type="number" {...P('paymentTerms')} placeholder="30" /></Field>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <button className="btn-primary" onClick={saveProfile} disabled={savingP}>{savingP ? 'Saving…' : 'Save company profile'}</button>
          {savedP && <span style={{ color: 'var(--success-600)', fontSize: 13, fontWeight: 700 }}>✓ Saved</span>}
        </div>
      </Card>

      <Card title="Hiring locations" subtitle="Sites where you’ll need staff.">
        {locs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {locs.map((l) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ color: 'var(--text-tertiary)' }}><Ic.MapPin width={17} /></span>
                <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{l.name}</div><div className="dim" style={{ fontSize: 12.5 }}>{[l.city, l.postcode].filter(Boolean).join(', ') || '—'}</div></div>
                <button onClick={() => delLoc(l.id)} aria-label="Remove" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
          <Field label="Site name"><input value={locForm.name} onChange={(e) => setLocForm({ ...locForm, name: e.target.value })} style={inputStyle} placeholder="Birmingham Depot" /></Field>
          <Field label="City"><input value={locForm.city} onChange={(e) => setLocForm({ ...locForm, city: e.target.value })} style={inputStyle} /></Field>
          <Field label="Postcode"><input value={locForm.postcode} onChange={(e) => setLocForm({ ...locForm, postcode: e.target.value.toUpperCase() })} style={inputStyle} /></Field>
          <button className="btn-primary" onClick={addLoc} disabled={!locForm.name.trim()} style={{ height: 40 }}>Add</button>
        </div>
      </Card>

      <Card title="Authorised users" subtitle="Colleagues who can access this account.">
        {contacts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {contacts.map((ct) => (
              <div key={ct.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ color: 'var(--text-tertiary)' }}><Ic.User width={17} /></span>
                <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{ct.firstName} {ct.lastName}{ct.isPrimary && <span className="dim" style={{ fontWeight: 500 }}> · Primary</span>}</div><div className="dim" style={{ fontSize: 12.5 }}>{[ct.jobTitle, ct.email].filter(Boolean).join(' · ')}</div></div>
                {!ct.isPrimary && <button onClick={() => delCon(ct.id)} aria-label="Remove" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 18 }}>×</button>}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 10 }}>
          <Field label="First name"><input value={conForm.firstName} onChange={(e) => setConForm({ ...conForm, firstName: e.target.value })} style={inputStyle} /></Field>
          <Field label="Last name"><input value={conForm.lastName} onChange={(e) => setConForm({ ...conForm, lastName: e.target.value })} style={inputStyle} /></Field>
          <Field label="Email"><input value={conForm.email} onChange={(e) => setConForm({ ...conForm, email: e.target.value })} style={inputStyle} />{emailBad(conForm.email) ? <p style={errStyle}>Enter a valid email.</p> : null}</Field>
          <Field label="Job title"><input value={conForm.jobTitle} onChange={(e) => setConForm({ ...conForm, jobTitle: e.target.value })} style={inputStyle} /></Field>
        </div>
        <button className="btn-primary" onClick={addCon} disabled={!conForm.firstName.trim() || !conForm.email.trim() || emailBad(conForm.email)}>Add authorised user</button>
      </Card>

      <Card title="Terms & agreement" subtitle="Please read, then sign to confirm.">
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '14px 16px', background: 'var(--surface-sunken, #f6f8fb)', marginBottom: 6, maxHeight: 360, overflowY: 'auto', fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-primary, #0B1F3A)' }}>
          {terms ? renderTerms(terms.text) : <p className="dim" style={{ fontSize: 13 }}>Loading the terms…</p>}
        </div>
        {terms && <p className="dim" style={{ fontSize: 11.5, marginBottom: 14 }}>Terms of Business version {terms.version} — please scroll and read in full before accepting.</p>}
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, marginBottom: 12 }}>
          <input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setSavedA(false); }} style={{ marginTop: 3 }} />
          <span>I have read and I accept these Terms of Business, and I am authorised to accept them on behalf of {c.name}.</span>
        </label>
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Type your full name to sign</span>
          <input value={signature} onChange={(e) => { setSignature(e.target.value); setSavedA(false); }} style={{ width: '100%', maxWidth: 340, height: 44, padding: '0 14px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 18, fontFamily: 'Georgia, serif', fontStyle: 'italic', outline: 'none' }} />
        </label>
        {c.signedAt && c.signatureName && <p className="dim" style={{ fontSize: 12.5, marginTop: 10 }}>Signed by {c.signatureName} on {fmt(c.signedAt)}.</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <button className="btn-primary" onClick={saveAgreement} disabled={savingA}>{savingA ? 'Saving…' : 'Save agreement'}</button>
          {savedA && <span style={{ color: 'var(--success-600)', fontSize: 13, fontWeight: 700 }}>✓ Saved</span>}
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label style={{ display: 'block', gridColumn: full ? '1 / -1' : undefined }}>
      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  );
}
