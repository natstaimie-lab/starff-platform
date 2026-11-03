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
import { AppBar } from '@/components/Screen';
import { LoadingState, ErrorState } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { colors, radius } from '@/theme/tokens';
import { staffApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api';
import type { StaffThread } from '@/lib/types';

/** One staff conversation — GET/POST /messages/conversations/:id, polled every 5s. */
export function StaffThreadScreen() {
  const nav = useNavigation<any>();
  const { id, name } = useRoute<any>().params as { id: string; name: string };
  const [thread, setThread] = useState<StaffThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      setThread(await staffApi.thread(id));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load messages.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
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
      <AppBar title={name} subtitle={thread ? (thread.kind === 'CLIENT' ? 'Client' : 'Worker') : undefined} onBack={() => nav.goBack()} />
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
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            showsVerticalScrollIndicator={false}
          >
            {(thread?.messages ?? []).map((m) => (
              <View
                key={m.id}
                style={[styles.bubble, m.senderIsStaff ? styles.bubbleMe : styles.bubbleThem]}
              >
                <Text style={[styles.bubbleText, m.senderIsStaff && { color: '#fff' }]}>
                  {m.body}
                </Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.foot}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder={`Reply to ${name}…`}
              placeholderTextColor={colors.textFaint}
              multiline
            />
            <Pressable style={styles.send} onPress={send} disabled={sending}>
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
  bubble: { maxWidth: '82%', paddingVertical: 11, paddingHorizontal: 13, borderRadius: radius.tile },
  bubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceAlt,
    borderBottomLeftRadius: 4,
  },
  bubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: colors.orange,
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontSize: 13, lineHeight: 19, color: colors.text },
  foot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
