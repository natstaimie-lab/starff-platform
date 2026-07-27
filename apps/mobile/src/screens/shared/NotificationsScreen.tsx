import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ActionButton, ScreenScroll } from '@/components/Screen';
import { Muted, LoadingState, ErrorState, EmptyState } from '@/components/ui';
import { FilterChips } from '@/components/cards';
import { Icon } from '@/components/Icon';
import { colors } from '@/theme/tokens';
import { useApi } from '@/lib/useApi';
import { notificationsApi } from '@/lib/endpoints';
import type { Notification } from '@/lib/types';

const CATEGORIES = ['All', 'Shifts', 'Pay', 'Compliance', 'Messages'] as const;
function categoryOf(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('shift') || t.includes('offer') || t.includes('booking')) return 'Shifts';
  if (t.includes('pay') || t.includes('timesheet') || t.includes('invoice')) return 'Pay';
  if (t.includes('document') || t.includes('compliance') || t.includes('registration') || t.includes('approved') || t.includes('reject')) return 'Compliance';
  if (t.includes('message')) return 'Messages';
  return 'Shifts';
}

/**
 * In-app notifications — GET /notifications, PATCH :id/read, POST read-all.
 * Shared by the candidate (bell) and employer (Alerts tab).
 */
export function NotificationsScreen() {
  const nav = useNavigation<any>();
  const { data, loading, error, refreshing, refresh, reload } = useApi<Notification[]>(
    () => notificationsApi.list(),
    [],
  );
  const [cat, setCat] = useState<string>('All');
  const all = data ?? [];
  const items = cat === 'All' ? all : all.filter((n) => categoryOf(n.type) === cat);
  const unread = all.filter((n) => !n.readAt).length;

  const open = async (n: Notification) => {
    if (!n.readAt) {
      try {
        await notificationsApi.markRead(n.id);
        reload();
      } catch {
        /* non-fatal */
      }
    }
  };

  const markAll = async () => {
    try {
      await notificationsApi.markAllRead();
      reload();
    } catch {
      /* non-fatal */
    }
  };

  return (
    <View style={styles.root}>
      <AppBar
        title="Notifications"
        subtitle={loading ? undefined : unread ? `${unread} unread` : 'All caught up'}
        onBack={nav.canGoBack() ? () => nav.goBack() : undefined}
        right={unread ? <ActionButton icon="checks" onPress={markAll} /> : undefined}
      />
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : all.length === 0 ? (
          <EmptyState
            icon="bell"
            title="No notifications yet"
            subtitle="Shift offers, timesheet updates and compliance reminders will appear here."
          />
        ) : (
          <>
          <FilterChips items={[...CATEGORIES]} value={cat} onChange={setCat} />
          {items.length === 0 ? (
            <EmptyState icon="bell" title={`No ${cat.toLowerCase()} notifications`} />
          ) : (
          items.map((n) => (
            <Pressable key={n.id} onPress={() => open(n)} style={styles.item}>
              <View style={[styles.iconWrap, !n.readAt && styles.iconUnread]}>
                <Icon
                  name={iconFor(n.type)}
                  size={18}
                  color={n.readAt ? colors.textMuted : colors.orangeDim}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, !n.readAt && { color: colors.text }]}>
                  {n.title}
                </Text>
                {n.body ? <Muted style={{ marginTop: 2 }}>{n.body}</Muted> : null}
                <Text style={styles.when}>{timeAgo(n.createdAt)}</Text>
              </View>
              {!n.readAt ? <View style={styles.dot} /> : null}
            </Pressable>
          ))
          )}
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

function iconFor(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('shift') || t.includes('offer')) return 'briefcase';
  if (t.includes('timesheet') || t.includes('pay')) return 'coin';
  if (t.includes('approved')) return 'circle-check';
  if (t.includes('reject') || t.includes('info')) return 'alert-triangle';
  if (t.includes('document') || t.includes('compliance')) return 'shield-check';
  if (t.includes('message')) return 'message';
  return 'bell';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  item: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnread: { backgroundColor: colors.orangeBg },
  title: { fontSize: 13.5, fontWeight: '700', color: colors.textMuted },
  when: { fontSize: 11, color: colors.textFaint, marginTop: 5 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.orange,
    marginTop: 6,
  },
});
