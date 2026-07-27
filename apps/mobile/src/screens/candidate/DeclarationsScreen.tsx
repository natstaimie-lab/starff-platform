import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, Field, Input, Button, Muted, LoadingState, ErrorState } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { colors, radius } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { candidateApi } from '@/lib/endpoints';

/** Agreements, GDPR consent, health declaration + typed e-signature.
 *  PUT /me/declarations (the backend timestamps consent/agreement/signed). */
export function DeclarationsScreen() {
  const nav = useNavigation<any>();
  const { data, loading, error, reload } = useApi(() => candidateApi.me(), []);
  const me = data as any;

  const [health, setHealth] = useState(false);
  const [healthNotes, setHealthNotes] = useState('');
  const [gdpr, setGdpr] = useState(false);
  const [agreement, setAgreement] = useState(false);
  const [signature, setSignature] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (me) {
      setHealth(!!me.healthDeclaration);
      setHealthNotes(me.healthNotes ?? '');
      setGdpr(!!me.consentGdpr);
      setAgreement(!!me.agreementAccepted);
      setSignature(me.signatureName ?? '');
    }
  }, [data]);

  const ready = gdpr && agreement && signature.trim().length > 1;

  const save = async () => {
    setSaving(true);
    try {
      await candidateApi.setDeclarations({
        healthDeclaration: health,
        healthNotes: healthNotes.trim() || undefined,
        consentGdpr: gdpr,
        agreementAccepted: agreement,
        signatureName: signature.trim(),
      });
      Alert.alert('Saved', 'Your agreements and signature were recorded.');
      reload();
    } catch (err) {
      Alert.alert('Could not save', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppBar title="Agreements" subtitle="Consent & e-signature" onBack={() => nav.goBack()} />
      <ScreenScroll>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <>
            <Card>
              <ConsentRow on={agreement} set={setAgreement}>
                I accept Starff's <Text style={styles.b}>Terms & Conditions</Text> of engagement as a temporary worker.
              </ConsentRow>
              <ConsentRow on={gdpr} set={setGdpr}>
                I give explicit <Text style={styles.b}>GDPR consent</Text> for identity, right-to-work & DBS checks and processing of the results.
              </ConsentRow>
              <ConsentRow on={health} set={setHealth}>
                I confirm my <Text style={styles.b}>health declaration</Text> is accurate.
              </ConsentRow>
              <Field label="Health notes (optional)">
                <Input
                  value={healthNotes}
                  onChangeText={setHealthNotes}
                  placeholder="Anything we should know about (allergies, conditions)…"
                  multiline
                  style={{ height: 72, paddingTop: 12, textAlignVertical: 'top' }}
                />
              </Field>
            </Card>

            <Card>
              <Field label="E-signature" hint="(type your full name)">
                <Input value={signature} onChangeText={setSignature} placeholder="Jamie Smith" />
              </Field>
              <Text style={styles.sig}>{signature.trim() || 'Your signature'}</Text>
              <View style={styles.info}>
                <Icon name="writing-sign" size={16} color={colors.orange} />
                <Muted style={{ flex: 1 }}>
                  Your typed signature is legally binding and confirms the agreements above.
                </Muted>
              </View>
            </Card>

            <Button title="Save & sign" onPress={save} disabled={!ready} loading={saving} />
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

function ConsentRow({
  on,
  set,
  children,
}: {
  on: boolean;
  set: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable style={styles.consent} onPress={() => set(!on)}>
      <View style={[styles.check, on && styles.checkOn]}>
        {on ? <Icon name="check" size={13} color="#fff" /> : null}
      </View>
      <Text style={styles.consentText}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  consent: { flexDirection: 'row', gap: 11, marginBottom: 14, alignItems: 'flex-start' },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  consentText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.text },
  b: { fontWeight: '800' },
  sig: {
    fontSize: 24,
    fontStyle: 'italic',
    color: colors.text,
    paddingVertical: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.borderStrong,
    marginBottom: 12,
  },
  info: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
