/**
 * Normalizuje polski numer do +48XXXXXXXXX.
 * Akceptuje: "600 123 456", "600-123-456", "+48600123456", "48600123456", "0048 600 123 456".
 */
export function normalizePhone(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim().replace(/[\s\-().\/]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('0048')) s = s.slice(4);
  else if (s.length === 11 && s.startsWith('48')) s = s.slice(2);
  if (!/^[1-9]\d{8}$/.test(s)) return null;
  return `+48${s}`;
}

/** "+48 600 123 456" */
export function formatPhone(phone: string | null | undefined): string {
  const n = normalizePhone(phone);
  if (!n) return phone ?? '';
  const d = n.slice(3);
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

/** Format dla SMSAPI: 48XXXXXXXXX */
export function toSmsapiNumber(phone: string): string {
  return phone.replace(/^\+/, '');
}

/** Podczas wpisywania: grupuje cyfry 3-3-3, zostawia +48 jeśli wpisano. */
export function formatPhoneInput(raw: string): string {
  const hasPlus = raw.trim().startsWith('+');
  let digits = raw.replace(/\D/g, '');
  let prefix = '';
  if (hasPlus && digits.startsWith('48')) { prefix = '+48 '; digits = digits.slice(2); }
  digits = digits.slice(0, 9);
  const groups = digits.match(/.{1,3}/g) ?? [];
  return prefix + groups.join(' ');
}
