import { getDb, DEFAULT_SETTINGS } from './database';
import type { Settings, SmsMode } from '../types';

const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS);

function toSettings(map: Record<string, string>): Settings {
  const v = (k: string) => map[k] ?? DEFAULT_SETTINGS[k] ?? '';
  const mode = v('sms_mode');
  const sub = v('sim_subscription_id');
  return {
    sms_template: v('sms_template'),
    days_before: Number(v('days_before')) || 0,
    send_hour: v('send_hour'),
    sms_mode: (['SIM', 'SMSAPI', 'MOCK'].includes(mode) ? mode : 'SIM') as SmsMode,
    smsapi_token: v('smsapi_token'),
    smsapi_sender: v('smsapi_sender'),
    sim_delay_sec: Number(v('sim_delay_sec')) || 4,
    sim_subscription_id: sub === '' ? null : Number(sub),
    auto_send: v('auto_send') === '1',
    sms_normalize: v('sms_normalize') === '1',
  };
}

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return toSettings(map);
}

export type SettingsErrors = Partial<Record<keyof Settings, string>>;

export function validateSettings(s: Partial<Settings>): SettingsErrors {
  const e: SettingsErrors = {};
  if (s.sms_template !== undefined) {
    const t = s.sms_template.trim();
    if (!t) e.sms_template = 'Szablon nie może być pusty';
    else if (t.length > 900) e.sms_template = 'Szablon jest za długi (max 900 znaków)';
  }
  if (s.days_before !== undefined && (!Number.isInteger(s.days_before) || s.days_before < 0 || s.days_before > 90)) {
    e.days_before = 'Podaj liczbę dni od 0 do 90';
  }
  if (s.send_hour !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.send_hour)) {
    e.send_hour = 'Godzina w formacie HH:MM';
  }
  if (s.sim_delay_sec !== undefined && (!Number.isFinite(s.sim_delay_sec) || s.sim_delay_sec < 2 || s.sim_delay_sec > 60)) {
    e.sim_delay_sec = 'Opóźnienie od 2 do 60 sekund';
  }
  if (s.smsapi_sender !== undefined && s.smsapi_sender.trim() && !/^[A-Za-z0-9 .\-]{1,11}$/.test(s.smsapi_sender.trim())) {
    e.smsapi_sender = 'Do 11 znaków: litery, cyfry, spacja, kropka, myślnik';
  }
  if (s.sms_mode === 'SMSAPI' && s.smsapi_token !== undefined && !s.smsapi_token.trim()) {
    e.smsapi_token = 'Tryb SMSAPI wymaga tokenu';
  }
  return e;
}

export async function saveSettings(partial: Partial<Settings>): Promise<{ errors?: SettingsErrors; settings?: Settings }> {
  const errors = validateSettings(partial);
  if (Object.keys(errors).length) return { errors };
  const db = await getDb();
  const entries: [string, string][] = [];
  for (const [k, raw] of Object.entries(partial)) {
    if (!SETTINGS_KEYS.includes(k)) continue;
    let val: string;
    if (typeof raw === 'boolean') val = raw ? '1' : '0';
    else if (raw === null || raw === undefined) val = '';
    else val = typeof raw === 'string' ? raw.trim() : String(raw);
    entries.push([k, val]);
  }
  await db.withTransactionAsync(async () => {
    for (const [k, v] of entries) {
      await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, v);
    }
  });
  return { settings: await getSettings() };
}

/** Wewnętrzne wartości techniczne (np. data ostatniego automatycznego przebiegu). */
export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', `meta_${key}`);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    `meta_${key}`, value,
  );
}
