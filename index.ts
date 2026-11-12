// Kolejność ma znaczenie: przechwytywanie błędów musi zadziałać przed załadowaniem reszty aplikacji.
import './src/crashGuard';
import React from 'react';
import { registerRootComponent } from 'expo';
import { ErrorScreen } from './src/components/ErrorScreen';
import { toCaptured } from './src/crashGuard';

let Root: React.ComponentType;
try {
  // Definicja zadania w tle musi zostać załadowana przy starcie procesu (także bez UI).
  require('./src/services/background');
  Root = require('./App').default;
} catch (err) {
  // Błąd już przy ładowaniu modułów – pokaż go zamiast zamykać aplikację.
  const c = toCaptured(err, 'Ładowanie aplikacji');
  Root = () => React.createElement(ErrorScreen, { title: 'Aplikacja nie mogła się uruchomić', message: c.message, details: c.stack });
}

registerRootComponent(Root);
