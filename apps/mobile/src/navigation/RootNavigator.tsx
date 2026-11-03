/**
 * RootNavigator — branches the whole app on auth state + role.
 *
 *   loading / resolving        → Splash
 *   no session or unknown role → Auth stack (login / register)
 *   role = candidate           → Candidate tab app
 *   role = employer            → Employer tab app
 *   role = staff               → MFA gate → Staff (admin/recruiter) tab app
 *
 * This is where "the app identifies the user's role after login and loads the
 * correct navigation, dashboard, permissions and features" is enforced.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '@/auth/AuthContext';
import { SplashScreen } from '@/screens/SplashScreen';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { RegisterScreen } from '@/screens/auth/RegisterScreen';
import { UnsupportedRoleScreen } from '@/screens/auth/UnsupportedRoleScreen';
import { CandidateTabs } from '@/navigation/CandidateTabs';
import { EmployerTabs } from '@/navigation/EmployerTabs';
import { StaffApp } from '@/navigation/StaffTabs';
import { PushRegistrar } from '@/notifications/PushRegistrar';

export type AuthStackParams = {
  Login: undefined;
  Register: { role?: 'candidate' | 'employer' } | undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParams>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

export function RootNavigator() {
  const { loading, session, role, resolvingRole } = useAuth();

  let content: React.ReactNode;
  if (loading || (session && resolvingRole)) {
    content = <SplashScreen />;
  } else if (!session) {
    content = <AuthNavigator />;
  } else if (role === 'candidate') {
    content = <CandidateTabs />;
  } else if (role === 'employer') {
    content = <EmployerTabs />;
  } else if (role === 'staff') {
    content = <StaffApp />;
  } else {
    // Signed in but the role couldn't be resolved (no profile / API down).
    content = <UnsupportedRoleScreen />;
  }

  return (
    <>
      <NavigationContainer>{content}</NavigationContainer>
      {/* Staff register push inside StaffApp, once MFA is complete. */}
      {session && role && role !== 'staff' ? <PushRegistrar /> : null}
    </>
  );
}
