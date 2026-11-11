import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { onDataChanged } from './services/events';

/** Ładuje dane przy wejściu na ekran oraz po każdej zmianie danych (np. wysyłka z tła). */
export function useRefreshOnFocus(load: () => void | Promise<void>) {
  const ref = useRef(load);
  useEffect(() => { ref.current = load; }, [load]);
  useFocusEffect(
    useCallback(() => {
      const run = () => { void ref.current(); };
      run();
      return onDataChanged(run);
    }, []),
  );
}
