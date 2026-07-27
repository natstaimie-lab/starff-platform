import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ActionButton, ScreenScroll } from '@/components/Screen';
import { Card, Pill, Muted, SecHead, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { Avatar, WeekStrip } from '@/components/cards';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { candidateApi } from '@/lib/endpoints';
import type { Timesheet, TimesheetStatus } from '@/lib/types';

const TS_PILL: Record<TimesheetStatus, any> = {
  DRAFT: 'gray', SUBMITTED: 'amber', APPROVED: 'green', REJECTED: 'red', INVOICED: 'blue', PAID: 'green',
};
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function CandidateHoursScreen() {
  const nav = useNavigation<any>();
  const { data: me, loading, error, refreshing, refresh, reload } = useApi(() => candidateApi.me(), []);

  const timesheets = me?.timesheets ?? [];
  const totalHours = timesheets.reduce((s, t) => s + Number(t.hoursWorked ?? 0), 0);
  const totalPay = timesheets.reduce((s, t) => s + Number(t.hoursWorked ?? 0) * Number(t.shift?.payRate ?? 0), 0);
  const holiday = totalPay * 0.1207;

  // Build a Mon–Sun strip from timesheet shift dates (bucketed by weekday).
  const byDay = new Map<number, number>();
  for (const t of timesheets) {
    if (!t.shift?.startAt) continue;
    const d = new Date(t.shift.startAt).getDay();
    byDay.set(d, (byDay.get(d) ?? 0) + Number(t.hoursWorked ?? 0));
  }
  const order = [1, 2, 3, 4, 5, 6, 0];
  const todayDow = new Date().getDay();
  const week = order.map((d) => ({ dn: DOW[d], dd: '', hours: byDay.get(d) ?? 0, today: d === todayDow }));

  return (
    <View style={styles.root}>
      <AppBar
        title="My timesheets"
        subtitle="Hours & approval status"
        right={<ActionButton icon="plus" onPress={() => nav.navigate('AddHours')} />}
      />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : timesheets.length === 0 ? (
          <EmptyState icon="clock" title="No timesheets yet" subtitle="Once you complete a shift you can submit your hours here for approval." />
        ) : (
          <>
            <WeekStrip days={week} />

            <Card tight>
              <SecHead title="This period" />
              <View style={{ marginTop: 8 }}>
                {timesheets.map((t: Timesheet) => (
                  <View key={t.id} style={styles.tsRow}>
                    <Avatar initials={initials(t.shift?.job?.client?.name)} tone="orange" size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.role}>{t.shift?.job?.title ?? 'Shift'}</Text>
                      <Muted>{t.shift?.startAt ? formatDate(t.shift.startAt) : ''}</Muted>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 3 }}>
                      <Text style={styles.hrs}>{Number(t.hoursWorked ?? 0).toFixed(1)} hrs</Text>
                      <Pill kind={TS_PILL[t.status] ?? 'gray'}>{label(t.status)}</Pill>
                    </View>
                  </View>
                ))}
              </View>
            </Card>

            <Card tight>
              <PayRow label="Hours logged" value={`${totalHours.toFixed(1)} hrs`} />
              <PayRow label="Est. pay" value={`£${totalPay.toFixed(2)}`} />
              <PayRow label="Holiday pay 12.07%" value={`£${holiday.toFixed(2)}`} />
              <PayRow label="Total gross" value={`£${(totalPay + holiday).toFixed(2)}`} strong />
            </Card>
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

function PayRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.payRow}>
      <Text style={[styles.payLabel, strong && { fontWeight: '800', color: colors.text }]}>{label}</Text>
      <Text style={[styles.payValue, strong && { color: colors.orange, fontSize: 15 }]}>{value}</Text>
    </View>
  );
}

function initials(name?: string | null) {
  if (!name) return 'S';
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}
function label(s: TimesheetStatus) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tsRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  role: { fontSize: 13, fontWeight: '700', color: colors.text },
  hrs: { fontSize: 13, fontWeight: '700', color: colors.orange },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  payLabel: { fontSize: 13, color: colors.textMuted },
  payValue: { fontSize: 13, fontWeight: '700', color: colors.text },
});
