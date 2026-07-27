import React from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, Pill, Button, Muted, LoadingState, ErrorState } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { clientApi } from '@/lib/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { PushToggleRow } from '@/components/PushToggleRow';

export function EmployerAccountScreen() {
  const nav = useNavigation<any>();
  const { signOut, biometricAvailable, biometricEnabled, setBiometricEnabled } = useAuth();
  const { data, loading, error, reload } = useApi<any>(() => clientApi.me() as Promise<any>, []);

  const client = data?.client ?? {};
  const contact = data?.contact ?? {};
  const initials = (client.name ?? 'Co')
    .split(' ')
    .map((p: string) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const rows = [
    { icon: 'building', label: 'Company setup', value: 'Profile, sites, users, terms', to: 'Company' },
    { icon: 'briefcase', label: 'Bookings', value: 'Your roles', to: 'Bookings' },
    { icon: 'users', label: 'Workers', value: 'On assignment', to: 'Talent' },
    { icon: 'file-invoice', label: 'Invoices', value: 'Billing', to: 'Invoices' },
    { icon: 'message', label: 'Messages', value: 'Starff team', to: 'Messages' },
  ] as const;

  const onToggleBiometric = async (on: boolean) => {
    if (on && !biometricAvailable) {
      Alert.alert('Biometrics unavailable', 'Set up Face ID / fingerprint on your device first.');
      return;
    }
    await setBiometricEnabled(on);
  };

  return (
    <View style={styles.root}>
      <AppBar title="Account" onBack={() => nav.goBack()} />
      <ScreenScroll>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <>
            <Card style={{ alignItems: 'center' }}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <Text style={styles.name}>{client.name ?? 'Your company'}</Text>
              <Muted>
                {[contact.firstName, contact.lastName].filter(Boolean).join(' ')}
                {contact.email ? ` · ${contact.email}` : ''}
              </Muted>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Pill kind="green">{client.status ?? 'Active'}</Pill>
                {client.industry ? <Pill kind="blue">{client.industry}</Pill> : null}
              </View>
            </Card>

            <Card tight>
              {rows.map((r, i) => (
                <Pressable
                  key={r.label}
                  onPress={() => nav.navigate(r.to)}
                  style={[styles.li, i < rows.length - 1 && styles.liBorder]}
                >
                  <View style={styles.liIcon}>
                    <Icon name={r.icon} size={18} color={colors.orangeDim} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.liTitle}>{r.label}</Text>
                    <Muted>{r.value}</Muted>
                  </View>
                  <Icon name="chevron-right" size={18} color={colors.textFaint} />
                </Pressable>
              ))}
            </Card>

            <Card tight>
              <PushToggleRow />
              <View style={[styles.li, { borderTopWidth: 1, borderTopColor: colors.border }]}>
                <View style={styles.liIcon}>
                  <Icon name="fingerprint" size={18} color={colors.orangeDim} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.liTitle}>Biometric sign-in</Text>
                  <Muted>{biometricAvailable ? 'Face ID / fingerprint' : 'Not available on this device'}</Muted>
                </View>
                <Switch value={biometricEnabled} onValueChange={onToggleBiometric} trackColor={{ true: colors.orange }} />
              </View>
            </Card>

            <Button title="Sign out" kind="ghost" icon="logout" onPress={signOut} />
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  avatar: {
    width: 72, height: 72, borderRadius: 999, backgroundColor: colors.orangeBg,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  avatarText: { fontSize: 22, fontWeight: '800', color: colors.orangeDim },
  name: { fontSize: 18, fontWeight: '800', color: colors.text },
  li: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  liBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  liIcon: {
    width: 38, height: 38, borderRadius: 10, backgroundColor: colors.orangeBg,
    alignItems: 'center', justifyContent: 'center',
  },
  liTitle: { fontSize: 13.5, fontWeight: '700', color: colors.text },
});
