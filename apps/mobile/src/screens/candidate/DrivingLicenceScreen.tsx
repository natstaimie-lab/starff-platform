/**
 * Driving licence — DVLA check. The driver supplies their licence number and a
 * "share code" they generate for free at gov.uk/view-driving-licence (valid 21
 * days). Starff admin uses it to view entitlements and penalty points on the
 * gov.uk "check driving licence" service. We store the code as a short-lived
 * access token — we never act on it automatically.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, Field, Input, Button, Muted, SecHead, LoadingState } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { candidateApi } from '@/lib/endpoints';

const GOV_UK = 'https://www.gov.uk/view-driving-licence';

export function DrivingLicenceScreen() {
  const nav = useNavigation<any>();
  const { data: me, loading } = useApi(() => candidateApi.me(), []);
  const [licence, setLicence] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (me) {
      setLicence((me as any).drivingLicenceNumber ?? '');
      setCode((me as any).dvlaCheckCode ?? '');
    }
  }, [me]);

  const save = async () => {
    setSaving(true);
    try {
      await candidateApi.setDrivingLicence({ licenceNumber: licence.trim(), checkCode: code.trim() });
      Alert.alert('Saved', 'Thanks — Starff can now check your driving licence.', [{ text: 'Done', onPress: () => nav.goBack() }]);
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppBar title="Driving licence" subtitle="DVLA check" onBack={() => nav.goBack()} />
      <ScreenScroll>
        {loading ? (
          <LoadingState />
        ) : (
          <>
            <Card>
              <SecHead title="How to get your check code" />
              <Muted style={{ marginTop: 8, lineHeight: 19 }}>
                1. Open the DVLA "View your driving licence" service.{'\n'}
                2. Sign in with your licence number, National Insurance number and postcode.{'\n'}
                3. Choose "Share your licence", then "Create a code".{'\n'}
                4. Copy the code here. It lasts 21 days — we may ask for a fresh one.
              </Muted>
              <Button title="Open gov.uk licence service" kind="ghost" icon="share-2" onPress={() => Linking.openURL(GOV_UK)} style={{ marginTop: 12 }} />
              <Text selectable style={styles.url}>{GOV_UK}</Text>
            </Card>

            <Card>
              <Field label="Driving licence number">
                <Input value={licence} onChangeText={setLicence} autoCapitalize="characters" placeholder="e.g. MORGA657054SM9IJ" />
              </Field>
              <Field label="DVLA check code">
                <Input value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="e.g. Ab C1 2d 3E" />
              </Field>
              <Button title={saving ? 'Saving…' : 'Save'} onPress={save} loading={saving} />
            </Card>

            <Muted style={{ textAlign: 'center', fontSize: 11, paddingHorizontal: 8 }}>
              Your check code only lets us view your driving record (categories, endorsements and points). It does not give access to anything else.
            </Muted>
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  url: { color: colors.textFaint, fontSize: 11.5, marginTop: 8, textAlign: 'center' },
});
