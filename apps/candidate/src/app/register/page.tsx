'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

const SECTORS = [
  'Warehouse & Logistics', 'Driving & Delivery', 'Construction & Trades',
  'Industrial & Manufacturing', 'Security', 'Cleaning', 'Hospitality & Catering',
  'Care & Healthcare', 'Events', 'Office & Admin',
];

export default function RegisterPage() {
  const router = useRouter();
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [sectors, setSectors] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleSector = (s: string) =>
    setSectors((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sectors.length === 0) { setError('Please pick at least one type of work you’re looking for.'); return; }
    setLoading(true);
    setError('');
    const { data, error } = await supabase.auth.signUp({
      email: f.email,
      password: f.password,
      options: { data: { firstName: f.firstName, lastName: f.lastName, preferredSectors: sectors } },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    if (data.session) {
      // Auto-confirmed → profile is created on first dashboard load.
      router.replace('/dashboard');
    } else {
      setMsg('Account created! Check your email to confirm, then sign in.');
    }
  }

  const input = { width: '100%', height: 42, padding: '0 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 14, outline: 'none' } as React.CSSProperties;

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <form onSubmit={onSubmit} style={{ width: '100%', maxWidth: 400, background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 32, boxShadow: 'var(--shadow-sm)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/starff-horizontal.png" alt="Starff" style={{ height: 38, width: 'auto' }} />
        <p className="mut" style={{ fontSize: 14, marginTop: 12, marginBottom: 22 }}>Create your candidate account.</p>

        {msg ? (
          <p style={{ color: 'var(--success-600)', fontSize: 14, background: 'var(--success-100)', borderRadius: 8, padding: '12px 14px' }}>{msg}</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>First name</label>
                <input value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} required style={input} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Last name</label>
                <input value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} required style={input} />
              </div>
            </div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Email</label>
            <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required style={{ ...input, marginBottom: 14 }} />
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Password</label>
            <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={6} style={{ ...input, marginBottom: 16 }} />

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>What work are you looking for?</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 20 }}>
              {SECTORS.map((s) => {
                const on = sectors.includes(s);
                return (
                  <button type="button" key={s} onClick={() => toggleSector(s)} style={{
                    fontSize: 12.5, fontWeight: 600, padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
                    border: `1px solid ${on ? 'var(--orange-500)' : 'var(--border-strong)'}`,
                    background: on ? 'var(--orange-500)' : 'var(--surface-card)',
                    color: on ? '#fff' : 'var(--text-secondary)',
                  }}>{s}</button>
                );
              })}
            </div>

            {error && <p style={{ color: 'var(--error-600)', fontSize: 13, background: 'var(--error-100)', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%' }}>{loading ? 'Creating…' : 'Create account'}</button>
          </>
        )}
        <p style={{ fontSize: 13, textAlign: 'center', marginTop: 16, color: 'var(--text-secondary)' }}>
          Already registered? <Link href="/login" className="link">Sign in</Link>
        </p>
      </form>
    </main>
  );
}
