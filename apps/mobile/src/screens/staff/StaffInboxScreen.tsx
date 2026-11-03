/**
 * Staff inbox — GET /messages/conversations. One row per candidate/client
 * thread, newest first, with the unread count the web inbox shows.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, EmptyState, ErrorState, LoadingState, Pill } from '@/components/ui';
import { Avatar } from '@/components/cards';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { staffApi } from '@/lib/endpoints';
import type { StaffConversation } from '@/lib/types';
import { initials, relativeStamp } from './format';

export function StaffInboxScreen() {
  const nav = useNavigation<any>();
  const { data, loading, error, refreshing, refresh, reload } = useApi<StaffConversation[]>(
    () => staffApi.conversations(),
    [],
  );

  // Refresh when returning from a thread so unread counts clear.
  React.useEffect(() => nav.addListener('focus', () => { if (data) refresh(); }), [nav, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = data ?? [];
  const unread = list.reduce((s, c) => s + (c.unread ?? 0), 0);

  return (
    <View style={styles.root}>
      <AppBar title="Inbox" subtitle={loading ? undefined : unread ? `${unread} unread` : 'All caught up'} />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : list.length === 0 ? (
          <EmptyState icon="message" title="No conversations yet" subtitle="Messages from candidates and clients land here." />
        ) : (
          <Card tight>
            {list.map((c, i) => (
              <Pressable
                key={c.id}
                onPress={() => nav.navigate('Conversation', { id: c.id, name: c.name })}
                style={[styles.row, i < list.length - 1 && styles.border]}
              >
                <Avatar initials={initials(c.name)} tone={c.kind === 'CLIENT' ? 'blue' : 'orange'} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.top}>
                    <Text style={[styles.name, c.unread > 0 && { fontWeight: '800' }]} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={styles.when}>{relativeStamp(c.lastAt)}</Text>
                  </View>
                  <View style={styles.top}>
                    <Text style={styles.last} numberOfLines={1}>{c.lastMessage}</Text>
                    {c.unread > 0 ? <Pill kind="orange">{String(c.unread)}</Pill> : null}
                  </View>
                </View>
              </Pressable>
            ))}
          </Card>
        )}
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11 },
  border: { borderBottomWidth: 1, borderBottomColor: colors.border },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.text },
  when: { fontSize: 11, color: colors.textFaint },
  last: { flex: 1, fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
