import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { getQueue } from '../db/clients';
import { getMeta, getSettings, setMeta } from '../db/settings';
import { nowHHMM, todayISO } from '../utils/dates';
import { notifyNow } from './notifications';
import { isQueueRunning, QueueSummary, sendQueue } from './queue';
import { canSendSilently } from './sms/sim';

export const BACKGROUND_TASK = 'klima-reminder-check';

export type AutoCheckResult =
  | { ran: true; summary: QueueSummary }
  | { ran: false; reason: 'before-hour' | 'already-done' | 'disabled' | 'needs-user' | 'busy' | 'empty'; pending: number };

/**
 * Wspólna logika automatu: zadanie w tle i start aplikacji.
 * Raz dziennie, po godzinie z ustawień, wysyła kolejkę – o ile da się to zrobić bez udziału użytkownika.
 */
export async function runAutoCheck(): Promise<AutoCheckResult> {
  const settings = await getSettings();
  const today = todayISO();
  if (nowHHMM() < settings.send_hour) return { ran: false, reason: 'before-hour', pending: 0 };
  if ((await getMeta('last_auto_run')) === today) return { ran: false, reason: 'already-done', pending: 0 };
  if (isQueueRunning()) return { ran: false, reason: 'busy', pending: 0 };

  const pending = (await getQueue(settings.days_before)).length;
  if (pending === 0) {
    await setMeta('last_auto_run', today);
    return { ran: false, reason: 'empty', pending };
  }

  const silentOk = settings.sms_mode !== 'SIM' || (await canSendSilently());
  if (!settings.auto_send || !silentOk) {
    if ((await getMeta('last_pending_notice')) !== today) {
      await setMeta('last_pending_notice', today);
      await notifyNow('Przypomnienia czekają na wysyłkę', `${pending} ${pending === 1 ? 'klient czeka' : 'klientów czeka'} na SMS. Otwórz aplikację i wyślij kolejkę.`);
    }
    return { ran: false, reason: settings.auto_send ? 'needs-user' : 'disabled', pending };
  }

  const summary = await sendQueue({ trigger: 'AUTO', interactive: false });
  if (summary.sent || summary.errors) {
    const body = summary.errors
      ? `Wysłano ${summary.sent}, błędy: ${summary.errors}. Sprawdź historię SMS.`
      : `Wysłano ${summary.sent} ${summary.sent === 1 ? 'przypomnienie' : 'przypomnień'} o serwisie.`;
    await notifyNow('Przypomnienia SMS wysłane', body);
  }
  return { ran: true, summary };
}

// Definicja zadania musi być wykonana na poziomie modułu (import w index.ts), zanim aplikacja się zarejestruje.
TaskManager.defineTask(BACKGROUND_TASK, async () => {
  try {
    await runAutoCheck();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    console.warn('[BG] Błąd zadania w tle', err);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Rejestruje okresowe zadanie (Android WorkManager, minimum co ~15 min, w praktyce wg uznania systemu). */
export async function registerBackgroundTask(): Promise<boolean> {
  const status = await BackgroundTask.getStatusAsync();
  if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return false;
  if (!(await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK))) {
    await BackgroundTask.registerTaskAsync(BACKGROUND_TASK, { minimumInterval: 30 });
  }
  return true;
}
