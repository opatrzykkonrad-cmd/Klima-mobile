import { getDb } from './database';
import type { Client, ClientFilter, ClientInput, FieldErrors } from '../types';
import { addDays, addMonths, isValidISO, monthRange, SOON_DAYS, todayISO } from '../utils/dates';
import { normalizePhone } from '../utils/phone';

type ValidData = Omit<Client, 'id' | 'reminder_sent' | 'reminder_sent_at' | 'created_at' | 'updated_at'>;

const clean = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

export function validateClient(input: ClientInput, existing?: Client | null): { errors: FieldErrors } | { data: ValidData } {
  const src = {
    first_name: input.first_name !== undefined ? input.first_name : existing?.first_name,
    company_name: input.company_name !== undefined ? input.company_name : existing?.company_name,
    phone: input.phone !== undefined ? input.phone : existing?.phone,
    address: input.address !== undefined ? input.address : existing?.address,
    device_model: input.device_model !== undefined ? input.device_model : existing?.device_model,
    last_service_date: input.last_service_date !== undefined ? input.last_service_date : existing?.last_service_date,
    service_interval_months: input.service_interval_months !== undefined ? input.service_interval_months : existing?.service_interval_months,
    sms_enabled: input.sms_enabled !== undefined ? input.sms_enabled : existing ? existing.sms_enabled === 1 : true,
    notes: input.notes !== undefined ? input.notes : existing?.notes,
  };

  const errors: FieldErrors = {};
  const first_name = clean(src.first_name);
  const company_name = clean(src.company_name);
  if (!first_name && !company_name) errors.first_name = 'Podaj imię i nazwisko lub nazwę firmy';

  const phone = normalizePhone(src.phone);
  if (!phone) errors.phone = 'Numer musi mieć 9 cyfr (opcjonalnie z +48)';

  const last = clean(src.last_service_date);
  if (!isValidISO(last)) errors.last_service_date = 'Wybierz datę ostatniego serwisu';
  else if (last > todayISO()) errors.last_service_date = 'Data serwisu nie może być w przyszłości';

  const interval = Number(src.service_interval_months ?? 12);
  if (!Number.isInteger(interval) || interval < 1 || interval > 60) errors.service_interval_months = 'Interwał od 1 do 60 miesięcy';

  const limits: [keyof ClientInput, number][] = [['first_name', 120], ['company_name', 160], ['address', 250], ['device_model', 200], ['notes', 4000]];
  for (const [k, max] of limits) {
    const v = clean(src[k as keyof typeof src]);
    if (v && v.length > max) errors[k] = `Maksymalnie ${max} znaków`;
  }

  if (Object.keys(errors).length || !phone || !isValidISO(last)) return { errors };
  return {
    data: {
      first_name, company_name, phone,
      address: clean(src.address),
      device_model: clean(src.device_model),
      last_service_date: last,
      service_interval_months: interval,
      next_service_date: addMonths(last, interval),
      sending_at: null,
      sms_enabled: src.sms_enabled ? 1 : 0,
      notes: clean(src.notes),
    } as ValidData,
  };
}

export async function getClient(id: number): Promise<Client | null> {
  const db = await getDb();
  return db.getFirstAsync<Client>('SELECT * FROM clients WHERE id = ?', id);
}

export async function createClient(input: ClientInput): Promise<{ errors: FieldErrors } | { client: Client }> {
  const r = validateClient(input);
  if ('errors' in r) return r;
  const d = r.data;
  const db = await getDb();
  const res = await db.runAsync(
    `INSERT INTO clients (first_name, company_name, phone, address, device_model, last_service_date,
       service_interval_months, next_service_date, reminder_sent, sms_enabled, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    d.first_name, d.company_name, d.phone, d.address, d.device_model, d.last_service_date,
    d.service_interval_months, d.next_service_date, d.sms_enabled, d.notes,
  );
  return { client: (await getClient(res.lastInsertRowId))! };
}

export async function updateClient(id: number, input: ClientInput): Promise<{ errors: FieldErrors } | { client: Client } | { notFound: true }> {
  const existing = await getClient(id);
  if (!existing) return { notFound: true };
  const r = validateClient(input, existing);
  if ('errors' in r) return r;
  const d = r.data;
  // Zmiana terminu = nowy cykl serwisowy, więc przypomnienie musi wyjść ponownie.
  const newCycle = d.next_service_date !== existing.next_service_date ? 1 : 0;
  const db = await getDb();
  await db.runAsync(
    `UPDATE clients SET first_name = ?, company_name = ?, phone = ?, address = ?, device_model = ?,
       last_service_date = ?, service_interval_months = ?, next_service_date = ?, sms_enabled = ?, notes = ?,
       reminder_sent = CASE WHEN ? = 1 THEN 0 ELSE reminder_sent END,
       reminder_sent_at = CASE WHEN ? = 1 THEN NULL ELSE reminder_sent_at END,
       updated_at = datetime('now','localtime')
     WHERE id = ?`,
    d.first_name, d.company_name, d.phone, d.address, d.device_model, d.last_service_date,
    d.service_interval_months, d.next_service_date, d.sms_enabled, d.notes, newCycle, newCycle, id,
  );
  return { client: (await getClient(id))! };
}

/** „Serwis wykonany”: nowa data ostatniego serwisu, przeliczony termin, reset flagi SMS. */
export async function markServiceDone(id: number, date = todayISO()) {
  return updateClient(id, { last_service_date: date });
}

export async function deleteClient(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM clients WHERE id = ?', id);
}

export async function listClients(q = '', filter: ClientFilter = 'all'): Promise<Client[]> {
  const db = await getDb();
  const today = todayISO();
  const where: string[] = [];
  const params: (string | number)[] = [];
  const query = q.trim();
  if (query) {
    const like = `%${query}%`;
    const digits = query.replace(/\D/g, '');
    where.push('(first_name LIKE ? OR company_name LIKE ? OR address LIKE ? OR device_model LIKE ? OR phone LIKE ?)');
    params.push(like, like, like, like, digits.length >= 3 ? `%${digits}%` : like);
  }
  if (filter === 'late') { where.push('next_service_date < ?'); params.push(today); }
  if (filter === 'soon') { where.push('next_service_date BETWEEN ? AND ?'); params.push(today, addDays(today, SOON_DAYS)); }
  const sql = `SELECT * FROM clients ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
               ORDER BY next_service_date ASC, COALESCE(company_name, first_name) COLLATE NOCASE ASC`;
  return db.getAllAsync<Client>(sql, params);
}

/** Kolejka: termin <= dziś + days_before, brak przypomnienia w cyklu, zgoda na SMS. */
export async function getQueue(daysBefore: number): Promise<Client[]> {
  const db = await getDb();
  const limit = addDays(todayISO(), daysBefore);
  return db.getAllAsync<Client>(
    `SELECT * FROM clients
     WHERE reminder_sent = 0 AND sms_enabled = 1 AND next_service_date <= ?
     ORDER BY next_service_date ASC`,
    limit,
  );
}

/**
 * Rezerwacja klienta do wysyłki (chroni przed podwójnym SMS-em, gdy kolejka ruszy jednocześnie
 * z ekranu i z zadania w tle). Rezerwacja wygasa po 5 minutach.
 */
export async function claimForSending(id: number): Promise<boolean> {
  const db = await getDb();
  const res = await db.runAsync(
    `UPDATE clients SET sending_at = datetime('now','localtime')
     WHERE id = ? AND reminder_sent = 0
       AND (sending_at IS NULL OR sending_at < datetime('now','localtime','-5 minutes'))`,
    id,
  );
  return res.changes === 1;
}

export async function finishSending(id: number, success: boolean): Promise<void> {
  const db = await getDb();
  if (success) {
    await db.runAsync(
      `UPDATE clients SET reminder_sent = 1, reminder_sent_at = datetime('now','localtime'), sending_at = NULL WHERE id = ?`, id,
    );
  } else {
    await db.runAsync('UPDATE clients SET sending_at = NULL WHERE id = ?', id);
  }
}

export interface DashboardStats {
  total: number;
  thisMonth: number;
  overdue: number;
  smsSentToday: number;
}

export async function getStats(): Promise<DashboardStats> {
  const db = await getDb();
  const today = todayISO();
  const { start, end } = monthRange(today);
  const count = async (sql: string, ...p: (string | number)[]) =>
    (await db.getFirstAsync<{ n: number }>(sql, p))?.n ?? 0;
  return {
    total: await count('SELECT COUNT(*) AS n FROM clients'),
    thisMonth: await count('SELECT COUNT(*) AS n FROM clients WHERE next_service_date BETWEEN ? AND ?', start, end),
    overdue: await count('SELECT COUNT(*) AS n FROM clients WHERE next_service_date < ?', today),
    smsSentToday: await count(
      "SELECT COUNT(*) AS n FROM sms_logs WHERE status IN ('SENT_SIM','SENT_API','MOCK') AND substr(sent_at, 1, 10) = ?", today,
    ),
  };
}
