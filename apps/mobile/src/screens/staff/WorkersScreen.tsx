import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, EmptyState, ErrorState, Input, LoadingState, Pill } from '@/components/ui';
import { FilterChips, ListRow } from '@/components/cards';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { staffApi } from '@/lib/endpoints';
import type { StaffCandidate } from '@/lib/types';
import { fullName, titleCase } from '@/screens/staff/format';

const FILTERS = ['All', 'To check', 'New', 'Screening', 'Compliant', 'Active'];

function pendingDocs(c: StaffCandidate) {
  return c.documents.filter((d) => d.status === 'PENDING').length;
}

/** Worker search — GET /candidates, filtered on the device. */
export function StaffWorkersScreen() {
  const nav = useNavigation<any>();
  const { data, loading, error, refreshing, refresh, silentRefresh, reload } = useApi<StaffCandidate[]>(
    () => staffApi.candidates(),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      if (data) void silentRefresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [!!data]),
  );
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');

  const workers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((c) => {
      if (q && !`${fullName(c)} ${c.postcode ?? ''} ${c.phone ?? ''}`.toLowerCase().includes(q)) return false;
      if (filter === 'All') return true;
      if (filter === 'To check') return pendingDocs(c) > 0;
      return c.status === filter.toUpperCase();
    });
  }, [data, query, filter]);

  return (
    <View style={styles.root}>
      <AppBar title="Workers" subtitle={loading ? undefined : `${workers.length} shown`} />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        <Input value={query} onChangeText={setQuery} placeholder="Search name, postcode or phone" autoCorrect={false} />
        <View style={{ marginVertical: 10 }}>
          <FilterChips items={FILTERS} value={filter} onChange={setFilter} />
        </View>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : workers.length === 0 ? (
          <EmptyState icon="search-off" title="No workers found" subtitle="Try a different search or filter." />
        ) : (
          <Card tight>
            {workers.map((c, i) => {
              const pending = pendingDocs(c);
              return (
                <ListRow
                  key={c.id}
                  title={fullName(c)}
                  subtitle={[c.city, c.postcode].filter(Boolean).join(' · ') || titleCase(c.status)}
                  onPress={() => nav.navigate('WorkerDetail', { id: c.id })}
                  right={pending ? <Pill kind="amber">{`${pending} to check`}</Pill> : undefined}
                  last={i === workers.length - 1}
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
