'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { apiFetch } from '@/lib/api';

const ROLE_NAME: Record<string, string> = { ADMIN: 'staff', RECRUITER: 'staff', CANDIDATE: 'worker/candidate' };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }

    // Role gate — this is the client portal, only client accounts may enter.
    try {
      const me = await apiFetch<{ role: string | null }>('/auth/whoami');
      if (me.role !== 'CLIENT') {
        await supabase.auth.signOut();
        const who = me.role ? ROLE_NAME[me.role] ?? 'that' : 'that';
        setError(`This is a ${who} account — it can’t access the client portal. Staff use the admin dashboard and workers use the candidate app.`);
        setLoading(false);
        return;
      }
      router.replace('/dashboard');
    } catch {
      await supabase.auth.signOut();
      setError('We couldn’t verify your account. Please try again.');
      setLoading(false);
    }
  }

  const input = { width: '100%', height: 42, padding: '0 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', fontSize: 14, outline: 'none' } as React.CSSProperties;

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <form onSubmit={onSubmit} style={{ width: '100%', maxWidth: 380, background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 32, boxShadow: 'var(--shadow-sm)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/starff-horizontal.png" alt="Starff" style={{ height: 38, width: 'auto' }} />
        <p className="mut" style={{ fontSize: 14, marginTop: 12, marginBottom: 22 }}>Client portal — sign in to manage your staffing.</p>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.co.uk" style={{ ...input, marginBottom: 14 }} />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" style={{ ...input, marginBottom: 8 }} />
        <div style={{ textAlign: 'right', marginBottom: 18 }}><a href="/forgot-password" className="link" style={{ fontSize: 13 }}>Forgot password?</a></div>

        {error && <p style={{ color: 'var(--error-600)', fontSize: 13, background: 'var(--error-100)', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%' }}>{loading ? 'Signing in…' : 'Sign in'}</button>
        <p style={{ fontSize: 12.5, textAlign: 'center', marginTop: 16, color: 'var(--text-tertiary)' }}>
          Client accounts are set up by your Starff consultant.
        </p>
      </form>
    </main>
  );
}
