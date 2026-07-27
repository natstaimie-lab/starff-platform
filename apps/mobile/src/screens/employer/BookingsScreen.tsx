import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, Pill, Muted, Button, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { clientApi } from '@/lib/endpoints';

interface Booking {
  id: string;
  title: string;
  status: string;
  openings: number;
  site?: string | null;
  filled: number;
  total: number;
}

const STATUS_PILL: Record<string, any> = {
  OPEN: 'amber',
  FILLED: 'green',
  DRAFT: 'gray',
  CLOSED: 'gray',
  CANCELLED: 'red',
};

/** The company's bookings — GET /client/jobs. */
export function EmployerBookingsScreen() {
  const nav = useNavigation<any>();
  const { data, loading, error, refreshing, refresh, reload } = useApi<Booking[]>(
    () => clientApi.jobs() as Promise<Booking[]>,
    [],
  );
  const bookings = data ?? [];

  return (
    <View style={styles.root}>
      <AppBar
        title="Bookings"
        subtitle={loading ? undefined : `${bookings.length} total`}
        onBack={() => nav.goBack()}
      />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : bookings.length === 0 ? (
          <EmptyState
            icon="briefcase"
            title="No bookings yet"
            subtitle="Post your first role to start hiring vetted staff."
          />
        ) : (
          <>
            {bookings.map((b) => (
              <Card key={b.id} tight>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{b.title}</Text>
                    <Muted>
                      {b.site ?? 'No site set'} · {b.filled}/{b.total} filled
                    </Muted>
                  </View>
                  <Pill kind={STATUS_PILL[b.status] ?? 'gray'}>{pretty(b.status)}</Pill>
                </View>
              </Card>
            ))}
            <Button title="Book more staff" icon="plus" onPress={() => nav.navigate('Post')} />
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

function pretty(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 14, fontWeight: '700', color: colors.text },
});
