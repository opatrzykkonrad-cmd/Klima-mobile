import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import Navigation from './src/navigation';
import { colors } from './src/theme';
import { getDb } from './src/db/database';
import { getSettings } from './src/db/settings';
import { scheduleDailyCheck, setupNotifications } from './src/services/notifications';
import { registerBackgroundTask, runAutoCheck } from './src/services/background';
import { toast } from './src/services/actions';

async function autoCheckWithFeedback() {
  try {
    const r = await runAutoCheck();
    if (r.ran && (r.summary.sent || r.summary.errors)) {
      toast(`Automatycznie wysłano ${r.summary.sent} przypomnień${r.summary.errors ? `, błędy: ${r.summary.errors}` : ''}`);
    }
  } catch (e) {
    console.warn('[AUTO] Błąd sprawdzania kolejki', e);
  }
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.bg);
    (async () => {
      try {
        await getDb();
        setReady(true);
        // Usługi pomocnicze – błąd żadnej z nich nie blokuje aplikacji.
        const settings = await getSettings();
        if (await setupNotifications().catch(() => false)) {
          await scheduleDailyCheck(settings.send_hour).catch(() => undefined);
        }
        await registerBackgroundTask().catch((e) => console.warn('[BG] Rejestracja nieudana', e));
        await autoCheckWithFeedback();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    // Sprawdzenie przy każdym powrocie aplikacji na pierwszy plan.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void autoCheckWithFeedback();
    });
    return () => sub.remove();
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: colors.late, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Nie udało się otworzyć bazy danych</Text>
        <Text style={{ color: colors.text, fontSize: 15 }}>{error}</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {ready ? (
        <Navigation />
      ) : (
        <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      )}
    </SafeAreaProvider>
  );
}
