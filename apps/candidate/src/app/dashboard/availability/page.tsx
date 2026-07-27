'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui';

const DAYS = [
  { n: 1, label: 'Monday' }, { n: 2, label: 'Tuesday' }, { n: 3, label: 'Wednesday' },
  { n: 4, label: 'Thursday' }, { n: 5, label: 'Friday' }, { n: 6, label: 'Saturday' }, { n: 0, label: 'Sunday' },
];

export default function AvailabilityPage() {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch<{ availability: { dayOfWeek: number }[] }>('/me')
      .then((me) => setSelected(new Set(me.availability.map((a) => a.dayOfWeek))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggle(n: number) {
    setSaved(false);
    setSelected((s) => { const next = new Set(s); next.has(n) ? next.delete(n) : next.add(n); return next; });
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch('/me/availability', { method: 'PUT', body: JSON.stringify({ days: [...selected] }) });
      setSaved(true);
    } finally { setSaving(false); }
  }

  if (loading) return <p className="mut">Loading…</p>;

  return (
    <Card title="My Availability" action={<span className="mut" style={{ fontSize: 13 }}>{selected.size} days selected</span>}>
      <p className="mut" style={{ fontSize: 13.5, marginBottom: 14 }}>Choose the days you can work. We&apos;ll only offer you shifts on these days.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {DAYS.map((d) => {
          const on = selected.has(d.n);
          return (
            <button key={d.n} onClick={() => toggle(d.n)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: `1px solid ${on ? 'var(--success-500)' : 'var(--border-subtle)'}`, background: on ? 'var(--status-success-bg)' : 'var(--surface-card)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{d.label}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: on ? 'var(--success-600)' : 'var(--text-tertiary)' }}>{on ? 'Available' : 'Not available'}</span>
            </button>
          );
        })}
      </div>
      <div className="fx ac" style={{ gap: 12, marginTop: 16 }}>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save availability'}</button>
        {saved && <span style={{ color: 'var(--success-600)', fontSize: 13, fontWeight: 600 }}>✓ Saved</span>}
      </div>
    </Card>
  );
}
