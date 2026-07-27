import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, Muted, SecHead, Button, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { candidateApi } from '@/lib/endpoints';

/**
 * Earnings view derived from approved timesheets × the shift pay rate. Figures
 * marked "estimate" — final net pay comes from payroll (a future integration;
 * PDF payslips are a Stage-6+ addition).
 */
export function PayrollScreen() {
  const nav = useNavigation<any>();
  const { data: me, loading, error, reload, refreshing, refresh } = useApi(
    () => candidateApi.me(),
    [],
  );

  const approved = (me?.timesheets ?? []).filter(
    (t) => t.status === 'APPROVED' || t.status === 'INVOICED' || t.status === 'PAID',
  );
  const basic = approved.reduce(
    (sum, t) => sum + Number(t.hoursWorked ?? 0) * Number(t.shift?.payRate ?? 0),
    0,
  );
  const holiday = basic * 0.1207;
  const gross = basic + holiday;
  const tax = gross * 0.12;
  const ni = gross * 0.1;
  const net = gross - tax - ni;

  return (
    <View style={styles.root}>
      <AppBar title="Earnings" subtitle="From approved hours" onBack={() => nav.goBack()} />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : approved.length === 0 ? (
          <EmptyState
            icon="coin"
            title="No approved earnings yet"
            subtitle="Once your timesheets are approved, your earnings appear here."
          />
        ) : (
          <>
            <Card style={{ backgroundColor: colors.navy }}>
              <Text style={styles.payLabel}>Estimated net (approved hours)</Text>
              <Text style={styles.payValue}>£{net.toFixed(2)}</Text>
              <Muted style={{ color: '#94A3B8' }}>
                Final pay is confirmed by payroll.
              </Muted>
            </Card>

            <Card tight>
              <SecHead title="Breakdown (estimate)" />
              <Row label={`Basic (${approved.length} timesheet${approved.length > 1 ? 's' : ''})`} value={`£${basic.toFixed(2)}`} />
              <Row label="Holiday pay 12.07%" value={`£${holiday.toFixed(2)}`} />
              <Row label="Income tax (est.)" value={`–£${tax.toFixed(2)}`} negative />
              <Row label="National Insurance (est.)" value={`–£${ni.toFixed(2)}`} negative />
              <Row label="Net (est.)" value={`£${net.toFixed(2)}`} strong />
            </Card>

            <Button
              title="Manage payment details"
              kind="ghost"
              icon="credit-card"
              onPress={() => nav.navigate('Payment')}
            />
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

function Row({
  label,
  value,
  negative,
  strong,
}: {
  label: string;
  value: string;
  negative?: boolean;
  strong?: boolean;
}) {
  return (
    <View style={styles.payrow}>
      <Text style={[styles.rowLabel, strong && { fontWeight: '800', color: colors.text }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.rowValue,
          negative && { color: colors.error },
          strong && { color: colors.orange, fontSize: 15 },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  payLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  payValue: { fontSize: 34, fontWeight: '800', color: '#fff', letterSpacing: -0.5, marginVertical: 6 },
  payrow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontSize: 13, color: colors.textMuted },
  rowValue: { fontSize: 13, fontWeight: '700', color: colors.text },
});
