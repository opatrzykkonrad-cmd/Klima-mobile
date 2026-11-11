import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getMeta, setMeta } from '../db/settings';

const CHANNEL_ID = 'reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function setupNotifications(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Przypomnienia serwisowe',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#4FC3E0',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

/** Codzienne powiadomienie o godzinie wysyłki – zabezpieczenie, gdy Android uśpi zadanie w tle. */
export async function scheduleDailyCheck(hhmm: string): Promise<void> {
  const prev = await getMeta('daily_notification_id');
  if (prev) await Notifications.cancelScheduledNotificationAsync(prev).catch(() => undefined);
  const [hour, minute] = hhmm.split(':').map(Number);
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Przypomnienia o serwisie',
      body: 'Sprawdź dzisiejszą kolejkę SMS do klientów.',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: CHANNEL_ID },
  });
  await setMeta('daily_notification_id', id);
}

export async function notifyNow(title: string, body: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: { channelId: CHANNEL_ID } });
}
