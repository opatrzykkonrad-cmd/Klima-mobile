import { DeviceEventEmitter } from 'react-native';

const EVENT = 'klima:data-changed';

/** Sygnał „dane się zmieniły” – ekrany odświeżają listy (np. po wysyłce z zadania w tle). */
export function emitDataChanged(): void {
  DeviceEventEmitter.emit(EVENT);
}

export function onDataChanged(cb: () => void): () => void {
  const sub = DeviceEventEmitter.addListener(EVENT, cb);
  return () => sub.remove();
}
