import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import {
  Card,
  Field,
  Input,
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

/** Submit hours for a completed shift — POST /me/timesheets/:shiftId. */
export function AddHoursScreen() {
  const nav = useNavigation<any>();
  const { data: me, loading, error, reload } = useApi(() => candidateApi.me(), []);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [start, setStart] = useState('07:00');
  const [end, setEnd] = useState('15:30');
  const [breakMins, setBreakMins] = useState('30');
  const [saving, setSaving] = useState(false);

  // Shifts eligible for a timesheet: completed / past and not already submitted.
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

  const hours = useMemo(() => {
    const [a, b] = start.split(':').map(Number);
    const [c, d] = end.split(':').map(Number);
    if ([a, b, c, d].some((n) => Number.isNaN(n))) return 0;
    let mins = c * 60 + d - (a * 60 + b);
    if (mins < 0) mins += 1440;
    mins -= Number(breakMins) || 0;
    return Math.max(0, Math.round((mins / 60) * 4) / 4);
  }, [start, end, breakMins]);

  const submit = async () => {
    if (!shiftId || hours <= 0) return;
    setSaving(true);
    try {
      await candidateApi.submitTimesheet(shiftId, {
        hoursWorked: hours,
        breakMinutes: Number(breakMins) || 0,
      });
      Alert.alert('Submitted', 'Your hours were submitted for approval.');
      nav.goBack();
    } catch (err) {
      Alert.alert('Could not submit', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppBar title="Add hours" subtitle="Submit a completed shift" onBack={() => nav.goBack()} />
      <ScreenScroll>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : eligible.length === 0 ? (
          <EmptyState
            icon="clock"
            title="No shifts to log"
            subtitle="Once a booked shift finishes it appears here to submit hours."
          />
        ) : (
          <>
            <Card>
              <Field label="Shift">
                <View style={{ gap: 8 }}>
                  {eligible.map((s) => {
                    const on = shiftId === s.id;
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => setShiftId(s.id)}
                        style={[styles.shift, on && styles.shiftOn]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.shiftTitle}>{s.job?.title ?? 'Shift'}</Text>
                          <Muted>{formatDate(s.startAt)}</Muted>
                        </View>
                        {on ? <Text style={styles.tick}>✓</Text> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </Field>

              <View style={{ flexDirection: 'row', gap: 11 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Start (HH:MM)">
                    <Input value={start} onChangeText={setStart} placeholder="07:00" />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="End (HH:MM)">
                    <Input value={end} onChangeText={setEnd} placeholder="15:30" />
                  </Field>
                </View>
              </View>
              <Field label="Break (mins)">
                <Input value={breakMins} onChangeText={setBreakMins} keyboardType="number-pad" />
              </Field>

              <View style={styles.summary}>
                <Text style={styles.summaryLabel}>Hours to submit</Text>
                <Text style={styles.summaryValue}>{hours.toFixed(2)} hrs</Text>
              </View>
            </Card>

            <Button
              title="Submit for approval"
              onPress={submit}
              disabled={!shiftId || hours <= 0}
              loading={saving}
            />
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  shift: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radius.control,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  shiftOn: { borderColor: colors.orange, backgroundColor: colors.orangeBg },
  shiftTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  tick: { color: colors.orangeDim, fontWeight: '800', fontSize: 16 },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  summaryLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  summaryValue: { fontSize: 16, fontWeight: '800', color: colors.orange },
});
