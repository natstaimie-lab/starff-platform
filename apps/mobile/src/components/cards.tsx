/**
 * Prototype-faithful building blocks shared across screens: coloured icon tiles
 * & avatars, list rows, job/role cards, the navy gradient "destination" card,
 * the timesheet week strip, filter chips and a segmented control. Ported from
 * the approved prototype (starff-shared / starff-candidate / starff-employer).
 */
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius } from '@/theme/tokens';
import { Icon } from '@/components/Icon';
import { Card, Chip, Pill } from '@/components/ui';
import type { StatusKind } from '@/theme/tokens';

export type Tone = 'orange' | 'blue' | 'gold' | 'amber' | 'red';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  orange: { bg: colors.orangeBg, fg: colors.orangeDim },
  blue: { bg: 'rgba(59,130,246,0.12)', fg: colors.blue },
  gold: { bg: 'rgba(183,121,31,0.13)', fg: colors.gold },
  amber: { bg: 'rgba(180,83,9,0.13)', fg: colors.warning },
  red: { bg: 'rgba(220,38,38,0.11)', fg: colors.error },
};

// ── Coloured icon tile ──────────────────────────────────────────────────────
export function IconTile({
  name,
  tone = 'orange',
  size = 42,
}: {
  name: string;
  tone?: Tone;
  size?: number;
}) {
  const t = TONES[tone];
  return (
    <View style={[styles.tile, { width: size, height: size, backgroundColor: t.bg }]}>
      <Icon name={name} size={Math.round(size * 0.5)} color={t.fg} />
    </View>
  );
}

// ── Avatar (initials) ───────────────────────────────────────────────────────
export function Avatar({
  initials,
  tone = 'orange',
  size = 42,
}: {
  initials: string;
  tone?: Tone;
  size?: number;
}) {
  const t = TONES[tone];
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg },
      ]}
    >
      <Text style={{ color: t.fg, fontWeight: '700', fontSize: size * 0.33 }}>{initials}</Text>
    </View>
  );
}

// ── List row (icon + title + subtitle + chevron/right) ──────────────────────
export function ListRow({
  icon,
  tone = 'orange',
  title,
  subtitle,
  onPress,
  right,
  last,
}: {
  icon?: string;
  tone?: Tone;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  last?: boolean;
}) {
  const Wrapper: any = onPress ? Pressable : View;
  return (
    <Wrapper onPress={onPress} style={[styles.li, !last && styles.liBorder]}>
      {icon ? <IconTile name={icon} tone={tone} size={38} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.liTitle}>{title}</Text>
        {subtitle ? <Text style={styles.liSub}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-right" size={18} color={colors.textFaint} /> : null)}
    </Wrapper>
  );
}

// ── Job / role card ─────────────────────────────────────────────────────────
export function JobCard({
  icon = 'briefcase',
  tone = 'orange',
  title,
  subtitle,
  pill,
  pillKind = 'orange',
  tags = [],
  footer,
  onPress,
  children,
}: {
  icon?: string;
  tone?: Tone;
  title: string;
  subtitle?: string;
  pill?: string;
  pillKind?: StatusKind;
  tags?: string[];
  footer?: React.ReactNode;
  onPress?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Card tight style={onPress ? undefined : undefined}>
      <Pressable onPress={onPress} disabled={!onPress} style={{ gap: 9 }}>
        <View style={styles.jobHead}>
          <IconTile name={icon} tone={tone} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.jobTitle}>{title}</Text>
            {subtitle ? <Text style={styles.jobSub}>{subtitle}</Text> : null}
          </View>
          {pill ? <Pill kind={pillKind}>{pill}</Pill> : null}
        </View>
        {tags.length > 0 ? (
          <View style={styles.tags}>
            {tags.map((t, i) => (
              <Chip key={i} hot={i === 0}>
                {t}
              </Chip>
            ))}
          </View>
        ) : null}
        {footer}
        {children}
      </Pressable>
    </Card>
  );
}

// ── Navy gradient "destination" card (next shift / pay) ─────────────────────
export function DestCard({
  label,
  labelIcon,
  title,
  subtitle,
  rows = [],
  style,
}: {
  label: string;
  labelIcon?: string;
  title: string;
  subtitle?: string;
  rows?: { k: string; v: string; accent?: boolean }[];
  style?: ViewStyle;
}) {
  return (
    <LinearGradient
      colors={[colors.navy2, colors.navy]}
      style={[styles.dest, style]}
    >
      <View style={styles.destLabelRow}>
        {labelIcon ? <Icon name={labelIcon} size={14} color="#A9B6C9" /> : null}
        <Text style={styles.destLabel}>{label}</Text>
      </View>
      <Text style={styles.destTitle}>{title}</Text>
      {subtitle ? <Text style={styles.destSub}>{subtitle}</Text> : null}
      {rows.length > 0 ? (
        <View style={styles.destRow}>
          {rows.map((r, i) => (
            <View key={i} style={{ flex: 1 }}>
              <Text style={styles.destK}>{r.k}</Text>
              <Text style={[styles.destV, r.accent && { color: '#7DD3A8' }]}>{r.v}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </LinearGradient>
  );
}

// ── Week strip (timesheets) ─────────────────────────────────────────────────
export function WeekStrip({
  days,
}: {
  days: { dn: string; dd: number | string; hours?: number; today?: boolean }[];
}) {
  return (
    <View style={styles.week}>
      {days.map((d, i) => {
        const on = (d.hours ?? 0) > 0;
        return (
          <View
            key={i}
            style={[styles.day, on && styles.dayOn, d.today && styles.dayToday]}
          >
            <Text style={styles.dayName}>{d.dn}</Text>
            <Text style={styles.dayNum}>{d.dd}</Text>
            <Text style={[styles.dayHours, on ? { color: colors.success } : { color: colors.textFaint }]}>
              {on ? (d.hours as number).toFixed(1) : '—'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Filter chips (horizontal) ───────────────────────────────────────────────
export function FilterChips({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
      {items.map((it) => {
        const on = it === value;
        return (
          <Pressable key={it} onPress={() => onChange(it)} style={[styles.nf, on && styles.nfOn]}>
            <Text style={[styles.nfText, on && { color: '#fff' }]}>{it}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── Segmented control ───────────────────────────────────────────────────────
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.seg}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} style={[styles.segBtn, on && styles.segOn]}>
            <Text style={[styles.segText, on && { color: '#fff' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  li: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  liBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  liTitle: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  liSub: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  jobHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  jobTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  jobSub: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dest: {
    borderRadius: radius.card,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  destLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  destLabel: { fontSize: 11, fontWeight: '600', color: '#A9B6C9' },
  destTitle: { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 4, letterSpacing: -0.2 },
  destSub: { fontSize: 12, color: '#B8C4DC', marginTop: 1 },
  destRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 13,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  destK: { fontSize: 10.5, color: '#A9B6C9', fontWeight: '600' },
  destV: { fontSize: 16, fontWeight: '800', color: '#fff', marginTop: 2 },
  week: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingVertical: 9,
    alignItems: 'center',
    gap: 3,
  },
  dayOn: { backgroundColor: colors.orangeBg, borderColor: colors.orangeBorder },
  dayToday: { borderColor: colors.warning },
  dayName: { fontSize: 9.5, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase' },
  dayNum: { fontSize: 14, fontWeight: '700', color: colors.text },
  dayHours: { fontSize: 9.5, fontWeight: '600' },
  nf: {
    paddingVertical: 6,
    paddingHorizontal: 13,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  nfOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  nfText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  seg: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.control,
    padding: 4,
    gap: 4,
  },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.chip },
  segOn: { backgroundColor: colors.orange },
  segText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
});
