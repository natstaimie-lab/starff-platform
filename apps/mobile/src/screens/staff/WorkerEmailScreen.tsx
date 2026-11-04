import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Button, Field, Input, Muted } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { staffApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api';

/**
 * Compose a branded email to a worker — POST /candidates/:id/email. It goes out
 * in the Starff template from the Starff address, not the staff member's own.
 */
export function StaffWorkerEmailScreen() {
  const nav = useNavigation<any>();
  const { id, firstName, email } = useRoute<any>().params as {
    id: string;
    firstName?: string;
    email: string;
  };
  const [subject, setSubject] = useState('A message from Starff');
  const [body, setBody] = useState(`Hi ${firstName || 'there'},\n\n`);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    setSending(true);
    try {
      const { emailed } = await staffApi.emailCandidate(id, subject.trim(), body.trim());
      if (!emailed) {
        Alert.alert('Email not sent', 'It could not be sent. Your message is still here, so please try again.');
        return;
      }
      Alert.alert('Email sent', `Sent to ${email}.`, [{ text: 'OK', onPress: () => nav.goBack() }]);
    } catch (err) {
      Alert.alert('Email not sent', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  const confirm = () => {
    const greetingOnly = body.trim() === `Hi ${firstName || 'there'},`;
    if (!subject.trim() || !body.trim() || greetingOnly) {
      setError('Add a subject and a message first.');
      return;
    }
    setError('');
    Alert.alert('Send this email?', `It will be sent to ${email} from Starff.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send', onPress: () => void send() },
    ]);
  };

  return (
    <View style={styles.root}>
      <AppBar title="Email worker" subtitle={email} onBack={() => nav.goBack()} />
      <ScreenScroll>
        <Muted style={styles.hint}>Sent in the Starff email design from the Starff address.</Muted>
        <Field label="Subject">
          <Input value={subject} onChangeText={setSubject} maxLength={150} />
        </Field>
        <Field label="Message">
          <Input
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={5000}
            textAlignVertical="top"
            style={styles.body}
          />
        </Field>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Send email" onPress={confirm} loading={sending} style={styles.send} />
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hint: { marginBottom: 12 },
  body: { minHeight: 120, paddingTop: 12 },
  error: { marginTop: 6, fontSize: 12, color: colors.error },
  send: { marginTop: 12 },
});
