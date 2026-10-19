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

type WorkerDoc = {
  key: string; title: string; optional: boolean; version: string;
  confirmation: string; text: string;
  status: { accepted: boolean; declined: boolean; signatureName: string | null; acceptedAt: string | null; outdated: boolean };
};

// Render the lightweight markdown the API serves: #/##/### headings, "- "
// bullets, "a | b" table rows, otherwise paragraphs.
function renderTerms(text: string) {
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      out.push(<ul key={`u${out.length}`} style={{ margin: '4px 0 8px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>{bullets.map((b, i) => <li key={i} style={{ fontSize: 12.5, lineHeight: 1.5 }}>{b}</li>)}</ul>);
      bullets = [];
    }
  };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line) { flush(); continue; }
    if (line.startsWith('### ')) { flush(); out.push(<h4 key={out.length} style={{ fontSize: 13, fontWeight: 700, margin: '8px 0 2px' }}>{line.slice(4)}</h4>); }
    else if (line.startsWith('## ')) { flush(); out.push(<h3 key={out.length} style={{ fontSize: 13.5, fontWeight: 800, margin: '12px 0 3px' }}>{line.slice(3)}</h3>); }
    else if (line.startsWith('# ')) { flush(); out.push(<h2 key={out.length} style={{ fontSize: 15, fontWeight: 800, margin: '2px 0 6px' }}>{line.slice(2)}</h2>); }
    else if (line.startsWith('- ')) { bullets.push(line.slice(2)); }
    else if (line.includes(' | ')) { flush(); const [a, b] = line.split(' | '); out.push(<div key={out.length} style={{ display: 'flex', gap: 8, fontSize: 12.5, padding: '2px 0', borderBottom: '1px solid var(--border-subtle)' }}><span style={{ fontWeight: 600, flex: '0 0 42%' }}>{a}</span><span style={{ flex: 1 }}>{b}</span></div>); }
    else { flush(); out.push(<p key={out.length} style={{ fontSize: 12.5, lineHeight: 1.55, margin: '0 0 6px' }}>{line}</p>); }
  }
  flush();
  return out;
}

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

  const [docs, setDocs] = useState<WorkerDoc[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [sig, setSig] = useState<Record<string, string>>({});
  const [busyDoc, setBusyDoc] = useState<string | null>(null);

  const loadDocs = () => apiFetch<{ documents: WorkerDoc[] }>('/me/documents/terms').then((r) => setDocs(r.documents)).catch(() => setDocs([]));

  useEffect(() => {
    apiFetch<Me>('/me').then((m) => {
      setMe(m);
      setHealth(!!m.healthDeclaration);
      setHealthNotes(m.healthNotes ?? '');
      setConsent(!!m.consentGdpr);
      setAgree(!!m.agreementAccepted);
      setSignature(m.signatureName ?? '');
    }).catch((e) => setError(e.message));
    loadDocs();
  }, []);

  async function acceptDoc(key: string) {
    const name = (sig[key] ?? '').trim();
    if (!name) { setError('Type your full name to sign.'); return; }
    setBusyDoc(key); setError('');
    try {
      await apiFetch(`/me/documents/${key}/accept`, { method: 'POST', body: JSON.stringify({ signatureName: name }) });
      await loadDocs(); setOpen(null);
    } catch (e: any) { setError(e.message); } finally { setBusyDoc(null); }
  }
  async function declineDoc(key: string) {
    setBusyDoc(key); setError('');
    try {
      await apiFetch(`/me/documents/${key}/decline`, { method: 'POST' });
      await loadDocs();
    } catch (e: any) { setError(e.message); } finally { setBusyDoc(null); }
  }

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
      <Card title="Your worker documents" subtitle="Read and sign the documents that cover how Starff works with you and pays you.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {docs.map((d) => {
            const signed = d.status.accepted;
            const isOpen = open === d.key;
            return (
              <div key={d.key} style={{ border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div className="fx ac" style={{ justifyContent: 'space-between', gap: 10, padding: '11px 13px', background: 'var(--surface-sunken, #f6f8fb)' }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{d.title}{d.optional && <span className="dim" style={{ fontWeight: 500 }}> · optional</span>}</div>
                    <div style={{ fontSize: 12, marginTop: 2, color: signed ? 'var(--success-600)' : d.status.declined ? 'var(--text-secondary)' : 'var(--orange-600)' }}>
                      {signed ? <>Signed by {d.status.signatureName} on {fmt(d.status.acceptedAt)}{d.status.outdated ? ' · updated version available' : ''}</> : d.status.declined ? 'Declined — you can sign it any time' : d.optional ? 'Not signed (your choice)' : 'Not signed yet'}
                    </div>
                  </div>
                  <button onClick={() => setOpen(isOpen ? null : d.key)} style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-card)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12.5, padding: '6px 11px', borderRadius: 9, cursor: 'pointer', whiteSpace: 'nowrap' }}>{isOpen ? 'Hide' : signed ? 'Review' : 'Read & sign'}</button>
                </div>
                {isOpen && (
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 14px', background: 'var(--surface-card)' }}>
                      {renderTerms(d.text)}
                    </div>
                    <p style={{ fontSize: 12.5, fontWeight: 600, margin: '12px 0 8px', lineHeight: 1.5 }}>{d.confirmation}</p>
                    {!signed && (
                      <>
                        <label style={{ display: 'block', marginBottom: 10 }}>
                          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5 }}>Type your full name to sign</span>
                          <input value={sig[d.key] ?? ''} onChange={(e) => setSig((s) => ({ ...s, [d.key]: e.target.value }))} placeholder={`${me.firstName} ${me.lastName}`} style={{ width: '100%', maxWidth: 340, height: 42, padding: '0 14px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 17, fontFamily: 'Georgia, serif', fontStyle: 'italic', outline: 'none' }} />
                        </label>
                        <div className="fx ac" style={{ gap: 10 }}>
                          <button className="btn-primary" disabled={busyDoc === d.key} onClick={() => acceptDoc(d.key)}>{busyDoc === d.key ? 'Signing…' : 'Agree & sign'}</button>
                          {d.optional && <button disabled={busyDoc === d.key} onClick={() => declineDoc(d.key)} style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-card)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 13, padding: '9px 14px', borderRadius: 10, cursor: 'pointer' }}>Decline for now</button>}
                        </div>
                      </>
                    )}
                    {signed && <p className="dim" style={{ fontSize: 12.5 }}><Ic.Check width={14} /> You signed this document. Starff keeps a copy on file.</p>}
                  </div>
                )}
              </div>
            );
          })}
          {docs.length === 0 && <p className="mut" style={{ fontSize: 13 }}>Loading documents…</p>}
        </div>
      </Card>

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
