import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Button, Card, EmptyState, ErrorState, LoadingState, Muted } from '@/components/ui';
import { Avatar } from '@/components/cards';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { staffApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api';
import type { StaffTimesheet } from '@/lib/types';
import { ReasonModal } from '@/screens/staff/ReasonModal';
import { formatDate, fullName, initials } from '@/screens/staff/format';

/**
 * Timesheet approvals across every client — GET /timesheets?status=SUBMITTED +
 * PATCH /timesheets/:id/{approve,reject}, the same workflow as the admin page.
 */
export function StaffTimesheetsScreen() {
  const { data, loading, error, refreshing, refresh, silentRefresh, reload } = useApi<StaffTimesheet[]>(
    () => staffApi.timesheets('SUBMITTED'),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      if (data) void silentRefresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [!!data]),
  );
  const [acting, setActing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<StaffTimesheet | null>(null);

  const run = async (id: string, action: () => Promise<unknown>) => {
    setActing(id);
    try {
      await action();
      setRejecting(null);
      await silentRefresh();
    } catch (err) {
      Alert.alert('Could not update', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setActing(null);
    }
  };

  const confirmApprove = (t: StaffTimesheet, name: string) =>
    Alert.alert('Approve timesheet?', `${Number(t.hoursWorked ?? 0).toFixed(1)} hours for ${name}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => void run(t.id, () => staffApi.approveTimesheet(t.id)) },
    ]);

  const timesheets = data ?? [];

  return (
    <View style={styles.root}>
      <AppBar
        title="Timesheets"
        subtitle={loading ? undefined : `${timesheets.length} awaiting approval`}
      />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : timesheets.length === 0 ? (
          <EmptyState
            icon="clock"
            title="Nothing to approve"
            subtitle="Timesheets submitted by workers will appear here."
          />
        ) : (
          timesheets.map((t) => {
            const name = t.candidate ? fullName(t.candidate) : 'Worker';
            const job = t.shift?.job;
            return (
              <Card key={t.id} tight>
                <View style={styles.row}>
                  <Avatar initials={initials(name)} tone="orange" size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{name}</Text>
                    <Muted>
                      {job?.title ?? 'Shift'}
                      {job?.client?.name ? ` · ${job.client.name}` : ''}
                    </Muted>
                    <Muted>
                      {Number(t.hoursWorked ?? 0).toFixed(1)} hrs
                      {t.shift?.startAt ? ` · ${formatDate(t.shift.startAt)}` : ''}
                    </Muted>
                  </View>
                </View>
                <View style={styles.actions}>
                  <Button
                    title="Reject"
                    kind="ghost"
                    onPress={() => setRejecting(t)}
                    disabled={acting === t.id}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Approve"
                    onPress={() => confirmApprove(t, name)}
                    loading={acting === t.id}
                    style={{ flex: 1 }}
                  />
                </View>
              </Card>
            );
          })
        )}
      </ScreenScroll>
      <ReasonModal
        visible={!!rejecting}
        title="Reject timesheet"
        hint="Say what's wrong so it can be corrected."
        busy={!!rejecting && acting === rejecting.id}
        onCancel={() => setRejecting(null)}
        onSubmit={(reason) => {
          if (rejecting) void run(rejecting.id, () => staffApi.rejectTimesheet(rejecting.id, reason));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 13, fontWeight: '700', color: colors.text },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
});
