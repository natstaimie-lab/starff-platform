'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

const wrap: React.CSSProperties = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#F5F7FA' };
const card: React.CSSProperties = { width: '100%', maxWidth: 380, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 32, boxShadow: '0 10px 30px rgba(11,31,58,0.08)' };
const h1: React.CSSProperties = { fontSize: 18, margin: '18px 0 4px', color: '#0B1F3A' };
const muted: React.CSSProperties = { fontSize: 14, color: '#64748B', lineHeight: 1.6 };
const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5, color: '#0B1F3A' };
const input: React.CSSProperties = { width: '100%', height: 42, padding: '0 12px', border: '1px solid #CBD6E4', borderRadius: 10, fontSize: 14, outline: 'none', color: '#0B1F3A' };
const btn: React.CSSProperties = { width: '100%', height: 44, border: 'none', background: '#F47A20', color: '#fff', fontWeight: 700, fontSize: 14, borderRadius: 10, cursor: 'pointer' };
const link: React.CSSProperties = { color: '#F47A20', fontWeight: 700, fontSize: 13, textDecoration: 'none' };

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  // Supabase parses the recovery token from the link URL and opens a temporary
  // session. Enable the form once that session exists.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (pw.length < 8) { setError('Use at least 8 characters.'); return; }
    if (pw !== pw2) { setError('Those passwords don’t match.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { setError(error.message); setLoading(false); return; }
    setDone(true);
    setLoading(false);
    setTimeout(() => router.replace('/login'), 2200);
  }

  return (
    <main style={wrap}>
      <div style={card}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/starff-horizontal.png" alt="Starff" style={{ height: 38, width: 'auto' }} />
        {done ? (
          <>
            <h1 style={h1}>Password updated</h1>
            <p style={muted}>You can now sign in with your new password. Redirecting you…</p>
            <p style={{ fontSize: 13, textAlign: 'center', marginTop: 22 }}><a href="/login" style={link}>Go to sign in</a></p>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <h1 style={h1}>Set a new password</h1>
            <p style={{ ...muted, marginBottom: 20 }}>{ready ? 'Choose a new password for your account.' : 'Open this page from the reset link in your email to continue.'}</p>
            <label style={label}>New password</label>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required placeholder="At least 8 characters" disabled={!ready} style={{ ...input, marginBottom: 14 }} />
            <label style={label}>Confirm new password</label>
            <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required placeholder="Re-enter password" disabled={!ready} style={{ ...input, marginBottom: 20 }} />
            {error && <p style={{ color: '#B91C1C', fontSize: 13, background: '#FEE2E2', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>{error}</p>}
            <button type="submit" disabled={loading || !ready} style={{ ...btn, opacity: (loading || !ready) ? 0.6 : 1 }}>{loading ? 'Saving…' : 'Update password'}</button>
            <p style={{ fontSize: 13, textAlign: 'center', marginTop: 16 }}><a href="/login" style={link}>Back to sign in</a></p>
          </form>
        )}
      </div>
    </main>
  );
}
