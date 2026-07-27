import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, Muted, Button, LoadingState, ErrorState } from '@/components/ui';
import { colors, radius } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { candidateApi } from '@/lib/endpoints';

const DAYS = [
  { n: 1, label: 'Mon' },
  { n: 2, label: 'Tue' },
  { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' },
  { n: 6, label: 'Sat' },
  { n: 0, label: 'Sun' },
];

/** Weekly availability — PUT /me/availability. A selected day means available all day. */
export function AvailabilityScreen() {
  const nav = useNavigation<any>();
  const { data: me, loading, error, reload } = useApi(() => candidateApi.me(), []);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (me?.availability) {
      setSelected(new Set(me.availability.map((a) => a.dayOfWeek)));
    }
  }, [me]);

  const toggle = (n: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      await candidateApi.setAvailability([...selected]);
      Alert.alert('Saved', 'Your availability was updated.');
      reload();
    } catch (err) {
      Alert.alert('Could not save', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppBar title="Availability" subtitle="When can you work?" onBack={() => nav.goBack()} />
      <ScreenScroll>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <>
            <Card>
              <Muted style={{ marginBottom: 12 }}>
                Tap the days you're available. Employers see this when matching shifts.
              </Muted>
              <View style={styles.week}>
                {DAYS.map((d) => {
                  const on = selected.has(d.n);
                  return (
                    <Pressable
                      key={d.n}
                      onPress={() => toggle(d.n)}
                      style={[styles.day, on && styles.dayOn]}
                    >
                      <Text style={[styles.dayLabel, on && { color: colors.orangeDim }]}>
                        {d.label}
                      </Text>
                      <Text style={[styles.dayHours, on ? { color: colors.success } : { color: colors.textFaint }]}>
                        {on ? 'All day' : '—'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
            <Button title="Save availability" onPress={save} loading={saving} />
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  week: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 4,
  },
  dayOn: { backgroundColor: colors.orangeBg, borderColor: colors.orangeBorder },
  dayLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  dayHours: { fontSize: 10, fontWeight: '600' },
});
