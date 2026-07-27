/**
 * The ONE Supabase client for the mobile app.
 *
 * This connects to the SAME Supabase Auth project the website, admin
 * dashboard, candidate portal and client portal use — so a user's login
 * works everywhere. There is NO separate mobile auth system.
 *
 * The session is persisted through LargeSecureStore (encrypted, hardware
 * secure store) rather than plain AsyncStorage.
 */
import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { config } from '@/config/env';
import { largeSecureStore } from '@/lib/secureStore';

export const supabase = createClient(
  config.supabaseUrl,
  config.supabaseAnonKey,
  {
    auth: {
      storage: largeSecureStore,
      autoRefreshToken: true,
      persistSession: true,
      // No URL session detection on native (that's a web-only concern).
      detectSessionInUrl: false,
    },
  },
);

// Keep tokens fresh while the app is in the foreground, and stop the timer
// in the background (recommended by Supabase for React Native).
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
