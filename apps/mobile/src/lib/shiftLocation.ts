/**
 * Location check at clock-in / clock-out. The phone's position is sent with the
 * check-in and check-out; the API works out how far it is from the site and
 * shows staff. Workers must allow location to check in, but a weak GPS fix
 * never stops them: if the phone can't get a position in time, the check-in
 * goes ahead without one and staff see "no location".
 */
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';

export type ShiftPosition = { lat: number; lng: number; accuracy?: number };

/**
 * Resolves to the position, `null` if no fix could be had (still OK to check in),
 * or `'denied'` if the worker refused location (don't check in).
 */
export async function getShiftPosition(): Promise<ShiftPosition | null | 'denied'> {
  let perm = await Location.getForegroundPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      'Location needed',
      'Starff checks you’re at the site when you check in and out. Please allow location for Starff in Settings.',
      [{ text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }],
    );
    return 'denied';
  }
  try {
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
    ]);
    if (pos) return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? undefined };
  } catch {
    // fall through to the last known position
  }
  const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }).catch(() => null);
  return last ? { lat: last.coords.latitude, lng: last.coords.longitude, accuracy: last.coords.accuracy ?? undefined } : null;
}
