import React, { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Button, Card, ErrorState, LoadingState, Muted, Pill, SecHead } from '@/components/ui';
import { ListRow } from '@/components/cards';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { staffApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import type { StaffCandidate, StaffDocument } from '@/lib/types';
import { ReasonModal } from '@/screens/staff/ReasonModal';
import { formatDate, fullName, titleCase } from '@/screens/staff/format';

// The same five checks as the admin dashboard's compliance checklist.
const REQUIRED = [
  { type: 'SELFIE', label: 'Identity photo (selfie)' },
  { type: 'RIGHT_TO_WORK', label: 'Right to Work' },
  { type: 'ID', label: 'Proof of ID' },
  { type: 'DBS_CHECK', label: 'DBS Check' },
  { type: 'CV', label: 'CV / Work History' },
];

const STATUS_PILL = {
  VERIFIED: 'green',
  PENDING: 'amber',
  REJECTED: 'red',
  EXPIRED: 'red',
} as const;

/**
 * One worker's contact details and compliance checks. NI, bank and health
 * details aren't shown on the phone, even to admins; they stay on the web.
 * Opening and deciding on documents is ADMIN only, enforced by the API.
 */
export function StaffWorkerDetailScreen() {
  const nav = useNavigation<any>();
  const { id } = useRoute<any>().params as { id: string };
  const { staffRole } = useAuth();
  const isAdmin = staffRole === 'ADMIN';
  const { data: c, loading, error, refreshing, refresh, silentRefresh, reload } = useApi<StaffCandidate>(
    () => staffApi.candidate(id),
    [id],
  );
  const [acting, setActing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<StaffDocument | null>(null);

  const decide = async (doc: StaffDocument, status: 'VERIFIED' | 'REJECTED', reason?: string) => {
    setActing(doc.id);
    try {
      await staffApi.setDocumentStatus(id, doc.id, status, reason);
      setRejecting(null);
      await silentRefresh();
    } catch (err) {
      Alert.alert('Could not update', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setActing(null);
    }
  };

  const confirmVerify = (doc: StaffDocument, label: string) =>
    Alert.alert('Verify document?', `Confirm you've checked ${label} for ${c ? fullName(c) : 'this worker'}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Verify', onPress: () => void decide(doc, 'VERIFIED') },
    ]);

  const openFile = async (doc: StaffDocument, side?: 'back') => {
    try {
      const { url } = await staffApi.documentUrl(id, doc.id, side);
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert('Could not open', err instanceof ApiError ? err.message : 'Please try again.');
    }
  };

  const renderDoc = (doc: StaffDocument, label: string) => (
    <View key={doc.id} style={styles.doc}>
      <View style={styles.docHead}>
        <Text style={styles.docLabel}>{label}</Text>
        <Pill kind={STATUS_PILL[doc.status as keyof typeof STATUS_PILL] ?? 'gray'}>{titleCase(doc.status)}</Pill>
      </View>
      <Muted>
        Uploaded {formatDate(doc.createdAt)}
        {doc.expiryDate ? ` · Expires ${formatDate(doc.expiryDate)}` : ''}
      </Muted>
      {isAdmin && doc.aiCheckSummary ? (
        <Muted style={styles.note}>
          Automated pre-check ({doc.aiCheckVerdict ?? 'n/a'}): {doc.aiCheckSummary}
        </Muted>
      ) : null}
      {doc.rejectionReason ? <Muted style={styles.note}>Rejected: {doc.rejectionReason}</Muted> : null}
      {isAdmin ? (
        <>
          <View style={styles.actions}>
            <Button title="View" kind="ghost" onPress={() => void openFile(doc)} style={{ flex: 1 }} />
            {doc.backFileUrl ? (
              <Button title="View back" kind="ghost" onPress={() => void openFile(doc, 'back')} style={{ flex: 1 }} />
            ) : null}
          </View>
          {doc.status === 'PENDING' ? (
            <View style={styles.actions}>
              <Button
                title="Reject"
                kind="ghost"
                onPress={() => setRejecting(doc)}
                disabled={acting === doc.id}
                style={{ flex: 1 }}
              />
              <Button
                title="Verify"
                onPress={() => confirmVerify(doc, label)}
                loading={acting === doc.id}
                style={{ flex: 1 }}
              />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );

  const extras = c?.documents.filter((d) => !REQUIRED.some((r) => r.type === d.type)) ?? [];

  return (
    <View style={styles.root}>
      <AppBar
        title={c ? fullName(c) : 'Worker'}
        subtitle={c ? titleCase(c.status) : undefined}
        onBack={() => nav.goBack()}
      />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <LoadingState />
        ) : error || !c ? (
          <ErrorState message={error ?? 'Could not load.'} onRetry={reload} />
        ) : (
          <>
            <Card tight>
              {c.phone ? (
                <ListRow icon="user" title={c.phone} subtitle="Tap to call" onPress={() => void Linking.openURL(`tel:${c.phone}`)} />
              ) : null}
              {c.loginEmail ? (
                <ListRow icon="message" title={c.loginEmail} subtitle="Send a Starff email" onPress={() => nav.navigate('WorkerEmail', { id, firstName: c.firstName, email: c.loginEmail })} />
              ) : null}
              <ListRow
                icon="map-pin"
                title={[c.city, c.postcode].filter(Boolean).join(' · ') || 'No location given'}
                subtitle={c.available === false ? 'Marked unavailable' : 'Available'}
                last
              />
            </Card>

            <SecHead title="Compliance checks" />
            <Card tight>
              {REQUIRED.map((r) => {
                const doc = c.documents.find((d) => d.type === r.type);
                return doc ? (
                  renderDoc(doc, r.label)
                ) : (
                  <View key={r.type} style={styles.doc}>
                    <View style={styles.docHead}>
                      <Text style={styles.docLabel}>{r.label}</Text>
                      <Pill kind="gray">Missing</Pill>
                    </View>
                  </View>
                );
              })}
            </Card>

            {extras.length ? (
              <>
                <SecHead title="Other documents" />
                <Card tight>{extras.map((d) => renderDoc(d, titleCase(d.type)))}</Card>
              </>
            ) : null}
            {!isAdmin ? (
              <Muted style={{ marginTop: 10 }}>Only admins can open documents or decide on them.</Muted>
            ) : null}
          </>
        )}
      </ScreenScroll>
      <ReasonModal
        visible={!!rejecting}
        title="Reject document"
        hint="The worker is sent this reason so they know what to fix."
        busy={!!rejecting && acting === rejecting.id}
        onCancel={() => setRejecting(null)}
        onSubmit={(reason) => {
          if (rejecting) void decide(rejecting, 'REJECTED', reason);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  doc: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 3 },
  docHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  docLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text },
  note: { marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
