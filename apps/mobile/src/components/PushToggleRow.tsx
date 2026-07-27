/**
 * A settings row that toggles push notifications on/off (stored locally, default
 * on). Turning it on also (re)registers the device token. Drop it into a Card.
 */
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Muted } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { getPushEnabled, setPushEnabled, getExpoPushToken } from '@/lib/push';
import { notificationsApi } from '@/lib/endpoints';

export function PushToggleRow() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    getPushEnabled().then(setOn);
  }, []);

  const toggle = async (value: boolean) => {
    setOn(value);
    await setPushEnabled(value);
    if (value) {
      const token = await getExpoPushToken();
      if (token) {
        try {
          await notificationsApi.registerPushToken(token, Platform.OS);
        } catch {
          /* best-effort */
        }
      }
    }
  };

  return (
    <View style={styles.row}>
      <View style={styles.icon}>
        <Icon name="bell" size={18} color={colors.orangeDim} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Push notifications</Text>
        <Muted>Shifts, timesheets & reminders</Muted>
      </View>
      <Switch value={on} onValueChange={toggle} trackColor={{ true: colors.orange }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.orangeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 13.5, fontWeight: '700', color: colors.text },
});
