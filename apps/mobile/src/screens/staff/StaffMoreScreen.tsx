/**
 * Staff "More" tab — who's signed in, shortcuts, device settings, sign out.
 * Staff accounts are managed by an admin, so there's no self-delete here.
 */
import React from 'react';
import { Alert, Linking, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Button, Card, Muted, Pill } from '@/components/ui';
import { Avatar, ListRow } from '@/components/cards';
import { PushToggleRow } from '@/components/PushToggleRow';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { staffApi } from '@/lib/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { initials } from './format';

const ADMIN_WEB = 'https://starff-platform-admin.vercel.app';

export function StaffMoreScreen() {
  const nav = useNavigation<any>();
  const { session, staffRole, signOut, biometricAvailable, biometricEnabled, setBiometricEnabled } = useAuth();
  const { data: me } = useApi(() => staffApi.me().catch(() => null), []);
  const name = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || session?.user.email || 'Staff';

  const confirmSignOut = () =>
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);

  const onToggleBiometric = async (on: boolean) => {
    if (on && !biometricAvailable) {
      Alert.alert('Biometrics unavailable', 'Set up Face ID / fingerprint on your device first.');
      return;
    }
    await setBiometricEnabled(on);
  };

  return (
    <View style={styles.root}>
      <AppBar title="More" />
      <ScreenScroll>
        <Card style={{ alignItems: 'center' }}>
          <Avatar initials={initials(name)} size={56} />
          <Text style={styles.name}>{name}</Text>
          <Muted>{session?.user.email}</Muted>
          <View style={{ marginTop: 10 }}>
            <Pill kind="orange">{staffRole === 'ADMIN' ? 'Admin' : 'Recruiter'}</Pill>
          </View>
        </Card>

        <Card tight>
          <ListRow icon="briefcase" title="Job bookings" subtitle="Requests and their stage" onPress={() => nav.navigate('Jobs')} />
          <ListRow icon="bell" title="Notifications" subtitle="Your in-app alerts" onPress={() => nav.navigate('Notifications')} />
          <ListRow
            icon="settings"
            title="Open the web dashboard"
            subtitle="Vetting, matching, invoicing, staff"
            onPress={() => Linking.openURL(ADMIN_WEB)}
            last
          />
        </Card>

        <Card tight>
          <PushToggleRow />
          <View style={styles.toggle}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Face ID / fingerprint</Text>
              <Muted>Unlock the app with biometrics</Muted>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={onToggleBiometric}
              trackColor={{ true: colors.orange, false: colors.surfaceAlt2 }}
            />
          </View>
        </Card>

        <Button title="Sign out" kind="ghost" icon="logout" onPress={confirmSignOut} />
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  name: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 10 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  toggleTitle: { fontSize: 13.5, fontWeight: '700', color: colors.text },
});
