import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, Pill, Muted, Button, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { clientApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api';
import type { ClientSubmission } from '@/lib/types';

const DECIDABLE = ['SUBMITTED_TO_CLIENT', 'CLIENT_ACCEPTED', 'CLIENT_REJECTED', 'ALTERNATIVE_REQUESTED'];
const STATUS_PILL: Record<string, any> = {
  SUBMITTED_TO_CLIENT: 'amber', CLIENT_ACCEPTED: 'green', CLIENT_REJECTED: 'red', ALTERNATIVE_REQUESTED: 'amber', BOOKED: 'green',
};
const STATUS_LABEL: Record<string, string> = {
  SUBMITTED_TO_CLIENT: 'Awaiting decision', CLIENT_ACCEPTED: 'Accepted', CLIENT_REJECTED: 'Rejected', ALTERNATIVE_REQUESTED: 'Alternative requested', BOOKED: 'Booked',
};

/** Candidates Starff has put forward — GET /client/submissions (redacted). */
export function EmployerSubmissionsScreen() {
  const { data, loading, error, refreshing, refresh, reload } = useApi<ClientSubmission[]>(
    () => clientApi.submissions(),
    [],
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const subs = data ?? [];

  const decide = async (s: ClientSubmission, decision: 'ACCEPT' | 'REJECT' | 'ALTERNATIVE') => {
    setBusyId(s.id);
    try {
      await clientApi.decideSubmission(s.id, decision);
      Alert.alert('Thanks', decision === 'ACCEPT' ? 'Accepted. Starff will confirm the booking.' : 'Your decision has been sent to Starff.');
      reload();
    } catch (err) {
      Alert.alert('Could not submit', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const requestReplacement = async (s: ClientSubmission) => {
    setBusyId(s.id);
    try {
      await clientApi.requestReplacement(s.id);
      Alert.alert('Requested', 'Starff has been notified and will arrange a replacement.');
    } catch (err) {
      Alert.alert('Could not request', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.root}>
      <AppBar title="Review candidates" subtitle={loading ? undefined : `${subs.length} put forward`} />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : subs.length === 0 ? (
          <EmptyState icon="users" title="No candidates to review" subtitle="Starff will put forward suitable workers once your request is approved." />
        ) : (
          subs.map((s) => {
            const c = s.candidate;
            const canDecide = DECIDABLE.includes(s.status);
            return (
              <Card key={s.id} tight>
                <View style={styles.head}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{c.firstName} <Text style={styles.ref}>· {c.reference}</Text></Text>
                    <Muted>{c.role} · {s.job.title}</Muted>
                  </View>
                  <Pill kind={STATUS_PILL[s.status] ?? 'gray'}>{STATUS_LABEL[s.status] ?? s.status}</Pill>
                </View>

                <View style={styles.meta}>
                  {c.complianceConfirmed ? <Muted style={styles.ok}>✓ Compliance confirmed</Muted> : null}
                  {c.rating != null ? <Muted>★ {c.rating.toFixed(1)}/5</Muted> : null}
                  {c.travelArea ? <Muted>{c.travelArea}</Muted> : null}
                </View>

                {s.adminSummary ? <Text style={styles.summary}>{s.adminSummary}</Text> : null}
                {c.skills.length > 0 ? <Muted style={styles.line}><Text style={styles.b}>Skills: </Text>{c.skills.join(', ')}</Muted> : null}
                {c.qualifications.length > 0 ? <Muted style={styles.line}><Text style={styles.b}>Qualifications: </Text>{c.qualifications.join(', ')}</Muted> : null}
                {c.availability.length > 0 ? <Muted style={styles.line}><Text style={styles.b}>Available: </Text>{c.availability.join(', ')}</Muted> : null}
                {s.decisionNote ? <Muted style={styles.line}>Your note: {s.decisionNote}</Muted> : null}

                {canDecide ? (
                  <View style={styles.btnRow}>
                    <Button title={busyId === s.id ? '…' : 'Accept'} onPress={() => decide(s, 'ACCEPT')} loading={busyId === s.id} style={styles.grow} />
                    <Button title="Request alternative" kind="ghost" onPress={() => decide(s, 'ALTERNATIVE')} disabled={busyId === s.id} />
                    <Button title="Reject" kind="ghost" onPress={() => decide(s, 'REJECT')} disabled={busyId === s.id} />
                  </View>
                ) : s.status === 'BOOKED' ? (
                  <View style={styles.btnRow}>
                    <Muted style={[styles.ok, styles.grow]}>Confirmed by Starff — see Workers.</Muted>
                    <Button title="Request replacement" kind="ghost" onPress={() => requestReplacement(s)} disabled={busyId === s.id} />
                  </View>
                ) : null}
              </Card>
            );
          })
        )}
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  ref: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 6 },
  ok: { color: colors.success },
  summary: { fontSize: 13, color: colors.text, backgroundColor: colors.surfaceAlt2, borderRadius: 8, padding: 9, marginBottom: 6 },
  line: { marginTop: 2 },
  b: { fontWeight: '700', color: colors.text },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
  grow: { flexGrow: 1 },
});
