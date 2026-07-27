/**
 * Employer bottom-tab navigator — Home · Talent · Post · Hours · Alerts.
 * The Home tab is a stack that also hosts the management detail screens
 * (Account, Bookings, Invoices, Company setup, Messages).
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@/theme/tokens';
import { Icon } from '@/components/Icon';
import { EmployerHomeScreen } from '@/screens/employer/HomeScreen';
import { EmployerTalentScreen } from '@/screens/employer/TalentScreen';
import { EmployerPostScreen } from '@/screens/employer/PostScreen';
import { EmployerHoursScreen } from '@/screens/employer/HoursScreen';
import { EmployerAccountScreen } from '@/screens/employer/AccountScreen';
import { EmployerBookingsScreen } from '@/screens/employer/BookingsScreen';
import { EmployerInvoicesScreen } from '@/screens/employer/InvoicesScreen';
import { EmployerInvoiceDetailScreen } from '@/screens/employer/InvoiceDetailScreen';
import { EmployerCompanyScreen } from '@/screens/employer/CompanyScreen';
import { EmployerSubmissionsScreen } from '@/screens/employer/SubmissionsScreen';
import { MessagesScreen } from '@/screens/candidate/MessagesScreen';
import { NotificationsScreen } from '@/screens/shared/NotificationsScreen';

const Tab = createBottomTabNavigator();

const HomeStackNav = createNativeStackNavigator();
function HomeStack() {
  return (
    <HomeStackNav.Navigator screenOptions={{ headerShown: false }}>
      <HomeStackNav.Screen name="HomeMain" component={EmployerHomeScreen} />
      <HomeStackNav.Screen name="Account" component={EmployerAccountScreen} />
      <HomeStackNav.Screen name="Bookings" component={EmployerBookingsScreen} />
      <HomeStackNav.Screen name="Submissions" component={EmployerSubmissionsScreen} />
      <HomeStackNav.Screen name="Invoices" component={EmployerInvoicesScreen} />
      <HomeStackNav.Screen name="InvoiceDetail" component={EmployerInvoiceDetailScreen} />
      <HomeStackNav.Screen name="Company" component={EmployerCompanyScreen} />
      <HomeStackNav.Screen name="Messages" component={MessagesScreen} />
    </HomeStackNav.Navigator>
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

const TalentStack = singleStack(EmployerTalentScreen);
const PostStack = singleStack(EmployerPostScreen);
const HoursStack = singleStack(EmployerHoursScreen);
const AlertsStack = singleStack(NotificationsScreen);

const TAB_ICONS: Record<string, string> = {
  Home: 'home',
  Talent: 'users',
  Post: 'plus',
  Hours: 'clock',
  Alerts: 'bell',
};

export function EmployerTabs() {
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
      <Tab.Screen name="Talent" component={TalentStack} />
      <Tab.Screen name="Post" component={PostStack} />
      <Tab.Screen name="Hours" component={HoursStack} />
      <Tab.Screen name="Alerts" component={AlertsStack} />
    </Tab.Navigator>
  );
}
