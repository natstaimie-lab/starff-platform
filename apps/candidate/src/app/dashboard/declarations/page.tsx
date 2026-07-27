'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui';
import * as Ic from '@/components/icons';

type Me = {
  firstName: string; lastName: string;
  healthDeclaration?: boolean; healthNotes?: string | null;
  consentGdpr?: boolean; consentGdprAt?: string | null;
  agreementAccepted?: boolean; agreementAcceptedAt?: string | null;
  signatureName?: string | null; signedAt?: string | null;
};

const AGREEMENT = [
  'I confirm the information I have provided is true and complete to the best of my knowledge.',
  'I understand Starff will place me into temporary assignments and that shifts are offered on an availability basis.',
  'I agree to arrive on time, follow each client site’s health & safety rules, and submit accurate timesheets.',
  'I understand my compliance documents must be valid and up to date to be offered work.',
];

export default function DeclarationsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [health, setHealth] = useState(false);
  const [healthNotes, setHealthNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [agree, setAgree] = useState(false);
  const [signature, setSignature] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Me>('/me').then((m) => {
      setMe(m);
      setHealth(!!m.healthDeclaration);
      setHealthNotes(m.healthNotes ?? '');
      setConsent(!!m.consentGdpr);
      setAgree(!!m.agreementAccepted);
      setSignature(m.signatureName ?? '');
    }).catch((e) => setError(e.message));
  }, []);

  async function save() {
    setSaving(true); setSaved(false); setError('');
    try {
      const updated = await apiFetch<Me>('/me/declarations', {
        method: 'PUT',
        body: JSON.stringify({ healthDeclaration: health, healthNotes, consentGdpr: consent, agreementAccepted: agree, signatureName: signature }),
      });
      setMe(updated);
      setSaved(true);
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }

  if (error && !me) return <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>;
  if (!me) return <p className="mut">Loading…</p>;

  const fmt = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const box: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.5 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <Card title="Health & safety declaration" subtitle="So we can place you safely.">
        <label style={box}>
          <input type="checkbox" checked={health} onChange={(e) => { setHealth(e.target.checked); setSaved(false); }} style={{ marginTop: 3 }} />
          <span>I confirm I have no medical condition, injury or disability that would prevent me from working safely. I’ll tell Starff if that changes.</span>
        </label>
        <textarea
          value={healthNotes} onChange={(e) => { setHealthNotes(e.target.value); setSaved(false); }}
          placeholder="Anything we should know to support you (optional)"
          style={{ width: '100%', minHeight: 64, marginTop: 12, padding: 11, border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 13.5, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }}
        />
      </Card>

      <Card title="Data protection (GDPR) consent" subtitle="How we handle your information.">
        <label style={box}>
          <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setSaved(false); }} style={{ marginTop: 3 }} />
          <span>I consent to Starff storing and processing my personal data to find me work, run compliance checks and pay me, as described in the privacy policy.</span>
        </label>
        {me.consentGdpr && me.consentGdprAt && <p className="dim" style={{ fontSize: 12.5, marginTop: 10 }}>Consented on {fmt(me.consentGdprAt)}.</p>}
      </Card>

      <Card title="Candidate agreement" subtitle="Please read, then sign below.">
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px 14px', background: 'var(--surface-sunken, #f6f8fb)', marginBottom: 14 }}>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {AGREEMENT.map((t, i) => <li key={i} style={{ fontSize: 13.5, lineHeight: 1.5 }}>{t}</li>)}
          </ul>
        </div>
        <label style={{ ...box, marginBottom: 12 }}>
          <input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setSaved(false); }} style={{ marginTop: 3 }} />
          <span>I have read and accept the Starff candidate agreement.</span>
        </label>
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Type your full name to sign</span>
          <input
            value={signature} onChange={(e) => { setSignature(e.target.value); setSaved(false); }}
            placeholder={`${me.firstName} ${me.lastName}`}
            style={{ width: '100%', maxWidth: 340, height: 44, padding: '0 14px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 18, fontFamily: 'Georgia, serif', fontStyle: 'italic', outline: 'none' }}
          />
        </label>
        {me.signedAt && me.signatureName && <p className="dim" style={{ fontSize: 12.5, marginTop: 10 }}>Signed by {me.signatureName} on {fmt(me.signedAt)}.</p>}
      </Card>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', bottom: 0, padding: '12px 0' }}>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save declarations'}</button>
        {saved && <span style={{ color: 'var(--success-600)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}><Ic.Check width={15} /> Saved</span>}
        {error && <span style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</span>}
      </div>
    </div>
  );
}
