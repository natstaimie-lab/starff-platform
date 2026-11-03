/**
 * Candidate record — GET /candidates/:id. A read-only, on-the-go summary:
 * contact, compliance documents (type + status only) and availability.
 *
 * Deliberately NOT shown on the phone, even to ADMIN: NI number, bank details,
 * health notes, address lines and document files. Those stay on the web
 * dashboard. Status changes and vetting decisions are made there too.
 */
import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Button, Card, CheckRow, ErrorState, LoadingState, Muted, Pill, SecHead } from '@/components/ui';
import { Avatar } from '@/components/cards';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { staffApi } from '@/lib/endpoints';
import type { StaffCandidate } from '@/lib/types';
import { initials, shortDate, titleCase } from './format';
import { STATUS_PILL } from './StaffCandidatesScreen';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOC_STATE: Record<string, string> = { VERIFIED: 'verified', PENDING: 'progress', REJECTED: 'todo', EXPIRED: 'todo' };

export function StaffCandidateDetailScreen() {
  const nav = useNavigation<any>();
  const { id } = (useRoute<any>().params ?? {}) as { id: string };
  const { data: c, loading, error, refreshing, refresh, reload } = useApi<StaffCandidate>(
    () => staffApi.candidate(id),
    [id],
  );

  const name = c ? `${c.firstName} ${c.lastName}`.trim() : 'Candidate';
  const days = [...new Set((c?.availability ?? []).map((a) => a.dayOfWeek))].sort();
  const skills = (c?.skills ?? []).map((s) => s.skill?.name).filter(Boolean) as string[];

  return (
    <View style={styles.root}>
      <AppBar title={name} onBack={() => nav.goBack()} />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <LoadingState />
        ) : error || !c ? (
          <ErrorState message={error ?? 'Not found'} onRetry={reload} />
        ) : (
          <>
            <Card style={{ alignItems: 'center' }}>
              <Avatar initials={initials(name)} size={58} />
              <Text style={styles.name}>{name}</Text>
              {c.headline ? <Muted>{c.headline}</Muted> : null}
              <View style={styles.pills}>
                <Pill kind={STATUS_PILL[c.status] ?? 'gray'}>{titleCase(c.status)}</Pill>
                {c.rightToWorkType ? <Pill kind="blue">{c.rightToWorkType}</Pill> : null}
                {typeof c.rating === 'number' ? <Pill kind="gray">{`★ ${c.rating.toFixed(1)}`}</Pill> : null}
              </View>
              <Muted style={{ marginTop: 8 }}>
                {[c.city, c.postcode].filter(Boolean).join(' · ') || 'No location yet'}
                {c.createdAt ? ` · joined ${shortDate(c.createdAt)}` : ''}
              </Muted>
            </Card>

            {c.phone || c.loginEmail ? (
              <View style={styles.btns}>
                {c.phone ? (
                  <Button title="Call" kind="ghost" onPress={() => Linking.openURL(`tel:${c.phone!.replace(/\s/g, '')}`)} style={{ flex: 1 }} />
                ) : null}
                {c.loginEmail ? (
                  <Button title="Email" kind="ghost" onPress={() => Linking.openURL(`mailto:${c.loginEmail}`)} style={{ flex: 1 }} />
                ) : null}
              </View>
            ) : null}

            <SecHead title="Compliance documents" />
            <Card tight>
              {(c.documents ?? []).length === 0 ? (
                <Muted>No documents uploaded yet.</Muted>
              ) : (
                (c.documents ?? []).map((d) => (
                  <CheckRow key={d.id} status={DOC_STATE[d.status] ?? 'todo'}>
                    {titleCase(d.type)} — {titleCase(d.status)}
                    {d.expiryDate ? ` · expires ${shortDate(d.expiryDate)}` : ''}
                  </CheckRow>
                ))
              )}
            </Card>

            <SecHead title="Availability" />
            <Card tight>
              <Muted>{days.length ? days.map((d) => DAYS[d]).join(' · ') : 'Not set'}</Muted>
            </Card>

            {skills.length ? (
              <>
                <SecHead title="Skills" />
                <Card tight>
                  <View style={styles.pills}>
                    {skills.map((s) => <Pill key={s}>{s}</Pill>)}
                  </View>
                </Card>
              </>
            ) : null}

            <Muted style={{ textAlign: 'center' }}>
              Vetting decisions, status changes and sensitive details are on the web dashboard.
            </Muted>
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  name: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 10 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, justifyContent: 'center' },
  btns: { flexDirection: 'row', gap: 8 },
});
