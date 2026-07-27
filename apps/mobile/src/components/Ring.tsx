/**
 * Circular progress ring — ported from the prototype's <Ring>. Shows a big
 * centred label with an optional sub-label (e.g. "68" / "/ 100"). The progress
 * arc starts at 12 o'clock and sweeps clockwise.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme/tokens';

export function Ring({
  size = 92,
  stroke = 7,
  pct,
  color = colors.orange,
  label,
  sub,
}: {
  size?: number;
  stroke?: number;
  pct: number;
  color?: string;
  label?: string | number;
  sub?: string;
}) {
  const r = (size - stroke * 2 - 2) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c * (1 - clamped / 100);
  const center = size / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={r} fill="none" stroke={colors.border} strokeWidth={stroke} />
        <Circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        {label != null ? <Text style={[styles.label, { color }]}>{label}</Text> : null}
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 24, fontWeight: '800', lineHeight: 26 },
  sub: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
});
