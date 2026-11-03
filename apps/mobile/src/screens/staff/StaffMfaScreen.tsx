/**
 * Staff two-step verification — the mobile twin of the admin dashboard's
 * MfaGate. Staff accounts must be at Supabase aal2 before staff mode loads
 * (the API enforces the same thing via REQUIRE_STAFF_MFA). Uses Supabase's
 * own TOTP MFA; nothing about the factor is stored on the device.
 *
 *   verified factor exists → challenge (enter current code)
 *   no factor yet          → enrol (scan QR / add key, confirm first code)
 */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Button, Card, ErrorState, Input, LoadingState, Muted } from '@/components/ui';
import { colors, radius } from '@/theme/tokens';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';

type Mode = 'loading' | 'enroll' | 'challenge' | 'error';

/** Supabase returns the QR as a `data:image/svg+xml;…,<svg…>` URI. */
function svgFromDataUri(uri: string): string | null {
  const comma = uri.indexOf(',');
  if (comma < 0) return null;
  const raw = uri.slice(comma + 1);
  try {
    return uri.slice(0, comma).includes('base64') ? null : decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function StaffMfaScreen({ onVerified }: { onVerified: () => void }) {
  const { session, signOut } = useAuth();
  const [mode, setMode] = useState<Mode>('loading');
  const [factorId, setFactorId] = useState('');
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [otpUri, setOtpUri] = useState('');
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
        if (aal?.currentLevel === 'aal2') {
          onVerified();
          return;
        }
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const verified = factors?.totp?.find((f) => f.status === 'verified');
        if (verified) {
          setFactorId(verified.id);
          setMode('challenge');
          return;
        }
        // Clear stale half-finished factors, then enrol (same as the web gate).
        for (const f of factors?.totp ?? []) {
          if (f.status !== 'verified') {
            try { await supabase.auth.mfa.unenroll({ factorId: f.id }); } catch { /* ignore */ }
          }
        }
        const { data: en, error: enErr } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: `Authenticator ${Date.now()}`,
        });
        if (enErr || !en) {
          setFatal(enErr?.message ?? 'Could not start two-step setup.');
          setMode('error');
          return;
        }
        setFactorId(en.id);
        setQrSvg(svgFromDataUri(en.totp.qr_code));
        setSecret(en.totp.secret);
        setOtpUri(en.totp.uri);
        setMode('enroll');
      } catch (e) {
        setFatal((e as Error)?.message ?? 'Something went wrong.');
        setMode('error');
      }
    })();
  }, [onVerified]);

  const submit = async () => {
    const c = code.trim();
    if (!/^\d{6}$/.test(c)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr || !ch) {
        setError(chErr?.message ?? 'Could not verify — please try again.');
        return;
      }
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: c });
      if (vErr) {
        setError("That code didn't match. Enter the current 6-digit code and try again.");
        return;
      }
      onVerified(); // the session is now aal2
    } catch (e) {
      setError((e as Error)?.message ?? 'Could not verify.');
    } finally {
      setBusy(false);
    }
  };

  const openAuthenticator = async () => {
    try {
      await Linking.openURL(otpUri);
    } catch {
      Alert.alert('No authenticator app found', 'Install an authenticator app, or enter the setup key manually.');
    }
  };

  const codeInput = (
    <>
      <Input
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
        onSubmitEditing={submit}
        placeholder="123456"
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        style={styles.code}
      />
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <Button title="Verify & continue" onPress={submit} loading={busy} style={{ marginTop: 12 }} />
    </>
  );

  return (
    <View style={styles.root}>
      <AppBar brand title="Two-step verification" subtitle={session?.user.email ?? undefined} />
      <ScreenScroll>
        {mode === 'loading' ? (
          <LoadingState />
        ) : mode === 'error' ? (
          <ErrorState message={fatal} />
        ) : mode === 'challenge' ? (
          <Card>
            <Text style={styles.h}>Enter your code</Text>
            <Muted style={{ marginBottom: 14 }}>
              Open your authenticator app and enter the current 6-digit code for Starff.
            </Muted>
            {codeInput}
          </Card>
        ) : (
          <Card>
            <Text style={styles.h}>Set up two-step verification</Text>
            <Muted style={{ marginBottom: 14 }}>
              Staff accounts need a second step at sign-in. Add Starff to an authenticator app
              (Google Authenticator, Authy, 1Password…), then enter the 6-digit code it shows.
            </Muted>
            {qrSvg ? (
              <View style={styles.qr}>
                <SvgXml xml={qrSvg} width={176} height={176} />
              </View>
            ) : null}
            {otpUri ? (
              <Button title="Open authenticator app" kind="ghost" icon="shield-lock" onPress={openAuthenticator} style={{ marginBottom: 12 }} />
            ) : null}
            <Muted>Or enter this setup key manually:</Muted>
            <Text selectable style={styles.secret}>{secret}</Text>
            {codeInput}
          </Card>
        )}
        <Button title="Sign out" kind="ghost" icon="logout" onPress={signOut} />
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  h: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 4 },
  qr: {
    alignSelf: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  secret: {
    fontFamily: 'Courier',
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.chip,
    padding: 10,
    marginTop: 6,
    marginBottom: 14,
  },
  code: { textAlign: 'center', fontSize: 20, letterSpacing: 8 },
  err: { color: colors.error, fontSize: 12.5, marginTop: 8 },
});
