import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Button, LoadingState, ErrorState, EmptyState, Muted } from '@/components/ui';
import { JobCard } from '@/components/cards';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { candidateApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api';
import type { CandidateInvitation } from '@/lib/types';

const RESPONDABLE = ['INVITED', 'INTERESTED', 'UNAVAILABLE', 'INFO_REQUESTED'];
const statusLabel: Record<string, string> = {
  INVITED: 'Awaiting your response',
  INTERESTED: "You're available",
  UNAVAILABLE: 'You said you cannot make it',
  INFO_REQUESTED: 'You asked a question',
  DECLINED: 'Declined',
  ALTERNATIVE_REQUESTED: 'Alternative requested',
  SUBMITTED_TO_CLIENT: 'Starff is putting you forward',
  CLIENT_ACCEPTED: 'Accepted — Starff is confirming',
};

/**
 * Shift offers — the shifts Starff has offered this worker (GET /me/invitations).
 * The worker says whether they're available; Starff confirms the booking. There
 * is no self-serve job board (that's an admin-controlled marketplace feature).
 */
export function CandidateRolesScreen() {
  const offers = useApi<CandidateInvitation[]>(() => candidateApi.invitations(), []);
  const [busyId, setBusyId] = useState<string | null>(null);

  const respond = async (iv: CandidateInvitation, response: 'INTERESTED' | 'UNAVAILABLE' | 'INFO') => {
    setBusyId(iv.id);
    try {
      await candidateApi.respondInvitation(iv.id, response);
      Alert.alert(
        'Thanks',
        response === 'INTERESTED'
          ? "We've noted you're available. Starff will confirm your booking and let you know."
          : response === 'INFO'
            ? "We'll get back to you about this shift."
            : "Thanks for letting us know.",
      );
      offers.reload();
    } catch (err) {
      Alert.alert('Could not respond', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const list = offers.data ?? [];

  return (
    <View style={styles.root}>
      <AppBar title="Shift offers" subtitle="Shifts Starff has offered you" />
      <ScreenScroll refreshing={offers.refreshing} onRefresh={offers.refresh}>
        {offers.loading ? (
          <LoadingState label="Loading your shift offers…" />
        ) : offers.error ? (
          <ErrorState message={offers.error} onRetry={offers.reload} />
        ) : list.length === 0 ? (
          <EmptyState
            icon="briefcase"
            title="No shift offers right now"
            subtitle="When Starff offers you a shift, it'll appear here. Keep your availability and documents up to date so you don't miss out."
          />
        ) : (
          list.map((iv) => {
            const canRespond = RESPONDABLE.includes(iv.status);
            return (
              <JobCard
                key={iv.id}
                icon="briefcase"
                title={iv.job.title}
                subtitle={[iv.job.sector, iv.job.location].filter(Boolean).join(' · ') || 'Shift opportunity'}
                pill={`£${Number(iv.job.payRate ?? 0).toFixed(2)}/hr`}
                tags={[iv.job.startDate ? formatWhen(iv.job.startDate) : 'Date TBC', statusLabel[iv.status] ?? iv.status].filter(Boolean) as string[]}
                footer={
                  canRespond ? (
                    <View style={styles.btnRow}>
                      <Button title={busyId === iv.id ? '…' : "I'm available"} onPress={() => respond(iv, 'INTERESTED')} loading={busyId === iv.id} style={styles.grow} />
                      <Button title="Can't make it" kind="ghost" onPress={() => respond(iv, 'UNAVAILABLE')} disabled={busyId === iv.id} />
                      <Button title="Ask a question" kind="ghost" onPress={() => respond(iv, 'INFO')} disabled={busyId === iv.id} />
                    </View>
                  ) : (
                    <Muted style={{ marginTop: 6 }}>Response sent. Starff will confirm your booking and it&apos;ll show under your shifts.</Muted>
                  )
                }
              />
            );
          })
        )}
      </ScreenScroll>
    </View>
  );
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  grow: { flexGrow: 1 },
});
