import React from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { Button, EmptyState } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useAuth } from '@/auth/AuthContext';

/**
 * Shown when a signed-in account has no usable role: not a worker, employer or
 * staff member, or the role couldn't be confirmed.
 */
export function UnsupportedRoleScreen() {
  const { signOut } = useAuth();
  return (
    <SafeAreaView style={styles.root}>
      <View style={{ flex: 1 }}>
        <EmptyState
          icon="shield-check"
          title="We couldn't open your account"
          subtitle="We couldn't confirm what this account has access to. Check your connection, then sign out and log in again. If it keeps happening, contact the Starff team."
        />
      </View>
      <View style={{ padding: 24 }}>
        <Button title="Sign out" kind="ghost" icon="logout" onPress={signOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
