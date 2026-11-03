import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBar, ScreenScroll } from '@/components/Screen';
import { Button, Card } from '@/components/ui';
import { ListRow } from '@/components/cards';
import { colors } from '@/theme/tokens';
import { useAuth } from '@/auth/AuthContext';
import { ADMIN_DASHBOARD_URL, titleCase } from '@/screens/staff/format';

export function StaffAccountScreen() {
  const nav = useNavigation<any>();
  const { session, staffRole, signOut } = useAuth();
  return (
    <View style={styles.root}>
      <AppBar title="Account" onBack={() => nav.goBack()} />
      <ScreenScroll>
        <Card tight>
          <ListRow
            icon="shield-check"
            title={session?.user.email ?? 'Staff account'}
            subtitle={staffRole ? titleCase(staffRole) : undefined}
          />
          <ListRow
            icon="briefcase"
            title="Open admin dashboard"
            subtitle="Jobs, bookings, clients, invoices and settings"
            onPress={() => void Linking.openURL(ADMIN_DASHBOARD_URL)}
            last
          />
        </Card>
        <Button title="Sign out" kind="ghost" icon="logout" onPress={signOut} style={{ marginTop: 12 }} />
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
