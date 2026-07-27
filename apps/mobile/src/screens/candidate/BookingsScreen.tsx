import React, { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, Pill, Muted, Button, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { candidateApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api';
import type { CandidateProfile, Shift } from '@/lib/types';

const STATUS_PILL: Record<string, any> = {
  ASSIGNED: 'green', CONFIRMED: 'green', IN_PROGRESS: 'amber', COMPLETED: 'gray', CANCELLED: 'red', NO_SHOW: 'red', OPEN: 'amber',
};
const STATUS_LABEL: Record<string, string> = {
  ASSIGNED: 'Booked', CONFIRMED: 'Confirmed', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled', NO_SHOW: 'No show', OPEN: 'Open',
};

/** The worker's confirmed shifts — upcoming and past. Reads GET /me (shifts). */
export function CandidateBookingsScreen() {
  const nav = useNavigation<any>();
  const { data: me, loading, error, refreshing, refresh, reload } = useApi<CandidateProfile>(() => candidateApi.me(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  const act = async (id: string, action: 'ack' | 'in' | 'out' | 'late') => {
    setBusy(id + action);
    try {
      if (action === 'ack') await candidateApi.acknowledgeShift(id);
      else if (action === 'in') await candidateApi.checkInShift(id);
      else if (action === 'out') await candidateApi.checkOutShift(id);
      else { await candidateApi.reportLate(id); Alert.alert('Thanks', "We've let the team know you're running late."); }
      reload();
    } catch (e) { Alert.alert('Could not update', e instanceof ApiError ? e.message : 'Please try again.'); }
    finally { setBusy(null); }
  };

  const now = Date.now();
  const all = (me?.shifts ?? []).slice().sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
  const upcoming = all.filter((s) => +new Date(s.startAt) >= now && s.status !== 'CANCELLED');
  const past = all.filter((s) => +new Date(s.startAt) < now || s.status === 'CANCELLED').reverse();

  return (
    <View style={styles.root}>
      <AppBar title="My shifts" subtitle="Your booked and past shifts" onBack={() => nav.goBack()} />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : all.length === 0 ? (
          <EmptyState icon="briefcase" title="No shifts yet" subtitle="When Starff confirms a booking for you, it'll appear here." />
        ) : (
          <>
            <View style={styles.segment}>
              {(['upcoming', 'past'] as const).map((t) => {
                const on = tab === t;
                const count = t === 'upcoming' ? upcoming.length : past.length;
                return (
                  <TouchableOpacity key={t} onPress={() => setTab(t)} activeOpacity={0.8} style={[styles.seg, on && styles.segOn]}>
                    <Text style={[styles.segTxt, on && styles.segTxtOn]}>{t === 'upcoming' ? 'Upcoming' : 'Past'} ({count})</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {(tab === 'upcoming' ? upcoming : past).length === 0 ? (
              <Muted style={{ marginTop: 8 }}>{tab === 'upcoming' ? 'No upcoming shifts booked.' : 'No past shifts yet.'}</Muted>
            ) : (
              (tab === 'upcoming' ? upcoming : past).map((s) => <ShiftRow key={s.id} s={s} busy={busy} onAct={act} />)
            )}
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

const fullAddress = (s: Shift): string => {
  const a = s.site && (s.site.addressLine1 || s.site.postcode) ? s.site : s.job?.client;
  return [a?.name, a?.addressLine1, a?.city, a?.postcode].filter(Boolean).join(', ') || 'Address to be confirmed';
};

function ShiftRow({ s, busy, onAct }: { s: Shift; busy: string | null; onAct: (id: string, a: 'ack' | 'in' | 'out' | 'late') => void }) {
  const start = new Date(s.startAt);
  const end = new Date(s.endAt);
  const day = start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = `${start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}–${end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  const actionable = s.status === 'ASSIGNED' || s.status === 'CONFIRMED' || s.status === 'IN_PROGRESS';
  const addr = fullAddress(s);
  const j = s.job;
  const breaks = j?.breakInfo ?? (s.breakMinutes ? `${s.breakMinutes} min` : null);
  return (
    <Card tight>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{s.job?.title ?? 'Shift'}</Text>
          <Muted>{s.job?.client?.name ?? 'Starff'}{s.site?.city ? ` · ${s.site.city}` : ''}</Muted>
        </View>
        <Pill kind={STATUS_PILL[s.status] ?? 'gray'}>{STATUS_LABEL[s.status] ?? s.status}</Pill>
      </View>
      <View style={styles.meta}>
        <Muted>📅 {day}</Muted>
        <Muted>🕒 {time}</Muted>
        <Muted>£{Number(s.payRate ?? 0).toFixed(2)}/hr</Muted>
      </View>

      <View style={styles.details}>
        <TouchableOpacity onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(addr)}`)} activeOpacity={0.7}>
          <View style={styles.addrRow}>
            <Text style={styles.pin}>📍</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.addr}>{addr}</Text>
              <Text style={styles.mapsLink}>Open in maps →</Text>
            </View>
          </View>
        </TouchableOpacity>
        {!!j?.reportingContact && <DetailRow k="Report to" v={j.reportingContact} />}
        {!!j?.reportingInstructions && <DetailRow k="On arrival" v={j.reportingInstructions} />}
        {!!j?.siteInstructions && <DetailRow k="Site info" v={j.siteInstructions} />}
        {!!j?.ppe && <DetailRow k="PPE" v={j.ppe} />}
        {!!j?.uniform && <DetailRow k="Uniform" v={j.uniform} />}
        {!!breaks && <DetailRow k="Breaks" v={breaks} />}
      </View>

      {actionable && (
        <View style={styles.actions}>
          {s.status === 'ASSIGNED' && <Button title="Confirm I'll attend" onPress={() => onAct(s.id, 'ack')} loading={busy === s.id + 'ack'} style={styles.grow} />}
          {s.status === 'CONFIRMED' && <Button title="Check in" onPress={() => onAct(s.id, 'in')} loading={busy === s.id + 'in'} style={styles.grow} />}
          {s.status === 'IN_PROGRESS' && <Button title="Check out" onPress={() => onAct(s.id, 'out')} loading={busy === s.id + 'out'} style={styles.grow} />}
          {(s.status === 'ASSIGNED' || s.status === 'CONFIRMED') && <Button title="Running late" kind="ghost" onPress={() => onAct(s.id, 'late')} disabled={!!busy} />}
        </View>
      )}
    </Card>
  );
}

function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailK}>{k}</Text>
      <Text style={styles.detailV}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  segment: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 4, gap: 4, marginBottom: 12 },
  seg: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  segOn: { backgroundColor: colors.surface, shadowColor: '#0B1F3A', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segTxt: { fontSize: 13.5, fontWeight: '700', color: colors.textMuted },
  segTxtOn: { color: colors.text },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  details: { backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 11, marginTop: 10, gap: 7 },
  addrRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  pin: { fontSize: 15, marginTop: 1 },
  addr: { fontSize: 13.5, fontWeight: '600', color: colors.text },
  mapsLink: { fontSize: 12, color: colors.orange, marginTop: 2 },
  detailRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  detailK: { width: 66, fontSize: 12.5, color: colors.textMuted },
  detailV: { flex: 1, fontSize: 12.5, color: colors.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  grow: { flexGrow: 1 },
});
