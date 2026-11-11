import { Alert, Linking, ToastAndroid, Platform } from 'react-native';
import type { Client } from '../types';
import { markServiceDone } from '../db/clients';
import { toPL } from '../utils/dates';
import { emitDataChanged } from './events';

export function toast(message: string) {
  if (Platform.OS === 'android') ToastAndroid.show(message, message.length > 60 ? ToastAndroid.LONG : ToastAndroid.SHORT);
  else Alert.alert(message);
}

export const clientName = (c: Pick<Client, 'first_name' | 'company_name'>) => c.company_name || c.first_name || 'Klient';

export async function callClient(phone: string) {
  try {
    await Linking.openURL(`tel:${phone}`);
  } catch {
    toast('Nie można otworzyć telefonu');
  }
}

/** Nawigacja Google Maps (tryb jazdy); gdy aplikacji Map brak – wersja w przeglądarce. */
export async function navigateTo(address: string) {
  const q = encodeURIComponent(address);
  try {
    await Linking.openURL(`google.navigation:q=${q}`);
  } catch {
    try {
      await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`);
    } catch {
      toast('Nie można otworzyć map');
    }
  }
}

export function confirmServiceDoneToday(client: Client, onDone?: (c: Client) => void) {
  Alert.alert(
    'Serwis wykonany dzisiaj?',
    `${clientName(client)}\nKolejny termin zostanie przeliczony o ${client.service_interval_months} mies., a przypomnienie SMS wyjdzie ponownie w nowym cyklu.`,
    [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Tak, zapisz',
        onPress: async () => {
          const r = await markServiceDone(client.id);
          if ('client' in r) {
            toast(`Zapisano. Następny serwis: ${toPL(r.client.next_service_date)}`);
            emitDataChanged();
            onDone?.(r.client);
          } else if ('errors' in r) {
            Alert.alert('Nie zapisano', Object.values(r.errors).join('\n'));
          }
        },
      },
    ],
  );
}
