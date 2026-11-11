import { requireOptionalNativeModule } from 'expo';

export type SimCard = {
  subscriptionId: number;
  slot: number;
  carrier: string | null;
  displayName: string | null;
};

type SimSmsNative = {
  isAvailable(): boolean;
  hasPermission(): boolean;
  getSimCards(): SimCard[];
  sendSms(phone: string, message: string, subscriptionId: number | null): Promise<{ parts: number }>;
};

/** null, gdy moduł nie jest wkompilowany (np. Expo Go) – wtedy aplikacja przechodzi na expo-sms. */
const native = requireOptionalNativeModule<SimSmsNative>('SimSms');

export const SimSms = {
  isLinked: native != null,
  isAvailable: (): boolean => (native ? native.isAvailable() : false),
  hasPermission: (): boolean => (native ? native.hasPermission() : false),
  getSimCards: (): SimCard[] => (native ? native.getSimCards() : []),
  sendSms: (phone: string, message: string, subscriptionId: number | null = null): Promise<{ parts: number }> => {
    if (!native) return Promise.reject(new Error('Natywny moduł SIM nie jest dostępny w tej wersji aplikacji'));
    return native.sendSms(phone, message, subscriptionId);
  },
};
