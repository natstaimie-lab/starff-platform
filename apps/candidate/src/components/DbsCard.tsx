'use client';

// Optional DBS details. DBS isn't needed to register or be cleared to work —
// only some jobs ask for it. The worker enters their details here; Starff admin
// checks them and marks them verified. Changing the details clears verification.

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, Badge } from '@/components/ui';

export type DbsFields = {
  dbsLevel?: 'BASIC' | 'STANDARD' | 'ENHANCED' | null;
  dbsIssueDate?: string | null;
  dbsCertificateNumber?: string | null;
  dbsUpdateService?: boolean | null;
  dbsVerifiedAt?: string | null;
};

const inputStyle: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px', border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-md)', fontSize: 14, outline: 'none', background: 'var(--surface, #fff)',
};
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 };

export function DbsCard({ me }: { me: DbsFields | null }) {
  const [level, setLevel] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [certNo, setCertNo] = useState('');
  const [updateService, setUpdateService] = useState(false);
  const [verified, setVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!me) return;
    setLevel(me.dbsLevel ?? '');
    setIssueDate(me.dbsIssueDate ? me.dbsIssueDate.slice(0, 10) : '');
    setCertNo(me.dbsCertificateNumber ?? '');
    setUpdateService(!!me.dbsUpdateService);
    setVerified(!!me.dbsVerifiedAt);
  }, [me]);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      await apiFetch('/me/dbs', {
        method: 'PUT',
        body: JSON.stringify(level
          ? { level, issueDate: issueDate || null, certificateNumber: certNo || null, updateService }
          : { level: null }),
      });
      setVerified(false);
      setMsg({ ok: true, text: level ? 'Saved. Starff will check your details.' : 'DBS details removed.' });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="DBS check (optional)"
      subtitle="You don’t need a DBS to register. Some jobs ask for one, so adding it can unlock more work."
      action={verified ? <Badge tone="success">Verified by Starff</Badge> : level ? <Badge tone="warning">Waiting for check</Badge> : <Badge tone="info">Optional</Badge>}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <label style={{ display: 'block' }}>
          <span style={labelStyle}>DBS level</span>
          <select value={level} onChange={(e) => setLevel(e.target.value)} style={inputStyle}>
            <option value="">I don’t have a DBS</option>
            <option value="BASIC">Basic</option>
            <option value="STANDARD">Standard</option>
            <option value="ENHANCED">Enhanced</option>
          </select>
        </label>
        {level && (
          <>
            <label style={{ display: 'block' }}>
              <span style={labelStyle}>Issue date</span>
              <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: 'block' }}>
              <span style={labelStyle}>Certificate number</span>
              <input value={certNo} onChange={(e) => setCertNo(e.target.value)} placeholder="12 digits, top right of certificate" inputMode="numeric" style={inputStyle} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600 }}>
              <input type="checkbox" checked={updateService} onChange={(e) => setUpdateService(e.target.checked)} style={{ width: 18, height: 18 }} />
              I’m on the DBS Update Service
            </label>
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save DBS details'}</button>
        {msg && <span style={{ fontSize: 13, color: msg.ok ? 'var(--success-600)' : 'var(--error-600)' }}>{msg.text}</span>}
      </div>
      <p className="mut" style={{ fontSize: 12, marginTop: 10 }}>
        You don’t need to upload your certificate. Starff may ask to see the original before a job that needs it.
      </p>
    </Card>
  );
}
