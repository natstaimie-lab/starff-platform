'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { Card, ComplianceBadge, Badge } from '@/components/ui';
import { complianceChecks } from '@/lib/compliance';

type Doc = { type: string; status: string };
type Me = { status?: string; documents: Doc[] };
type RelIncident = { id: string; typeLabel: string; reason: string; occurredAt: string; status: string; canAppeal: boolean; appealNote: string | null };
type Rel = { level: 'LOW' | 'WATCH' | 'MEDIUM' | 'HIGH'; concernNote: string; stats: { completedShifts: number; completionRate: number | null }; incidents: RelIncident[] };

const REL_LABEL: Record<string, string> = { LOW: 'Good standing', WATCH: 'Keep it up', MEDIUM: 'Some concerns', HIGH: 'Please get in touch' };
const REL_TONE: Record<string, string> = { LOW: 'success', WATCH: 'info', MEDIUM: 'warning', HIGH: 'error' };

export default function CompliancePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [rel, setRel] = useState<Rel | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const loadRel = () => apiFetch<Rel>('/me/reliability').then(setRel).catch(() => {});
  useEffect(() => { apiFetch<Me>('/me').then(setMe).catch(() => {}); loadRel(); }, []);

  async function appeal(id: string) {
    const note = window.prompt('Tell us why this isn’t right (this goes to the Starff team):') ?? undefined;
    if (note === undefined) return;
    setBusy(id);
    try { await apiFetch(`/me/reliability/incidents/${id}/appeal`, { method: 'POST', body: JSON.stringify({ note }) }); await loadRel(); }
    catch (e: any) { alert(e.message); } finally { setBusy(null); }
  }

  const { checks, done, total, pct, cleared } = complianceChecks(me?.status, me?.documents ?? []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title="Compliance"
        subtitle={cleared ? 'Starff has cleared you to work' : `${done} of ${total} checks complete`}
        action={<Link href="/dashboard/documents" className="link">Upload documents</Link>}
      >
        {cleared && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--success-100, #e7f6ee)', color: 'var(--success-600, #178a50)', fontSize: 13.5, fontWeight: 600 }}>
            ✓ You&apos;re fully compliant and can receive shift offers.
          </div>
        )}
        <div style={{ height: 10, borderRadius: 999, background: 'var(--surface-sunken)', marginBottom: 16 }}>
          <div style={{ height: 10, width: `${pct}%`, borderRadius: 999, background: pct === 100 ? 'var(--success-500)' : 'var(--orange-500)' }} />
        </div>
        {checks.map((c) => (
          <div key={c.type} className="crow">
            <div className="clabel">
              <div>{c.label}</div>
              <div className="mut" style={{ fontSize: 12, fontWeight: 400 }}>{c.desc}</div>
            </div>
            <ComplianceBadge status={c.status} />
          </div>
        ))}
        {!cleared && pct < 100 && <p className="mut" style={{ fontSize: 13, marginTop: 14 }}>Upload the missing documents to become fully compliant and start receiving shift offers.</p>}
      </Card>

      {rel && (
        <Card title="Reliability & feedback" action={<Badge tone={(REL_TONE[rel.level]) as any}>{REL_LABEL[rel.level]}</Badge>}>
          <p style={{ fontSize: 13.5, marginBottom: 12 }}>{rel.concernNote}</p>
          <div className="mut" style={{ fontSize: 13, marginBottom: 12 }}>{rel.stats.completedShifts} shift{rel.stats.completedShifts === 1 ? '' : 's'} completed{rel.stats.completionRate != null ? ` · ${rel.stats.completionRate}% completion rate` : ''}.</div>
          {rel.incidents.length === 0 ? (
            <p className="mut" style={{ fontSize: 13.5 }}>Nothing on record — keep turning up and doing great work! 👍</p>
          ) : rel.incidents.map((i) => (
            <div key={i.id} className="crow" style={{ alignItems: 'flex-start' }}>
              <div className="clabel">
                <div>{i.typeLabel}</div>
                <div className="mut" style={{ fontSize: 12, fontWeight: 400 }}>{i.reason} · {new Date(i.occurredAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                {i.appealNote && <div className="mut" style={{ fontSize: 12, fontWeight: 400, marginTop: 3 }}>You told us: “{i.appealNote}”</div>}
              </div>
              {i.status === 'DISPUTED' ? <Badge tone="info">Under review</Badge>
                : i.canAppeal ? <button className="btn-outline" disabled={busy === i.id} onClick={() => appeal(i.id)} style={{ fontSize: 12.5 }}>This isn’t right</button>
                : <Badge tone="neutral">{i.status.toLowerCase()}</Badge>}
            </div>
          ))}
          <p className="mut" style={{ fontSize: 12, marginTop: 12 }}>If something here looks wrong, tap “This isn’t right” and the Starff team will review it. Nothing here is shared with clients.</p>
        </Card>
      )}
    </div>
  );
}
