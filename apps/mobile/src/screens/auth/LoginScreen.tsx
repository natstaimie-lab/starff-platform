import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthShell } from '@/screens/auth/AuthShell';
import { Button, Field, Input } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { colors } from '@/theme/tokens';
import { useAuth } from '@/auth/AuthContext';
import type { AuthStackParams } from '@/navigation/RootNavigator';

type Props = NativeStackScreenProps<AuthStackParams, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { signIn, resetPassword, biometricAvailable, biometricEnabled, authenticateBiometric } =
    useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const ready = email.includes('@') && password.length >= 4;

  const onSignIn = async () => {
    setBusy(true);
    try {
      // Optional biometric gate before restoring the (already stored) session.
      if (biometricEnabled && biometricAvailable) {
        const ok = await authenticateBiometric();
        if (!ok) {
          setBusy(false);
          return;
        }
      }
      await signIn(email, password);
      // On success the AuthContext flips the navigator automatically.
    } catch (err) {
      Alert.alert('Sign in failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <View style={styles.hero}>
        <Text style={styles.heroText}>
          The people you need, when you need them.
        </Text>
      </View>

      <Field label="Email">
        <Input
          onDark
          value={email}
          onChangeText={setEmail}
          placeholder="you@email.com"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
      </Field>
      <Field label="Password">
        <Input
          onDark
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          autoComplete="password"
        />
      </Field>

      <Pressable
        onPress={async () => {
          if (!email.includes('@')) {
            Alert.alert('Reset password', 'Enter your email address above first, then tap “Forgot password?”.');
            return;
          }
          try {
            await resetPassword(email);
          } catch {
            // Never reveal whether an account exists — show the same message.
          }
          Alert.alert(
            'Check your email',
            `If an account exists for ${email.trim()}, we’ve sent a link to reset your password. Open it, set a new password, then come back and sign in.`,
          );
        }}
      >
        <Text style={styles.forgot}>Forgot password?</Text>
      </Pressable>

      <View style={{ marginTop: 18, gap: 12 }}>
        <Button
          title="Sign in"
          onPress={onSignIn}
          disabled={!ready}
          loading={busy}
          iconRight="arrow-right"
        />

        <Pressable
          style={styles.altRow}
          onPress={() => navigation.navigate('Register', {})}
        >
          <Text style={styles.altText}>New to Starff?</Text>
          <Text style={styles.altLink}>Create account</Text>
        </Pressable>

        <View style={styles.trust}>
          <Icon name="shield-lock" size={14} color={colors.orange} />
          <Text style={styles.trustText}>
            FCA-grade identity checks · GDPR compliant
          </Text>
        </View>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: 10, paddingBottom: 26 },
  heroText: { color: '#A9B6C9', fontSize: 14, textAlign: 'center' },
  forgot: {
    color: colors.orange,
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'right',
  },
  altRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 4 },
  altText: { color: '#A9B6C9', fontSize: 13 },
  altLink: { color: colors.orange, fontSize: 13, fontWeight: '700' },
  trust: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 14,
  },
  trustText: { fontSize: 11, color: '#5E7191' },
});
