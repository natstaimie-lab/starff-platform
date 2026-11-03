/**
 * Staff dashboard — GET /stats/overview + GET /stats/alerts, the same numbers
 * and operational alerts the admin dashboard shows. Read-only: every decision
 * (approve, invite, submit, book) stays an explicit action elsewhere.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ActionButton, ScreenScroll } from '@/components/Screen';
import { Card, ErrorState, LoadingState, Metric, Muted, Pill, SecHead, TwoCol } from '@/components/ui';
import { ListRow } from '@/components/cards';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { staffApi } from '@/lib/endpoints';
import { useAuth } from '@/auth/AuthContext';
import type { OperationalAlert, StaffOverview } from '@/lib/types';
import { money, shortDate, titleCase } from './format';

const ALERT_ICON: Record<string, string> = {
  RUNNING_LATE: 'alarm',
  REPORTED_ABSENT: 'alert-triangle',
  NOT_ACKNOWLEDGED: 'bell',
  NO_CHECK_IN: 'map-pin-check',
  TIMESHEET_OUTSTANDING: 'clock',
  DOC_EXPIRING: 'file-text',
};

export function StaffHomeScreen() {
  const nav = useNavigation<any>();
  const { staffRole, session } = useAuth();
  const { data, loading, error, refreshing, refresh, reload } = useApi(
    async () => {
      const [overview, alerts] = await Promise.all([
        staffApi.overview(),
        staffApi.alerts().catch(() => ({ alerts: [] as OperationalAlert[], counts: {} })),
      ]);
      return { overview, alerts: alerts.alerts ?? [] };
    },
    [],
  );

  const o: Partial<StaffOverview> = data?.overview ?? {};
  const alerts = data?.alerts ?? [];
  const high = alerts.filter((a) => a.severity === 'high').length;

  const attention = [
    { icon: 'clock', label: 'Timesheets to approve', n: o.pendingTimesheets, to: () => nav.navigate('Timesheets') },
    { icon: 'message', label: 'Unread messages', n: o.unreadMessages, to: () => nav.navigate('Inbox') },
    { icon: 'briefcase', label: 'Job requests awaiting review', n: o.jobsAwaitingAdmin, to: () => nav.navigate('Jobs') },
    { icon: 'user', label: 'New registrations', n: o.newCandidates, to: () => nav.navigate('Candidates', { screen: 'CandidatesMain', params: { status: 'NEW' } }) },
    { icon: 'shield-check', label: 'Compliance decisions', n: o.complianceAttention, to: () => nav.navigate('Candidates') },
    { icon: 'calendar', label: 'Upcoming shifts unfilled', n: o.openShifts },
    { icon: 'file-invoice', label: 'Overdue invoices', n: o.overdueInvoices },
  ];

  return (
    <View style={styles.root}>
      <AppBar
        brand
        eyebrow={staffRole === 'ADMIN' ? 'Admin' : 'Recruiter'}
        title="Operations"
        subtitle={session?.user.email ?? undefined}
        right={<ActionButton icon="bell" onPress={() => nav.navigate('More', { screen: 'Notifications' })} />}
      />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <>
            <TwoCol>
              <Metric label="Active workers" value={o.workers ?? 0} delta={`${o.candidates ?? 0} candidates`} />
              <Metric label="Live bookings" value={o.bookings ?? 0} delta={`${o.clients ?? 0} clients`} />
              <Metric
                label="Alerts"
                value={alerts.length}
                valueColor={high ? colors.error : undefined}
                delta={high ? `${high} urgent` : 'None urgent'}
                deltaKind={high ? 'r' : ''}
              />
              {staffRole === 'ADMIN' ? (
                <Metric label="Revenue (paid)" value={money(o.revenue)} delta="All time" />
              ) : (
                <Metric label="Open shifts" value={o.openShifts ?? 0} delta="Need a worker" deltaKind={o.openShifts ? 'a' : ''} />
              )}
            </TwoCol>

            <SecHead title="Needs attention" />
            <Card tight>
              {attention.map((a, i) => (
                <ListRow
                  key={a.label}
                  icon={a.icon}
                  tone={a.n ? 'orange' : 'blue'}
                  title={a.label}
                  onPress={a.to}
                  last={i === attention.length - 1}
                  right={<Pill kind={a.n ? 'amber' : 'gray'}>{String(a.n ?? 0)}</Pill>}
                />
              ))}
            </Card>

            <SecHead title={`Operational alerts${alerts.length ? ` · ${alerts.length}` : ''}`} />
            {alerts.length === 0 ? (
              <Card>
                <Muted>No live alerts — every shift is on track.</Muted>
              </Card>
            ) : (
              <Card tight>
                {alerts.slice(0, 25).map((a, i, arr) => (
                  <ListRow
                    key={`${a.type}-${a.shiftId ?? a.candidateId ?? i}-${i}`}
                    icon={ALERT_ICON[a.type] ?? 'alert-triangle'}
                    tone={a.severity === 'high' ? 'red' : 'amber'}
                    title={a.message}
                    subtitle={[titleCase(a.type), shortDate(a.occurredAt)].filter(Boolean).join(' · ')}
                    onPress={
                      a.candidateId
                        ? () => nav.navigate('Candidates', { screen: 'CandidateDetail', params: { id: a.candidateId }, initial: false })
                        : undefined
                    }
                    last={i === arr.length - 1}
                  />
                ))}
                {alerts.length > 25 ? (
                  <Text style={styles.more}>+{alerts.length - 25} more on the web dashboard</Text>
                ) : null}
              </Card>
            )}
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  more: { fontSize: 12, color: colors.textMuted, paddingVertical: 10, textAlign: 'center' },
});
