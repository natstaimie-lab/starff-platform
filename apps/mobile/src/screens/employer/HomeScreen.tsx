import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ActionButton, ScreenScroll } from '@/components/Screen';
import {
  Card,
  Metric,
  TwoCol,
  SecHead,
  AIBox,
  Button,
  LoadingState,
  ErrorState,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { clientApi } from '@/lib/endpoints';

interface Overview {
  company?: string;
  activeBookings?: number;
  workersOnSiteToday?: number;
  timesheetsPending?: number;
  spendMtd?: number;
}

export function EmployerHomeScreen() {
  const nav = useNavigation<any>();
  const { data, loading, error, refreshing, refresh, reload } = useApi<Overview>(
    () => clientApi.overview() as Promise<Overview>,
    [],
  );

  if (loading)
    return (
      <Wrap>
        <LoadingState label="Loading your dashboard…" />
      </Wrap>
    );

  if (error || !data)
    return (
      <Wrap>
        <ErrorState
          message={
            error ??
            'Your company account is being set up by the Starff team. Please try again shortly.'
          }
          onRetry={reload}
        />
      </Wrap>
    );

  const pending = data.timesheetsPending ?? 0;

  return (
    <View style={styles.root}>
      <AppBar
        brand
        eyebrow="Employer"
        title={data.company ?? 'Your company'}
        right={<ActionButton icon="settings" onPress={() => nav.navigate('Account')} />}
      />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        <TwoCol>
          <Metric label="Active bookings" value={data.activeBookings ?? 0} delta="Open roles" />
          <Metric
            label="Timesheets"
            value={pending}
            valueColor={pending ? colors.warning : colors.success}
            delta={pending ? 'Approve now' : 'All clear'}
            deltaKind={pending ? 'a' : ''}
          />
          <Metric label="On site today" value={data.workersOnSiteToday ?? 0} delta="Workers" />
          <Metric
            label="Spend (month)"
            value={`£${Number(data.spendMtd ?? 0).toLocaleString('en-GB')}`}
            valueColor={colors.text}
          />
        </TwoCol>

        <AIBox
          action={
            pending > 0 ? (
              <Button title="Approve timesheets" onPress={() => nav.navigate('Hours')} />
            ) : undefined
          }
        >
          {pending > 0
            ? `${pending} timesheet${pending > 1 ? 's' : ''} need approval before payroll closes.`
            : 'All timesheets are approved. Post a new role and Starff will match vetted, compliant workers instantly.'}
        </AIBox>

        <SecHead title="Quick actions" />
        <Card tight>
          <Button title="Book staff" icon="plus" onPress={() => nav.navigate('Post')} />
          <View style={{ height: 10 }} />
          <Button
            title={pending ? 'Approve timesheets' : 'View timesheets'}
            kind="ghost"
            icon="clock"
            onPress={() => nav.navigate('Hours')}
          />
        </Card>

        <SecHead title="Manage" />
        <Card tight>
          <Row label="Review candidates" icon="circle-check" onPress={() => nav.navigate('Submissions')} />
          <Row label="Bookings" icon="briefcase" onPress={() => nav.navigate('Bookings')} />
          <Row label="Workers" icon="users" onPress={() => nav.navigate('Talent')} />
          <Row label="Invoices" icon="file-invoice" onPress={() => nav.navigate('Invoices')} />
          <Row label="Messages" icon="message" onPress={() => nav.navigate('Messages')} />
          <Row label="Company setup" icon="building" onPress={() => nav.navigate('Company')} last />
        </Card>
      </ScreenScroll>
    </View>
  );
}

function Row({
  label,
  icon,
  onPress,
  last,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.row, !last && styles.rowBorder]}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={18} color={colors.orangeDim} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ flex: 1 }} />
      <Icon name="chevron-right" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      <AppBar eyebrow="Employer" title="Dashboard" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.orangeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontSize: 13.5, fontWeight: '700', color: colors.text },
});
