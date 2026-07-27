import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, Field, Input, Button, Muted, LoadingState, ErrorState } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { colors, radius } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { candidateApi } from '@/lib/endpoints';

/**
 * Bank & payroll details — PATCH /candidates/:id (bankAccountName, bankSortCode,
 * bankAccountNumber, nationalInsurance). The stored account number is only ever
 * shown masked; the input stays empty unless the candidate re-enters it.
 */
export function PaymentScreen() {
  const nav = useNavigation<any>();
  const { data, loading, error, reload } = useApi(() => candidateApi.me(), []);
  const me = data as any;

  const [accountName, setAccountName] = useState('');
  const [sortCode, setSortCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ni, setNi] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (me) {
      setAccountName(me.bankAccountName ?? '');
      setSortCode(me.bankSortCode ?? '');
      setNi(me.nationalInsurance ?? '');
    }
  }, [data]);

  const currentMasked = me?.bankAccountNumber
    ? `••••${String(me.bankAccountNumber).slice(-4)}`
    : 'Not set';

  const save = async () => {
    if (!me?.id) return;
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        bankAccountName: accountName.trim() || undefined,
        bankSortCode: sortCode.trim() || undefined,
        nationalInsurance: ni.trim().toUpperCase() || undefined,
      };
      // Only overwrite the account number if a new one was entered.
      if (accountNumber.trim()) patch.bankAccountNumber = accountNumber.trim();
      await candidateApi.updateProfile(me.id, patch);
      setAccountNumber('');
      Alert.alert('Saved', 'Your payroll details were updated.');
      reload();
    } catch (err) {
      Alert.alert('Could not save', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppBar title="Payment details" subtitle="For weekly payroll" onBack={() => nav.goBack()} />
      <ScreenScroll>
        {loading ? (
          <LoadingState />
        ) : error || !me ? (
          <ErrorState message={error ?? 'No profile.'} onRetry={reload} />
        ) : (
          <>
            <Card>
              <Text style={styles.section}>Bank account</Text>
              <Field label="Account holder name">
                <Input value={accountName} onChangeText={setAccountName} placeholder="Mr J Smith" />
              </Field>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Field label="Sort code">
                    <Input value={sortCode} onChangeText={setSortCode} placeholder="12-34-56" keyboardType="numbers-and-punctuation" />
                  </Field>
                </View>
                <View style={{ flex: 1.4 }}>
                  <Field label="Account number" hint={`(current ${currentMasked})`}>
                    <Input
                      value={accountNumber}
                      onChangeText={setAccountNumber}
                      placeholder={me.bankAccountNumber ? 'Enter to change' : '12345678'}
                      keyboardType="number-pad"
                      secureTextEntry
                    />
                  </Field>
                </View>
              </View>
            </Card>

            <Card>
              <Text style={styles.section}>Tax</Text>
              <Field label="National Insurance number">
                <Input value={ni} onChangeText={setNi} placeholder="QQ 12 34 56 C" autoCapitalize="characters" />
              </Field>
            </Card>

            <View style={styles.infoline}>
              <Icon name="lock" size={18} color={colors.orange} />
              <Text style={styles.infoText}>
                <Text style={{ fontWeight: '700', color: colors.text }}>Encrypted &amp; private</Text> — used only to pay you. Never shown to employers.
              </Text>
            </View>

            <Button title="Save payment details" onPress={save} loading={saving} />
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  section: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 11 },
  infoline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: 'rgba(244,122,32,0.05)',
    borderWidth: 1,
    borderColor: colors.orangeBorder,
    borderRadius: radius.control,
    padding: 12,
  },
  infoText: { flex: 1, fontSize: 12, color: colors.textMuted, lineHeight: 17 },
});
