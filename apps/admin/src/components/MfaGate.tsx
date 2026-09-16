'use client';

/**
 * Staff MFA gate. Rendered by the dashboard layout whenever a signed-in staff
 * member has not stepped up to aal2. It drives Supabase's TOTP MFA entirely
 * client-side:
 *   - no verified factor yet  → enrollment (show QR, confirm first code)
 *   - a verified factor exists → challenge (enter the current code)
 * On success the Supabase session becomes aal2 and onVerified() lets the
 * dashboard load. Backed up server-side by the REQUIRE_STAFF_MFA guard.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Mode = 'loading' | 'enroll' | 'challenge' | 'error';

export function MfaGate({ email, onVerified }: { email?: string; onVerified: () => void }) {
  const [mode, setMode] = useState<Mode>('loading');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fatal, setFatal] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.currentLevel === 'aal2') { onVerified(); return; }

        const { data: factors } = await supabase.auth.mfa.listFactors();
        const verified = factors?.totp?.find((f) => f.status === 'verified');
        if (verified) {
          setFactorId(verified.id);
          setMode('challenge');
          return;
        }
        // No verified factor — clear any stale half-finished ones, then enroll.
        for (const f of factors?.totp ?? []) {
          if (f.status !== 'verified') {
            try { await supabase.auth.mfa.unenroll({ factorId: f.id }); } catch { /* ignore */ }
          }
        }
        const { data: en, error: enErr } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
        if (enErr || !en) { setFatal(enErr?.message ?? 'Could not start MFA setup.'); setMode('error'); return; }
        setFactorId(en.id);
        setQr(en.totp.qr_code);
        setSecret(en.totp.secret);
        setMode('enroll');
      } catch (e) {
        setFatal((e as Error).message ?? 'Something went wrong.');
        setMode('error');
      }
    })();
  }, [onVerified]);

  async function submit() {
    const c = code.trim();
    if (!/^\d{6}$/.test(c)) { setError('Enter the 6-digit code from your authenticator app.'); return; }
    setBusy(true); setError('');
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr || !ch) { setError(chErr?.message ?? 'Could not verify — please try again.'); setBusy(false); return; }
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: c });
      if (vErr) { setError("That code didn't match. Enter the current 6-digit code and try again."); setBusy(false); return; }
      onVerified(); // session is now aal2
    } catch (e) {
      setError((e as Error).message ?? 'Could not verify.');
      setBusy(false);
    }
  }

  async function signOut() { await supabase.auth.signOut(); window.location.href = '/login'; }

  const codeInput = (
    <>
      <label className="block text-sm font-medium text-ink mb-1">6-digit code</label>
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder="123456"
        className="w-full text-center tracking-[0.4em] text-lg rounded-lg border border-line px-3 py-2 outline-none focus:border-brand"
      />
      {error && <p className="text-sm mt-2" style={{ color: 'var(--text-danger, #DC2626)' }}>{error}</p>}
      <button
        onClick={submit}
        disabled={busy}
        className="w-full mt-4 rounded-lg bg-brand text-white font-semibold py-2.5 disabled:opacity-60"
        style={{ background: '#F47A20' }}
      >
        {busy ? 'Verifying…' : 'Verify & continue'}
      </button>
    </>
  );

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white border border-line rounded-2xl p-8 shadow-sm">
        <div className="mb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/starff-horizontal.png" alt="Starff" style={{ height: 36, width: 'auto' }} />
          <p className="text-sm text-muted mt-3">Two-step verification{email ? ` · ${email}` : ''}</p>
        </div>

        {mode === 'loading' && <p className="text-sm text-muted">Loading…</p>}

        {mode === 'enroll' && (
          <>
            <h1 className="text-lg font-semibold text-ink mb-1">Set up two-step verification</h1>
            <p className="text-sm text-muted mb-4">
              Staff accounts require a second step at sign-in. Scan this QR code with an authenticator
              app (Google Authenticator, Authy, 1Password…), then enter the 6-digit code it shows.
            </p>
            <div className="flex justify-center mb-3">
              <div className="p-3 bg-white border border-line rounded-xl">
                {/* Supabase returns the QR as a data-URI SVG — render it as an image. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {qr && <img src={qr} alt="Authenticator QR code" style={{ width: 176, height: 176, display: 'block' }} />}
              </div>
            </div>
            <p className="text-xs text-muted mb-1">Can’t scan? Enter this key manually:</p>
            <code className="block text-xs bg-surface-2 rounded-md px-2 py-1.5 mb-4 break-all" style={{ background: '#F5F7FA' }}>{secret}</code>
            {codeInput}
          </>
        )}

        {mode === 'challenge' && (
          <>
            <h1 className="text-lg font-semibold text-ink mb-1">Enter your code</h1>
            <p className="text-sm text-muted mb-4">Open your authenticator app and enter the current 6-digit code for Starff.</p>
            {codeInput}
          </>
        )}

        {mode === 'error' && (
          <>
            <h1 className="text-lg font-semibold text-ink mb-1">Couldn’t start verification</h1>
            <p className="text-sm text-muted mb-4">{fatal}</p>
          </>
        )}

        <button onClick={signOut} className="w-full mt-3 text-sm text-muted hover:text-ink">Sign out</button>
      </div>
    </main>
  );
}
