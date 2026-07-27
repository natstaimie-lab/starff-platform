/**
 * Registers this device's Expo push token with the backend once the user is
 * signed in (and has push enabled). Renders nothing. Mounted inside the
 * authenticated navigation tree.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { getExpoPushToken, getPushEnabled } from '@/lib/push';
import { notificationsApi } from '@/lib/endpoints';

export function PushRegistrar() {
  const { session } = useAuth();

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      if (!(await getPushEnabled())) return;
      const token = await getExpoPushToken();
      if (!token || cancelled) return;
      try {
        await notificationsApi.registerPushToken(token, Platform.OS);
      } catch {
        /* best-effort; the in-app list still works without push */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  return null;
}
