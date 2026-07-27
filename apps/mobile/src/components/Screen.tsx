/**
 * Screen scaffolding: a safe-area aware header (AppBar) and a scrolling body.
 * Handles device notches/home-indicators and keyboard avoidance so individual
 * screens stay focused on content.
 */
import React from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme/tokens';
import { logos, LOGO_ASPECT } from '@/theme/logos';
import { Icon } from '@/components/Icon';

export function AppBar({
  title,
  subtitle,
  eyebrow,
  onBack,
  backIcon = 'arrow-left',
  right,
  brand,
}: {
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  onBack?: () => void;
  backIcon?: string;
  right?: React.ReactNode;
  brand?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.appbar, { paddingTop: insets.top + 6 }]}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={10} style={styles.backBtn}>
          <Icon name={backIcon} size={20} color={colors.text} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {brand ? <Image source={logos.horizontal} style={styles.brandLogo} resizeMode="contain" /> : null}
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        {title ? (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function ActionButton({
  icon,
  onPress,
  dot,
}: {
  icon: string;
  onPress?: () => void;
  dot?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={styles.actBtn} hitSlop={8}>
      <Icon name={icon} size={18} color={colors.textMuted} />
      {dot ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

export function ScreenScroll({
  children,
  contentStyle,
  refreshing,
  onRefresh,
}: {
  children: React.ReactNode;
  contentStyle?: ViewStyle;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.body}
        contentContainerStyle={[
          { padding: 18, paddingBottom: insets.bottom + 24, gap: 14 },
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={colors.orange}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  appbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 18,
    paddingBottom: 12,
    backgroundColor: colors.bg,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLogo: { width: 88, height: 88 / LOGO_ASPECT, marginBottom: 5 },
  eyebrow: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  title: { fontSize: 21, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  actBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.error,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  body: { flex: 1, backgroundColor: colors.bg },
});
