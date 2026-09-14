'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const wrap: React.CSSProperties = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#F5F7FA' };
const card: React.CSSProperties = { width: '100%', maxWidth: 380, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 32, boxShadow: '0 10px 30px rgba(11,31,58,0.08)' };
const h1: React.CSSProperties = { fontSize: 18, margin: '18px 0 4px', color: '#0B1F3A' };
const muted: React.CSSProperties = { fontSize: 14, color: '#64748B', lineHeight: 1.6 };
const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5, color: '#0B1F3A' };
const input: React.CSSProperties = { width: '100%', height: 42, padding: '0 12px', border: '1px solid #CBD6E4', borderRadius: 10, marginBottom: 20, fontSize: 14, outline: 'none', color: '#0B1F3A' };
const btn: React.CSSProperties = { width: '100%', height: 44, border: 'none', background: '#F47A20', color: '#fff', fontWeight: 700, fontSize: 14, borderRadius: 10, cursor: 'pointer' };
const link: React.CSSProperties = { color: '#F47A20', fontWeight: 700, fontSize: 13, textDecoration: 'none' };

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const redirectTo = `${window.location.origin}/reset-password`;
    // Always show the same confirmation — never reveal whether an email is registered.
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo }).catch(() => {});
    setSent(true);
    setLoading(false);
  }

  return (
    <main style={wrap}>
      <div style={card}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/starff-horizontal.png" alt="Starff" style={{ height: 38, width: 'auto' }} />
        {sent ? (
          <>
            <h1 style={h1}>Check your email</h1>
            <p style={muted}>If an account exists for <b>{email}</b>, we&apos;ve sent a link to reset your password. It can take a minute — check your spam folder too.</p>
            <p style={{ fontSize: 13, textAlign: 'center', marginTop: 22 }}><a href="/login" style={link}>Back to sign in</a></p>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <h1 style={h1}>Reset your password</h1>
            <p style={{ ...muted, marginBottom: 20 }}>Enter your email and we&apos;ll send you a link to set a new password.</p>
            <label style={label}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@email.com" style={input} />
            <button type="submit" disabled={loading} style={{ ...btn, opacity: loading ? 0.6 : 1 }}>{loading ? 'Sending…' : 'Send reset link'}</button>
            <p style={{ fontSize: 13, textAlign: 'center', marginTop: 16 }}><a href="/login" style={link}>Back to sign in</a></p>
          </form>
        )}
      </div>
    </main>
  );
}
