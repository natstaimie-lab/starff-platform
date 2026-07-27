/**
 * Push-notification helpers (Expo). Kept resilient:
 *  - a device push TOKEN can only be minted on a physical device, and in Expo
 *    Go it also needs an EAS projectId; when that isn't available we skip
 *    cleanly (the in-app notification list still works, and a dev/EAS build
 *    enables real delivery — see docs/MOBILE.md).
 *  - the user's preference (default ON) gates registration.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREF_KEY = 'starff_push_enabled';

// Show a banner + list entry + badge for foreground notifications.
Notifications.setNotificationHandler({
  handleNotification: async () =>
    ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }) as Notifications.NotificationBehavior,
});

export async function getPushEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(PREF_KEY);
  return v === null ? true : v === 'true';
}

export async function setPushEnabled(on: boolean): Promise<void> {
  await AsyncStorage.setItem(PREF_KEY, on ? 'true' : 'false');
}

/** Request permission (if needed) and return this device's Expo push token, or null. */
export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#F47A20',
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any).easConfig?.projectId;

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return tokenData.data;
  } catch {
    // Expo Go without an EAS projectId, or an offline mint — skip.
    return null;
  }
}
