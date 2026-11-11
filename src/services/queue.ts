import type { Client, SendResult, SmsTrigger } from '../types';
import { claimForSending, finishSending, getClient, getQueue } from '../db/clients';
import { getLog } from '../db/logs';
import { getSettings, setMeta } from '../db/settings';
import { diffDays, todayISO } from '../utils/dates';
import { renderTemplate } from '../utils/template';
import { sendSms } from './sms';
import { emitDataChanged } from './events';

/** Automat (tło / start aplikacji) pomija terminy przeterminowane o ponad tyle dni – np. po imporcie starej bazy. */
export const AUTO_MAX_OVERDUE_DAYS = 30;

export interface QueueProgress {
  done: number;
  total: number;
  current?: Client;
  lastResult?: SendResult;
}

export interface QueueSummary {
  total: number;
  sent: number;
  errors: number;
  skipped: number;
  cancelled: boolean;
}

let running = false;
export const isQueueRunning = () => running;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function buildReminderText(client: Client): Promise<string> {
  const s = await getSettings();
  return renderTemplate(s.sms_template, client);
}

/** Pojedyncze przypomnienie. Flaga reminder_sent ustawiana tylko po udanej wysyłce. */
export async function sendReminder(client: Client, trigger: SmsTrigger, interactive: boolean): Promise<SendResult> {
  const settings = await getSettings();
  if (!(await claimForSending(client.id))) {
    const fresh = await getClient(client.id);
    if (fresh?.reminder_sent) return { status: 'ERROR', logId: 0, error: 'Przypomnienie w tym cyklu zostało już wysłane' };
    return { status: 'ERROR', logId: 0, error: 'Ten SMS jest właśnie wysyłany' };
  }
  let result: SendResult | null = null;
  try {
    result = await sendSms({
      phone: client.phone,
      message: renderTemplate(settings.sms_template, client),
      clientId: client.id,
      trigger,
      interactive,
      settings,
    });
    return result;
  } finally {
    await finishSending(client.id, result !== null && result.status !== 'ERROR');
    emitDataChanged();
  }
}

/**
 * Wysyła całą kolejkę z opóźnieniem między SMS-ami (ochrona karty SIM przed blokadą antyspamową).
 * Zwraca podsumowanie; postęp raportuje przez onProgress; przerwanie przez shouldCancel().
 */
export async function sendQueue(opts: {
  trigger: SmsTrigger;
  interactive: boolean;
  onProgress?: (p: QueueProgress) => void;
  shouldCancel?: () => boolean;
}): Promise<QueueSummary> {
  if (running) throw new Error('Wysyłka kolejki już trwa');
  running = true;
  const summary: QueueSummary = { total: 0, sent: 0, errors: 0, skipped: 0, cancelled: false };
  try {
    const settings = await getSettings();
    let queue = await getQueue(settings.days_before);
    if (opts.trigger === 'AUTO') {
      const today = todayISO();
      queue = queue.filter((c) => diffDays(c.next_service_date, today) <= AUTO_MAX_OVERDUE_DAYS);
    }
    summary.total = queue.length;
    const delayMs = settings.sms_mode === 'SIM' ? settings.sim_delay_sec * 1000 : settings.sms_mode === 'SMSAPI' ? 400 : 150;

    for (let i = 0; i < queue.length; i++) {
      if (opts.shouldCancel?.()) { summary.cancelled = true; break; }
      const client = queue[i];
      opts.onProgress?.({ done: i, total: queue.length, current: client });
      const r = await sendReminder(client, opts.trigger, opts.interactive);
      if (r.status === 'ERROR') {
        if (r.logId === 0) summary.skipped++; else summary.errors++;
      } else summary.sent++;
      opts.onProgress?.({ done: i + 1, total: queue.length, current: client, lastResult: r });
      if (i < queue.length - 1) await sleep(delayMs);
    }
    if (opts.trigger === 'AUTO') await setMeta('last_auto_run', todayISO());
    await setMeta('last_queue_summary', JSON.stringify({ ...summary, at: new Date().toISOString(), trigger: opts.trigger }));
    return summary;
  } finally {
    running = false;
    emitDataChanged();
  }
}

/** Ponowienie wysyłki z historii (np. po błędzie braku zasięgu). */
export async function retryLog(logId: number): Promise<SendResult> {
  const log = await getLog(logId);
  if (!log) throw new Error('Nie znaleziono wpisu w historii');
  if (log.client_id) {
    const client = await getClient(log.client_id);
    if (client && !client.reminder_sent && client.sms_enabled) {
      return sendReminder(client, 'RETRY', true);
    }
  }
  const r = await sendSms({ phone: log.phone, message: log.message, clientId: log.client_id, trigger: 'RETRY', interactive: true });
  emitDataChanged();
  return r;
}
