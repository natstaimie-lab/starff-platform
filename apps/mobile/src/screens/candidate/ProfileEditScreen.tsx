import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, Field, Input, Button, LoadingState, ErrorState } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { candidateApi } from '@/lib/endpoints';

/** Edit own profile — PATCH /candidates/:id (owner-scoped on the backend). */
export function ProfileEditScreen() {
  const nav = useNavigation<any>();
  const { data: me, loading, error, reload } = useApi(() => candidateApi.me(), []);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const val = (key: string, fallback?: string | null) =>
    form[key] ?? fallback ?? '';
  const set = (key: string) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  const save = async () => {
    if (!me) return;
    setSaving(true);
    try {
      await candidateApi.updateProfile(me.id, form);
      Alert.alert('Saved', 'Your profile was updated.');
      nav.goBack();
    } catch (err) {
      Alert.alert('Could not save', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppBar title="Edit profile" onBack={() => nav.goBack()} />
      <ScreenScroll>
        {loading ? (
          <LoadingState />
        ) : error || !me ? (
          <ErrorState message={error ?? 'No profile.'} onRetry={reload} />
        ) : (
          <>
            <Card>
              <Text style={styles.section}>Personal</Text>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Field label="First name">
                    <Input value={val('firstName', me.firstName)} onChangeText={set('firstName')} />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Last name">
                    <Input value={val('lastName', me.lastName)} onChangeText={set('lastName')} />
                  </Field>
                </View>
              </View>
              <Field label="Phone">
                <Input value={val('phone', me.phone)} onChangeText={set('phone')} keyboardType="phone-pad" />
              </Field>
              <Field label="Headline" hint="(e.g. Warehouse Operative, 3yrs)">
                <Input value={val('headline', me.headline)} onChangeText={set('headline')} />
              </Field>
            </Card>

            <Card>
              <Text style={styles.section}>Address</Text>
              <Field label="City">
                <Input value={val('city', me.city)} onChangeText={set('city')} />
              </Field>
              <Field label="Postcode">
                <Input value={val('postcode', me.postcode)} onChangeText={set('postcode')} />
              </Field>
            </Card>

            <Card>
              <Text style={styles.section}>Right to work</Text>
              <Field label="Type" hint="(UK citizen / Settled / Visa)">
                <Input value={val('rightToWorkType', me.rightToWorkType)} onChangeText={set('rightToWorkType')} />
              </Field>
            </Card>

            <Card>
              <Text style={styles.section}>Emergency contact</Text>
              <Field label="Name">
                <Input value={val('emergencyName')} onChangeText={set('emergencyName')} />
              </Field>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Field label="Phone">
                    <Input value={val('emergencyPhone')} onChangeText={set('emergencyPhone')} keyboardType="phone-pad" />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Relationship">
                    <Input value={val('emergencyRelationship')} onChangeText={set('emergencyRelationship')} />
                  </Field>
                </View>
              </View>
            </Card>

            <Button title="Save changes" onPress={save} loading={saving} />
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
});
