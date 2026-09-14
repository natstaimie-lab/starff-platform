/**
 * Shared dark-gradient shell for the auth screens (login / register), matching
 * the prototype's navy radial background and white brand wordmark.
 */
import React, { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme/tokens';
import { logos, LOGO_ASPECT } from '@/theme/logos';
import { Icon } from '@/components/Icon';
import { ScrollLockContext } from '@/components/scrollLock';

export function AuthShell({
  children,
  onBack,
}: {
  children: React.ReactNode;
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const lock = useCallback(() => setScrollEnabled(false), []);
  const unlock = useCallback(() => setScrollEnabled(true), []);
  return (
    <LinearGradient
      colors={[colors.authTop, colors.authMid, colors.authBottom]}
      locations={[0, 0.55, 1]}
      style={{ flex: 1 }}
    >
      <StatusBar style="light" />
      <ScrollView
        scrollEnabled={scrollEnabled}
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets={true}
        contentInsetAdjustmentBehavior="always"
        showsVerticalScrollIndicator={false}
      >
        {onBack ? (
          <Text onPress={onBack} style={styles.back}>
            <Icon name="arrow-left" size={20} color="#fff" />
          </Text>
        ) : null}
        <View style={styles.brand}>
          <Image source={logos.white} style={styles.logo} resizeMode="contain" />
        </View>
        <ScrollLockContext.Provider value={{ lock, unlock }}>
          {children}
        </ScrollLockContext.Provider>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: 4 },
  brand: { alignItems: 'center', paddingTop: 30, paddingBottom: 8 },
  logo: { width: 150, height: 150 / LOGO_ASPECT },
});
