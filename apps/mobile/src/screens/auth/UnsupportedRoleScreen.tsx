import React from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { Button, EmptyState } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useAuth } from '@/auth/AuthContext';

/**
 * Shown when a signed-in user is neither a candidate nor an employer (e.g. an
 * admin/recruiter). Admin functions stay in the web dashboard by design.
 */
export function UnsupportedRoleScreen() {
  const { signOut } = useAuth();
  return (
    <SafeAreaView style={styles.root}>
      <View style={{ flex: 1 }}>
        <EmptyState
          icon="shield-check"
          title="This app is for workers & employers"
          subtitle="Your account is a Starff staff account. Please use the admin dashboard on the web. You can sign out and log in with a worker or employer account here."
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
