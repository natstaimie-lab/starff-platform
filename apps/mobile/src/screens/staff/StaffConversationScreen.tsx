/**
 * One staff thread — GET/POST /messages/conversations/:id, polled every 5s.
 * Opening it marks the member's messages read (server-side, as on the web).
 * Staff messages are "me" here (right, orange); the member's are on the left.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBar } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { colors, radius } from '@/theme/tokens';
import { staffApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api';
import type { StaffThread } from '@/lib/types';
import { relativeStamp, titleCase } from './format';

export function StaffConversationScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { id, name } = (route.params ?? {}) as { id: string; name?: string };
  const insets = useSafeAreaInsets();
  const [thread, setThread] = useState<StaffThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      setThread(await staffApi.conversation(id));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this conversation.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [thread?.messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setDraft('');
    setSending(true);
    try {
      await staffApi.reply(id, body);
      await load();
    } catch {
      setDraft(body); // restore on failure
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppBar
        title={thread?.name ?? name ?? 'Conversation'}
        subtitle={thread?.kind ? titleCase(thread.kind) : undefined}
        onBack={() => nav.goBack()}
      />
      {loading ? (
        <LoadingState />
      ) : error && !thread ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={90}
        >
          <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, gap: 10 }} showsVerticalScrollIndicator={false}>
            {(thread?.messages ?? []).map((m) => (
              <View key={m.id} style={[styles.bubble, m.senderIsStaff ? styles.me : styles.them]}>
                <Text style={[styles.text, m.senderIsStaff && { color: '#fff' }]}>{m.body}</Text>
                <Text style={[styles.stamp, m.senderIsStaff && { color: 'rgba(255,255,255,0.75)' }]}>
                  {relativeStamp(m.createdAt)}
                </Text>
              </View>
            ))}
          </ScrollView>
          <View style={[styles.foot, { paddingBottom: insets.bottom + 8 }]}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Reply as Starff…"
              placeholderTextColor={colors.textFaint}
              multiline
            />
            <Pressable style={[styles.send, (!draft.trim() || sending) && { opacity: 0.5 }]} onPress={send} disabled={sending}>
              <Icon name="arrow-up" size={18} color="#fff" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  bubble: { maxWidth: '82%', paddingVertical: 10, paddingHorizontal: 13, borderRadius: radius.tile },
  them: { alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt, borderBottomLeftRadius: 4 },
  me: { alignSelf: 'flex-end', backgroundColor: colors.orange, borderBottomRightRadius: 4 },
  text: { fontSize: 13, lineHeight: 19, color: colors.text },
  stamp: { fontSize: 10, color: colors.textFaint, marginTop: 4, alignSelf: 'flex-end' },
  foot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 9,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 42,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 14,
    color: colors.text,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
