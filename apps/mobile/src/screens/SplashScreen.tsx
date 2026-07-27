import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme/tokens';
import { logos } from '@/theme/logos';

/** Brand splash — the mark on top with the STARFF wordmark underneath. */
export function SplashScreen() {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Image source={logos.mark} style={styles.mark} resizeMode="contain" />
      <Text style={styles.tag}>The people you need, when you need them.</Text>
      <ActivityIndicator color={colors.orange} style={{ marginTop: 30 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { width: 240, height: 240 },
  tag: { color: '#A9B6C9', fontSize: 13, marginTop: 18 },
});
