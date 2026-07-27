import React, { useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBar } from '@/components/Screen';
import { Icon } from '@/components/Icon';
import { colors, radius } from '@/theme/tokens';
import { candidateApi } from '@/lib/endpoints';

interface Turn { role: 'user' | 'assistant'; content: string }

const CHIPS = ['What DBS do I need?', 'Right-to-work share code', 'How is my pay worked out?'];

/** Worker AI assistant — POST /ai/me/ask (grounded on the worker's own record). */
export function CandidateAIScreen() {
  const insets = useSafeAreaInsets();
  const [turns, setTurns] = useState<Turn[]>([
    { role: 'assistant', content: "Hi! I'm Starff AI. Ask me about compliance, your shifts, timesheets or getting paid." },
  ]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const send = async (text?: string) => {
    const message = (text ?? draft).trim();
    if (!message || busy) return;
    setDraft('');
    const history = turns.filter((t) => t.role === 'user' || t.role === 'assistant');
    setTurns((t) => [...t, { role: 'user', content: message }]);
    setBusy(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const res = await candidateApi.aiAsk(message, history);
      setTurns((t) => [...t, { role: 'assistant', content: res.reply }]);
    } catch {
      setTurns((t) => [
        ...t,
        { role: 'assistant', content: "I couldn't reach the network just now — please try again." },
      ]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  return (
    <View style={styles.root}>
      <AppBar
        title="Starff AI"
        subtitle="Compliance & shifts assistant"
        right={
          <View style={styles.live}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live</Text>
          </View>
        }
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, gap: 10 }} showsVerticalScrollIndicator={false}>
          {turns.map((t, i) => (
            <View key={i} style={[styles.bubble, t.role === 'user' ? styles.me : styles.ai]}>
              <Text style={[styles.bubbleText, t.role === 'user' && { color: '#fff' }]}>{t.content}</Text>
            </View>
          ))}
          {busy ? (
            <View style={[styles.bubble, styles.ai]}>
              <Text style={styles.bubbleText}>Thinking…</Text>
            </View>
          ) : null}
          <View style={styles.chips}>
            {CHIPS.map((c) => (
              <Pressable key={c} style={styles.chip} onPress={() => send(c)}>
                <Text style={styles.chipText}>{c}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        <View style={[styles.foot, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask about a role or check…"
            placeholderTextColor={colors.textFaint}
            multiline
          />
          <Pressable style={styles.send} onPress={() => send()} disabled={busy}>
            <Icon name="arrow-up" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  live: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: colors.success },
  liveText: { fontSize: 11, color: colors.success, fontWeight: '700' },
  bubble: { maxWidth: '84%', paddingVertical: 11, paddingHorizontal: 13, borderRadius: radius.tile },
  ai: { alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt, borderBottomLeftRadius: 4 },
  me: { alignSelf: 'flex-end', backgroundColor: colors.orange, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 13, lineHeight: 19, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 4 },
  chip: { backgroundColor: colors.orangeBg, borderRadius: radius.chip, paddingVertical: 7, paddingHorizontal: 11 },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.orangeDim },
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
