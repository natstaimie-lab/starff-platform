/**
 * Shift wake-up reminders.
 *
 * When a worker confirms they'll attend a booking, we offer a one-tap wake-up
 * reminder — a local notification scheduled for the morning of the shift. The
 * wake time is worked backwards from clock-in using the same sensible defaults
 * as the "Plan my journey" screen (arrive-early buffer + travel + morning prep),
 * which the worker can still fine-tune there.
 *
 * This is a LOCAL notification (fires on-device even when the app is closed) —
 * it does not require push/remote notifications.
 */
import { Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Shift } from '@/lib/types';

// Defaults mirror the "Plan my journey" screen: 15 min early + 45 min public
// transport + 33 min prep (shower 15 / breakfast 10 / get ready 8) = 93 min.
const EARLY_MIN = 15;
const TRAVEL_MIN = 45;
const PREP_MIN = 33;
const LEAD_MIN = EARLY_MIN + TRAVEL_MIN + PREP_MIN;

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** The default wake-up time for a shift (clock-in minus prep + travel + buffer). */
export function wakeTimeFor(shift: Pick<Shift, 'startAt'>): Date {
  return new Date(new Date(shift.startAt).getTime() - LEAD_MIN * 60000);
}

const siteName = (shift: Shift): string =>
  shift.site?.name ?? shift.site?.city ?? shift.job?.client?.name ?? 'the site';

/** Schedule the local wake-up notification. Returns false if it couldn't. */
export async function scheduleWakeReminder(shift: Shift): Promise<boolean> {
  const clockIn = new Date(shift.startAt);
  const wake = wakeTimeFor(shift);
  if (wake.getTime() <= Date.now()) {
    Alert.alert('Too soon', "This shift's wake-up time has already passed.");
    return false;
  }
  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Notifications off', 'Enable notifications to set a wake-up reminder.');
    return false;
  }
  const leaveHome = new Date(clockIn.getTime() - (EARLY_MIN + TRAVEL_MIN) * 60000);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Time to get up — ${shift.job?.title ?? 'shift'}`,
      body: `Leave home by ${fmt(leaveHome)} to reach ${siteName(shift)} for ${fmt(clockIn)}.`,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: wake },
  });
  return true;
}

/**
 * Offer a wake-up reminder right after a worker confirms they'll attend.
 * No-ops silently when the wake time has already passed (e.g. a same-day
 * confirmation) so we never nag with a useless prompt.
 */
export function offerWakeReminder(shift: Shift): void {
  const wake = wakeTimeFor(shift);
  if (wake.getTime() <= Date.now()) return;
  const clockIn = new Date(shift.startAt);
  const dayLabel = clockIn.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  Alert.alert(
    "You're confirmed 🎉",
    `Want a wake-up reminder for ${dayLabel}? We'll wake you at ${fmt(wake)} — enough time to get ready and travel to ${siteName(shift)} for ${fmt(clockIn)}.`,
    [
      { text: 'Not now', style: 'cancel' },
      {
        text: `Set for ${fmt(wake)}`,
        onPress: async () => {
          try {
            const ok = await scheduleWakeReminder(shift);
            if (ok) {
              Alert.alert('Reminder set', `We'll wake you at ${fmt(wake)}. You can fine-tune the timing any time under "Plan my journey".`);
            }
          } catch {
            Alert.alert('Could not set reminder', 'Please try again.');
          }
        },
      },
    ],
  );
}
