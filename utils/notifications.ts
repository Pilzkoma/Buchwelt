import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// ─── Storage Keys ─────────────────────────────────────────────────────────────
const NOTIF_ENABLED_KEY = 'notif_reading_enabled';
const NOTIF_INTERVAL_KEY = 'notif_reading_interval_days';
const NOTIF_SCHEDULED_ID_KEY = 'notif_reading_scheduled_id';

// ─── Constants ────────────────────────────────────────────────────────────────
export const DEFAULT_INTERVAL_DAYS = 3;

export const INTERVAL_OPTIONS = [
  { label: '1 Tag',    days: 1 },
  { label: '2 Tage',   days: 2 },
  { label: '3 Tage',   days: 3 },
  { label: '1 Woche',  days: 7 },
];

const REMINDER_MESSAGES = [
  'Deine Bücher warten! Wie wäre es mit ein paar Seiten heute Abend?',
  'Schon eine Weile nicht gelesen. Zeit für ein neues Kapitel!',
  'Ein Buch liest sich nicht von selbst – los geht\'s!',
  'Kurze Lesepause einplanen? Deine Sammlung freut sich.',
  'Das Bookmark wartet auf dich. Weiter lesen!',
];

// ─── Android Notification Channel Setup ──────────────────────────────────────
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reading-reminders', {
      name: 'Lese-Erinnerungen',
      description: 'Erinnerungen, regelmäßig zu lesen',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4A3728',
    });
  }
}

// ─── Permission ───────────────────────────────────────────────────────────────
export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ─── Settings Persistence ─────────────────────────────────────────────────────
export interface NotificationSettings {
  enabled: boolean;
  intervalDays: number;
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    const enabled = await SecureStore.getItemAsync(NOTIF_ENABLED_KEY);
    const interval = await SecureStore.getItemAsync(NOTIF_INTERVAL_KEY);
    return {
      enabled: enabled !== 'false',
      intervalDays: interval ? parseInt(interval, 10) : DEFAULT_INTERVAL_DAYS,
    };
  } catch {
    return { enabled: true, intervalDays: DEFAULT_INTERVAL_DAYS };
  }
}

export async function saveNotificationSettings(enabled: boolean, intervalDays: number): Promise<void> {
  await SecureStore.setItemAsync(NOTIF_ENABLED_KEY, enabled ? 'true' : 'false');
  await SecureStore.setItemAsync(NOTIF_INTERVAL_KEY, String(intervalDays));
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

export async function cancelReadingReminder(): Promise<void> {
  try {
    const existingId = await SecureStore.getItemAsync(NOTIF_SCHEDULED_ID_KEY);
    if (existingId) {
      await Notifications.cancelScheduledNotificationAsync(existingId);
      await SecureStore.deleteItemAsync(NOTIF_SCHEDULED_ID_KEY);
    }
  } catch {
    // Ignore – no active notification to cancel
  }
}

export async function scheduleReadingReminder(intervalDays: number = DEFAULT_INTERVAL_DAYS): Promise<void> {
  await cancelReadingReminder();

  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return;

  // Fire at 7 PM, X days from now
  const fireDate = new Date();
  fireDate.setDate(fireDate.getDate() + intervalDays);
  fireDate.setHours(19, 0, 0, 0);

  // If today and already past 7 PM, push to tomorrow
  if (fireDate.getTime() <= Date.now()) {
    fireDate.setDate(fireDate.getDate() + 1);
  }

  const body = REMINDER_MESSAGES[Math.floor(Math.random() * REMINDER_MESSAGES.length)];

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '📚 BuchWelt',
        body,
        sound: true,
        ...(Platform.OS === 'android' && { channelId: 'reading-reminders' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireDate,
      },
    });
    await SecureStore.setItemAsync(NOTIF_SCHEDULED_ID_KEY, id);
  } catch (e) {
    console.warn('Notification scheduling failed:', e);
  }
}

// ─── Called after every reading activity ─────────────────────────────────────
// Resets the countdown clock – every time user reads, the reminder pushes back.
export async function onReadingActivity(): Promise<void> {
  try {
    const { enabled, intervalDays } = await getNotificationSettings();
    if (enabled) {
      await scheduleReadingReminder(intervalDays);
    }
  } catch {
    // Non-critical – don't block reading actions
  }
}
