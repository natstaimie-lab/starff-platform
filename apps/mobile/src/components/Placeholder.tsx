/**
 * Placeholder — an honest "built next" screen so navigation is complete while
 * feature screens are implemented stage by stage. Each names the exact backend
 * endpoint(s) it will wire to, so the remaining work is unambiguous.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppBar } from '@/components/Screen';
import { Icon } from '@/components/Icon';
import { colors } from '@/theme/tokens';

export function Placeholder({
  title,
  icon = 'sparkles',
  note,
  endpoint,
}: {
  title: string;
  icon?: string;
  note: string;
  endpoint?: string;
}) {
  return (
    <View style={styles.root}>
      <AppBar title={title} />
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Icon name={icon} size={34} color={colors.orange} />
        </View>
        <Text style={styles.title}>Coming in the next build stage</Text>
        <Text style={styles.note}>{note}</Text>
        {endpoint ? (
          <View style={styles.pill}>
            <Text style={styles.pillText}>{endpoint}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.orangeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 4 },
  note: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
  pill: {
    marginTop: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  pillText: { fontSize: 12, color: colors.textMuted, fontFamily: 'monospace' },
});
