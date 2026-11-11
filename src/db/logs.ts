import { getDb } from './database';
import type { SmsLog, SmsStatus, SmsTrigger } from '../types';

export async function insertLog(entry: {
  client_id: number | null; phone: string; message: string; status: SmsStatus; trigger_type: SmsTrigger; error_details?: string | null;
}): Promise<number> {
  const db = await getDb();
  const res = await db.runAsync(
    'INSERT INTO sms_logs (client_id, phone, message, status, trigger_type, error_details) VALUES (?, ?, ?, ?, ?, ?)',
    entry.client_id, entry.phone, entry.message, entry.status, entry.trigger_type, entry.error_details ?? null,
  );
  return res.lastInsertRowId;
}

export async function listLogs(opts: { status?: SmsStatus | 'SENT' | ''; limit?: number; offset?: number } = {}): Promise<SmsLog[]> {
  const db = await getDb();
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts.status === 'SENT') where.push("l.status IN ('SENT_SIM','SENT_API')");
  else if (opts.status) { where.push('l.status = ?'); params.push(opts.status); }
  params.push(opts.limit ?? 50, opts.offset ?? 0);
  return db.getAllAsync<SmsLog>(
    `SELECT l.*, COALESCE(c.company_name, c.first_name) AS client_name
     FROM sms_logs l LEFT JOIN clients c ON c.id = l.client_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY l.id DESC LIMIT ? OFFSET ?`,
    params,
  );
}

export async function getLog(id: number): Promise<SmsLog | null> {
  const db = await getDb();
  return db.getFirstAsync<SmsLog>('SELECT * FROM sms_logs WHERE id = ?', id);
}

export async function listLogsForClient(clientId: number, limit = 10): Promise<SmsLog[]> {
  const db = await getDb();
  return db.getAllAsync<SmsLog>('SELECT * FROM sms_logs WHERE client_id = ? ORDER BY id DESC LIMIT ?', clientId, limit);
}
