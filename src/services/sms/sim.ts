import * as ExpoSms from 'expo-sms';
import { SimSms } from '../../../modules/sim-sms';
import { ensureSmsPermission, hasSmsPermission } from './permissions';

export type SimSendResult = { confirmed: boolean; note?: string };

/** Czy można wysłać SMS bez interakcji użytkownika (wymagane w zadaniu w tle). */
export async function canSendSilently(): Promise<boolean> {
  return SimSms.isLinked && SimSms.isAvailable() && (await hasSmsPermission());
}

/**
 * Wysyłka z karty SIM.
 * 1) Natywny moduł (SmsManager) – w tle, z potwierdzeniem od sieci.
 * 2) Fallback expo-sms – otwiera aplikację SMS z gotową treścią; użytkownik naciska „Wyślij”.
 */
export async function sendViaSim(
  phone: string,
  message: string,
  subscriptionId: number | null,
  opts: { interactive: boolean },
): Promise<SimSendResult> {
  if (SimSms.isLinked) {
    if (!SimSms.isAvailable()) throw new Error('To urządzenie nie obsługuje wysyłania SMS');
    const granted = opts.interactive ? await ensureSmsPermission() : await hasSmsPermission();
    if (!granted) throw new Error('Brak uprawnienia do wysyłania SMS – nadaj je w Ustawieniach aplikacji');
    await SimSms.sendSms(phone, message, subscriptionId);
    return { confirmed: true };
  }

  if (!opts.interactive) throw new Error('Wysyłka w tle wymaga wersji aplikacji z modułem SIM (zbuduj APK)');
  if (!(await ExpoSms.isAvailableAsync())) throw new Error('Brak aplikacji do SMS na urządzeniu');
  const { result } = await ExpoSms.sendSMSAsync([phone], message);
  if (result === 'cancelled') throw new Error('Wysyłka anulowana w aplikacji SMS');
  return { confirmed: result === 'sent', note: result === 'sent' ? undefined : 'Otwarto aplikację SMS – brak potwierdzenia wysłania' };
}
