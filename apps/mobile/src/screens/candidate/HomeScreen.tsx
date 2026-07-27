import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ActionButton, ScreenScroll } from '@/components/Screen';
import {
  Card,
  Metric,
  Pill,
  SecHead,
  CheckRow,
  Button,
  TwoCol,
  LoadingState,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import { Ring } from '@/components/Ring';
import { DestCard, JobCard } from '@/components/cards';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { candidateApi } from '@/lib/endpoints';
import type { CandidateProfile, CandidateStatus, CandidateInvitation, Shift } from '@/lib/types';

const REQUIRED = [
  { type: 'RIGHT_TO_WORK', label: 'Right to work' },
  { type: 'ID', label: 'Identity verified' },
  { type: 'DBS_CHECK', label: 'DBS check' },
  { type: 'CV', label: 'CV on file' },
] as const;

// The admin's clearance decision (COMPLIANT/ACTIVE) is authoritative: once Starff
// has cleared the worker, show the required checks as done even without doc rows
// (a genuinely EXPIRED doc is still flagged). Before clearance, fall back to the
// per-document state so the worker sees what's left to upload.
function docStatus(me: CandidateProfile, type: string, cleared: boolean): 'done' | 'progress' | 'todo' {
  const doc = me.documents?.find((d) => d.type === type);
  if (cleared) return doc && doc.status === 'EXPIRED' ? 'todo' : 'done';
  if (!doc) return 'todo';
  if (doc.status === 'VERIFIED') return 'done';
  if (doc.status === 'PENDING') return 'progress';
  return 'todo';
}

const STATUS_PILL: Record<CandidateStatus, { kind: any; label: string }> = {
  NEW: { kind: 'gray', label: 'New' },
  SCREENING: { kind: 'amber', label: 'In review' },
  COMPLIANT: { kind: 'green', label: 'Cleared to work' },
  ACTIVE: { kind: 'green', label: 'Active' },
  INACTIVE: { kind: 'gray', label: 'Inactive' },
  REJECTED: { kind: 'red', label: 'Action needed' },
};

export function CandidateHomeScreen() {
  const nav = useNavigation<any>();
  const { data: me, loading, error, refreshing, refresh, reload } = useApi(
    () => candidateApi.me(),
    [],
  );
  const offers = useApi<CandidateInvitation[]>(() => candidateApi.invitations(), []);

  if (loading) return <Wrap><LoadingState label="Loading your dashboard…" /></Wrap>;
  if (error || !me) return <Wrap><ErrorState message={error ?? 'No profile found.'} onRetry={reload} /></Wrap>;

  const cleared = me.status === 'COMPLIANT' || me.status === 'ACTIVE';
  const doneCount = REQUIRED.filter((r) => docStatus(me, r.type, cleared) === 'done').length;
  const compliancePct = Math.round((doneCount / REQUIRED.length) * 100);
  const pending = REQUIRED.length - doneCount;

  const now = Date.now();
  const upcoming = (me.shifts ?? [])
    .filter((s) => new Date(s.startAt).getTime() >= now && s.status !== 'CANCELLED')
    .sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
  const nextShift = upcoming[0];
  const hoursThisWeek = (me.timesheets ?? []).reduce((sum, t) => sum + Number(t.hoursWorked ?? 0), 0);
  const statusPill = STATUS_PILL[me.status] ?? STATUS_PILL.NEW;
  // Pending shift offers awaiting the worker's response.
  const matched = (offers.data ?? []).filter((iv) => iv.status === 'INVITED').slice(0, 3);

  return (
    <View style={styles.root}>
      <AppBar
        brand
        eyebrow="Welcome back"
        title={`${me.firstName} ${me.lastName}`.trim()}
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <ActionButton icon="message" onPress={() => nav.navigate('Messages')} />
            <ActionButton icon="bell" onPress={() => nav.navigate('Notifications')} />
          </View>
        }
      />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        <TwoCol>
          <Metric label="Compliance" value={`${compliancePct}%`} valueColor={compliancePct === 100 ? colors.success : colors.orange} delta={cleared ? 'Cleared to work' : pending ? `${pending} pending` : 'Fully vetted'} deltaKind={pending && !cleared ? 'a' : ''} />
          <Metric label="Upcoming shifts" value={upcoming.length} delta={nextShift ? 'Next this week' : 'None booked'} deltaKind={nextShift ? '' : 'a'} />
          <Metric label="Hours logged" value={hoursThisWeek.toFixed(1)} delta="This period" />
          <Metric label="Status" value={<Pill kind={statusPill.kind}>{statusPill.label}</Pill>} />
        </TwoCol>

        <Card tight>
          <SecHead title="Compliance checklist" />
          <View style={styles.compRow}>
            <Ring pct={compliancePct} label={compliancePct} sub="/ 100" />
            <View style={{ flex: 1, gap: 8 }}>
              {REQUIRED.map((r) => (
                <CheckRow key={r.type} status={docStatus(me, r.type, cleared)}>{r.label}</CheckRow>
              ))}
            </View>
          </View>
          <Button
            title={pending ? 'Complete vetting' : 'View vetting'}
            onPress={() => nav.navigate('Profile', { screen: 'Vetting' })}
            style={{ marginTop: 13 }}
          />
        </Card>

        <SecHead
          title="Next shift"
          more="My shifts"
          onMore={() => nav.navigate('Bookings')}
        />
        {nextShift ? (
          <Pressable onPress={() => nav.navigate('Travel')}>
            <DestCard
              label="Your next booking · tap to plan journey"
              labelIcon="building-warehouse"
              title={nextShift.job?.title ?? 'Shift'}
              subtitle={`${nextShift.job?.client?.name ?? 'Starff'}${nextShift.site?.city ? ` · ${nextShift.site.city}` : ''}`}
              rows={[
                { k: 'Starts', v: formatDateTime(nextShift.startAt), accent: true },
                { k: 'Pay', v: `£${Number(nextShift.payRate ?? 0).toFixed(2)}/hr` },
              ]}
            />
          </Pressable>
        ) : (
          <Card>
            <EmptyState icon="briefcase" title="No upcoming shifts" subtitle="Respond to a shift offer and Starff will confirm your booking." />
            <Button title="See shift offers" kind="ghost" onPress={() => nav.navigate('Roles')} />
          </Card>
        )}

        {matched.length > 0 ? (
          <>
            <SecHead title="Shift offers for you" more="See all" onMore={() => nav.navigate('Roles')} />
            {matched.map((iv) => (
              <JobCard
                key={iv.id}
                title={iv.job.title}
                subtitle={[iv.job.sector, iv.job.location].filter(Boolean).join(' · ') || 'Shift opportunity'}
                pill={`£${Number(iv.job.payRate ?? 0).toFixed(2)}/hr`}
                tags={iv.job.startDate ? [formatWhen(iv.job.startDate)] : []}
                onPress={() => nav.navigate('Roles')}
              />
            ))}
          </>
        ) : null}
      </ScreenScroll>
    </View>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      <AppBar eyebrow="Welcome back" title="Home" />
      {children}
    </View>
  );
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function formatWhen(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  compRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginTop: 10 },
});
