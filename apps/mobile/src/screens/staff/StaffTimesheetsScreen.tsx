/**
 * Staff timesheet review — GET /timesheets?status=SUBMITTED, PATCH
 * /timesheets/:id/approve | reject. Same workflow as the web Timesheets page;
 * every approval/rejection is an explicit tap and confirmed first.
 */
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Muted, Pill } from '@/components/ui';
import { Avatar, Segmented } from '@/components/cards';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { staffApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api';
import type { StaffTimesheet } from '@/lib/types';
import { initials, shortDate, timeOf, titleCase } from './format';

type Filter = 'SUBMITTED' | 'APPROVED' | 'REJECTED';
const PILL: Record<string, 'amber' | 'green' | 'red' | 'gray' | 'blue'> = {
  SUBMITTED: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
  INVOICED: 'blue',
  PAID: 'green',
};

export function StaffTimesheetsScreen() {
  const [filter, setFilter] = useState<Filter>('SUBMITTED');
  const { data, loading, error, refreshing, refresh, reload } = useApi<StaffTimesheet[]>(
    () => staffApi.timesheets(filter),
    [filter],
  );
  const [acting, setActing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const run = async (id: string, fn: () => Promise<unknown>, done: string) => {
    setActing(id);
    try {
      await fn();
      setRejecting(null);
      setReason('');
      Alert.alert(done);
      reload();
    } catch (err) {
      Alert.alert('Something went wrong', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setActing(null);
    }
  };

  const approve = (t: StaffTimesheet, name: string) =>
    Alert.alert('Approve timesheet?', `${name} · ${hours(t)} hrs`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => run(t.id, () => staffApi.approveTimesheet(t.id), 'Timesheet approved') },
    ]);

  const reject = (t: StaffTimesheet) =>
    run(t.id, () => staffApi.rejectTimesheet(t.id, reason.trim() || undefined), 'Timesheet rejected');

  const list = data ?? [];

  return (
    <View style={styles.root}>
      <AppBar title="Timesheets" subtitle={loading ? undefined : `${list.length} ${titleCase(filter).toLowerCase()}`} />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        <Segmented<Filter>
          options={[
            { key: 'SUBMITTED', label: 'To review' },
            { key: 'APPROVED', label: 'Approved' },
            { key: 'REJECTED', label: 'Rejected' },
          ]}
          value={filter}
          onChange={setFilter}
        />
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : list.length === 0 ? (
          <EmptyState icon="clock" title="Nothing here" subtitle={filter === 'SUBMITTED' ? 'No timesheets are waiting for review.' : undefined} />
        ) : (
          list.map((t) => {
            const name = `${t.candidate?.firstName ?? ''} ${t.candidate?.lastName ?? ''}`.trim() || 'Worker';
            const s = t.shift;
            return (
              <Card key={t.id} tight>
                <View style={styles.row}>
                  <Avatar initials={initials(name)} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{name}</Text>
                    <Muted>
                      {s?.job?.title ?? 'Shift'}
                      {s?.job?.client?.name ? ` · ${s.job.client.name}` : ''}
                    </Muted>
                  </View>
                  <Pill kind={PILL[t.status] ?? 'gray'}>{titleCase(t.status)}</Pill>
                </View>
                <View style={styles.facts}>
                  <Fact label="Date" value={shortDate(s?.startAt)} />
                  <Fact label="Rostered" value={s ? `${timeOf(s.startAt)}–${timeOf(s.endAt)}` : '—'} />
                  <Fact label="Clocked" value={t.clockIn ? `${timeOf(t.clockIn)}–${timeOf(t.clockOut)}` : '—'} />
                  <Fact label="Hours" value={hours(t)} />
                </View>
                {t.status === 'SUBMITTED' ? (
                  rejecting === t.id ? (
                    <View style={{ marginTop: 10, gap: 8 }}>
                      <Input value={reason} onChangeText={setReason} placeholder="Reason (saved on the timesheet)" multiline />
                      <View style={styles.btns}>
                        <Button title="Cancel" kind="ghost" onPress={() => { setRejecting(null); setReason(''); }} style={{ flex: 1 }} />
                        <Button title="Reject" onPress={() => reject(t)} loading={acting === t.id} style={{ flex: 1, backgroundColor: colors.error }} />
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.btns, { marginTop: 10 }]}>
                      <Button title="Reject" kind="ghost" onPress={() => setRejecting(t.id)} disabled={!!acting} style={{ flex: 1 }} />
                      <Button title="Approve" icon="check" onPress={() => approve(t, name)} loading={acting === t.id} style={{ flex: 1 }} />
                    </View>
                  )
                ) : null}
              </Card>
            );
          })
        )}
      </ScreenScroll>
    </View>
  );
}

function hours(t: StaffTimesheet) {
  return Number(t.hoursWorked ?? 0).toFixed(2);
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexBasis: '47%' }}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  factLabel: { fontSize: 11, color: colors.textFaint, fontWeight: '600' },
  factValue: { fontSize: 13, color: colors.text, fontWeight: '600', marginTop: 1 },
  btns: { flexDirection: 'row', gap: 8 },
});
