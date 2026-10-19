import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import {
  Card,
  Button,
  Muted,
  LoadingState,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import { colors, radius } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { candidateApi } from '@/lib/endpoints';
import type { Shift } from '@/lib/types';

/**
 * Submit hours for a completed shift — POST /me/timesheets/:shiftId.
 * Mirrors the web portal: the worker confirms the shift's scheduled hours
 * (the API records them from the shift itself), so what's submitted here is
 * exactly what shows in the portal and the admin dashboard. No manual time
 * entry — one tap per shift.
 */
export function AddHoursScreen() {
  const nav = useNavigation<any>();
  const { data: me, loading, error, reload } = useApi(() => candidateApi.me(), []);
  const [saving, setSaving] = useState<string | null>(null);

  // Completed/past shifts that don't already have a timesheet.
  const eligible: Shift[] = useMemo(() => {
    const submittedShiftIds = new Set(
      (me?.timesheets ?? []).map((t) => t.shift?.id).filter(Boolean) as string[],
    );
    const now = Date.now();
    return (me?.shifts ?? []).filter(
      (s) =>
        !submittedShiftIds.has(s.id) &&
        (s.status === 'COMPLETED' || new Date(s.endAt).getTime() < now),
    );
  }, [me]);

  async function submit(id: string) {
    setSaving(id);
    try {
      await candidateApi.submitTimesheet(id, {});
      Alert.alert('Submitted', 'Your hours were sent to Starff for approval.');
      await reload();
    } catch (e) {
      Alert.alert('Could not submit', (e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <View style={styles.root}>
      <AppBar title="Submit hours" subtitle="Confirm the hours for a completed shift" onBack={() => nav.goBack()} />
      <ScreenScroll refreshing={false} onRefresh={reload}>
        {loading ? (
          <LoadingState label="Loading your shifts…" />
        ) : error || !me ? (
          <ErrorState message={error ?? 'No profile.'} onRetry={reload} />
        ) : eligible.length === 0 ? (
          <EmptyState
            title="Nothing to submit"
            subtitle="Once a booked shift finishes it appears here. Just tap Submit to send the hours for approval."
          />
        ) : (
          eligible.map((s) => (
            <Card key={s.id}>
              <Text style={styles.title}>{s.job?.title ?? 'Shift'}</Text>
              <Muted>{s.job?.client?.name ? `${s.job.client.name} · ` : ''}{formatDate(s.startAt)}</Muted>

              <View style={styles.rows}>
                <Row k="Scheduled" v={`${hhmm(s.startAt)} – ${hhmm(s.endAt)}`} />
                {s.breakMinutes ? <Row k="Break" v={`${s.breakMinutes} mins`} /> : null}
                <View style={styles.total}>
                  <Text style={styles.totalLabel}>Hours to submit</Text>
                  <Text style={styles.totalValue}>{hoursFor(s).toFixed(2)} hrs</Text>
                </View>
              </View>

              <Button
                title="Submit for approval"
                onPress={() => submit(s.id)}
                loading={saving === s.id}
                disabled={!!saving}
                style={{ marginTop: 12 }}
              />
            </Card>
          ))
        )}
      </ScreenScroll>
    </View>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowK}>{k}</Text>
      <Text style={styles.rowV}>{v}</Text>
    </View>
  );
}

// Same calculation the API uses: scheduled span minus the break.
function hoursFor(s: Shift) {
  const mins = (new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / 60000 - (s.breakMinutes ?? 0);
  return Math.max(0, Math.round((mins / 60) * 100) / 100);
}

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 15, fontWeight: '800', color: colors.text },
  rows: { marginTop: 12, gap: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowK: { fontSize: 13.5, color: colors.textMuted },
  rowV: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 11, marginTop: 4 },
  totalLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  totalValue: { fontSize: 18, fontWeight: '800', color: colors.orange },
});
