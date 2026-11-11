import type { ServiceState } from './types';

export const colors = {
  bg: '#0E1620',
  surface: '#16212D',
  surfaceHigh: '#1E2B3A',
  border: '#2A3A4D',
  text: '#E9EFF4',
  mute: '#8DA0B3',
  faint: '#5E7184',
  accent: '#4FC3E0',      // „chłodne powietrze” – kolor akcji
  accentInk: '#06232D',
  accentSoft: 'rgba(79,195,224,0.14)',
  ok: '#3DBE7E',
  okSoft: 'rgba(61,190,126,0.14)',
  soon: '#F2C14E',
  soonSoft: 'rgba(242,193,78,0.15)',
  late: '#F0645A',
  lateSoft: 'rgba(240,100,90,0.15)',
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const type = {
  hero: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '700' as const },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 16 },
  small: { fontSize: 14 },
  tiny: { fontSize: 12 },
};

export const stateColor: Record<ServiceState, { fg: string; bg: string; label: string }> = {
  ok: { fg: colors.ok, bg: colors.okSoft, label: 'OK' },
  soon: { fg: colors.soon, bg: colors.soonSoft, label: 'Wkrótce' },
  late: { fg: colors.late, bg: colors.lateSoft, label: 'Po terminie' },
};

export const navTheme = {
  dark: true,
  colors: {
    primary: colors.accent,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.late,
  },
};
