import type { Client } from '../types';
import { toPL } from './dates';
import { formatPhone } from './phone';

export const TEMPLATE_VARIABLES: Record<string, string> = {
  imie: 'Imię i nazwisko (lub nazwa firmy)',
  firma: 'Nazwa firmy',
  data_serwisu: 'Data kolejnego serwisu',
  ostatni_serwis: 'Data ostatniego serwisu',
  model: 'Model / jednostki',
  adres: 'Adres montażu',
  telefon: 'Telefon klienta',
};

export const DEFAULT_TEMPLATE =
  'Dzień dobry {imie}, przypominamy o zbliżającym się terminie przeglądu klimatyzacji ({model}) ' +
  'zaplanowanym do {data_serwisu}. Prosimy o kontakt w celu ustalenia godziny.';

type TemplateSource = Pick<Client, 'first_name' | 'company_name' | 'next_service_date' | 'last_service_date' | 'device_model' | 'address' | 'phone'>;

export const SAMPLE_CLIENT: TemplateSource = {
  first_name: 'Jan Kowalski',
  company_name: null,
  next_service_date: '2026-06-15',
  last_service_date: '2025-06-15',
  device_model: 'Gree Amber Prestige 3.5kW x2',
  address: 'ul. Słoneczna 5, Kraków',
  phone: '+48600123456',
};

export function renderTemplate(template: string, c: TemplateSource): string {
  const vars: Record<string, string> = {
    imie: c.first_name || c.company_name || '',
    firma: c.company_name || c.first_name || '',
    data_serwisu: toPL(c.next_service_date),
    ostatni_serwis: toPL(c.last_service_date),
    model: c.device_model || '',
    adres: c.address || '',
    telefon: formatPhone(c.phone),
  };
  return template
    .replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? vars[key] : match))
    .replace(/\(\s*\)/g, '') // pusty nawias, gdy brak modelu
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
