import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, Pill, Muted, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { clientApi } from '@/lib/endpoints';

interface Invoice {
  id: string;
  number: string;
  status: string;
  total: string | number;
  periodStart?: string;
  periodEnd?: string;
  dueDate?: string | null;
}

const STATUS_PILL: Record<string, any> = {
  PAID: 'green',
  SENT: 'blue',
  DRAFT: 'gray',
  OVERDUE: 'red',
  VOID: 'gray',
};

/** The company's invoices — GET /client/invoices. */
export function EmployerInvoicesScreen() {
  const nav = useNavigation<any>();
  const { data, loading, error, refreshing, refresh, reload } = useApi<Invoice[]>(
    () => clientApi.invoices() as Promise<Invoice[]>,
    [],
  );
  const invoices = data ?? [];
  const outstanding = invoices
    .filter((i) => i.status === 'SENT' || i.status === 'OVERDUE')
    .reduce((s, i) => s + Number(i.total ?? 0), 0);

  return (
    <View style={styles.root}>
      <AppBar title="Invoices" subtitle="Billing & payments" onBack={() => nav.goBack()} />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : invoices.length === 0 ? (
          <EmptyState
            icon="file-invoice"
            title="No invoices yet"
            subtitle="Invoices appear here once your workers' approved hours are billed."
          />
        ) : (
          <>
            <Card style={{ backgroundColor: colors.navy }}>
              <Text style={styles.outLabel}>Outstanding</Text>
              <Text style={styles.outValue}>£{outstanding.toFixed(2)}</Text>
            </Card>
            {invoices.map((inv) => (
              <Pressable key={inv.id} onPress={() => nav.navigate('InvoiceDetail', { id: inv.id })}>
                <Card tight>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.number}>{inv.number}</Text>
                      <Muted>{period(inv)}</Muted>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={styles.total}>£{Number(inv.total ?? 0).toFixed(2)}</Text>
                      <Pill kind={STATUS_PILL[inv.status] ?? 'gray'}>{pretty(inv.status)}</Pill>
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))}
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

function pretty(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
function period(inv: Invoice) {
  if (!inv.periodStart || !inv.periodEnd) return 'Invoice';
  const f = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${f(inv.periodStart)} – ${f(inv.periodEnd)}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  outLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  outValue: { fontSize: 30, fontWeight: '800', color: '#fff', letterSpacing: -0.5, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  number: { fontSize: 14, fontWeight: '700', color: colors.text },
  total: { fontSize: 14, fontWeight: '800', color: colors.text },
});
