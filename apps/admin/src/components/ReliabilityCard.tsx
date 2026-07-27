'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useRole } from '@/lib/useRole';
import { Card, Badge } from '@/components/ui';

type Incident = {
  id: string; type: string; typeLabel: string; severity: number; status: string;
  reason: string; notes: string | null; evidenceSource: string | null;
  occurredAt: string; scoreImpact: number; weightFactor: number; reviewDate: string | null;
  appealNote: string | null; appealedAt: string | null;
};
type Profile = {
  level: 'LOW' | 'WATCH' | 'MEDIUM' | 'HIGH'; points: number; concernNote: string;
  stats: { completedShifts: number; noShows: number; completionRate: number | null; totalIncidents: number; activeIncidents: number; disputed: number; unresolved: number };
  incidents: Incident[];
};

const LEVEL_TONE: Record<string, string> = { LOW: 'success', WATCH: 'info', MEDIUM: 'warning', HIGH: 'error' };
const LEVEL_LABEL: Record<string, string> = { LOW: 'Low concern', WATCH: 'Watch', MEDIUM: 'Medium concern', HIGH: 'High concern' };
const STATUS_TONE: Record<string, string> = { CONFIRMED: 'error', UNCONFIRMED: 'warning', DISPUTED: 'info', RESOLVED: 'neutral', REMOVED: 'neutral' };
const TYPES = ['NO_SHOW', 'LATE_CANCELLATION', 'LATENESS', 'MISSED_CHECKIN', 'LEFT_EARLY', 'TIMESHEET_MISSING', 'NO_RESPONSE', 'WITHDREW', 'CLIENT_COMPLAINT', 'NEGATIVE_FEEDBACK', 'POSITIVE_FEEDBACK', 'DISPUTE', 'OTHER'];
const TYPE_LABEL: Record<string, string> = {
  NO_SHOW: 'No-show', LATE_CANCELLATION: 'Late cancellation', LATENESS: 'Lateness', MISSED_CHECKIN: 'Missed check-in',
  LEFT_EARLY: 'Left early', TIMESHEET_MISSING: 'Timesheet not submitted', NO_RESPONSE: 'No response', WITHDREW: 'Withdrew after accepting',
  CLIENT_COMPLAINT: 'Client complaint', NEGATIVE_FEEDBACK: 'Negative feedback', POSITIVE_FEEDBACK: 'Positive feedback', DISPUTE: 'Disputed incident', OTHER: 'Other',
};
const fmt = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export function ReliabilityCard({ candidateId }: { candidateId: string }) {
  const role = useRole();
  const [p, setP] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ type: 'LATENESS', reason: '', severity: '3', evidenceSource: '', status: 'UNCONFIRMED' });

  const load = () => apiFetch<Profile>(`/candidates/${candidateId}/reliability`).then(setP).catch(() => {});
  useEffect(() => { load(); }, [candidateId]);

  async function addIncident() {
    if (!form.reason.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/candidates/${candidateId}/reliability/incidents`, {
        method: 'POST',
        body: JSON.stringify({ type: form.type, reason: form.reason, severity: Number(form.severity), evidenceSource: form.evidenceSource || undefined, status: form.status }),
      });
      setForm({ type: 'LATENESS', reason: '', severity: '3', evidenceSource: '', status: 'UNCONFIRMED' });
      setAdding(false); await load();
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }
  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    try { await apiFetch(`/reliability/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); await load(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }

  const inp = { width: '100%', height: 36, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 13.5 } as React.CSSProperties;
  if (!p) return <Card title="Reliability"><p className="dim">Loading…</p></Card>;

  return (
    <Card
      title="Reliability (internal — never shown to clients)"
      action={<Badge tone={(LEVEL_TONE[p.level]) as any}>{LEVEL_LABEL[p.level]}</Badge>}
    >
      <p style={{ fontSize: 13.5, marginBottom: 12 }}>{p.concernNote}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 14 }}>
        {[['Completed', p.stats.completedShifts], ['No-shows', p.stats.noShows], ['Completion', p.stats.completionRate != null ? `${p.stats.completionRate}%` : '—'], ['Active concerns', p.stats.activeIncidents], ['Disputed', p.stats.disputed], ['Unreviewed', p.stats.unresolved]].map(([k, v]) => (
          <div key={k as string} style={{ background: 'var(--surface-sunken)', borderRadius: 10, padding: '8px 10px' }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{v as any}</div>
            <div className="dim" style={{ fontSize: 11.5 }}>{k as string}</div>
          </div>
        ))}
      </div>

      <div className="fx ac jb" style={{ marginBottom: 8 }}>
        <div className="dim" style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Incidents & feedback</div>
        <button onClick={() => setAdding((a) => !a)} className="aibtn" style={{ border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', fontWeight: 700, fontSize: 12 }}>{adding ? 'Cancel' : '+ Log incident'}</button>
      </div>

      {adding && (
        <div style={{ background: 'var(--surface-sunken)', borderRadius: 10, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inp}>{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={inp}>{['UNCONFIRMED', 'CONFIRMED'].map((s) => <option key={s} value={s}>{s === 'UNCONFIRMED' ? 'Reported (unconfirmed)' : 'Confirmed'}</option>)}</select>
          </div>
          <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="What happened? (short reason)" style={inp} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input value={form.evidenceSource} onChange={(e) => setForm({ ...form, evidenceSource: e.target.value })} placeholder="Evidence source (e.g. Client report)" style={inp} />
            <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} style={inp}>{[1, 2, 3, 4, 5].map((s) => <option key={s} value={s}>Severity {s}</option>)}</select>
          </div>
          <button className="aibtn" style={{ background: 'var(--blue-500)', color: '#fff', border: 'none', alignSelf: 'flex-start' }} disabled={busy || !form.reason.trim()} onClick={addIncident}>{busy ? 'Saving…' : 'Add incident'}</button>
        </div>
      )}

      {p.incidents.length === 0 ? <p className="dim" style={{ fontSize: 13.5 }}>No reliability incidents on record.</p> : p.incidents.map((i) => (
        <div key={i.id} style={{ padding: '11px 0', borderBottom: '1px solid var(--border-subtle)', opacity: i.status === 'REMOVED' || i.status === 'RESOLVED' ? 0.55 : 1 }}>
          <div className="fx ac jb" style={{ gap: 8 }}>
            <div className="nm">{i.typeLabel} <span className="dim" style={{ fontWeight: 500, fontSize: 12 }}>· sev {i.severity} · {i.scoreImpact > 0 ? `+${i.scoreImpact}` : i.scoreImpact} pts{i.weightFactor !== 1 ? ` ×${i.weightFactor}` : ''}</span></div>
            <Badge tone={(STATUS_TONE[i.status]) as any}>{i.status.toLowerCase()}</Badge>
          </div>
          <div className="dim" style={{ fontSize: 12.5, marginTop: 3 }}>{i.reason}</div>
          <div className="dim" style={{ fontSize: 11.5, marginTop: 3 }}>{fmt(i.occurredAt)}{i.evidenceSource ? ` · ${i.evidenceSource}` : ''}{i.reviewDate ? ` · review ${fmt(i.reviewDate)}` : ''}</div>
          {i.appealNote && <div style={{ fontSize: 12, marginTop: 4, background: 'var(--info-100, #e6f0ff)', color: 'var(--blue-500)', padding: '5px 8px', borderRadius: 8 }}>Candidate appeal: “{i.appealNote}”</div>}
          {i.notes && <div className="dim" style={{ fontSize: 12, marginTop: 3 }}>Note: {i.notes}</div>}
          {role === 'ADMIN' && i.status !== 'REMOVED' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {i.status !== 'CONFIRMED' && <ActBtn onClick={() => patch(i.id, { status: 'CONFIRMED' })} disabled={busy}>Confirm</ActBtn>}
              {i.status !== 'DISPUTED' && <ActBtn onClick={() => patch(i.id, { status: 'DISPUTED' })} disabled={busy}>Mark disputed</ActBtn>}
              {i.status !== 'RESOLVED' && <ActBtn onClick={() => patch(i.id, { status: 'RESOLVED' })} disabled={busy}>Resolve</ActBtn>}
              <ActBtn onClick={() => patch(i.id, { weightFactor: Math.round(i.weightFactor * 0.5 * 100) / 100 })} disabled={busy}>½ weight (older)</ActBtn>
              <ActBtn onClick={() => { const d = window.prompt('Review date (YYYY-MM-DD):'); if (d) patch(i.id, { reviewDate: d }); }} disabled={busy}>Set review</ActBtn>
              <ActBtn danger onClick={() => { if (confirm('Remove this concern? It stays in the audit trail but stops counting.')) patch(i.id, { status: 'REMOVED' }); }} disabled={busy}>Remove</ActBtn>
            </div>
          )}
        </div>
      ))}
      <p className="dim" style={{ fontSize: 11.5, marginTop: 10 }}>Reliability supports your decision — it never blocks, suspends or rejects a candidate automatically. Protected characteristics are never used.</p>
    </Card>
  );
}

function ActBtn({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', color: danger ? 'var(--error-600)' : 'var(--text-secondary)', fontWeight: 700, fontSize: 11.5, padding: '4px 9px', borderRadius: 8, cursor: 'pointer' }}>{children}</button>
  );
}
