/**
 * Job bookings — GET /jobs, grouped by the workflow stage the admin cares
 * about. Read-only on the phone; review, matching, invites and submissions
 * are explicit actions on the web dashboard.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, EmptyState, ErrorState, LoadingState, Pill } from '@/components/ui';
import { FilterChips, ListRow } from '@/components/cards';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { staffApi } from '@/lib/endpoints';
import type { StaffJob } from '@/lib/types';
import { shortDate, titleCase } from './format';

const GROUPS: Record<string, string[] | null> = {
  'To review': ['SUBMITTED', 'UNDER_REVIEW'],
  Recruiting: ['APPROVED', 'RECRUITING', 'OFFERS_SENT', 'CANDIDATES_SUBMITTED', 'OPEN'],
  Booked: ['PARTIALLY_FILLED', 'FILLED', 'CONFIRMED', 'IN_PROGRESS'],
  Closed: ['COMPLETED', 'CLOSED', 'CANCELLED'],
  All: null,
};

function pillFor(status: string) {
  if (GROUPS['To review']!.includes(status)) return 'amber' as const;
  if (GROUPS.Recruiting!.includes(status)) return 'orange' as const;
  if (GROUPS.Booked!.includes(status)) return 'green' as const;
  return 'gray' as const;
}

export function StaffJobsScreen() {
  const nav = useNavigation<any>();
  const [group, setGroup] = useState('To review');
  const { data, loading, error, refreshing, refresh, reload } = useApi<StaffJob[]>(() => staffApi.jobs(), []);

  const list = useMemo(() => {
    const allowed = GROUPS[group];
    return (data ?? []).filter((j) => !allowed || allowed.includes(j.status));
  }, [data, group]);

  return (
    <View style={styles.root}>
      <AppBar title="Job bookings" subtitle={loading ? undefined : `${list.length} ${group.toLowerCase()}`} onBack={() => nav.goBack()} />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        <FilterChips items={Object.keys(GROUPS)} value={group} onChange={setGroup} />
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : list.length === 0 ? (
          <EmptyState icon="briefcase" title="Nothing in this stage" />
        ) : (
          <Card tight>
            {list.map((j, i) => (
              <ListRow
                key={j.id}
                icon="briefcase"
                title={j.title}
                subtitle={[
                  j.client?.name,
                  j.site?.name ?? j.client?.city,
                  j.startDate ? `starts ${shortDate(j.startDate)}` : null,
                  j.openings ? `${j.openings} opening${j.openings > 1 ? 's' : ''}` : null,
                  j._count?.applications ? `${j._count.applications} applicants` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                right={<Pill kind={pillFor(j.status)}>{titleCase(j.status)}</Pill>}
                last={i === list.length - 1}
              />
            ))}
          </Card>
        )}
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
