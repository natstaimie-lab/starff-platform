import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, Pill, Button, Muted, LoadingState, ErrorState } from '@/components/ui';
import { IconTile } from '@/components/cards';
import { Icon } from '@/components/Icon';
import { colors, radius } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { candidateApi } from '@/lib/endpoints';
import { uploadCandidateDocument, PickedFile } from '@/lib/storage';
import type { CandidateProfile } from '@/lib/types';

// The vetting journey — each step maps to a real DocumentType.
interface VettingStep {
  key: string;
  label: string;
  icon: string;
  docType: string;
  optional?: boolean;
  items: { t: string; s: string }[];
}
const STEPS: VettingStep[] = [
  {
    key: 'identity',
    label: 'Identity',
    icon: 'user',
    docType: 'ID',
    items: [{ t: 'Photo ID', s: 'Passport, driving licence or BRP' }],
  },
  {
    key: 'rtw',
    label: 'Right to work',
    icon: 'shield-check',
    docType: 'RIGHT_TO_WORK',
    items: [{ t: 'Right-to-work evidence', s: 'Share code or document' }],
  },
  {
    key: 'dbs',
    label: 'DBS check',
    icon: 'fingerprint',
    docType: 'DBS_CHECK',
    items: [{ t: 'DBS certificate', s: 'Enhanced DBS where required' }],
  },
  {
    key: 'cv',
    label: 'CV',
    icon: 'file-cv',
    docType: 'CV',
    items: [{ t: 'Your CV', s: 'Recent work history' }],
  },
  {
    key: 'licences',
    label: 'Licences',
    icon: 'certificate',
    docType: 'LICENCE',
    optional: true,
    items: [{ t: 'Tickets & licences', s: 'CSCS, CPC, SIA — optional' }],
  },
];

type StepStatus = 'verified' | 'pending' | 'missing';
function statusFor(me: CandidateProfile | null, docType: string): StepStatus {
  const doc = me?.documents?.find((d) => d.type === docType);
  if (!doc) return 'missing';
  if (doc.status === 'VERIFIED') return 'verified';
  if (doc.status === 'PENDING') return 'pending';
  return 'missing'; // rejected / expired → needs re-upload
}

export function VettingScreen() {
  const nav = useNavigation<any>();
  const { data: me, loading, error, reload } = useApi(() => candidateApi.me(), []);
  const [i, setI] = useState(0);
  const [uploading, setUploading] = useState(false);

  // Start on the first incomplete step once data arrives.
  useEffect(() => {
    if (me) {
      const first = STEPS.findIndex((s) => statusFor(me, s.docType) === 'missing' && !s.optional);
      setI(first === -1 ? 0 : first);
    }
  }, [me]);

  if (loading)
    return (
      <View style={styles.root}>
        <AppBar title="My vetting" onBack={() => nav.goBack()} />
        <LoadingState label="Loading your vetting…" />
      </View>
    );
  if (error || !me)
    return (
      <View style={styles.root}>
        <AppBar title="My vetting" onBack={() => nav.goBack()} />
        <ErrorState message={error ?? 'No profile.'} onRetry={reload} />
      </View>
    );

  const step = STEPS[i];
  const status = statusFor(me, step.docType);
  const done = status === 'verified' || status === 'pending';
  const isLast = i === STEPS.length - 1;

  const upload = async (file: PickedFile) => {
    setUploading(true);
    try {
      const { path, fileName } = await uploadCandidateDocument(file);
      await candidateApi.addDocument({ type: step.docType, fileUrl: path, fileName });
      await reload();
    } catch (err) {
      Alert.alert('Upload failed', (err as Error).message);
    } finally {
      setUploading(false);
    }
  };
  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('Camera access needed', 'Enable camera access to capture documents.');
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      await upload({ uri: a.uri, name: a.fileName ?? `photo_${Date.now()}.jpg`, mimeType: a.mimeType ?? 'image/jpeg' });
    }
  };
  const chooseFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
    if (!res.canceled && res.assets?.[0]) {
      const a = res.assets[0];
      await upload({ uri: a.uri, name: a.name, mimeType: a.mimeType });
    }
  };
  const pickSource = () =>
    Alert.alert(`Upload ${step.label}`, 'Choose a source', [
      { text: 'Take photo', onPress: takePhoto },
      { text: 'Choose file', onPress: chooseFile },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const next = () => {
    if (isLast) {
      Alert.alert('Vetting up to date', 'Thanks — your recruiter will review your documents.');
      nav.goBack();
    } else {
      setI(i + 1);
    }
  };

  const completed = STEPS.filter((s) => statusFor(me, s.docType) !== 'missing').length;

  return (
    <View style={styles.root}>
      <AppBar
        title="My vetting"
        subtitle={`Step ${i + 1} of ${STEPS.length} · ${step.label}`}
        onBack={() => nav.goBack()}
        right={<View style={styles.count}><Text style={styles.countText}>{completed}/{STEPS.length}</Text></View>}
      />
      <ScreenScroll>
        {/* Progress bars */}
        <View style={styles.steps}>
          {STEPS.map((s, j) => {
            const st = statusFor(me, s.docType);
            const filled = st === 'verified' || st === 'pending';
            return <View key={s.key} style={[styles.bar, filled ? styles.barOn : j === i ? styles.barCur : null]} />;
          })}
        </View>

        <Card>
          <View style={styles.head}>
            <IconTile name={step.icon} tone="orange" />
            <View style={{ flex: 1 }}>
              <Text style={styles.headTitle}>{step.label} verification</Text>
              <Muted>Bank-grade checks · about 2 minutes</Muted>
            </View>
          </View>

          <View style={{ gap: 9, marginTop: 4 }}>
            {step.items.map((it, k) => {
              const pk = status === 'verified' ? 'green' : status === 'pending' ? 'amber' : step.optional ? 'gray' : 'gray';
              const lbl = status === 'verified' ? 'Verified' : status === 'pending' ? 'In review' : step.optional ? 'Optional' : 'Required';
              return (
                <View key={k} style={styles.doc}>
                  <View style={styles.docIcon}>
                    <Icon name={step.icon} size={18} color={colors.orange} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docTitle}>{it.t}</Text>
                    <Muted>{it.s}</Muted>
                  </View>
                  <Pill kind={pk as any}>{lbl}</Pill>
                </View>
              );
            })}
          </View>

          {/* Upload box shown until something is on file for this step */}
          {status === 'missing' ? (
            <Pressable style={styles.upbox} onPress={pickSource} disabled={uploading}>
              <Icon name={uploading ? 'clock' : 'cloud-upload'} size={28} color={colors.orange} />
              <Text style={styles.upText}>{uploading ? 'Uploading…' : 'Tap to upload or capture'}</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.replace} onPress={pickSource} disabled={uploading}>
              <Icon name="cloud-upload" size={16} color={colors.orangeDim} />
              <Text style={styles.replaceText}>{uploading ? 'Uploading…' : 'Replace document'}</Text>
            </Pressable>
          )}
        </Card>

        <View style={styles.infoline}>
          <Icon name="lock" size={18} color={colors.orange} />
          <Text style={styles.infoText}>
            <Text style={{ fontWeight: '700', color: colors.text }}>256-bit AES encrypted</Text> — the same secure store UK high-street banks use.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
          {i > 0 ? <Button title="Back" kind="ghost" onPress={() => setI(i - 1)} style={{ flex: 1 }} /> : null}
          <Button
            title={isLast ? 'Finish' : done ? 'Continue' : step.optional ? 'Skip for now' : 'Continue'}
            onPress={next}
            iconRight={isLast ? 'check' : 'arrow-right'}
            style={{ flex: 2 }}
          />
        </View>

        <Pressable onPress={() => nav.navigate('Documents')} style={{ paddingVertical: 8, alignItems: 'center' }}>
          <Text style={styles.allDocs}>View all my documents</Text>
        </Pressable>
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  count: { backgroundColor: colors.surfaceAlt, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11 },
  countText: { fontSize: 12, fontWeight: '800', color: colors.textMuted },
  steps: { flexDirection: 'row', gap: 5 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt2 },
  barOn: { backgroundColor: colors.orange },
  barCur: { backgroundColor: colors.orange, opacity: 0.45 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  headTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  doc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 11,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
  },
  docIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: colors.orangeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  upbox: {
    borderWidth: 1.5,
    borderColor: colors.orangeBorder,
    borderStyle: 'dashed',
    borderRadius: radius.tile,
    paddingVertical: 22,
    alignItems: 'center',
    gap: 6,
    marginTop: 11,
    backgroundColor: 'rgba(244,122,32,0.04)',
  },
  upText: { fontSize: 13, fontWeight: '700', color: colors.text },
  replace: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 11,
    paddingVertical: 10,
  },
  replaceText: { fontSize: 12.5, fontWeight: '700', color: colors.orangeDim },
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
  allDocs: { fontSize: 12.5, fontWeight: '700', color: colors.orangeDim },
});
