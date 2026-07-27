'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui';

const TOGGLES = [
  { key: 'offers', label: 'Shift offers', desc: 'Notify me when a shift matches my availability' },
  { key: 'reminders', label: 'Shift reminders', desc: 'Remind me the day before a booked shift' },
  { key: 'docs', label: 'Document expiry', desc: 'Alert me before my documents expire' },
  { key: 'pay', label: 'Payment updates', desc: 'Tell me when a timesheet is approved or paid' },
];

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="toggle" style={{ width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: on ? 'var(--success-500)' : 'var(--grey-300)', position: 'relative' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 22 : 2, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
    </button>
  );
}

export default function SettingsPage() {
  const [state, setState] = useState<Record<string, boolean>>({ offers: true, reminders: true, docs: true, pay: true });
  const [email, setEmail] = useState('');
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? '')); }, []);

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
      <Card title="Account">
        <div className="fx jb" style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13.5 }}><span className="mut">Email</span><span style={{ fontWeight: 600 }}>{email || '—'}</span></div>
        <div className="fx jb" style={{ padding: '10px 0', fontSize: 13.5 }}><span className="mut">Portal</span><span style={{ fontWeight: 600 }}>Starff Candidate</span></div>
      </Card>
    </div>
  );
}
