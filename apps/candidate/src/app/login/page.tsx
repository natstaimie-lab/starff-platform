'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

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
    setLoading(false);
    if (error) setError(error.message);
    else router.replace('/dashboard');
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <form onSubmit={onSubmit} style={{ width: '100%', maxWidth: 380, background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 32, boxShadow: 'var(--shadow-sm)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/starff-horizontal.png" alt="Starff" style={{ height: 38, width: 'auto' }} />
        <p className="mut" style={{ fontSize: 14, marginTop: 12, marginBottom: 22 }}>Candidate portal — sign in to find shifts.</p>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@email.com"
          style={{ width: '100%', height: 42, padding: '0 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', marginBottom: 14, fontSize: 14, outline: 'none' }} />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••"
          style={{ width: '100%', height: 42, padding: '0 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', marginBottom: 20, fontSize: 14, outline: 'none' }} />

        {error && <p style={{ color: 'var(--error-600)', fontSize: 13, background: 'var(--error-100)', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%' }}>{loading ? 'Signing in…' : 'Sign in'}</button>
        <p style={{ fontSize: 13, textAlign: 'center', marginTop: 16, color: 'var(--text-secondary)' }}>
          New to Starff? <Link href="/register" className="link">Create an account</Link>
        </p>
      </form>
    </main>
  );
}
