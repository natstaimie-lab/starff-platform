import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { Button, Field, Input, Muted } from '@/components/ui';
import { colors, radius } from '@/theme/tokens';

/** Asks for the reason behind a rejection. Each caller's hint says who sees it. */
export function ReasonModal({
  visible,
  title,
  hint,
  busy,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  hint: string;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (visible) setReason('');
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <Muted style={{ marginVertical: 8 }}>{hint}</Muted>
          <Field label="Reason">
            <Input value={reason} onChangeText={setReason} multiline autoFocus />
          </Field>
          <Button
            title="Reject"
            onPress={() => onSubmit(reason.trim())}
            disabled={!reason.trim()}
            loading={busy}
            style={{ marginTop: 10 }}
          />
          <Button title="Cancel" kind="ghost" onPress={onCancel} style={{ marginTop: 8 }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(11,31,58,0.5)' },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 18 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
});
