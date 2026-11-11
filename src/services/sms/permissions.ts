import { PermissionsAndroid, Platform } from 'react-native';

export async function ensureSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const perm = PermissionsAndroid.PERMISSIONS.SEND_SMS;
  if (await PermissionsAndroid.check(perm)) return true;
  const result = await PermissionsAndroid.request(perm, {
    title: 'Wysyłanie SMS z karty SIM',
    message: 'Aplikacja wysyła przypomnienia o serwisie bezpośrednio z Twojego numeru. SMS-y wychodzą tylko do klientów z Twojej bazy.',
    buttonPositive: 'Zezwól',
    buttonNegative: 'Nie teraz',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function hasSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.SEND_SMS);
}

/** Potrzebne tylko do pokazania listy kart SIM w telefonach dual SIM. */
export async function ensurePhoneStatePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const perm = PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE;
  if (await PermissionsAndroid.check(perm)) return true;
  const result = await PermissionsAndroid.request(perm, {
    title: 'Wybór karty SIM',
    message: 'Uprawnienie pozwala wyświetlić karty SIM, aby wybrać, z której mają wychodzić przypomnienia.',
    buttonPositive: 'Zezwól',
    buttonNegative: 'Anuluj',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
