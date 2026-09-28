import React, { useState } from 'react';
import { Alert, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ActionButton, ScreenScroll } from '@/components/Screen';
import {
  Card,
  Metric,
  Pill,
  SecHead,
  CheckRow,
  Button,
  Muted,
  TwoCol,
  LoadingState,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import { Ring } from '@/components/Ring';
import { DestCard } from '@/components/cards';
import { Icon } from '@/components/Icon';
import { colors, radius } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { candidateApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api';
import type { CandidateProfile, CandidateStatus, CandidateInvitation, Shift } from '@/lib/types';

const REQUIRED = [
  { type: 'RIGHT_TO_WORK', label: 'Right to work' },
  { type: 'ID', label: 'Identity verified' },
  { type: 'DBS_CHECK', label: 'DBS check' },
  { type: 'CV', label: 'CV on file' },
] as const;

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

const PENDING_STAGES = ['INTERESTED', 'INFO_REQUESTED', 'SUBMITTED_TO_CLIENT', 'CLIENT_ACCEPTED', 'ALTERNATIVE_REQUESTED'];

export function CandidateHomeScreen() {
  const nav = useNavigation<any>();
  const me = useApi(() => candidateApi.me(), []);
  const offers = useApi<CandidateInvitation[]>(() => candidateApi.invitations(), []);
  const [busy, setBusy] = useState<string | null>(null);

  if (me.loading) return <Wrap><LoadingState label="Loading your dashboard…" /></Wrap>;
  if (me.error || !me.data) return <Wrap><ErrorState message={me.error ?? 'No profile found.'} onRetry={me.reload} /></Wrap>;

  const profile = me.data;
  const cleared = profile.status === 'COMPLIANT' || profile.status === 'ACTIVE';
  const doneCount = REQUIRED.filter((r) => docStatus(profile, r.type, cleared) === 'done').length;
  const compliancePct = Math.round((doneCount / REQUIRED.length) * 100);
  const pending = REQUIRED.length - doneCount;

  const now = Date.now();
  const shifts = profile.shifts ?? [];
  const submittedShiftIds = new Set((profile.timesheets ?? []).map((t) => t.shift?.id).filter(Boolean) as string[]);

  const upcoming = shifts
    .filter((s) => new Date(s.startAt).getTime() >= now && s.status !== 'CANCELLED' && !s.checkOutAt)
    .sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));

  const activeShifts = shifts.filter((s) => {
    if (s.status === 'CANCELLED' || s.checkOutAt) return false;
    return !!s.checkInAt || (isToday(s.startAt) && s.status !== 'COMPLETED');
  });
  const activeIds = new Set(activeShifts.map((s) => s.id));
  const dueTimesheets = shifts.filter((s) => {
    if (s.status === 'CANCELLED' || submittedShiftIds.has(s.id)) return false;
    return s.status === 'COMPLETED' || !!s.checkOutAt || new Date(s.endAt).getTime() < now;
  });
  const nextShift = upcoming.find((s) => !activeIds.has(s.id));

  const invites = offers.data ?? [];
  const offerCards = invites.filter((iv) => iv.status === 'INVITED' || PENDING_STAGES.includes(iv.status));

  const statusPill = STATUS_PILL[profile.status] ?? STATUS_PILL.NEW;

  const respond = async (iv: CandidateInvitation, response: 'INTERESTED' | 'DECLINE') => {
    setBusy(iv.id);
    try {
      await candidateApi.respondInvitation(iv.id, response);
      offers.reload();
    } catch (err) {
      Alert.alert('Could not respond', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const doShift = async (id: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(id);
    try {
      await fn();
      if (done) Alert.alert('Done', done);
      me.reload();
    } catch (err) {
      Alert.alert('Could not do that', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const submitDue = (s: Shift) =>
    Alert.alert('Submit timesheet?', `Submit your hours for ${s.job?.title ?? 'this shift'}? Starff will review and approve them.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Submit', onPress: () => doShift(s.id, () => candidateApi.submitTimesheet(s.id, {}), 'Timesheet submitted for approval.') },
    ]);

  // Compliance card — rendered at the top when checks are pending (an action),
  // otherwise tucked at the bottom as a passive "you're cleared" glance.
  const complianceCard = (top: boolean) => (
    <Card tight style={top ? styles.complianceTop : undefined}>
      <SecHead title={top ? 'Complete your vetting' : 'Compliance checklist'} />
      {top ? (
        <Muted style={{ marginTop: 4 }}>{pending} check{pending > 1 ? 's' : ''} left before Starff can book you.</Muted>
      ) : null}
      <View style={styles.compRow}>
        <Ring pct={compliancePct} label={compliancePct} sub="/ 100" />
        <View style={{ flex: 1, gap: 8 }}>
          {REQUIRED.map((r) => (
            <CheckRow key={r.type} status={docStatus(profile, r.type, cleared)}>{r.label}</CheckRow>
          ))}
        </View>
      </View>
      <Button title={pending ? 'Complete vetting' : 'View vetting'} onPress={() => nav.navigate('Profile', { screen: 'Vetting' })} style={{ marginTop: 13 }} />
    </Card>
  );

  const nothing = offerCards.length === 0 && activeShifts.length === 0 && !nextShift && dueTimesheets.length === 0;

  return (
    <View style={styles.root}>
      <AppBar
        brand
        eyebrow="Welcome back"
        title={`${profile.firstName} ${profile.lastName}`.trim()}
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <ActionButton icon="message" onPress={() => nav.navigate('Messages')} />
            <ActionButton icon="bell" onPress={() => nav.navigate('Notifications')} />
          </View>
        }
      />
      <ScreenScroll refreshing={me.refreshing} onRefresh={() => { me.refresh(); offers.refresh(); }}>
        {/* 0 — Compliance jumps to the top ONLY while checks are pending */}
        {pending > 0 ? complianceCard(true) : null}

        {/* 1 — Shift offer(s): hero card, swipeable when there's more than one */}
        {offerCards.length > 0 ? (
          <SwipeDeck>
            {offerCards.map((iv) => (
              <ShiftOfferCard
                key={iv.id}
                offer={iv}
                busy={busy === iv.id}
                onAccept={() => respond(iv, 'INTERESTED')}
                onDecline={() => respond(iv, 'DECLINE')}
              />
            ))}
          </SwipeDeck>
        ) : null}

        {/* 2 — Today (check in / out) — its own card */}
        {activeShifts.length > 0 ? (
          <Card tight>
            <SecHead title="Today" />
            <View style={{ marginTop: 4 }}>
              {activeShifts.map((s, i) => (
                <TodayShiftRow
                  key={s.id}
                  shift={s}
                  last={i === activeShifts.length - 1}
                  busy={busy === s.id}
                  onCheckIn={() => doShift(s.id, () => candidateApi.checkInShift(s.id), 'Checked in. Have a great shift!')}
                  onCheckOut={() => doShift(s.id, () => candidateApi.checkOutShift(s.id), 'Checked out. Submit your timesheet when ready.')}
                  onLate={() => doShift(s.id, () => candidateApi.reportLate(s.id), "We've let Starff know you're running late.")}
                />
              ))}
            </View>
          </Card>
        ) : null}

        {/* 3 — Next shift (journey) — its own card */}
        {nextShift ? (
          <>
            <SecHead title="Next shift" more="My shifts" onMore={() => nav.navigate('Bookings')} />
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
          </>
        ) : null}

        {/* 4 — Timesheets due — separate, below next shift, swipeable when several */}
        {dueTimesheets.length > 0 ? (
          <>
            <SecHead title={dueTimesheets.length > 1 ? `${dueTimesheets.length} timesheets due` : 'Timesheet due'} more="All timesheets" onMore={() => nav.navigate('Hours')} />
            <SwipeDeck>
              {dueTimesheets.map((s) => (
                <TimesheetDueCard key={s.id} shift={s} busy={busy === s.id} onSubmit={() => submitDue(s)} />
              ))}
            </SwipeDeck>
          </>
        ) : null}

        {nothing ? (
          <Card>
            <EmptyState icon="briefcase" title="No shifts or offers yet" subtitle="When Starff offers you a shift it'll appear here. Keep your availability and documents up to date." />
            <Button title="See shift offers" kind="ghost" onPress={() => nav.navigate('Roles')} />
          </Card>
        ) : null}

        {/* Glanceable status */}
        <TwoCol>
          <Metric label="Compliance" value={`${compliancePct}%`} valueColor={compliancePct === 100 ? colors.success : colors.orange} delta={cleared ? 'Cleared to work' : pending ? `${pending} pending` : 'Fully vetted'} deltaKind={pending && !cleared ? 'a' : ''} />
          <Metric label="Upcoming shifts" value={upcoming.length} delta={upcoming[0] ? 'Next this week' : 'None booked'} deltaKind={upcoming[0] ? '' : 'a'} />
          <Metric label="Hours logged" value={(profile.timesheets ?? []).reduce((sum, t) => sum + Number(t.hoursWorked ?? 0), 0).toFixed(1)} delta="This period" />
          <Metric label="Status" value={<Pill kind={statusPill.kind}>{statusPill.label}</Pill>} />
        </TwoCol>

        {/* Compliance sits at the bottom once there's nothing to action */}
        {pending === 0 ? complianceCard(false) : null}
      </ScreenScroll>
    </View>
  );
}

// ── Horizontal swipe deck (edge-to-edge, with page dots) ─────────────────────
function SwipeDeck({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  const [active, setActive] = useState(0);
  if (items.length <= 1) return <>{items}</>;

  const W = Dimensions.get('window').width;
  const CARD = W - 46; // leaves ~28px peek of the next card
  const GAP = 12;
  const interval = CARD + GAP;

  return (
    <View style={{ marginHorizontal: -18 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={interval}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 18 }}
        onMomentumScrollEnd={(e) => setActive(Math.round(e.nativeEvent.contentOffset.x / interval))}
      >
        {items.map((c, i) => (
          <View key={i} style={{ width: CARD, marginRight: i < items.length - 1 ? GAP : 0 }}>
            {c}
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {items.map((_, i) => (
          <View key={i} style={[styles.dot, i === active && styles.dotOn]} />
        ))}
      </View>
    </View>
  );
}

// ── Prominent shift-offer card ───────────────────────────────────────────────
function ShiftOfferCard({
  offer,
  busy,
  onAccept,
  onDecline,
}: {
  offer: CandidateInvitation;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const actionable = offer.status === 'INVITED';
  const j = offer.job;
  return (
    <View style={styles.offer}>
      <Text style={styles.offerEyebrow}>{actionable ? 'NEW SHIFT OFFER' : 'SHIFT OFFER'}</Text>
      <Text style={styles.offerTitle}>{j.title}</Text>
      <Text style={styles.offerMeta}>
        {formatOfferWhen(j.startDate, j.endDate)}
        {j.location ? `   ${j.location}` : ''}
      </Text>
      <Text style={styles.offerPay}>£{Number(j.payRate ?? 0).toFixed(2)}<Text style={styles.offerPayUnit}> / hr</Text></Text>

      {actionable ? (
        <View style={styles.offerBtns}>
          <Pressable onPress={onAccept} disabled={busy} style={[styles.offerAccept, busy && { opacity: 0.6 }]}>
            <Text style={styles.offerAcceptText}>{busy ? 'Sending…' : 'Accept'}</Text>
          </Pressable>
          <Pressable onPress={onDecline} disabled={busy} style={styles.offerDecline}>
            <Text style={styles.offerDeclineText}>Decline</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.offerPending}>
          <Icon name="circle-check" size={16} color="#7DD3A8" />
          <Text style={styles.offerPendingText}>
            {offer.status === 'CLIENT_ACCEPTED' ? 'Accepted — Starff is confirming your booking.' : "Sent — Starff will confirm your booking."}
          </Text>
        </View>
      )}
      <Text style={styles.offerNote}>Accepting tells Starff you're available — they confirm the booking.</Text>
    </View>
  );
}

// ── Today's shift row (check in / out) ───────────────────────────────────────
function TodayShiftRow({
  shift,
  busy,
  last,
  onCheckIn,
  onCheckOut,
  onLate,
}: {
  shift: Shift;
  busy: boolean;
  last: boolean;
  onCheckIn: () => void;
  onCheckOut: () => void;
  onLate: () => void;
}) {
  const checkedIn = !!shift.checkInAt && !shift.checkOutAt;
  const site = shift.site?.name ?? shift.site?.city ?? shift.job?.client?.name ?? '';
  return (
    <View style={[styles.todayRow, !last && styles.rowBorder]}>
      <View style={styles.todayIcon}><Icon name="clock" size={17} color={colors.orangeDim} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.todayTitle}>{shift.job?.title ?? 'Shift'}</Text>
        <Muted>{[site, `${formatTime(shift.startAt)} start`].filter(Boolean).join(' · ')}</Muted>
        {!checkedIn ? (
          <Pressable onPress={onLate} disabled={busy} hitSlop={6}><Text style={styles.lateLink}>Running late?</Text></Pressable>
        ) : null}
      </View>
      {checkedIn ? (
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Pill kind="green">Checked in</Pill>
          <Button title={busy ? '…' : 'Check out'} kind="ghost" onPress={onCheckOut} loading={busy} style={styles.todayBtn} />
        </View>
      ) : (
        <Button title={busy ? '…' : 'Check in'} onPress={onCheckIn} loading={busy} style={styles.todayBtn} />
      )}
    </View>
  );
}

// ── Timesheet-due card (stands alone in a swipe deck) ────────────────────────
function TimesheetDueCard({ shift, busy, onSubmit }: { shift: Shift; busy: boolean; onSubmit: () => void }) {
  const hrs = Math.max(0, (+new Date(shift.endAt) - +new Date(shift.startAt)) / 3600000 - (shift.breakMinutes ?? 0) / 60);
  const pay = hrs * Number(shift.payRate ?? 0);
  return (
    <Card tight style={styles.tsCard}>
      <View style={styles.tsHead}>
        <View style={styles.tsIcon}><Icon name="clock" size={18} color={colors.warning} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.tsLabel}>Timesheet due</Text>
          <Muted>{shift.job?.title ?? 'Shift'} · {formatDate(shift.startAt)}</Muted>
        </View>
      </View>
      <View style={styles.tsFigures}>
        <View><Text style={styles.tsFigK}>Hours</Text><Text style={styles.tsFigV}>{hrs.toFixed(1)}</Text></View>
        <View><Text style={styles.tsFigK}>Est. pay</Text><Text style={[styles.tsFigV, { color: colors.orange }]}>£{pay.toFixed(2)}</Text></View>
      </View>
      <Button title={busy ? 'Submitting…' : 'Submit timesheet'} onPress={onSubmit} loading={busy} />
    </Card>
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
function isToday(iso: string) {
  const d = new Date(iso); const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function formatOfferWhen(start: string | null, end: string | null) {
  if (!start) return 'Date to be confirmed';
  const d = formatDate(start);
  const hasTime = new Date(start).getHours() !== 0 || (end ? new Date(end).getHours() !== 0 : false);
  if (hasTime && end) return `${d} · ${formatTime(start)}–${formatTime(end)}`;
  if (hasTime) return `${d} · ${formatTime(start)}`;
  return d;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  compRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginTop: 10 },
  complianceTop: { borderColor: colors.warning },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },

  // Swipe deck dots
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 999, backgroundColor: colors.borderStrong },
  dotOn: { backgroundColor: colors.orange, width: 18 },

  // Offer card
  offer: { backgroundColor: colors.navy, borderRadius: radius.card, padding: 18 },
  offerEyebrow: { color: colors.orange, fontSize: 11.5, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  offerTitle: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  offerMeta: { color: '#B8C4DC', fontSize: 13, marginTop: 6, fontWeight: '600' },
  offerPay: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 12, letterSpacing: -0.5 },
  offerPayUnit: { color: '#A9B6C9', fontSize: 15, fontWeight: '600' },
  offerBtns: { flexDirection: 'row', gap: 11, marginTop: 16 },
  offerAccept: { flex: 1.3, height: 50, borderRadius: radius.control, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  offerAcceptText: { color: colors.navy, fontSize: 15.5, fontWeight: '800' },
  offerDecline: { flex: 1, height: 50, borderRadius: radius.control, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  offerDeclineText: { color: '#E6ECF5', fontSize: 15, fontWeight: '700' },
  offerPending: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, backgroundColor: 'rgba(125,211,168,0.12)', borderRadius: radius.control, padding: 12 },
  offerPendingText: { flex: 1, color: '#D8E7DE', fontSize: 12.5, fontWeight: '600', lineHeight: 17 },
  offerNote: { color: '#7C8DA6', fontSize: 11, marginTop: 12 },

  // Today
  todayRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11 },
  todayIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.orangeBg, alignItems: 'center', justifyContent: 'center' },
  todayTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  todayBtn: { minWidth: 96, height: 38, paddingHorizontal: 14 },
  lateLink: { color: colors.warning, fontSize: 11.5, fontWeight: '700', marginTop: 4 },

  // Timesheet-due card
  tsCard: { gap: 12 },
  tsHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  tsIcon: { width: 40, height: 40, borderRadius: radius.control, backgroundColor: colors.warningBg, alignItems: 'center', justifyContent: 'center' },
  tsLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  tsFigures: { flexDirection: 'row', gap: 28, paddingTop: 4, paddingBottom: 2 },
  tsFigK: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  tsFigV: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2 },
});
