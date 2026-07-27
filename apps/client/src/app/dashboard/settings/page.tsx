'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui';

const TOGGLES = [
  { key: 'timesheets', label: 'Timesheet approvals', desc: 'Email me when workers submit timesheets' },
  { key: 'bookings', label: 'Booking updates', desc: 'Notify me when a booking is filled or changes' },
  { key: 'invoices', label: 'Invoice reminders', desc: 'Remind me about due and overdue invoices' },
];

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="toggle" style={{ width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: on ? 'var(--success-500)' : 'var(--grey-300)', position: 'relative' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 22 : 2, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
    </button>
  );
}

export default function SettingsPage() {
  const [state, setState] = useState<Record<string, boolean>>({ timesheets: true, bookings: true, invoices: true });
  const [me, setMe] = useState<{ client: { name: string; city?: string }; contact: { email: string } } | null>(null);
  useEffect(() => { apiFetch<any>('/client/me').then(setMe).catch(() => {}); }, []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
      <Card title="Notifications">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {TOGGLES.map((t) => (
            <div key={t.key} className="fx ac jb">
              <div><div className="nm">{t.label}</div><div className="sub2">{t.desc}</div></div>
              <Switch on={state[t.key]} onClick={() => setState((s) => ({ ...s, [t.key]: !s[t.key] }))} />
            </div>
          ))}
        </div>
      </Card>
      <Card title="Company">
        <div className="fx jb" style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13.5 }}><span className="mut">Company</span><span style={{ fontWeight: 600 }}>{me?.client.name ?? '—'}</span></div>
        <div className="fx jb" style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13.5 }}><span className="mut">Location</span><span style={{ fontWeight: 600 }}>{me?.client.city ?? '—'}</span></div>
        <div className="fx jb" style={{ padding: '10px 0', fontSize: 13.5 }}><span className="mut">Account contact</span><span style={{ fontWeight: 600 }}>{me?.contact.email ?? '—'}</span></div>
      </Card>
    </div>
  );
}
