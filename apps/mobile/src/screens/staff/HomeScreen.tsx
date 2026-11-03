import React, { useCallback } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ActionButton, AppBar, ScreenScroll } from '@/components/Screen';
import { Button, Card, ErrorState, LoadingState, Metric, Muted, Pill, SecHead, TwoCol } from '@/components/ui';
import { ListRow } from '@/components/cards';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { staffApi } from '@/lib/endpoints';
import { ADMIN_DASHBOARD_URL, formatDateTime, fullName } from '@/screens/staff/format';

/**
 * Staff dashboard — GET /stats/overview + /stats/workflow, the same numbers as
 * the admin dashboard. Job approval and booking stay on the web, where the full
 * matching and submission screens live; here they're shown so nothing is missed.
 */
export function StaffHomeScreen() {
  const nav = useNavigation<any>();
  const { data, loading, error, refreshing, refresh, silentRefresh, reload } = useApi(
    () => Promise.all([staffApi.overview(), staffApi.workflow()]),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      if (data) void silentRefresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [!!data]),
  );

  const overview = data?.[0];
  const workflow = data?.[1];
  const openWeb = () => void Linking.openURL(ADMIN_DASHBOARD_URL);
  const openWorker = (id: string) =>
    nav.navigate('Workers', { screen: 'WorkerDetail', params: { id }, initial: false });

  return (
    <View style={styles.root}>
      <AppBar
        brand
        subtitle="Staff"
        right={<ActionButton icon="settings" onPress={() => nav.navigate('Account')} />}
      />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <LoadingState />
        ) : error || !overview || !workflow ? (
          <ErrorState message={error ?? 'Could not load.'} onRetry={reload} />
        ) : (
          <>
            <TwoCol>
              <Metric
                label="Timesheets to approve"
                value={overview.pendingTimesheets}
                delta={overview.pendingTimesheets ? 'Needs action' : 'All clear'}
                deltaKind={overview.pendingTimesheets ? 'a' : ''}
              />
              <Metric
                label="Unread messages"
                value={overview.unreadMessages}
                delta={overview.unreadMessages ? 'Reply' : 'All clear'}
                deltaKind={overview.unreadMessages ? 'a' : ''}
              />
            </TwoCol>
            <TwoCol>
              <Metric
                label="Compliance to check"
                value={overview.complianceAttention}
                delta={overview.complianceAttention ? 'Needs action' : 'All clear'}
                deltaKind={overview.complianceAttention ? 'a' : ''}
              />
              <Metric
                label="Jobs awaiting approval"
                value={overview.jobsAwaitingAdmin}
                delta={overview.jobsAwaitingAdmin ? 'Needs action' : 'All clear'}
                deltaKind={overview.jobsAwaitingAdmin ? 'a' : ''}
              />
            </TwoCol>

            {workflow.reliabilityConcerns.length ? (
              <>
                <SecHead title="Reliability concerns" />
                <Card tight>
                  {workflow.reliabilityConcerns.map((c, i, all) => (
                    <ListRow
                      key={c.candidateId}
                      icon="alert-triangle"
                      tone="red"
                      title={c.name}
                      subtitle={`${c.level.charAt(0)}${c.level.slice(1).toLowerCase()} concern`}
                      onPress={() => openWorker(c.candidateId)}
                      last={i === all.length - 1}
                    />
                  ))}
                </Card>
              </>
            ) : null}

            <SecHead title="Next 7 days" />
            <Card tight>
              {workflow.upcomingShifts.length === 0 ? (
                <Muted>No shifts in the next 7 days.</Muted>
              ) : (
                workflow.upcomingShifts.map((s, i, all) => (
                  <ListRow
                    key={s.id}
                    icon="calendar"
                    tone="blue"
                    title={s.candidate ? fullName(s.candidate) : 'Unassigned'}
                    subtitle={`${s.job.title} · ${s.job.client.name} · ${formatDateTime(s.startAt)}`}
                    last={i === all.length - 1}
                  />
                ))
              )}
            </Card>

            <SecHead title="To action on the web" />
            <Card tight>
              {workflow.awaitingApprovalJobs.map((j) => (
                <ListRow
                  key={j.id}
                  icon="briefcase"
                  title={j.title}
                  subtitle={`${j.client.name} · ${j.openings} needed`}
                  right={<Pill kind="amber">Approve job</Pill>}
                />
              ))}
              {workflow.readyToBook.map((a) => (
                <ListRow
                  key={a.id}
                  icon="circle-check"
                  title={fullName(a.candidate)}
                  subtitle={`${a.job.title} · ${a.job.client.name}`}
                  right={<Pill kind="amber">Confirm booking</Pill>}
                />
              ))}
              <Muted style={styles.webNote}>
                {workflow.awaitingApprovalJobs.length || workflow.readyToBook.length
                  ? 'Approve jobs and confirm bookings in the admin dashboard.'
                  : 'No jobs or bookings are waiting. Matching and booking stay in the admin dashboard.'}
              </Muted>
              <Button title="Open admin dashboard" kind="ghost" onPress={openWeb} style={{ marginTop: 10 }} />
            </Card>
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  webNote: { marginTop: 8, color: colors.textMuted },
});
