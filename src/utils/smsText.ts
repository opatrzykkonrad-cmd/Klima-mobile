const PL_MAP: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
  Ą: 'A', Ć: 'C', Ę: 'E', Ł: 'L', Ń: 'N', Ó: 'O', Ś: 'S', Ź: 'Z', Ż: 'Z',
  '–': '-', '—': '-', '„': '"', '”': '"', '“': '"', '’': "'", '‘': "'", '…': '...',
};

/** Zamienia polskie znaki i typograficzne cudzysłowy na odpowiedniki GSM-7 (tańszy SMS). */
export function normalizeSmsText(text: string): string {
  return text.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ–—„”“’‘…]/g, (ch) => PL_MAP[ch] ?? ch);
}

const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXT = '^{}\\[~]|€';

/** Liczba znaków i części SMS (GSM-7: 160/153, Unicode: 70/67). */
export function smsInfo(text: string): { length: number; parts: number; unicode: boolean } {
  let units = 0;
  let unicode = false;
  for (const ch of text) {
    if (GSM7_BASIC.includes(ch)) units += 1;
    else if (GSM7_EXT.includes(ch)) units += 2;
    else { unicode = true; break; }
  }
  if (unicode) {
    const length = [...text].length;
    return { length, parts: length <= 70 ? 1 : Math.ceil(length / 67), unicode };
  }
  return { length: units, parts: units <= 160 ? 1 : Math.ceil(units / 153), unicode };
}
