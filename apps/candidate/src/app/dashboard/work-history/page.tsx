'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui';
import * as Ic from '@/components/icons';

type Job = { id: string; employer: string; jobTitle?: string | null; startDate?: string | null; endDate?: string | null; current: boolean; reasonForLeaving?: string | null };
type Ref = { id: string; name: string; relationship?: string | null; company?: string | null; email?: string | null; phone?: string | null };

const inputStyle: React.CSSProperties = { width: '100%', height: 38, padding: '0 11px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 13.5, outline: 'none' };
const monthLabel = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '');

export default function WorkHistoryPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [refs, setRefs] = useState<Ref[]>([]);
  const [error, setError] = useState('');

  const jBlank = { employer: '', jobTitle: '', startDate: '', endDate: '', current: false, reasonForLeaving: '' };
  const rBlank = { name: '', relationship: '', company: '', email: '', phone: '' };
  const [jForm, setJForm] = useState(jBlank);
  const [rForm, setRForm] = useState(rBlank);
  const [savingJ, setSavingJ] = useState(false);
  const [savingR, setSavingR] = useState(false);

  const load = () => {
    apiFetch<Job[]>('/me/employment').then(setJobs).catch((e) => setError(e.message));
    apiFetch<Ref[]>('/me/references').then(setRefs).catch((e) => setError(e.message));
  };
  useEffect(() => { load(); }, []);

  async function addJob() {
    if (!jForm.employer.trim()) return;
    setSavingJ(true);
    try { await apiFetch('/me/employment', { method: 'POST', body: JSON.stringify(jForm) }); setJForm(jBlank); await load(); }
    catch (e: any) { setError(e.message); } finally { setSavingJ(false); }
  }
  async function delJob(id: string) {
    setJobs((j) => j.filter((x) => x.id !== id));
    try { await apiFetch(`/me/employment/${id}`, { method: 'DELETE' }); } catch { load(); }
  }
  async function addRef() {
    if (!rForm.name.trim()) return;
    setSavingR(true);
    try { await apiFetch('/me/references', { method: 'POST', body: JSON.stringify(rForm) }); setRForm(rBlank); await load(); }
    catch (e: any) { setError(e.message); } finally { setSavingR(false); }
  }
  async function delRef(id: string) {
    setRefs((r) => r.filter((x) => x.id !== id));
    try { await apiFetch(`/me/references/${id}`, { method: 'DELETE' }); } catch { load(); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
      {error && <p style={{ color: 'var(--error-600)', fontSize: 13 }}>{error}</p>}

      <Card title="Employment history" subtitle="Add the jobs you’ve had recently — most recent first.">
        {jobs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {jobs.map((j) => (
              <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken, #eef1f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', flexShrink: 0 }}><Ic.Briefcase width={17} /></span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{j.jobTitle ? `${j.jobTitle} · ` : ''}{j.employer}</div>
                  <div className="dim" style={{ fontSize: 12.5 }}>{monthLabel(j.startDate)} – {j.current ? 'Present' : monthLabel(j.endDate) || '—'}</div>
                </div>
                <button onClick={() => delJob(j.id)} aria-label="Remove job" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <input placeholder="Employer *" value={jForm.employer} onChange={(e) => setJForm({ ...jForm, employer: e.target.value })} style={inputStyle} />
          <input placeholder="Job title" value={jForm.jobTitle} onChange={(e) => setJForm({ ...jForm, jobTitle: e.target.value })} style={inputStyle} />
          <label style={{ fontSize: 12 }}><span className="dim">From</span><input type="month" value={jForm.startDate} onChange={(e) => setJForm({ ...jForm, startDate: e.target.value })} style={inputStyle} /></label>
          <label style={{ fontSize: 12 }}><span className="dim">To</span><input type="month" value={jForm.endDate} disabled={jForm.current} onChange={(e) => setJForm({ ...jForm, endDate: e.target.value })} style={{ ...inputStyle, opacity: jForm.current ? 0.5 : 1 }} /></label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '10px 0' }}>
          <input type="checkbox" checked={jForm.current} onChange={(e) => setJForm({ ...jForm, current: e.target.checked, endDate: '' })} /> I currently work here
        </label>
        <input placeholder="Reason for leaving (optional)" value={jForm.reasonForLeaving} onChange={(e) => setJForm({ ...jForm, reasonForLeaving: e.target.value })} style={{ ...inputStyle, marginBottom: 12 }} />
        <button className="btn-primary" onClick={addJob} disabled={savingJ || !jForm.employer.trim()}>{savingJ ? 'Adding…' : 'Add job'}</button>
      </Card>

      <Card title="References" subtitle="People who can confirm your work — a manager or supervisor is ideal.">
        {refs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {refs.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken, #eef1f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', flexShrink: 0 }}><Ic.User width={17} /></span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{r.name}{r.relationship ? <span className="dim" style={{ fontWeight: 500 }}> · {r.relationship}</span> : null}</div>
                  <div className="dim" style={{ fontSize: 12.5 }}>{[r.company, r.email, r.phone].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                <button onClick={() => delRef(r.id)} aria-label="Remove reference" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <input placeholder="Full name *" value={rForm.name} onChange={(e) => setRForm({ ...rForm, name: e.target.value })} style={inputStyle} />
          <input placeholder="Relationship (e.g. Manager)" value={rForm.relationship} onChange={(e) => setRForm({ ...rForm, relationship: e.target.value })} style={inputStyle} />
          <input placeholder="Company" value={rForm.company} onChange={(e) => setRForm({ ...rForm, company: e.target.value })} style={inputStyle} />
          <input placeholder="Email" value={rForm.email} onChange={(e) => setRForm({ ...rForm, email: e.target.value })} style={inputStyle} />
          <input placeholder="Phone" value={rForm.phone} onChange={(e) => setRForm({ ...rForm, phone: e.target.value })} style={inputStyle} />
        </div>
        <button className="btn-primary" onClick={addRef} disabled={savingR || !rForm.name.trim()}>{savingR ? 'Adding…' : 'Add reference'}</button>
      </Card>
    </div>
  );
}
