import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Button, Card, ErrorState, Field, Input, LoadingState, Muted } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';

type Mode = 'loading' | 'enroll' | 'challenge' | 'error';

/**
 * Staff two-step verification — the same Supabase TOTP flow as the admin
 * dashboard's MfaGate, so a code set up on either works on both:
 *   - no verified factor yet  → set up an authenticator, confirm the first code
 *   - a verified factor exists → enter the current code
 * Success raises the session to aal2, which the API requires of staff when
 * REQUIRE_STAFF_MFA is on.
 */
export function StaffMfaScreen({ onVerified }: { onVerified: () => void }) {
  const { signOut } = useAuth();
  const [mode, setMode] = useState<Mode>('loading');
  const [factorId, setFactorId] = useState('');
  const [secret, setSecret] = useState('');
  const [otpUri, setOtpUri] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fatal, setFatal] = useState('');

  const start = async () => {
    setMode('loading');
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
      // Unique name for the same reason as the web gate: a stale blank factor is
      // hidden from listFactors and would collide on re-enrolment.
      const { data: en, error: enErr } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Mobile ${Date.now()}`,
      });
      if (enErr || !en) {
        setFatal(enErr?.message ?? 'Could not start two-step setup.');
        setMode('error');
        return;
      }
      setFactorId(en.id);
      setSecret(en.totp.secret);
      setOtpUri(en.totp.uri);
      setMode('enroll');
    } catch (e) {
      setFatal((e as Error).message ?? 'Something went wrong.');
      setMode('error');
    }
  };

  useEffect(() => {
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setError(chErr?.message ?? 'Could not verify. Please try again.');
        return;
      }
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code: c,
      });
      if (vErr) {
        const wrongCode = vErr.code === 'mfa_verification_failed';
        setError(
          wrongCode
            ? "That code didn't match. Use the entry you set up for the Starff admin dashboard and try again."
            : `Could not verify: ${vErr.message}`,
        );
        return;
      }
      onVerified();
    } catch (e) {
      setError((e as Error).message ?? 'Could not verify.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppBar brand subtitle="Staff sign-in" />
      <ScreenScroll>
        {mode === 'loading' ? (
          <LoadingState />
        ) : mode === 'error' ? (
          <ErrorState message={fatal} onRetry={start} />
        ) : (
          <Card>
            <Text style={styles.title}>
              {mode === 'enroll' ? 'Set up two-step verification' : 'Enter your code'}
            </Text>
            {mode === 'enroll' ? (
              <>
                <Muted style={styles.gap}>
                  Staff accounts need an authenticator app, such as Google Authenticator or Authy.
                  Add Starff to it, then enter the 6-digit code it shows.
                </Muted>
                <Button
                  title="Open authenticator app"
                  kind="ghost"
                  icon="shield-lock"
                  onPress={() =>
                    Linking.openURL(otpUri).catch(() =>
                      setError('No authenticator app opened. Enter the setup key below by hand.'),
                    )
                  }
                  style={styles.gap}
                />
                <Muted style={styles.gap}>Or enter this setup key by hand:</Muted>
                <Text selectable style={styles.secret}>
                  {secret}
                </Text>
              </>
            ) : (
              <Muted style={styles.gap}>Open your authenticator app and enter the current code from the entry you set up for the Starff admin dashboard.</Muted>
            )}
            <View style={{ height: 12 }} />
            <Field label="6-digit code">
              <Input
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                placeholder="123456"
              />
            </Field>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              title={mode === 'enroll' ? 'Confirm and continue' : 'Verify'}
              onPress={submit}
              loading={busy}
              style={styles.gap}
            />
          </Card>
        )}
        <Button title="Sign out" kind="ghost" icon="logout" onPress={signOut} style={styles.gap} />
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  gap: { marginTop: 10 },
  secret: { marginTop: 6, marginBottom: 12, fontSize: 14, fontWeight: '700', color: colors.text, letterSpacing: 1 },
  error: { marginTop: 8, fontSize: 12, color: colors.error },
});
