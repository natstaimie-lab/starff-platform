import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, Button, Muted, SecHead, AIBox, Pill, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { DestCard, IconTile } from '@/components/cards';
import { Icon } from '@/components/Icon';
import { colors, radius } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { candidateApi } from '@/lib/endpoints';
import type { Shift } from '@/lib/types';

// Route options are typical estimates (no live-traffic API on device).
const ROUTES = [
  { id: 'transit', mode: 'Public transport', icon: 'bus', dur: 45, fare: '~£3.20', sub: 'Bus + short walk', recommended: true },
  { id: 'drive', mode: 'Drive', icon: 'car', dur: 30, fare: '~£4 fuel', sub: 'Fastest by road' },
  { id: 'cycle', mode: 'Cycle', icon: 'bike', dur: 38, fare: 'Free', sub: 'Quiet cycle route' },
] as const;

// Toggleable morning prep steps.
const PREP = [
  { key: 'shower', label: 'Shower & freshen up', mins: 15, icon: 'shower' },
  { key: 'breakfast', label: 'Breakfast', mins: 10, icon: 'coffee' },
  { key: 'dress', label: 'Get ready', mins: 8, icon: 'shirt' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const minus = (d: Date, mins: number) => new Date(d.getTime() - mins * 60000);

export function TravelScreen() {
  const nav = useNavigation<any>();
  const { data: me, loading, error, reload } = useApi(() => candidateApi.me(), []);

  const [mode, setMode] = useState<string>('transit');
  const [early, setEarly] = useState<number>(15);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [tip, setTip] = useState<string | null>(null);
  const [tipBusy, setTipBusy] = useState(false);

  const nextShift: Shift | undefined = useMemo(() => {
    const now = Date.now();
    return (me?.shifts ?? [])
      .filter((s) => new Date(s.startAt).getTime() >= now && s.status !== 'CANCELLED')
      .sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt))[0];
  }, [me]);

  const route = ROUTES.find((r) => r.id === mode) ?? ROUTES[0];
  const prepTotal = PREP.reduce((a, p) => a + (skip.has(p.key) ? 0 : p.mins), 0);

  if (loading)
    return (
      <View style={styles.root}>
        <AppBar title="Plan my journey" onBack={() => nav.goBack()} />
        <LoadingState label="Planning your morning…" />
      </View>
    );
  if (error)
    return (
      <View style={styles.root}>
        <AppBar title="Plan my journey" onBack={() => nav.goBack()} />
        <ErrorState message={error} onRetry={reload} />
      </View>
    );
  if (!nextShift)
    return (
      <View style={styles.root}>
        <AppBar title="Plan my journey" onBack={() => nav.goBack()} />
        <EmptyState icon="map-2" title="No upcoming shift" subtitle="Accept a shift and we'll plan your journey to it." />
      </View>
    );

  const clockIn = new Date(nextShift.startAt);
  const arrive = minus(clockIn, early);
  const leaveHome = minus(arrive, route.dur);
  const wake = minus(leaveHome, prepTotal);
  const dayLabel = clockIn.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  const site = nextShift.site?.name ?? nextShift.site?.city ?? nextShift.job?.client?.name ?? 'the site';

  // Build the chronological timeline.
  const nodes: { time: Date | null; icon: string; label: string; detail: string; kind: string; key?: string }[] = [];
  let run = new Date(wake);
  nodes.push({ time: new Date(run), icon: 'alarm', label: 'Wake up', detail: 'Alarm — time to get moving', kind: 'wake' });
  for (const p of PREP) {
    const off = skip.has(p.key);
    nodes.push({ time: off ? null : new Date(run), icon: p.icon, label: p.label, detail: `${p.mins} min`, kind: 'prep', key: p.key });
    if (!off) run = new Date(run.getTime() + p.mins * 60000);
  }
  nodes.push({ time: new Date(leaveHome), icon: 'door-exit', label: 'Leave home', detail: `${route.mode} · ${route.dur} min door-to-gate`, kind: 'go' });
  nodes.push({ time: new Date(arrive), icon: 'map-pin-check', label: `Arrive at ${site}`, detail: `${early} min before clock-in`, kind: 'arrive' });
  nodes.push({ time: new Date(clockIn), icon: 'clock-play', label: 'Shift starts', detail: nextShift.job?.title ?? 'Your shift', kind: 'shift' });

  const baseTip = `Set your alarm for ${fmt(wake)}. Leaving home at ${fmt(leaveHome)} by ${route.mode.toLowerCase()} gets you to ${site} for ${fmt(arrive)} — ${early} minutes before clock-in.`;

  const askAI = async () => {
    setTipBusy(true);
    setTip(null);
    try {
      const msg = `I have a "${nextShift.job?.title}" shift at ${nextShift.job?.client?.name ?? 'a client'} starting ${fmt(clockIn)} on ${dayLabel}. I'll travel by ${route.mode.toLowerCase()} (~${route.dur} min) and want to arrive ${early} min early. My plan: wake ${fmt(wake)}, leave home ${fmt(leaveHome)}. Give me one short, practical, reassuring tip for this exact morning.`;
      const res = await candidateApi.aiAsk(msg);
      setTip(res.reply || baseTip);
    } catch {
      setTip(baseTip + ' (offline — using your saved plan)');
    } finally {
      setTipBusy(false);
    }
  };

  const setReminder = async () => {
    try {
      const perm = await Notifications.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Notifications off', 'Enable notifications to set a wake-up reminder.');
        return;
      }
      if (wake.getTime() <= Date.now()) {
        Alert.alert('Too soon', "This shift's wake-up time has already passed.");
        return;
      }
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Time to get up — ${nextShift.job?.title ?? 'shift'}`,
          body: `Leave home by ${fmt(leaveHome)} to reach ${site} for ${fmt(clockIn)}.`,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: wake },
      });
      Alert.alert('Reminder set', `We'll wake you at ${fmt(wake)} and re-check nearer the time.`);
    } catch {
      Alert.alert('Could not set reminder', 'Please try again.');
    }
  };

  const toggleSkip = (key: string) =>
    setSkip((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <View style={styles.root}>
      <AppBar title="Plan my journey" subtitle={`${nextShift.job?.title ?? 'Shift'} · ${dayLabel}`} onBack={() => nav.goBack()} />
      <ScreenScroll>
        {/* Destination hero */}
        <DestCard
          label={nextShift.job?.client?.name ?? 'Your booking'}
          labelIcon="building-warehouse"
          title={nextShift.job?.title ?? 'Shift'}
          subtitle={`${site}${nextShift.site?.city ? ` · ${nextShift.site.city}` : ''}`}
          rows={[
            { k: 'Wake', v: fmt(wake) },
            { k: 'Leave home', v: fmt(leaveHome), accent: true },
            { k: 'Clock-in', v: fmt(clockIn) },
          ]}
        />

        {/* AI tip */}
        <AIBox
          label="Starff AI · journey"
          action={
            <Button
              title={tipBusy ? 'Checking…' : 'Re-check with Starff AI'}
              kind="ghost"
              icon="sparkles"
              onPress={askAI}
              loading={tipBusy}
            />
          }
        >
          {tip ?? baseTip}
        </AIBox>

        {/* Arrive-early buffer */}
        <Card tight>
          <View style={styles.rowBetween}>
            <Text style={styles.cardLabel}>Arrive early by</Text>
            <Pill kind="orange">{early} min</Pill>
          </View>
          <View style={styles.seg}>
            {[10, 15, 30].map((v) => (
              <Pressable key={v} onPress={() => setEarly(v)} style={[styles.segBtn, early === v && styles.segOn]}>
                <Text style={[styles.segText, early === v && { color: '#fff' }]}>{v} min</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* Route options */}
        <SecHead title="Choose your route" />
        <View style={{ gap: 9 }}>
          {ROUTES.map((r) => {
            const on = r.id === mode;
            return (
              <Pressable key={r.id} onPress={() => setMode(r.id)} style={[styles.troute, on && styles.trouteOn]}>
                <IconTile name={r.icon} tone="orange" size={40} />
                <View style={{ flex: 1 }}>
                  <View style={styles.trouteTitleRow}>
                    <Text style={styles.trouteTitle}>{r.mode}</Text>
                    {'recommended' in r && r.recommended ? <Pill kind="green">AI pick</Pill> : null}
                  </View>
                  <Muted>{r.fare} · {r.sub}</Muted>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.trouteDur}>{r.dur}</Text>
                  <Text style={styles.trouteMin}>min</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Timeline */}
        <SecHead title="Your morning, minute by minute" />
        <Card tight>
          {nodes.map((n, i) => {
            const off = n.time === null;
            return (
              <View key={i} style={styles.tnode}>
                <Text style={[styles.ttime, off && styles.ttimeMut]}>{n.time ? fmt(n.time) : '—'}</Text>
                <View style={styles.trail}>
                  {i > 0 ? <View style={styles.trailLineTop} /> : null}
                  <View style={[styles.tdot, dotStyle(n.kind), off && { opacity: 0.4 }]}>
                    <Icon name={n.icon} size={12} color={dotColor(n.kind)} />
                  </View>
                  {i < nodes.length - 1 ? <View style={styles.trailLineBottom} /> : null}
                </View>
                <View style={styles.tcard}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tlabel, n.kind === 'go' && { color: colors.orangeDim }, off && styles.tlabelOff]}>{n.label}</Text>
                    <Text style={styles.tdetail}>{n.detail}</Text>
                  </View>
                  {n.kind === 'prep' && n.key ? (
                    <Pressable onPress={() => toggleSkip(n.key!)} style={[styles.prep, !off && styles.prepOn]}>
                      <Icon name={off ? 'plus' : 'check'} size={14} color={off ? colors.textFaint : colors.orangeDim} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </Card>

        <Muted style={{ textAlign: 'center', fontSize: 11 }}>
          Route times are typical estimates. Always allow extra time for delays.
        </Muted>

        <Button title={`Set wake-up reminder · ${fmt(wake)}`} icon="alarm" onPress={setReminder} />
      </ScreenScroll>
    </View>
  );
}

function dotStyle(kind: string) {
  if (kind === 'go' || kind === 'arrive') return { backgroundColor: colors.orange, borderColor: colors.orange };
  if (kind === 'shift') return { backgroundColor: colors.navy, borderColor: colors.navy };
  return { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong };
}
function dotColor(kind: string) {
  if (kind === 'go' || kind === 'arrive' || kind === 'shift') return '#fff';
  return colors.textMuted;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardLabel: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  seg: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.control, padding: 4, gap: 4 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.chip },
  segOn: { backgroundColor: colors.orange },
  segText: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  troute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 12,
    borderRadius: radius.tile,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  trouteOn: { borderColor: colors.orange, backgroundColor: colors.orangeBg },
  trouteTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  trouteTitle: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  trouteDur: { fontSize: 16, fontWeight: '800', color: colors.text },
  trouteMin: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  tnode: { flexDirection: 'row', gap: 10, minHeight: 46 },
  ttime: { width: 44, textAlign: 'right', paddingTop: 10, fontSize: 12, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  ttimeMut: { color: colors.textFaint, fontWeight: '600' },
  trail: { width: 26, alignItems: 'center' },
  trailLineTop: { position: 'absolute', top: 0, height: 14, width: 2, backgroundColor: colors.surfaceAlt2 },
  trailLineBottom: { position: 'absolute', top: 14, bottom: 0, width: 2, backgroundColor: colors.surfaceAlt2 },
  tdot: {
    marginTop: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  tcard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  tlabel: { fontSize: 13, fontWeight: '700', color: colors.text },
  tlabelOff: { color: colors.textFaint, textDecorationLine: 'line-through', fontWeight: '600' },
  tdetail: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  prep: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prepOn: { backgroundColor: colors.orangeBg, borderColor: colors.orangeBorder },
});
