/**
 * DBS check (optional). DBS isn't needed to register or be cleared to work —
 * only some jobs ask for it. The worker enters their details; Starff admin
 * checks them and marks them verified. Changing details clears verification.
 * Mirrors apps/candidate/src/components/DbsCard.tsx.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, Field, Input, Button, Muted, Pill, LoadingState } from '@/components/ui';
import { colors, radius } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { candidateApi } from '@/lib/endpoints';

const LEVELS = [
  { v: '', l: 'None' },
  { v: 'BASIC', l: 'Basic' },
  { v: 'STANDARD', l: 'Standard' },
  { v: 'ENHANCED', l: 'Enhanced' },
];

export function DbsScreen() {
  const nav = useNavigation<any>();
  const { data: me, loading } = useApi(() => candidateApi.me(), []);
  const [level, setLevel] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [certNo, setCertNo] = useState('');
  const [updateService, setUpdateService] = useState(false);
  const [verified, setVerified] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!me) return;
    const m = me as any;
    setLevel(m.dbsLevel ?? '');
    setIssueDate(m.dbsIssueDate ? String(m.dbsIssueDate).slice(0, 10) : '');
    setCertNo(m.dbsCertificateNumber ?? '');
    setUpdateService(!!m.dbsUpdateService);
    setVerified(!!m.dbsVerifiedAt);
  }, [me]);

  const save = async () => {
    setSaving(true);
    try {
      await candidateApi.setDbs(
        level
          ? { level, issueDate: issueDate.trim() || null, certificateNumber: certNo.trim() || null, updateService }
          : { level: null },
      );
      Alert.alert('Saved', level ? 'Thanks. Starff will check your DBS details.' : 'DBS details removed.', [
        { text: 'Done', onPress: () => nav.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppBar title="DBS check" subtitle="Optional" onBack={() => nav.goBack()} />
      <ScreenScroll>
        {loading ? (
          <LoadingState />
        ) : (
          <>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.h}>Your DBS</Text>
                {verified ? <Pill kind="green">Verified</Pill> : level ? <Pill kind="amber">Waiting for check</Pill> : <Pill kind="gray">Optional</Pill>}
              </View>
              <Muted style={{ marginTop: 6, lineHeight: 19 }}>
                You don't need a DBS to register. Some jobs ask for one, so adding it can unlock more work.
              </Muted>
            </Card>

            <Card>
              <Field label="DBS level">
                <View style={styles.seg}>
                  {LEVELS.map((o) => (
                    <Pressable key={o.v} onPress={() => setLevel(o.v)} style={[styles.segItem, level === o.v && styles.segOn]}>
                      <Text style={[styles.segText, level === o.v && styles.segTextOn]}>{o.l}</Text>
                    </Pressable>
                  ))}
                </View>
              </Field>
              {level ? (
                <>
                  <Field label="Issue date (YYYY-MM-DD)">
                    <Input value={issueDate} onChangeText={setIssueDate} placeholder="e.g. 2025-06-14" keyboardType="numbers-and-punctuation" />
                  </Field>
                  <Field label="Certificate number">
                    <Input value={certNo} onChangeText={setCertNo} placeholder="12 digits, top right of certificate" keyboardType="number-pad" />
                  </Field>
                  <View style={styles.switchRow}>
                    <Text style={styles.switchText}>I'm on the DBS Update Service</Text>
                    <Switch value={updateService} onValueChange={setUpdateService} trackColor={{ true: colors.orange }} />
                  </View>
                </>
              ) : null}
              <Button title={saving ? 'Saving…' : 'Save DBS details'} onPress={save} loading={saving} style={{ marginTop: 12 }} />
            </Card>

            <Muted style={{ textAlign: 'center', fontSize: 11, paddingHorizontal: 8 }}>
              You don't need to upload your certificate. Starff may ask to see the original before a job that needs it.
            </Muted>
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  h: { fontSize: 15, fontWeight: '800', color: colors.text },
  seg: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  segItem: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.control, borderWidth: 1, borderColor: colors.border },
  segOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  segText: { fontSize: 13, fontWeight: '600', color: colors.text },
  segTextOn: { color: '#fff' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  switchText: { fontSize: 13.5, fontWeight: '600', color: colors.text, flex: 1 },
});
