/**
 * Candidate bottom-tab navigator — Home · Roles · AI · Hours · Profile.
 * Each tab is its own native stack so detail screens (messages, add hours,
 * documents, availability, declarations, payroll, profile edit) push over it.
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@/theme/tokens';
import { Icon } from '@/components/Icon';
import type {
  HomeStackParamList,
  HoursStackParamList,
  ProfileStackParamList,
} from '@/navigation/types';

import { CandidateHomeScreen } from '@/screens/candidate/HomeScreen';
import { CandidateBookingsScreen } from '@/screens/candidate/BookingsScreen';
import { CandidateRolesScreen } from '@/screens/candidate/RolesScreen';
import { CandidateAIScreen } from '@/screens/candidate/AIScreen';
import { CandidateHoursScreen } from '@/screens/candidate/HoursScreen';
import { CandidateProfileScreen } from '@/screens/candidate/ProfileScreen';
import { MessagesScreen } from '@/screens/candidate/MessagesScreen';
import { NotificationsScreen } from '@/screens/shared/NotificationsScreen';
import { TravelScreen } from '@/screens/candidate/TravelScreen';
import { AddHoursScreen } from '@/screens/candidate/AddHoursScreen';
import { DocumentsScreen } from '@/screens/candidate/DocumentsScreen';
import { VettingScreen } from '@/screens/candidate/VettingScreen';
import { AvailabilityScreen } from '@/screens/candidate/AvailabilityScreen';
import { DeclarationsScreen } from '@/screens/candidate/DeclarationsScreen';
import { PayrollScreen } from '@/screens/candidate/PayrollScreen';
import { ProfileEditScreen } from '@/screens/candidate/ProfileEditScreen';
import { PaymentScreen } from '@/screens/candidate/PaymentScreen';

const Tab = createBottomTabNavigator();

const HomeStackNav = createNativeStackNavigator<HomeStackParamList>();
function HomeStack() {
  return (
    <HomeStackNav.Navigator screenOptions={{ headerShown: false }}>
      <HomeStackNav.Screen name="HomeMain" component={CandidateHomeScreen} />
      <HomeStackNav.Screen name="Bookings" component={CandidateBookingsScreen} />
      <HomeStackNav.Screen name="Messages" component={MessagesScreen} />
      <HomeStackNav.Screen name="Notifications" component={NotificationsScreen} />
      <HomeStackNav.Screen name="Travel" component={TravelScreen} />
    </HomeStackNav.Navigator>
  );
}

const HoursStackNav = createNativeStackNavigator<HoursStackParamList>();
function HoursStack() {
  return (
    <HoursStackNav.Navigator screenOptions={{ headerShown: false }}>
      <HoursStackNav.Screen name="HoursMain" component={CandidateHoursScreen} />
      <HoursStackNav.Screen name="AddHours" component={AddHoursScreen} />
    </HoursStackNav.Navigator>
  );
}

const ProfileStackNav = createNativeStackNavigator<ProfileStackParamList>();
function ProfileStack() {
  return (
    <ProfileStackNav.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStackNav.Screen name="ProfileMain" component={CandidateProfileScreen} />
      <ProfileStackNav.Screen name="ProfileEdit" component={ProfileEditScreen} />
      <ProfileStackNav.Screen name="Vetting" component={VettingScreen} />
      <ProfileStackNav.Screen name="Documents" component={DocumentsScreen} />
      <ProfileStackNav.Screen name="Availability" component={AvailabilityScreen} />
      <ProfileStackNav.Screen name="Declarations" component={DeclarationsScreen} />
      <ProfileStackNav.Screen name="Payroll" component={PayrollScreen} />
      <ProfileStackNav.Screen name="Payment" component={PaymentScreen} />
    </ProfileStackNav.Navigator>
  );
}

const RolesStackNav = createNativeStackNavigator();
function RolesStack() {
  return (
    <RolesStackNav.Navigator screenOptions={{ headerShown: false }}>
      <RolesStackNav.Screen name="RolesMain" component={CandidateRolesScreen} />
    </RolesStackNav.Navigator>
  );
}

const AIStackNav = createNativeStackNavigator();
function AIStack() {
  return (
    <AIStackNav.Navigator screenOptions={{ headerShown: false }}>
      <AIStackNav.Screen name="AIMain" component={CandidateAIScreen} />
    </AIStackNav.Navigator>
  );
}

const TAB_ICONS: Record<string, string> = {
  Home: 'home',
  Roles: 'briefcase',
  AI: 'robot',
  Hours: 'clock',
  Profile: 'user',
};

export function CandidateTabs() {
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
      <Tab.Screen name="Roles" component={RolesStack} options={{ tabBarLabel: 'Offers' }} />
      <Tab.Screen name="AI" component={AIStack} />
      <Tab.Screen name="Hours" component={HoursStack} />
      <Tab.Screen name="Profile" component={ProfileStack} />
    </Tab.Navigator>
  );
}
