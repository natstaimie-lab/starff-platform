import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Card, EmptyState, ErrorState, LoadingState, Pill } from '@/components/ui';
import { ListRow } from '@/components/cards';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { staffApi } from '@/lib/endpoints';
import type { StaffConversation } from '@/lib/types';

/** Staff inbox — every worker and client conversation, GET /messages/conversations. */
export function StaffInboxScreen() {
  const nav = useNavigation<any>();
  const { data, loading, error, refreshing, refresh, silentRefresh, reload } = useApi<StaffConversation[]>(
    () => staffApi.conversations(),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      if (data) void silentRefresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [!!data]),
  );
  const conversations = data ?? [];
  const unread = conversations.reduce((sum, c) => sum + c.unread, 0);

  return (
    <View style={styles.root}>
      <AppBar title="Messages" subtitle={loading ? undefined : unread ? `${unread} unread` : 'All read'} />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : conversations.length === 0 ? (
          <EmptyState icon="message" title="No messages yet" subtitle="Worker and client messages will appear here." />
        ) : (
          <Card tight>
            {conversations.map((c, i) => (
              <ListRow
                key={c.id}
                title={c.name}
                subtitle={`${c.kind === 'CLIENT' ? 'Client' : 'Worker'} · ${
                  c.lastMessage.length > 60 ? `${c.lastMessage.slice(0, 60)}…` : c.lastMessage
                }`}
                onPress={() => nav.navigate('Thread', { id: c.id, name: c.name })}
                right={c.unread ? <Pill kind="amber">{`${c.unread} new`}</Pill> : undefined}
                last={i === conversations.length - 1}
              />
            ))}
          </Card>
        )}
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
