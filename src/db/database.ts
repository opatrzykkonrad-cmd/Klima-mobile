import * as SQLite from 'expo-sqlite';
import { DEFAULT_TEMPLATE } from '../utils/template';

export const DB_NAME = 'klima.db';
const SCHEMA_VERSION = 1;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Jedno współdzielone połączenie (aplikacja + zadanie w tle w tym samym procesie JS). */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await migrate(db);
      return db;
    })();
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

export const DEFAULT_SETTINGS: Record<string, string> = {
  sms_template: DEFAULT_TEMPLATE,
  days_before: '7',
  send_hour: '09:00',
  sms_mode: 'SIM',
  smsapi_token: '',
  smsapi_sender: '',
  sim_delay_sec: '4',
  sim_subscription_id: '',
  auto_send: '1',
  sms_normalize: '1',
};

/** Tworzy tabele (idempotentnie) i uzupełnia brakujące ustawienia. Wywoływane też po imporcie bazy. */
export async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS clients (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name              TEXT,
      company_name            TEXT,
      phone                   TEXT    NOT NULL,
      address                 TEXT,
      device_model            TEXT,
      last_service_date       TEXT    NOT NULL,
      service_interval_months INTEGER NOT NULL DEFAULT 12 CHECK (service_interval_months BETWEEN 1 AND 60),
      next_service_date       TEXT    NOT NULL,
      reminder_sent           INTEGER NOT NULL DEFAULT 0 CHECK (reminder_sent IN (0,1)),
      reminder_sent_at        TEXT,
      sending_at              TEXT,
      sms_enabled             INTEGER NOT NULL DEFAULT 1 CHECK (sms_enabled IN (0,1)),
      notes                   TEXT,
      created_at              TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at              TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      CHECK (COALESCE(first_name,'') <> '' OR COALESCE(company_name,'') <> '')
    );
    CREATE INDEX IF NOT EXISTS idx_clients_next ON clients (next_service_date, reminder_sent);

    CREATE TABLE IF NOT EXISTS sms_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id     INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      phone         TEXT    NOT NULL,
      message       TEXT    NOT NULL,
      status        TEXT    NOT NULL CHECK (status IN ('SENT_SIM','SENT_API','ERROR','MOCK')),
      trigger_type  TEXT    NOT NULL DEFAULT 'MANUAL' CHECK (trigger_type IN ('AUTO','MANUAL','TEST','RETRY')),
      sent_at       TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      error_details TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_logs_sent ON sms_logs (sent_at);
    CREATE INDEX IF NOT EXISTS idx_logs_client ON sms_logs (client_id);

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Migracje przyszłych wersji: if (version < 2) { ALTER TABLE ... }
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((row?.user_version ?? 0) < SCHEMA_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.runAsync('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', key, value);
  }
}
