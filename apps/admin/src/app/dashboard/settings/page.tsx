'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui';

const WEIGHT_ORDER = ['skills', 'compliance', 'rightToWork', 'availability', 'rating', 'reliability', 'proximity'];

const TOGGLES = [
  { key: 'email', label: 'Email notifications', desc: 'New enquiries, timesheets and compliance alerts' },
  { key: 'sms', label: 'SMS alerts', desc: 'Urgent shift changes and no-show warnings' },
  { key: 'compliance', label: 'Compliance reminders', desc: 'Right-to-work and document expiry reminders' },
  { key: 'weekly', label: 'Weekly summary', desc: 'A Monday digest of the week ahead' },
];

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="toggle" style={{ width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: on ? 'var(--success-500)' : 'var(--grey-300)', position: 'relative' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 22 : 2, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
    </button>
  );
}

export default function SettingsPage() {
  const [state, setState] = useState<Record<string, boolean>>({ email: true, sms: false, compliance: true, weekly: true });
  const [email, setEmail] = useState('');
  const [weights, setWeights] = useState<Record<string, number> | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [savingW, setSavingW] = useState(false);
  const [savedW, setSavedW] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? ''));
    apiFetch<{ weights: Record<string, number>; labels: Record<string, string> }>('/matching/weights')
      .then((r) => { setWeights(r.weights); setLabels(r.labels); })
      .catch(() => {});
  }, []);

  const totalW = weights ? WEIGHT_ORDER.reduce((s, k) => s + (weights[k] ?? 0), 0) : 0;
  async function saveWeights() {
    if (!weights) return;
    setSavingW(true); setSavedW(false);
    try {
      const saved = await apiFetch<Record<string, number>>('/matching/weights', { method: 'PATCH', body: JSON.stringify(weights) });
      setWeights(saved); setSavedW(true);
    } catch (e: any) { alert(e.message); } finally { setSavingW(false); }
  }

  const org = [
    { label: 'Organisation', value: 'Starff Recruitment Ltd' },
    { label: 'Signed in as', value: email || '—' },
    { label: 'Plan', value: 'Platform (self-hosted)' },
    { label: 'Region', value: 'United Kingdom' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
      <Card title="Notifications">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {TOGGLES.map((t) => (
            <div key={t.key} className="fx ac jb">
              <div>
                <div className="nm">{t.label}</div>
                <div className="sub2">{t.desc}</div>
              </div>
              <Switch on={state[t.key]} onClick={() => setState((s) => ({ ...s, [t.key]: !s[t.key] }))} />
            </div>
          ))}
        </div>
      </Card>

      <Card title="Organisation">
        <div>
          {org.map((d) => (
            <div key={d.label} className="fx jb" style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13.5 }}>
              <span className="dim">{d.label}</span>
              <span style={{ fontWeight: 600 }}>{d.value}</span>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ gridColumn: '1 / -1' }}>
      <Card title="AI match weighting" subtitle="Tune how much each factor counts when ranking candidates">
        {!weights ? <p className="dim">Loading…</p> : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {WEIGHT_ORDER.map((k) => {
                const v = weights[k] ?? 0;
                const share = totalW > 0 ? Math.round((v / totalW) * 100) : 0;
                return (
                  <div key={k} className="fx ac jb" style={{ gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div className="nm">{labels[k] ?? k}</div>
                      <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-sunken)', marginTop: 5 }}>
                        <div style={{ height: 6, width: `${share}%`, borderRadius: 999, background: 'var(--orange-500)' }} />
                      </div>
                    </div>
                    <input type="range" min={0} max={50} step={1} value={v} onChange={(e) => { setSavedW(false); setWeights((w) => ({ ...w!, [k]: Number(e.target.value) })); }} style={{ width: 120 }} />
                    <input type="number" min={0} value={v} onChange={(e) => { setSavedW(false); setWeights((w) => ({ ...w!, [k]: Number(e.target.value) })); }} style={{ width: 56, height: 32, textAlign: 'center', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 13 }} />
                    <span className="dim mono" style={{ fontSize: 12, width: 34, textAlign: 'right' }}>{share}%</span>
                  </div>
                );
              })}
            </div>
            <div className="fx ac" style={{ gap: 12, marginTop: 16 }}>
              <button className="aibtn" style={{ background: 'var(--blue-500)', color: '#fff', border: 'none' }} disabled={savingW} onClick={saveWeights}>{savingW ? 'Saving…' : 'Save weighting'}</button>
              <button className="aibtn" style={{ border: '1px solid var(--border-subtle)', background: 'var(--surface-card)' }} onClick={() => { setSavedW(false); setWeights({ skills: 35, compliance: 15, rightToWork: 10, availability: 15, rating: 10, reliability: 10, proximity: 5 }); }}>Reset to defaults</button>
              {savedW && <span style={{ color: 'var(--success-600)', fontSize: 13, fontWeight: 600 }}>✓ Saved — affects new match scores</span>}
            </div>
            <p className="dim" style={{ fontSize: 12, marginTop: 10 }}>Scores are normalised, so the bars show each factor’s share of the total. Only administrators can save; changes are audited. Eligibility filters (right-to-work, compliance, availability) always apply regardless of weighting.</p>
          </>
        )}
      </Card>
      </div>
    </div>
  );
}
