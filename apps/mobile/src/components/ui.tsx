/**
 * ui.tsx — reusable, brand-consistent primitives ported from the prototype's
 * shared components (Btn, Pill, Chip, Metric, Card, AppBar, Ring, CheckRow,
 * SecHead, AIBox, empty/loading states). Every screen composes these so the
 * Starff design system stays consistent and values are never hard-coded.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing, shadow, StatusKind } from '@/theme/tokens';
import { Icon } from '@/components/Icon';

// ── Text helpers ───────────────────────────────────────────────────────────
export const H1 = ({ children, style }: any) => (
  <Text style={[styles.h1, style]}>{children}</Text>
);
export const H2 = ({ children, style }: any) => (
  <Text style={[styles.h2, style]}>{children}</Text>
);
export const Muted = ({ children, style }: any) => (
  <Text style={[styles.muted, style]}>{children}</Text>
);

// ── Card ─────────────────────────────────────────────────────────────────
export function Card({
  children,
  style,
  tight,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  tight?: boolean;
}) {
  return (
    <View style={[styles.card, tight && { padding: 13 }, shadow.card, style]}>
      {children}
    </View>
  );
}

// ── Button ─────────────────────────────────────────────────────────────────
export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  iconRight,
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress?: () => void;
  kind?: 'primary' | 'ghost';
  icon?: string;
  iconRight?: string;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const isGhost = kind === 'ghost';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        isGhost ? styles.btnGhost : styles.btnPrimary,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isGhost ? colors.text : colors.onPrimary} />
      ) : (
        <>
          {icon && (
            <Icon
              name={icon}
              size={18}
              color={isGhost ? colors.text : colors.onPrimary}
            />
          )}
          <Text style={[styles.btnText, isGhost && { color: colors.text }]}>
            {title}
          </Text>
          {iconRight && (
            <Icon
              name={iconRight}
              size={18}
              color={isGhost ? colors.text : colors.onPrimary}
            />
          )}
        </>
      )}
    </Pressable>
  );
}

// ── Pill / Chip ─────────────────────────────────────────────────────────────
const PILL_COLORS: Record<StatusKind, { bg: string; fg: string }> = {
  green: { bg: colors.successBg, fg: colors.success },
  amber: { bg: colors.warningBg, fg: colors.warning },
  red: { bg: colors.errorBg, fg: colors.error },
  blue: { bg: 'rgba(59,130,246,0.12)', fg: colors.blue },
  gray: { bg: colors.surfaceAlt2, fg: colors.textMuted },
  orange: { bg: colors.orangeBg, fg: colors.orangeDim },
};

export function Pill({
  kind = 'gray',
  children,
}: {
  kind?: StatusKind;
  children: React.ReactNode;
}) {
  const c = PILL_COLORS[kind];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[styles.pillText, { color: c.fg }]}>{children}</Text>
    </View>
  );
}

export function Chip({
  children,
  hot,
}: {
  children: React.ReactNode;
  hot?: boolean;
}) {
  return (
    <View style={[styles.chip, hot && { backgroundColor: colors.orangeBg }]}>
      <Text
        style={[styles.chipText, hot && { color: colors.orangeDim }]}
        numberOfLines={1}
      >
        {children}
      </Text>
    </View>
  );
}

// ── Two-column grid (metrics etc.) ──────────────────────────────────────────
export function TwoCol({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.twoCol}>
      {React.Children.map(children, (c, i) => (
        <View key={i} style={styles.twoColCell}>
          {c}
        </View>
      ))}
    </View>
  );
}

// ── Metric tile ─────────────────────────────────────────────────────────────
export function Metric({
  label,
  value,
  delta,
  deltaKind,
  valueColor,
}: {
  label: string;
  value: React.ReactNode;
  delta?: string;
  deltaKind?: 'a' | 'r' | '';
  valueColor?: string;
}) {
  const deltaColor =
    deltaKind === 'a'
      ? colors.warning
      : deltaKind === 'r'
        ? colors.error
        : colors.success;
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, valueColor && { color: valueColor }]}>
        {value}
      </Text>
      {delta ? (
        <Text style={[styles.metricDelta, { color: deltaColor }]}>{delta}</Text>
      ) : null}
    </View>
  );
}

// ── Section header ──────────────────────────────────────────────────────────
export function SecHead({
  title,
  more,
  onMore,
}: {
  title: string;
  more?: string;
  onMore?: () => void;
}) {
  return (
    <View style={styles.secHead}>
      <Text style={styles.secHeadTitle}>{title}</Text>
      {more ? (
        <Pressable onPress={onMore}>
          <Text style={styles.secHeadMore}>{more}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Check row (compliance / vetting) ────────────────────────────────────────
export function CheckRow({
  status,
  children,
}: {
  status: 'done' | 'verified' | 'progress' | 'todo' | string;
  children: React.ReactNode;
}) {
  const done = status === 'done' || status === 'verified';
  const bg = done
    ? colors.successBg
    : status === 'progress'
      ? colors.warningBg
      : colors.surfaceAlt2;
  const fg = done
    ? colors.success
    : status === 'progress'
      ? colors.warning
      : colors.textFaint;
  const icon = done ? 'check' : status === 'progress' ? 'clock' : 'circle';
  return (
    <View style={styles.checkRow}>
      <View style={[styles.checkDot, { backgroundColor: bg }]}>
        <Icon name={icon} size={11} color={fg} />
      </View>
      <Text style={styles.checkText}>{children}</Text>
    </View>
  );
}

// ── AI insight box ──────────────────────────────────────────────────────────
export function AIBox({
  children,
  label = 'Starff AI',
  action,
}: {
  children: React.ReactNode;
  label?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.aiBox}>
      <View style={styles.aiLabel}>
        <Icon name="robot" size={14} color={colors.orangeDim} />
        <Text style={styles.aiLabelText}>{label.toUpperCase()}</Text>
      </View>
      <Text style={styles.aiBody}>{children}</Text>
      {action ? <View style={{ marginTop: 11 }}>{action}</View> : null}
    </View>
  );
}

// ── Labeled text field ──────────────────────────────────────────────────────
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 13 }}>
      <Text style={styles.fieldLabel}>
        {label}
        {hint ? <Text style={{ color: colors.textFaint }}>  {hint}</Text> : null}
      </Text>
      {children}
    </View>
  );
}

export function Input(props: TextInputProps & { onDark?: boolean }) {
  const { onDark, style, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={onDark ? '#7C8DA6' : colors.textFaint}
      style={[
        styles.input,
        onDark && {
          backgroundColor: 'rgba(255,255,255,0.07)',
          borderColor: 'rgba(255,255,255,0.18)',
          color: '#fff',
        },
        style,
      ]}
      {...rest}
    />
  );
}

// ── Loading / empty / error states ──────────────────────────────────────────
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.centerState}>
      <ActivityIndicator color={colors.orange} />
      <Muted style={{ marginTop: 10 }}>{label}</Muted>
    </View>
  );
}

export function EmptyState({
  icon = 'search-off',
  title,
  subtitle,
}: {
  icon?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.centerState}>
      <Icon name={icon} size={38} color={colors.textFaint} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Muted style={{ textAlign: 'center' }}>{subtitle}</Muted> : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.centerState}>
      <Icon name="alert-triangle" size={34} color={colors.error} />
      <Text style={[styles.emptyTitle, { color: colors.error }]}>
        Something went wrong
      </Text>
      <Muted style={{ textAlign: 'center', marginBottom: 12 }}>{message}</Muted>
      {onRetry ? <Button title="Try again" kind="ghost" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 25, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  h2: { fontSize: 21, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  muted: { fontSize: 12.5, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 16,
  },
  btn: {
    height: 46,
    borderRadius: radius.control,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  btnPrimary: { backgroundColor: colors.orange },
  btnGhost: { borderWidth: 1, borderColor: colors.borderStrong },
  btnText: { color: colors.onPrimary, fontSize: 14.5, fontWeight: '700' },
  pill: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 10.5, fontWeight: '700' },
  chip: {
    backgroundColor: colors.surfaceAlt2,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.chip,
  },
  chipText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  twoCol: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 11,
  },
  twoColCell: { width: '48.5%' },
  metric: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.tile,
    padding: 14,
    minWidth: 0,
  },
  metricLabel: {
    fontSize: 11.5,
    color: colors.textMuted,
    fontWeight: '600',
    marginBottom: 7,
  },
  metricValue: { fontSize: 25, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  metricDelta: { fontSize: 11, fontWeight: '600', marginTop: 6 },
  secHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secHeadTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  secHeadMore: { fontSize: 12.5, color: colors.orange, fontWeight: '700' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkDot: {
    width: 19,
    height: 19,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { fontSize: 12.5, color: colors.text },
  aiBox: {
    backgroundColor: colors.orangeBg,
    borderWidth: 1,
    borderColor: colors.orangeBorder,
    borderRadius: radius.tile,
    padding: 14,
  },
  aiLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  aiLabelText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.orangeDim,
    letterSpacing: 0.6,
  },
  aiBody: { fontSize: 12.5, color: colors.text, lineHeight: 20 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  input: {
    height: 46,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 14,
    fontSize: 14,
    color: colors.text,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 8,
    minHeight: 220,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 4 },
});

export { spacing, colors, radius };
