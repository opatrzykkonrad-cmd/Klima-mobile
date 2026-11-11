/** Daty jako ciągi YYYY-MM-DD w czasie lokalnym telefonu (bez przesunięć stref). */
const pad = (n: number) => String(n).padStart(2, '0');

export function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return dateToISO(new Date());
}

export function isValidISO(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** YYYY-MM-DD -> Date (południe, aby uniknąć problemów ze zmianą czasu). */
export function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** Dodaje miesiące z przycięciem do ostatniego dnia miesiąca (31.08 + 6 mies. = 28/29.02). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const first = new Date(y, m - 1 + months, 1, 12);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12).getDate();
  first.setDate(Math.min(d, lastDay));
  return dateToISO(first);
}

export function addDays(iso: string, days: number): string {
  const dt = isoToDate(iso);
  dt.setDate(dt.getDate() + days);
  return dateToISO(dt);
}

export function diffDays(fromIso: string, toIso: string): number {
  return Math.round((isoToDate(toIso).getTime() - isoToDate(fromIso).getTime()) / 86_400_000);
}

/** YYYY-MM-DD (lub datetime) -> DD.MM.RRRR */
export function toPL(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

/** Lokalny znacznik czasu do zapisu w bazie: YYYY-MM-DD HH:MM:SS */
export function nowStamp(): string {
  const d = new Date();
  return `${dateToISO(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function nowHHMM(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function monthRange(iso: string): { start: string; end: string } {
  const [y, m] = iso.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` };
}

export function daysLabel(n: number): string {
  const a = Math.abs(n);
  return a === 1 ? '1 dzień' : `${a} dni`;
}

export const SOON_DAYS = 14; // kolor żółty: serwis w ciągu 14 dni

export function serviceState(nextIso: string, today = todayISO()): { state: 'ok' | 'soon' | 'late'; daysLeft: number } {
  const daysLeft = diffDays(today, nextIso);
  if (daysLeft < 0) return { state: 'late', daysLeft };
  if (daysLeft <= SOON_DAYS) return { state: 'soon', daysLeft };
  return { state: 'ok', daysLeft };
}

export function dueLabel(daysLeft: number): string {
  if (daysLeft < 0) return `${daysLabel(daysLeft)} po terminie`;
  if (daysLeft === 0) return 'dzisiaj';
  if (daysLeft === 1) return 'jutro';
  return `za ${daysLabel(daysLeft)}`;
}
