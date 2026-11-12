/**
 * Przechwytywanie błędów JS. W wersji release React Native zamyka aplikację przy błędzie krytycznym
 * bez żadnego komunikatu – tutaj zapamiętujemy błąd i pokazujemy go na ekranie (ErrorScreen).
 * Ten plik musi być importowany jako pierwszy w index.ts.
 */
type Listener = (e: CapturedError) => void;
export type CapturedError = { message: string; stack: string; source: string };

let captured: CapturedError | null = null;
const listeners = new Set<Listener>();

export function toCaptured(err: unknown, source: string): CapturedError {
  if (err instanceof Error) return { message: `${err.name}: ${err.message}`, stack: err.stack ?? '', source };
  return { message: String(err), stack: '', source };
}

export function reportError(err: unknown, source: string) {
  if (captured) return; // pokazujemy pierwszy błąd – zwykle to on jest przyczyną
  captured = toCaptured(err, source);
  listeners.forEach((l) => l(captured!));
}

export function getCapturedError() { return captured; }

export function onCapturedError(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

type ErrorUtilsType = {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
};
const EU = (globalThis as unknown as { ErrorUtils?: ErrorUtilsType }).ErrorUtils;
if (EU) {
  const previous = EU.getGlobalHandler();
  EU.setGlobalHandler((error, isFatal) => {
    if (isFatal) {
      reportError(error, 'Błąd krytyczny JS');
      if (listeners.size === 0) previous(error, isFatal); // brak ekranu do pokazania – zachowanie domyślne
      return;
    }
    previous(error, isFatal);
  });
}
