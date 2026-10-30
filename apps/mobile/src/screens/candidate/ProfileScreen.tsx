import React from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ActionButton, ScreenScroll } from '@/components/Screen';
import {
  Card,
  Pill,
  Button,
  Muted,
  LoadingState,
  ErrorState,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { candidateApi, accountApi } from '@/lib/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { PushToggleRow } from '@/components/PushToggleRow';

export function CandidateProfileScreen() {
  const nav = useNavigation<any>();
  const { signOut, biometricAvailable, biometricEnabled, setBiometricEnabled } =
    useAuth();
  const { data: me, loading, error, refreshing, refresh, reload } = useApi(
    () => candidateApi.me(),
    [],
  );

  const initials =
    me ? `${me.firstName?.[0] ?? ''}${me.lastName?.[0] ?? ''}`.toUpperCase() : '';

  const rows = [
    { icon: 'shield-check', label: 'Vetting & compliance', value: `${me?.documents?.length ?? 0} document${(me?.documents?.length ?? 0) === 1 ? '' : 's'} on file`, to: 'Vetting' },
    { icon: 'user', label: 'Personal details', value: me?.phone ?? 'Add phone', to: 'ProfileEdit' },
    { icon: 'calendar', label: 'Availability', value: `${me?.availability?.length ?? 0} days set`, to: 'Availability' },
    { icon: 'writing-sign', label: 'Agreements & signature', value: 'Consent & e-signature', to: 'Declarations' },
    { icon: 'file-text', label: 'Worker documents', value: 'Terms, Key Info, opt-out', to: 'WorkerDocuments' },
    { icon: 'coin', label: 'Earnings', value: 'From approved hours', to: 'Payroll' },
    { icon: 'credit-card', label: 'Payment details', value: (me as any)?.bankAccountNumber ? `••••${String((me as any).bankAccountNumber).slice(-4)}` : 'Add bank details', to: 'Payment' },
  ] as const;

  const confirmSignOut = () =>
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);

  // In-app account deletion (required by the App Store / Play Store). Two-step
  // confirm, then the API disables the account immediately and the team erases
  // what the law doesn't require us to keep.
  const finalDeleteConfirm = () =>
    Alert.alert(
      'Confirm deletion',
      'Are you sure? Your account will be disabled straight away and this cannot be undone from the app.',
      [
        { text: 'Keep my account', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            try {
              await accountApi.requestDeletion();
              Alert.alert(
                'Account deletion requested',
                'Your account has been disabled and our team will complete the deletion. You’ll now be signed out.',
                [{ text: 'OK', onPress: signOut }],
              );
            } catch (e: any) {
              Alert.alert('Something went wrong', e?.message || 'Please try again, or email privacy@starff.co.uk.');
            }
          },
        },
      ],
    );

  const confirmDeleteAccount = () =>
    Alert.alert(
      'Delete your account?',
      'This closes your Starff account and signs you out — you’ll lose access to shifts, messages and your profile.\n\nSome records (such as right-to-work and pay records) must be kept for a period required by law; everything else will be erased by our team.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: finalDeleteConfirm },
      ],
    );

  const onToggleBiometric = async (on: boolean) => {
    if (on && !biometricAvailable) {
      Alert.alert(
        'Biometrics unavailable',
        'Set up Face ID / fingerprint on your device first.',
      );
      return;
    }
    await setBiometricEnabled(on);
  };

  return (
    <View style={styles.root}>
      <AppBar title="Profile" right={<ActionButton icon="logout" onPress={confirmSignOut} />} />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <LoadingState />
        ) : error || !me ? (
          <ErrorState message={error ?? 'No profile.'} onRetry={reload} />
        ) : (
          <>
            <Card style={{ alignItems: 'center' }}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <Text style={styles.name}>
                {me.firstName} {me.lastName}
              </Text>
              <Muted>{[me.headline, me.city].filter(Boolean).join(' · ') || 'Temporary worker'}</Muted>
              <View style={styles.pills}>
                <Pill kind="green">{me.status}</Pill>
                {me.available ? <Pill kind="blue">Available</Pill> : <Pill kind="gray">Unavailable</Pill>}
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
              <View style={[styles.li, styles.liBorder, { borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: colors.border }]}>
                <View style={styles.liIcon}>
                  <Icon name="fingerprint" size={18} color={colors.orangeDim} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.liTitle}>Biometric sign-in</Text>
                  <Muted>
                    {biometricAvailable ? 'Face ID / fingerprint' : 'Not available on this device'}
                  </Muted>
                </View>
                <Switch
                  value={biometricEnabled}
                  onValueChange={onToggleBiometric}
                  trackColor={{ true: colors.orange }}
                />
              </View>
            </Card>

            <Button title="Sign out" kind="ghost" icon="logout" onPress={confirmSignOut} />

            <Pressable onPress={confirmDeleteAccount} style={styles.deleteBtn} hitSlop={8}>
              <Text style={styles.deleteTxt}>Delete my account</Text>
            </Pressable>
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: colors.orangeBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarText: { fontSize: 24, fontWeight: '800', color: colors.orangeDim },
  name: { fontSize: 18, fontWeight: '800', color: colors.text },
  pills: { flexDirection: 'row', gap: 8, marginTop: 12 },
  li: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  liBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  liIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.orangeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liTitle: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  deleteBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 2 },
  deleteTxt: { color: colors.error, fontWeight: '700', fontSize: 13.5 },
});
