# Klima Serwis – aplikacja na Androida

Baza klientów serwisu klimatyzacji z przypomnieniami SMS o przeglądzie. Działa w 100% offline
na telefonie: dane w lokalnej bazie SQLite, wysyłka z karty SIM, bez żadnego serwera.

## Pobierz APK

Najnowsza wersja (budowana automatycznie przez GitHub Actions po każdej zmianie w `main`):
https://github.com/opatrzykkonrad-cmd/Klima-mobile/releases/latest/download/klima-serwis.apk

## Stack

| Warstwa | Biblioteka |
|---|---|
| Framework | Expo SDK 58 (React Native 0.88, React 19), TypeScript, Prebuild |
| Nawigacja | React Navigation 7 (dolne zakładki + stos) |
| Baza | `expo-sqlite` (WAL, kopia przez SQLite Backup API) |
| SMS z SIM | własny moduł Kotlin `modules/sim-sms` (Android `SmsManager`), fallback `expo-sms` |
| SMS przez API | `fetch` → SMSAPI.pl (`Authorization: Bearer`) |
| Tło | `expo-background-task` + `expo-task-manager` (Android WorkManager) |
| Powiadomienia | `expo-notifications` |
| Pliki | `expo-file-system` (wybór pliku / folderu), `expo-sharing` |
| Daty | `@react-native-community/datetimepicker` |
| Ikony | `@expo/vector-icons` |

Dlaczego własny moduł SIM, a nie `react-native-get-sms-android`: tamta biblioteka nie jest rozwijana
i nie raportuje rzeczywistego wyniku wysyłki. Moduł w `modules/sim-sms` czeka na potwierdzenie od sieci
dla każdej części wiadomości, więc status `SENT_SIM` w historii oznacza, że SMS faktycznie wyszedł.
Błędy (brak zasięgu, tryb samolotowy, brak środków) są opisane po polsku.

## Uprawnienia (`app.json` → `AndroidManifest.xml`)

| Uprawnienie | Po co |
|---|---|
| `SEND_SMS` | wysyłka przypomnień z karty SIM (pytanie przy pierwszej wysyłce) |
| `READ_PHONE_STATE` | tylko lista kart SIM w telefonach dual SIM (opcjonalne) |
| `POST_NOTIFICATIONS` | powiadomienie o kolejce i podsumowanie wysyłki (Android 13+) |
| `RECEIVE_BOOT_COMPLETED` | wznowienie zadania w tle po restarcie telefonu |
| `INTERNET` | tylko tryb SMSAPI.pl |

Zbędne uprawnienia dodawane przez biblioteki (mikrofon, pamięć zewnętrzna, nakładki) są usuwane
przez `blockedPermissions`. Wymagania `android.hardware.telephony` są ustawione jako opcjonalne,
więc aplikacja zainstaluje się też na tablecie (bez wysyłki z SIM).

## Struktura

```
index.ts                     wejście: rejestracja zadania w tle + aplikacji
App.tsx                      start bazy, powiadomienia, zadanie w tle, sprawdzenie kolejki
modules/sim-sms/             natywny moduł Expo (Kotlin) – wysyłka z karty SIM
src/
  db/database.ts             schemat i migracje SQLite
  db/clients.ts              walidacja, przeliczanie terminów, filtry, kolejka, statystyki
  db/logs.ts, db/settings.ts historia SMS, ustawienia
  services/sms/              index.ts (tryby SIM/SMSAPI/MOCK + zapis do historii), sim.ts, smsapi.ts, permissions.ts
  services/queue.ts          wysyłka kolejki z przerwą, pojedyncze przypomnienie, ponowienie
  services/background.ts     zadanie w tle i automatyczna wysyłka raz dziennie
  services/backup.ts         eksport/import .db i JSON
  services/notifications.ts  kanał, codzienne powiadomienie
  screens/                   Pulpit, Klienci, Formularz, Szczegóły, Historia, Ustawienia
  components/                przyciski, pola, karta klienta, wybór daty/godziny
  utils/                     daty, telefony, szablon SMS, licznik znaków SMS
```

## Jak działają przypomnienia

- `next_service_date` = `last_service_date` + interwał, z przycięciem do końca miesiąca (31.08 + 6 mies. = 28/29.02).
- **Kolejka**: termin ≤ dziś + `days_before`, `reminder_sent = 0`, klient ma włączone SMS.
- **Automat** (zadanie w tle co ok. 30 min, start aplikacji i powrót do niej): raz dziennie, po godzinie
  z ustawień, wysyła kolejkę z przerwą (domyślnie 4 s) między SMS-ami. Pomija terminy przeterminowane
  o ponad 30 dni, żeby import starej bazy nie wysłał serii SMS-ów – takim klientom wyślesz ręcznie z Pulpitu.
- Flaga `reminder_sent = 1` ustawia się tylko po udanej wysyłce. Przed wysyłką klient jest rezerwowany,
  więc nie dostanie dwóch SMS-ów, gdy kolejka ruszy jednocześnie z ekranu i z tła.
- **„Serwis wykonany dzisiaj”** ustawia dzisiejszą datę, przelicza termin i zeruje flagę – nowy cykl.
- Gdy Android uśpi zadanie w tle, o godzinie wysyłki przychodzi powiadomienie, a Pulpit pokazuje
  przycisk **„Wyślij zaległe przypomnienia (X)”**.

## Uruchomienie lokalne

Wymagane: Node.js 20+, JDK 17, Android Studio z Android SDK (zmienna `ANDROID_HOME`), telefon
z włączonym debugowaniem USB.

```bash
npm install
npx expo run:android        # buduje wersję deweloperską i instaluje na telefonie
```

Kolejne uruchomienia: `npm start` (serwer Metro) i otwarcie aplikacji na telefonie.
Expo Go nie zawiera modułu SIM – zadziała tylko tryb Test, SMSAPI i ręczna wysyłka przez aplikację SMS.

## Budowa pliku APK

### Lokalnie (Android Studio / Gradle)

```bash
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```

Gotowy plik: `android/app/build/outputs/apk/release/app-release.apk`. Skopiuj go na telefon
i zainstaluj (zgoda na „instalację z nieznanych źródeł”).

**Własny klucz podpisu – zrób to przed pierwszą instalacją u siebie.** Domyślnie wersja release jest
podpisana kluczem debug. Jeśli później zmienisz klucz, Android każe odinstalować aplikację, a to
**kasuje bazę klientów**. Wygeneruj klucz raz i trzymaj go w bezpiecznym miejscu:

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore klima-release.keystore \
  -alias klima -keyalg RSA -keysize 2048 -validity 10000
```

Skopiuj plik do `android/app/`, dopisz do `android/gradle.properties`:

```
KLIMA_STORE_FILE=klima-release.keystore
KLIMA_KEY_ALIAS=klima
KLIMA_STORE_PASSWORD=...
KLIMA_KEY_PASSWORD=...
```

i w `android/app/build.gradle` dodaj w `signingConfigs` wpis `release` z tymi wartościami,
a w `buildTypes.release` ustaw `signingConfig signingConfigs.release`.
(`prebuild --clean` usuwa katalog `android`, więc po nim te zmiany trzeba powtórzyć.)

### W chmurze (EAS, bez Android Studio)

```bash
npm i -g eas-cli
eas login
eas build -p android --profile preview
```

Profil `preview` w `eas.json` buduje APK. EAS sam wygeneruje i przechowa klucz podpisu,
więc kolejne wersje zainstalują się jako aktualizacja.

## Pierwsze uruchomienie – lista kontrolna

1. Ustawienia → Sposób wysyłki → **Test**, zapisz i wyślij testowy SMS na własny numer – sprawdź treść w Historii.
2. Przełącz na **Karta SIM**, zapisz, nadaj uprawnienie do SMS i wyślij test ponownie.
3. Dla telefonu dual SIM wybierz kartę, z której mają wychodzić przypomnienia.
4. Wyłącz optymalizację baterii dla aplikacji (Ustawienia Androida → Aplikacje → Klima Serwis → Bateria
   → Bez ograniczeń). Na telefonach Xiaomi/Huawei/Samsung bywa to konieczne, żeby zadanie w tle działało.
5. Zrób pierwszą kopię zapasową (Ustawienia → Kopia zapasowa → Udostępnij .db → Dysk Google).

## Ważne ograniczenia

- **Limit Androida**: system pyta o zgodę po ok. 30 SMS-ach w 30 minut. Przy dużej kolejce wysyłaj partiami.
- **Sklep Google Play** traktuje `SEND_SMS` jako uprawnienie zastrzeżone. Instalacja z pliku APK działa
  bez ograniczeń; publikacja w sklepie wymagałaby osobnej zgody Google.
- **Długość SMS**: domyślny szablon ma ok. 190 znaków, czyli 2 części SMS (płatne jak 2 SMS-y u wielu
  operatorów). Licznik w Ustawieniach pokazuje liczbę części – skróć szablon do 160 znaków, żeby płacić za jeden.
- **Kopia JSON** nie zawiera tokenu SMSAPI (celowo). Kopia `.db` zawiera wszystko.
- Po imporcie bazy aplikacja zastępuje bieżące dane – zrób najpierw eksport.

## Sprawdzenie projektu

```bash
npm run typecheck    # TypeScript
npx expo-doctor      # zgodność wersji bibliotek z SDK
```
