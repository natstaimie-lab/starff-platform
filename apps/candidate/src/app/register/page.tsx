'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { precheckSignup } from '@/lib/api';
import { checkEmail } from '@/lib/email-check';

const SECTORS = [
  'Warehouse & Logistics', 'Driving & Delivery', 'Construction & Trades',
  'Industrial & Manufacturing', 'Security', 'Cleaning', 'Hospitality & Catering',
  'Care & Healthcare', 'Events', 'Office & Admin',
];

const RTW_OPTIONS = [
  'British or Irish citizen',
  'Settled or Pre-settled status',
  'Visa with right to work',
  'Other / not sure',
];

// "DD/MM/YYYY" → "YYYY-MM-DD" (or '' if not a complete valid date).
function dobToISO(v: string): string {
  const m = v.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const [, dd, mm, yyyy] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  if (isNaN(d.getTime()) || d.getUTCDate() !== Number(dd) || d.getUTCMonth() + 1 !== Number(mm)) return '';
  return `${yyyy}-${mm}-${dd}`;
}
function ageFrom(iso: string): number {
  const d = new Date(iso); const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const mo = now.getMonth() - d.getMonth();
  if (mo < 0 || (mo === 0 && now.getDate() < d.getDate())) a--;
  return a;
}
// Keep a DD/MM/YYYY mask as the user types digits.
function maskDob(v: string): string {
  const n = v.replace(/\D/g, '').slice(0, 8);
  if (n.length <= 2) return n;
  if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`;
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}`;
}

export default function RegisterPage() {
  const router = useRouter();
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', password: '', phone: '', postcode: '', dob: '', rtw: '' });
  const [sectors, setSectors] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleSector = (s: string) =>
    setSectors((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSuggestion('');
    const emailCheck = checkEmail(f.email);
    if (!emailCheck.ok) {
      setError(emailCheck.suggestion ? `That email address looks mistyped. Did you mean ${emailCheck.suggestion}?` : 'That email address looks mistyped. Please check it.');
      setSuggestion(emailCheck.suggestion ?? '');
      return;
    }
    if (sectors.length === 0) { setError('Please pick at least one type of work you’re looking for.'); return; }
    if (!/^(?:0|\+44)[0-9 ]{9,13}$/.test(f.phone.trim())) { setError('Please enter a valid UK mobile number.'); return; }
    if (!/^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/.test(f.postcode.trim())) { setError('Please enter a valid UK postcode.'); return; }
    const iso = dobToISO(f.dob);
    if (!iso) { setError('Please enter your date of birth as DD/MM/YYYY.'); return; }
    if (ageFrom(iso) < 18) { setError('You must be at least 18 years old to register.'); return; }
    if (!f.rtw) { setError('Please tell us your right-to-work status.'); return; }
    setLoading(true);
    setError('');
    // Stop typos and second accounts before the login is created.
    const pre = await precheckSignup({
      email: f.email.trim(), firstName: f.firstName.trim(), lastName: f.lastName.trim(),
      phone: f.phone.trim(), dateOfBirth: iso,
    });
    if (!pre.ok) {
      setLoading(false);
      setError(pre.message);
      setSuggestion(pre.suggestion ?? '');
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: f.email.trim(),
      password: f.password,
      options: { data: {
        firstName: f.firstName, lastName: f.lastName, preferredSectors: sectors,
        phone: f.phone.trim(), postcode: f.postcode.trim().toUpperCase(),
        dateOfBirth: iso, rightToWorkType: f.rtw,
      } },
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
            <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={6} style={{ ...input, marginBottom: 14 }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Mobile number</label>
                <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required inputMode="tel" placeholder="07700 900000" style={input} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Postcode</label>
                <input value={f.postcode} onChange={(e) => setF({ ...f, postcode: e.target.value.toUpperCase() })} required placeholder="RM18 7AB" maxLength={8} style={input} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Date of birth</label>
                <input value={f.dob} onChange={(e) => setF({ ...f, dob: maskDob(e.target.value) })} required inputMode="numeric" placeholder="DD/MM/YYYY" maxLength={10} style={input} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Right to work</label>
                <select value={f.rtw} onChange={(e) => setF({ ...f, rtw: e.target.value })} required style={{ ...input, padding: '0 8px' }}>
                  <option value="">Select…</option>
                  {RTW_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

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
            {suggestion && (
              <button type="button" onClick={() => { setF({ ...f, email: suggestion }); setSuggestion(''); setError(''); }}
                style={{ marginTop: -8, marginBottom: 16, background: 'none', border: 'none', padding: 0, color: 'var(--text-link)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Use {suggestion}
              </button>
            )}
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
