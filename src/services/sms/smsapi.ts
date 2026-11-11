/**
 * SMSAPI.pl – POST https://api.smsapi.pl/sms.do, nagłówek Authorization: Bearer <token OAuth>.
 * Dokumentacja: https://www.smsapi.pl/docs
 */
const SMSAPI_URL = 'https://api.smsapi.pl/sms.do';
const TIMEOUT_MS = 15_000;

type SmsapiResponse = {
  count?: number;
  list?: { id: string; points: number; number: string; status: string }[];
  error?: number;
  message?: string;
};

export async function sendViaSmsapi(params: {
  token: string; to: string; message: string; from?: string; normalize?: boolean; test?: boolean;
}): Promise<{ id: string | null; points: number | null }> {
  if (!params.token.trim()) throw new Error('Brak tokenu SMSAPI – uzupełnij go w Ustawieniach');

  const body = new URLSearchParams({ to: params.to, message: params.message, format: 'json', encoding: 'utf-8' });
  if (params.from) body.set('from', params.from);
  if (params.normalize) body.set('normalize', '1');
  if (params.test) body.set('test', '1');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(SMSAPI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.token.trim()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: controller.signal,
    });
    const text = await res.text();
    let data: SmsapiResponse;
    try {
      data = JSON.parse(text) as SmsapiResponse;
    } catch {
      throw new Error(`Nieprawidłowa odpowiedź SMSAPI (HTTP ${res.status})`);
    }
    if (!res.ok || data.error) {
      throw new Error(`SMSAPI ${data.error ?? `HTTP ${res.status}`}: ${data.message ?? 'nieznany błąd'}`);
    }
    const item = data.list?.[0];
    return { id: item?.id ?? null, points: item?.points ?? null };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw new Error('SMSAPI nie odpowiada (limit 15 s) – sprawdź internet');
    if (err instanceof TypeError) throw new Error('Brak połączenia z internetem – SMSAPI niedostępne');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
