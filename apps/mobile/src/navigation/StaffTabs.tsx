/**
 * Staff bottom-tab navigator — Home · Timesheets · Workers · Messages · Alerts.
 * StaffRoot keeps all of it behind the MFA gate, matching the admin dashboard.
 */
import React, { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@/theme/tokens';
import { Icon } from '@/components/Icon';
import { PushRegistrar } from '@/notifications/PushRegistrar';
import { NotificationsScreen } from '@/screens/shared/NotificationsScreen';
import { StaffMfaScreen } from '@/screens/staff/MfaScreen';
import { StaffHomeScreen } from '@/screens/staff/HomeScreen';
import { StaffAccountScreen } from '@/screens/staff/AccountScreen';
import { StaffTimesheetsScreen } from '@/screens/staff/TimesheetsScreen';
import { StaffWorkersScreen } from '@/screens/staff/WorkersScreen';
import { StaffWorkerDetailScreen } from '@/screens/staff/WorkerDetailScreen';
import { StaffWorkerEmailScreen } from '@/screens/staff/WorkerEmailScreen';
import { StaffInboxScreen } from '@/screens/staff/InboxScreen';
import { StaffThreadScreen } from '@/screens/staff/ThreadScreen';

const Tab = createBottomTabNavigator();

const HomeStackNav = createNativeStackNavigator();
function HomeStack() {
  return (
    <HomeStackNav.Navigator screenOptions={{ headerShown: false }}>
      <HomeStackNav.Screen name="HomeMain" component={StaffHomeScreen} />
      <HomeStackNav.Screen name="Account" component={StaffAccountScreen} />
    </HomeStackNav.Navigator>
  );
}

const WorkersStackNav = createNativeStackNavigator();
function WorkersStack() {
  return (
    <WorkersStackNav.Navigator screenOptions={{ headerShown: false }}>
      <WorkersStackNav.Screen name="WorkersMain" component={StaffWorkersScreen} />
      <WorkersStackNav.Screen name="WorkerDetail" component={StaffWorkerDetailScreen} />
      <WorkersStackNav.Screen name="WorkerEmail" component={StaffWorkerEmailScreen} />
    </WorkersStackNav.Navigator>
  );
}

const MessagesStackNav = createNativeStackNavigator();
function MessagesStack() {
  return (
    <MessagesStackNav.Navigator screenOptions={{ headerShown: false }}>
      <MessagesStackNav.Screen name="Inbox" component={StaffInboxScreen} />
      <MessagesStackNav.Screen name="Thread" component={StaffThreadScreen} />
    </MessagesStackNav.Navigator>
  );
}

function singleStack(Component: React.ComponentType) {
  const S = createNativeStackNavigator();
  return function Wrapper() {
    return (
      <S.Navigator screenOptions={{ headerShown: false }}>
        <S.Screen name="index" component={Component} />
      </S.Navigator>
    );
  };
}

const TimesheetsStack = singleStack(StaffTimesheetsScreen);
const AlertsStack = singleStack(NotificationsScreen);

const TAB_ICONS: Record<string, string> = {
  Home: 'home',
  Timesheets: 'clock',
  Workers: 'users',
  Messages: 'message',
  Alerts: 'bell',
};

export function StaffTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.orange,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 84,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarIcon: ({ color }) => (
          <Icon name={TAB_ICONS[route.name] ?? 'circle'} size={23} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen name="Timesheets" component={TimesheetsStack} />
      <Tab.Screen name="Workers" component={WorkersStack} />
      <Tab.Screen name="Messages" component={MessagesStack} />
      <Tab.Screen name="Alerts" component={AlertsStack} />
    </Tab.Navigator>
  );
}

export function StaffRoot() {
  const [verified, setVerified] = useState(false);
  if (!verified) return <StaffMfaScreen onVerified={() => setVerified(true)} />;
  return (
    <>
      <StaffTabs />
      <PushRegistrar />
    </>
  );
}
