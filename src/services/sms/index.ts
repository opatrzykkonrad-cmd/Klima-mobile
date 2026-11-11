import type { SendResult, Settings, SmsStatus, SmsTrigger } from '../../types';
import { insertLog } from '../../db/logs';
import { getSettings } from '../../db/settings';
import { normalizePhone, toSmsapiNumber } from '../../utils/phone';
import { normalizeSmsText } from '../../utils/smsText';
import { sendViaSim } from './sim';
import { sendViaSmsapi } from './smsapi';

/**
 * Wysyła jedną wiadomość w trybie z ustawień (SIM / SMSAPI / MOCK) i ZAWSZE zapisuje wpis w sms_logs.
 * `interactive` = wywołanie z ekranu (można pytać o uprawnienia, otworzyć aplikację SMS).
 */
export async function sendSms(args: {
  phone: string;
  message: string;
  clientId?: number | null;
  trigger: SmsTrigger;
  interactive: boolean;
  settings?: Settings;
}): Promise<SendResult> {
  const settings = args.settings ?? (await getSettings());
  const phone = normalizePhone(args.phone);
  const text = settings.sms_normalize && settings.sms_mode !== 'SMSAPI' ? normalizeSmsText(args.message) : args.message;

  let status: SmsStatus = 'ERROR';
  let errorDetails: string | null = null;

  try {
    if (!phone) throw new Error('Nieprawidłowy numer telefonu');
    switch (settings.sms_mode) {
      case 'MOCK': {
        console.log(`[SMS MOCK] → ${phone} (${text.length} zn.)\n${text}`);
        status = 'MOCK';
        break;
      }
      case 'SMSAPI': {
        await sendViaSmsapi({
          token: settings.smsapi_token,
          to: toSmsapiNumber(phone),
          message: text,
          from: settings.smsapi_sender || undefined,
          normalize: settings.sms_normalize,
        });
        status = 'SENT_API';
        break;
      }
      case 'SIM':
      default: {
        const r = await sendViaSim(phone, text, settings.sim_subscription_id, { interactive: args.interactive });
        status = 'SENT_SIM';
        if (!r.confirmed) errorDetails = r.note ?? null;
        break;
      }
    }
  } catch (err) {
    status = 'ERROR';
    errorDetails = err instanceof Error ? err.message : String(err);
    console.warn(`[SMS] Błąd wysyłki do ${phone ?? args.phone}: ${errorDetails}`);
  }

  const logId = await insertLog({
    client_id: args.clientId ?? null,
    phone: phone ?? String(args.phone),
    message: text,
    status,
    trigger_type: args.trigger,
    error_details: errorDetails ? errorDetails.slice(0, 1000) : null,
  });
  return status === 'ERROR' ? { status, logId, error: errorDetails ?? 'Błąd wysyłki' } : { status, logId };
}
