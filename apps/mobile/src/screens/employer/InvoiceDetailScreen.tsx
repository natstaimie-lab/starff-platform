import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, Pill, Muted, SecHead, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { clientApi } from '@/lib/endpoints';

interface Line {
  id: string;
  description: string;
  hours: string | number;
  rate: string | number;
  amount: string | number;
  timesheet?: {
    candidate?: { firstName: string; lastName: string };
    shift?: { startAt?: string; job?: { title?: string } };
  } | null;
}
interface Invoice {
  id: string;
  number: string;
  status: string;
  periodStart?: string;
  periodEnd?: string;
  subtotal?: string | number;
  vat?: string | number;
  total?: string | number;
  dueDate?: string | null;
  lines?: Line[];
}

const STATUS_PILL: Record<string, any> = {
  PAID: 'green', SENT: 'blue', DRAFT: 'gray', OVERDUE: 'red', VOID: 'gray',
};

export function EmployerInvoiceDetailScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const id = route.params?.id as string;
  const { data, loading, error, reload } = useApi<Invoice>(() => clientApi.invoice(id) as Promise<Invoice>, [id]);

  return (
    <View style={styles.root}>
      <AppBar title={data?.number ?? 'Invoice'} subtitle="Billing detail" onBack={() => nav.goBack()} />
      <ScreenScroll>
        {loading ? (
          <LoadingState />
        ) : error || !data ? (
          <ErrorState message={error ?? 'Invoice not found.'} onRetry={reload} />
        ) : (
          <>
            <Card>
              <View style={styles.headRow}>
                <View>
                  <Text style={styles.number}>{data.number}</Text>
                  <Muted>{period(data)}</Muted>
                </View>
                <Pill kind={STATUS_PILL[data.status] ?? 'gray'}>{pretty(data.status)}</Pill>
              </View>
              {data.dueDate ? (
                <Muted style={{ marginTop: 8 }}>Due {new Date(data.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Muted>
              ) : null}
            </Card>

            <SecHead title="Line items" />
            {(data.lines ?? []).length === 0 ? (
              <Card><EmptyState icon="file-invoice" title="No line items" subtitle="Line items appear once approved timesheets are billed." /></Card>
            ) : (
              <Card tight>
                {(data.lines ?? []).map((l) => {
                  const worker = l.timesheet?.candidate ? `${l.timesheet.candidate.firstName} ${l.timesheet.candidate.lastName}` : null;
                  return (
                    <View key={l.id} style={styles.lineRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.lineTitle}>{l.timesheet?.shift?.job?.title ?? l.description}</Text>
                        <Muted>
                          {worker ? `${worker} · ` : ''}{Number(l.hours).toFixed(1)} hrs × £{Number(l.rate).toFixed(2)}
                        </Muted>
                      </View>
                      <Text style={styles.lineAmount}>£{Number(l.amount).toFixed(2)}</Text>
                    </View>
                  );
                })}
              </Card>
            )}

            <Card tight>
              <TotalRow label="Subtotal" value={data.subtotal} />
              <TotalRow label="VAT" value={data.vat} />
              <TotalRow label="Total" value={data.total} strong />
            </Card>
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

function TotalRow({ label, value, strong }: { label: string; value?: string | number; strong?: boolean }) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, strong && { fontWeight: '800', color: colors.text }]}>{label}</Text>
      <Text style={[styles.totalValue, strong && { color: colors.orange, fontSize: 16 }]}>£{Number(value ?? 0).toFixed(2)}</Text>
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
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  number: { fontSize: 18, fontWeight: '800', color: colors.text },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  lineTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  lineAmount: { fontSize: 14, fontWeight: '800', color: colors.text },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  totalLabel: { fontSize: 13, color: colors.textMuted },
  totalValue: { fontSize: 13, fontWeight: '700', color: colors.text },
});
