import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, Pill, Muted, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { clientApi } from '@/lib/endpoints';

interface Worker {
  id: string;
  name: string;
  status: string;
  city?: string | null;
  role: string;
  shifts: number;
}

const STATUS_PILL: Record<string, any> = {
  COMPLIANT: 'green',
  ACTIVE: 'green',
  SCREENING: 'amber',
  NEW: 'gray',
  REJECTED: 'red',
  INACTIVE: 'gray',
};

/** Workers assigned to the company's shifts — GET /client/workers. */
export function EmployerTalentScreen() {
  const { data, loading, error, refreshing, refresh, reload } = useApi<Worker[]>(
    () => clientApi.workers() as Promise<Worker[]>,
    [],
  );
  const workers = data ?? [];

  return (
    <View style={styles.root}>
      <AppBar
        title="Your workers"
        subtitle={loading ? undefined : `${workers.length} on assignment`}
      />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : workers.length === 0 ? (
          <EmptyState
            icon="users"
            title="No workers yet"
            subtitle="Post a role and Starff will match vetted workers to your bookings."
          />
        ) : (
          workers.map((w) => (
            <Card key={w.id} tight>
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(w.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{w.name}</Text>
                  <Muted>
                    {w.role}
                    {w.city ? ` · ${w.city}` : ''} · {w.shifts} shift{w.shifts > 1 ? 's' : ''}
                  </Muted>
                </View>
                <Pill kind={STATUS_PILL[w.status] ?? 'gray'}>{pretty(w.status)}</Pill>
              </View>
            </Card>
          ))
        )}
      </ScreenScroll>
    </View>
  );
}

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
function pretty(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: colors.orangeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '700', color: colors.orangeDim },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
});
