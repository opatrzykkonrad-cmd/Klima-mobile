import * as SQLite from 'expo-sqlite';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { getDb, migrate } from '../db/database';
import type { Client, SmsLog } from '../types';
import { nowStamp, todayISO } from '../utils/dates';
import type { SmsStatus, SmsTrigger } from '../types';

/** Statusy z innych wersji (np. panel webowy: SENT) mapowane na statusy aplikacji. */
function mapStatus(s: unknown): SmsStatus {
  if (s === 'SENT_SIM' || s === 'SENT_API' || s === 'ERROR' || s === 'MOCK') return s;
  if (s === 'SENT') return 'SENT_API';
  return 'MOCK';
}
function mapTrigger(t: unknown): SmsTrigger {
  return t === 'AUTO' || t === 'MANUAL' || t === 'TEST' || t === 'RETRY' ? t : 'MANUAL';
}
import { emitDataChanged } from './events';

const APP_ID = 'klima-serwis';
const JSON_VERSION = 1;

/** file:///data/.../cache/ -> /data/.../cache (expo-sqlite oczekuje zwykłej ścieżki). */
function uriToPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/\/+$/, '');
}

function freshCacheFile(name: string): File {
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  return f;
}

/** Spójna kopia bazy (SQLite Backup API) do pliku w cache. */
export async function createDbBackupFile(): Promise<File> {
  const db = await getDb();
  const name = `klima-serwis-${todayISO()}.db`;
  const file = freshCacheFile(name);
  for (const suffix of ['-wal', '-shm', '-journal']) {
    const side = new File(Paths.cache, name + suffix);
    if (side.exists) side.delete();
  }
  const dest = await SQLite.openDatabaseAsync(name, {}, uriToPath(Paths.cache.uri));
  try {
    await SQLite.backupDatabaseAsync({ sourceDatabase: db, destDatabase: dest });
  } finally {
    await dest.closeAsync();
  }
  return file;
}

export async function createJsonBackupFile(): Promise<File> {
  const db = await getDb();
  const clients = await db.getAllAsync<Client>('SELECT * FROM clients ORDER BY id');
  const sms_logs = await db.getAllAsync<SmsLog>('SELECT * FROM sms_logs ORDER BY id');
  const settings = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM settings WHERE key NOT LIKE 'meta_%' AND key <> 'smsapi_token'",
  );
  const payload = { app: APP_ID, version: JSON_VERSION, exported_at: new Date().toISOString(), clients, sms_logs, settings };
  const file = freshCacheFile(`klima-serwis-${todayISO()}.json`);
  file.write(JSON.stringify(payload, null, 2));
  return file;
}

/** Udostępnij (Dysk Google, e-mail, komunikator…). */
export async function shareFile(file: File, mimeType: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Udostępnianie nie jest dostępne na tym urządzeniu');
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Zapisz kopię bazy klientów' });
}

/** Zapis do wybranego folderu w pamięci telefonu (np. Pobrane/Dokumenty) przez systemowy wybór folderu. */
export async function saveFileToFolder(file: File, mimeType: string): Promise<string> {
  const dir = await Directory.pickDirectoryAsync();
  const target = dir.createFile(file.name, mimeType);
  target.write(await file.bytes());
  return target.uri;
}

export type ImportResult = { kind: 'db' | 'json'; clients: number; logs: number };

/** Import pliku .db (pełna kopia) lub .json (eksport z aplikacji). Zastępuje bieżące dane. */
export async function importBackup(): Promise<ImportResult | null> {
  const picked = await File.pickFileAsync();
  if (picked.canceled) return null;
  const source = picked.result;
  const bytes = await source.bytes();
  const isSqlite = new TextDecoder().decode(bytes.slice(0, 15)) === 'SQLite format 3';

  return isSqlite ? importDb(bytes) : importJson(new TextDecoder().decode(bytes));
}

async function importDb(bytes: Uint8Array): Promise<ImportResult> {
  const name = 'import-tmp.db';
  const tmp = freshCacheFile(name);
  tmp.write(bytes);
  const imported = await SQLite.openDatabaseAsync(name, {}, uriToPath(Paths.cache.uri));
  try {
    const t = await imported.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('clients','sms_logs','settings')",
    );
    if ((t?.n ?? 0) < 2) throw new Error('To nie jest kopia bazy tej aplikacji (brak tabel klientów)');
    const db = await getDb();
    await SQLite.backupDatabaseAsync({ sourceDatabase: imported, destDatabase: db });
    await migrate(db);
  } finally {
    await imported.closeAsync();
    if (tmp.exists) tmp.delete();
  }
  const db = await getDb();
  const clients = (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM clients'))?.n ?? 0;
  const logs = (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sms_logs'))?.n ?? 0;
  emitDataChanged();
  return { kind: 'db', clients, logs };
}

type JsonBackup = {
  app?: string;
  clients?: Partial<Client>[];
  sms_logs?: Partial<SmsLog>[];
  settings?: { key: string; value: string }[];
};

async function importJson(text: string): Promise<ImportResult> {
  let data: JsonBackup;
  try { data = JSON.parse(text) as JsonBackup; } catch { throw new Error('Plik nie jest prawidłowym JSON ani bazą SQLite'); }
  if (data.app !== APP_ID || !Array.isArray(data.clients)) throw new Error('To nie jest eksport tej aplikacji');

  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.execAsync('DELETE FROM sms_logs; DELETE FROM clients;');
    for (const c of data.clients ?? []) {
      await tx.runAsync(
        `INSERT INTO clients (id, first_name, company_name, phone, address, device_model, last_service_date,
           service_interval_months, next_service_date, reminder_sent, reminder_sent_at, sms_enabled, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now','localtime')), COALESCE(?, datetime('now','localtime')))`,
        c.id ?? null, c.first_name ?? null, c.company_name ?? null, c.phone ?? '', c.address ?? null, c.device_model ?? null,
        c.last_service_date ?? todayISO(), c.service_interval_months ?? 12, c.next_service_date ?? todayISO(),
        c.reminder_sent ?? 0, c.reminder_sent_at ?? null, c.sms_enabled ?? 1, c.notes ?? null, c.created_at ?? null, c.updated_at ?? null,
      );
    }
    for (const l of data.sms_logs ?? []) {
      await tx.runAsync(
        `INSERT INTO sms_logs (id, client_id, phone, message, status, trigger_type, sent_at, error_details)
         VALUES (?, (SELECT id FROM clients WHERE id = ?), ?, ?, ?, ?, ?, ?)`,
        l.id ?? null, l.client_id ?? null, l.phone ?? '', l.message ?? '', mapStatus(l.status), mapTrigger(l.trigger_type),
        l.sent_at ?? nowStamp(), l.error_details ?? null,
      );
    }
    for (const s of data.settings ?? []) {
      if (typeof s.key !== 'string' || s.key.startsWith('meta_') || s.key === 'smsapi_token') continue;
      await tx.runAsync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', s.key, String(s.value ?? ''));
    }
  });
  emitDataChanged();
  return { kind: 'json', clients: data.clients.length, logs: data.sms_logs?.length ?? 0 };
}
