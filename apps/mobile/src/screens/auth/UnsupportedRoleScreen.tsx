import React from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { Button, EmptyState } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useAuth } from '@/auth/AuthContext';

/**
 * Shown when a signed-in user's role can't be resolved — no candidate profile,
 * no client company and not staff (or the API couldn't be reached).
 */
export function UnsupportedRoleScreen() {
  const { signOut } = useAuth();
  return (
    <SafeAreaView style={styles.root}>
      <View style={{ flex: 1 }}>
        <EmptyState
          icon="shield-check"
          title="We couldn't find your account"
          subtitle="This login isn't linked to a worker, employer or Starff staff profile yet — or we couldn't reach Starff just now. Sign out and try again, or contact the Starff team."
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
