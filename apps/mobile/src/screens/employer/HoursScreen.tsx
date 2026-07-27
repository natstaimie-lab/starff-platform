import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import {
  Card,
  Pill,
  Button,
  Muted,
  Metric,
  TwoCol,
  LoadingState,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import { Avatar } from '@/components/cards';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { clientApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api';
import type { Timesheet } from '@/lib/types';

/**
 * Timesheet approvals — GET /client/timesheets + PATCH /client/timesheets/:id/
 * approve. Approving here updates the shared timesheet approval workflow the
 * admin dashboard and payroll see.
 */
export function EmployerHoursScreen() {
  const { data, loading, error, refreshing, refresh, reload } = useApi<Timesheet[]>(
    () => clientApi.timesheets(),
    [],
  );
  const [acting, setActing] = useState<string | null>(null);

  const approve = async (t: Timesheet) => {
    setActing(t.id);
    try {
      await clientApi.approveTimesheet(t.id);
      Alert.alert('Approved', 'The timesheet has been approved.');
      reload();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not approve.';
      Alert.alert('Could not approve', message);
    } finally {
      setActing(null);
    }
  };

  const timesheets = data ?? [];
  const pending = timesheets.filter((t) => t.status === 'SUBMITTED');

  return (
    <View style={styles.root}>
      <AppBar
        title="Approvals"
        subtitle={loading ? undefined : `${pending.length} awaiting approval`}
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
            subtitle="Submitted worker timesheets will appear here for your approval."
          />
        ) : (
          <>
            <TwoCol>
              <Metric
                label="Pending"
                value={pending.length}
                valueColor={pending.length ? colors.warning : colors.success}
                delta={pending.length ? 'Approve now' : 'All clear'}
                deltaKind={pending.length ? 'a' : ''}
              />
              <Metric
                label="Total hours"
                value={timesheets.reduce((s, t) => s + Number(t.hoursWorked ?? 0), 0).toFixed(1)}
                delta="Awaiting"
              />
            </TwoCol>
            {timesheets.map((t) => {
              const c = (t as any).candidate;
              const name = `${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim() || 'Worker';
              return (
                <Card key={t.id} tight>
                  <View style={styles.row}>
                    <Avatar initials={initials(name)} tone="orange" size={38} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.role}>{name}</Text>
                      <Muted>
                        {t.shift?.job?.title ?? 'Shift'} · {Number(t.hoursWorked ?? 0).toFixed(1)} hrs
                        {t.shift?.startAt ? ` · ${formatDate(t.shift.startAt)}` : ''}
                      </Muted>
                    </View>
                    <Pill kind="amber">{label(t.status)}</Pill>
                  </View>
                  {t.status === 'SUBMITTED' ? (
                    <Button
                      title={acting === t.id ? 'Approving…' : 'Approve'}
                      onPress={() => approve(t)}
                      loading={acting === t.id}
                      style={{ marginTop: 10 }}
                    />
                  ) : null}
                </Card>
              );
            })}
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

function label(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() || 'W';
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  role: { fontSize: 13, fontWeight: '700', color: colors.text },
});
