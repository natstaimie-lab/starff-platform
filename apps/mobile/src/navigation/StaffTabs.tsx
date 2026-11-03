/**
 * Staff (ADMIN / RECRUITER) mode — Home · Timesheets · Inbox · Candidates · More.
 *
 * Gated behind two-step verification (Supabase aal2), mirroring the admin
 * dashboard's MfaGate. The API enforces the same rule on every staff route
 * when REQUIRE_STAFF_MFA is on, so this gate is UX, not the security boundary.
 */
import React, { useCallback, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@/theme/tokens';
import { Icon } from '@/components/Icon';
import { PushRegistrar } from '@/notifications/PushRegistrar';
import { StaffMfaScreen } from '@/screens/staff/StaffMfaScreen';
import { StaffHomeScreen } from '@/screens/staff/StaffHomeScreen';
import { StaffTimesheetsScreen } from '@/screens/staff/StaffTimesheetsScreen';
import { StaffInboxScreen } from '@/screens/staff/StaffInboxScreen';
import { StaffConversationScreen } from '@/screens/staff/StaffConversationScreen';
import { StaffCandidatesScreen } from '@/screens/staff/StaffCandidatesScreen';
import { StaffCandidateDetailScreen } from '@/screens/staff/StaffCandidateDetailScreen';
import { StaffJobsScreen } from '@/screens/staff/StaffJobsScreen';
import { StaffMoreScreen } from '@/screens/staff/StaffMoreScreen';
import { NotificationsScreen } from '@/screens/shared/NotificationsScreen';

const Tab = createBottomTabNavigator();
const opts = { headerShown: false } as const;

const HomeNav = createNativeStackNavigator();
function HomeStack() {
  return (
    <HomeNav.Navigator screenOptions={opts}>
      <HomeNav.Screen name="HomeMain" component={StaffHomeScreen} />
      <HomeNav.Screen name="Jobs" component={StaffJobsScreen} />
    </HomeNav.Navigator>
  );
}

const TimesheetsNav = createNativeStackNavigator();
function TimesheetsStack() {
  return (
    <TimesheetsNav.Navigator screenOptions={opts}>
      <TimesheetsNav.Screen name="TimesheetsMain" component={StaffTimesheetsScreen} />
    </TimesheetsNav.Navigator>
  );
}

const InboxNav = createNativeStackNavigator();
function InboxStack() {
  return (
    <InboxNav.Navigator screenOptions={opts}>
      <InboxNav.Screen name="InboxMain" component={StaffInboxScreen} />
      <InboxNav.Screen name="Conversation" component={StaffConversationScreen} />
    </InboxNav.Navigator>
  );
}

const CandidatesNav = createNativeStackNavigator();
function CandidatesStack() {
  return (
    <CandidatesNav.Navigator screenOptions={opts}>
      <CandidatesNav.Screen name="CandidatesMain" component={StaffCandidatesScreen} />
      <CandidatesNav.Screen name="CandidateDetail" component={StaffCandidateDetailScreen} />
    </CandidatesNav.Navigator>
  );
}

const MoreNav = createNativeStackNavigator();
function MoreStack() {
  return (
    <MoreNav.Navigator screenOptions={opts}>
      <MoreNav.Screen name="MoreMain" component={StaffMoreScreen} />
      <MoreNav.Screen name="Jobs" component={StaffJobsScreen} />
      <MoreNav.Screen name="Notifications" component={NotificationsScreen} />
    </MoreNav.Navigator>
  );
}

const TAB_ICONS: Record<string, string> = {
  Home: 'home',
  Timesheets: 'clock',
  Inbox: 'message',
  Candidates: 'users',
  More: 'dots-vertical',
};

function StaffTabs() {
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
        tabBarIcon: ({ color }) => <Icon name={TAB_ICONS[route.name] ?? 'circle'} size={23} color={color} />,
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen name="Timesheets" component={TimesheetsStack} />
      <Tab.Screen name="Inbox" component={InboxStack} />
      <Tab.Screen name="Candidates" component={CandidatesStack} />
      <Tab.Screen name="More" component={MoreStack} />
    </Tab.Navigator>
  );
}

/** MFA gate → staff tabs. Push registers only once the session is aal2. */
export function StaffApp() {
  const [verified, setVerified] = useState(false);
  const onVerified = useCallback(() => setVerified(true), []);
  if (!verified) return <StaffMfaScreen onVerified={onVerified} />;
  return (
    <>
      <StaffTabs />
      <PushRegistrar />
    </>
  );
}
