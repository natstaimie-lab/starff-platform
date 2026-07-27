import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, Pill, Muted, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { colors, radius } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { candidateApi } from '@/lib/endpoints';
import { uploadCandidateDocument, PickedFile } from '@/lib/storage';
import type { DocumentStatus } from '@/lib/types';

const DOC_TYPES = [
  { type: 'RIGHT_TO_WORK', label: 'Right to work' },
  { type: 'ID', label: 'ID' },
  { type: 'DBS_CHECK', label: 'DBS' },
  { type: 'CV', label: 'CV' },
  { type: 'CERTIFICATE', label: 'Certificate' },
  { type: 'QUALIFICATION', label: 'Qualification' },
  { type: 'LICENCE', label: 'Licence' },
  { type: 'OTHER', label: 'Other' },
] as const;

const STATUS_PILL: Record<DocumentStatus, any> = {
  VERIFIED: 'green',
  PENDING: 'amber',
  REJECTED: 'red',
  EXPIRED: 'red',
};
const STATUS_LABEL: Record<DocumentStatus, string> = {
  VERIFIED: 'Verified',
  PENDING: 'In review',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
};

export function DocumentsScreen() {
  const nav = useNavigation<any>();
  const { data: me, loading, error, reload, refreshing, refresh } = useApi(
    () => candidateApi.me(),
    [],
  );
  const [type, setType] = useState<string>('RIGHT_TO_WORK');
  const [uploading, setUploading] = useState(false);

  const doUpload = async (file: PickedFile) => {
    setUploading(true);
    try {
      const { path, fileName } = await uploadCandidateDocument(file);
      await candidateApi.addDocument({ type, fileUrl: path, fileName });
      Alert.alert('Uploaded', 'Your document was sent for verification.');
      reload();
    } catch (err) {
      Alert.alert('Upload failed', (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access needed', 'Enable camera access to photograph documents.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      await doUpload({ uri: a.uri, name: a.fileName ?? `photo_${Date.now()}.jpg`, mimeType: a.mimeType ?? 'image/jpeg' });
    }
  };

  const chooseFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
    });
    if (!res.canceled && res.assets?.[0]) {
      const a = res.assets[0];
      await doUpload({ uri: a.uri, name: a.name, mimeType: a.mimeType });
    }
  };

  const pickSource = () => {
    const label = DOC_TYPES.find((d) => d.type === type)?.label ?? 'document';
    Alert.alert(`Upload ${label}`, 'Choose a source', [
      { text: 'Take photo', onPress: takePhoto },
      { text: 'Choose file', onPress: chooseFile },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const docs = me?.documents ?? [];

  return (
    <View style={styles.root}>
      <AppBar title="My documents" subtitle="Compliance & verification" onBack={() => nav.goBack()} />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <>
            <Card>
              <Text style={styles.h}>Upload a document</Text>
              <View style={styles.chips}>
                {DOC_TYPES.map((d) => {
                  const on = type === d.type;
                  return (
                    <Pressable key={d.type} onPress={() => setType(d.type)} style={[styles.chip, on && styles.chipOn]}>
                      {on ? <Icon name="check" size={12} color={colors.orangeDim} /> : null}
                      <Text style={[styles.chipText, on && { color: colors.orangeDim }]}>{d.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Dashed upload box (prototype .upbox) */}
              <Pressable style={styles.upbox} onPress={pickSource} disabled={uploading}>
                <Icon name={uploading ? 'clock' : 'cloud-upload'} size={28} color={colors.orange} />
                <Text style={styles.upText}>
                  {uploading ? 'Uploading…' : 'Tap to upload or capture'}
                </Text>
                <Text style={styles.upHint}>Photo or PDF · {DOC_TYPES.find((d) => d.type === type)?.label}</Text>
              </Pressable>

              {/* Info line (prototype .infoline) */}
              <View style={styles.infoline}>
                <Icon name="lock" size={18} color={colors.orange} />
                <Text style={styles.infoText}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>256-bit AES encrypted</Text> — the same secure store your recruiter reviews.
                </Text>
              </View>
            </Card>

            <Text style={styles.sectionLabel}>YOUR DOCUMENTS</Text>
            {docs.length === 0 ? (
              <EmptyState icon="file-text" title="No documents yet" subtitle="Upload your right-to-work, ID and certificates to get cleared to work." />
            ) : (
              <View style={{ gap: 9 }}>
                {docs.map((d) => (
                  <View key={d.id} style={styles.doc}>
                    <View style={styles.docIcon}>
                      <Icon name="file-text" size={19} color={colors.orange} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docTitle}>{prettyType(d.type)}</Text>
                      <Muted>{d.fileName ?? 'Document'}</Muted>
                    </View>
                    <Pill kind={STATUS_PILL[d.status] ?? 'gray'}>{STATUS_LABEL[d.status] ?? d.status}</Pill>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

function prettyType(t: string) {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  h: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.chip,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.orangeBg, borderColor: colors.orangeBorder },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  upbox: {
    borderWidth: 1.5,
    borderColor: colors.orangeBorder,
    borderStyle: 'dashed',
    borderRadius: radius.tile,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(244,122,32,0.04)',
  },
  upText: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  upHint: { fontSize: 11.5, color: colors.textMuted },
  infoline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 12,
    backgroundColor: 'rgba(244,122,32,0.05)',
    borderWidth: 1,
    borderColor: colors.orangeBorder,
    borderRadius: radius.control,
    padding: 12,
  },
  infoText: { flex: 1, fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  sectionLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: -4,
  },
  doc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 11,
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
  },
  docIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.control,
    backgroundColor: colors.orangeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
});
