/**
 * Candidate pipeline — GET /candidates?status=. Search is client-side over the
 * newest 200 (the list route has no text search); the web dashboard remains
 * the place for bulk work.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, EmptyState, ErrorState, Input, LoadingState, Pill } from '@/components/ui';
import { FilterChips, ListRow } from '@/components/cards';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { staffApi } from '@/lib/endpoints';
import type { CandidateStatus, StaffCandidate } from '@/lib/types';
import { titleCase } from './format';

const FILTERS: { label: string; status?: CandidateStatus }[] = [
  { label: 'All' },
  { label: 'New', status: 'NEW' },
  { label: 'Screening', status: 'SCREENING' },
  { label: 'Compliant', status: 'COMPLIANT' },
  { label: 'Active', status: 'ACTIVE' },
  { label: 'Inactive', status: 'INACTIVE' },
  { label: 'Rejected', status: 'REJECTED' },
];

export const STATUS_PILL: Record<string, 'gray' | 'amber' | 'green' | 'blue' | 'red' | 'orange'> = {
  NEW: 'orange',
  SCREENING: 'amber',
  COMPLIANT: 'blue',
  ACTIVE: 'green',
  INACTIVE: 'gray',
  REJECTED: 'red',
};

export function StaffCandidatesScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const initial = FILTERS.find((f) => f.status === route.params?.status)?.label ?? 'All';
  const [filter, setFilter] = useState(initial);
  const [q, setQ] = useState('');

  // Follow a status passed in from the dashboard after first mount, too.
  React.useEffect(() => {
    const f = FILTERS.find((x) => x.status === route.params?.status);
    if (f) setFilter(f.label);
  }, [route.params?.status]);

  const status = FILTERS.find((f) => f.label === filter)?.status;
  const { data, loading, error, refreshing, refresh, reload } = useApi<StaffCandidate[]>(
    () => staffApi.candidates({ status, take: 200 }),
    [status],
  );

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = data ?? [];
    if (!needle) return rows;
    return rows.filter((c) =>
      [c.firstName, c.lastName, c.headline, c.city, c.postcode, c.phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [data, q]);

  return (
    <View style={styles.root}>
      <AppBar title="Candidates" subtitle={loading ? undefined : `${list.length} shown`} />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        <Input value={q} onChangeText={setQ} placeholder="Search name, role, town, postcode…" autoCorrect={false} />
        <FilterChips items={FILTERS.map((f) => f.label)} value={filter} onChange={setFilter} />
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : list.length === 0 ? (
          <EmptyState icon="users" title="No candidates match" />
        ) : (
          <Card tight>
            {list.map((c, i) => {
              const pending = (c.documents ?? []).filter((d) => d.status === 'PENDING').length;
              return (
                <ListRow
                  key={c.id}
                  icon="user"
                  title={`${c.firstName} ${c.lastName}`.trim()}
                  subtitle={[c.headline, c.city || c.postcode, pending ? `${pending} doc${pending > 1 ? 's' : ''} to check` : null]
                    .filter(Boolean)
                    .join(' · ')}
                  right={<Pill kind={STATUS_PILL[c.status] ?? 'gray'}>{titleCase(c.status)}</Pill>}
                  onPress={() => nav.navigate('CandidateDetail', { id: c.id })}
                  last={i === list.length - 1}
                />
              );
            })}
          </Card>
        )}
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
