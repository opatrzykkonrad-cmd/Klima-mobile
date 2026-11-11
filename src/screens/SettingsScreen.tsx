import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as BackgroundTask from 'expo-background-task';
import type { TabScreenProps } from '../navigation/types';
import type { Settings, SmsMode } from '../types';
import { getSettings, saveSettings, SettingsErrors } from '../db/settings';
import { colors, radius, space, type } from '../theme';
import { Button, Card, Field, IconButton, Segmented, SectionTitle, ToggleRow, styles as ui } from '../components/ui';
import { TimeField } from '../components/DateField';
import { renderTemplate, SAMPLE_CLIENT, TEMPLATE_VARIABLES } from '../utils/template';
import { normalizeSmsText, smsInfo } from '../utils/smsText';
import { addDays, todayISO } from '../utils/dates';
import { formatPhoneInput, normalizePhone } from '../utils/phone';
import { sendSms } from '../services/sms';
import { ensurePhoneStatePermission, ensureSmsPermission, hasSmsPermission } from '../services/sms/permissions';
import { SimCard, SimSms } from '../../modules/sim-sms';
import { scheduleDailyCheck } from '../services/notifications';
import { createDbBackupFile, createJsonBackupFile, importBackup, saveFileToFolder, shareFile } from '../services/backup';
import { toast } from '../services/actions';

const MODES: { value: SmsMode; label: string }[] = [
  { value: 'SIM', label: 'Karta SIM' },
  { value: 'SMSAPI', label: 'SMSAPI.pl' },
  { value: 'MOCK', label: 'Test' },
];

const MODE_HINT: Record<SmsMode, string> = {
  SIM: 'SMS-y wychodzą z Twojego numeru. Koszt według taryfy operatora.',
  SMSAPI: 'Wysyłka przez internet z nazwą nadawcy (np. nazwą firmy). Wymaga konta i tokenu SMSAPI.pl.',
  MOCK: 'Nic nie jest wysyłane. Treść trafia do historii – bezpieczne testowanie.',
};

export default function SettingsScreen(_: TabScreenProps<'Settings'>) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<Settings | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [smsPermission, setSmsPermission] = useState(false);
  const [sims, setSims] = useState<SimCard[]>([]);
  const [bgStatus, setBgStatus] = useState<string>('');
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const [busyBackup, setBusyBackup] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = await getSettings();
    setForm(s);
    setTokenInput('');
    setDirty(false);
    setSmsPermission(await hasSmsPermission());
    const status = await BackgroundTask.getStatusAsync();
    setBgStatus(status === BackgroundTask.BackgroundTaskStatus.Available
      ? 'Zadanie w tle aktywne – system uruchamia je co ok. 30 min.'
      : 'Zadanie w tle jest zablokowane przez system (oszczędzanie baterii). Wyłącz optymalizację baterii dla aplikacji.');
  }, []);

  useEffect(() => { void load(); }, [load]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setDirty(true);
  };

  const preview = useMemo(() => {
    if (!form) return { text: '', info: { length: 0, parts: 1, unicode: false } };
    const sample = { ...SAMPLE_CLIENT, next_service_date: addDays(todayISO(), form.days_before) };
    const raw = renderTemplate(form.sms_template, sample);
    const text = form.sms_normalize ? normalizeSmsText(raw) : raw;
    return { text, info: smsInfo(text) };
  }, [form]);

  if (!form) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const insertVar = (key: string) => set('sms_template', `${form.sms_template}${form.sms_template.endsWith(' ') ? '' : ' '}{${key}}`);

  const save = async () => {
    setSaving(true);
    const patch: Partial<Settings> = { ...form };
    // pusty input = zostaw zapisany token
    patch.smsapi_token = tokenInput.trim() ? tokenInput.trim() : form.smsapi_token;
    const r = await saveSettings(patch);
    setSaving(false);
    if (r.errors) {
      setErrors(r.errors);
      Alert.alert('Popraw ustawienia', Object.values(r.errors).join('\n'));
      return;
    }
    setErrors({});
    await scheduleDailyCheck(patch.send_hour ?? form.send_hour).catch(() => undefined);
    if (patch.sms_mode === 'SIM' && SimSms.isLinked && !(await hasSmsPermission())) {
      const ok = await ensureSmsPermission();
      if (!ok) Alert.alert('Brak uprawnienia', 'Bez uprawnienia do SMS wysyłka z karty SIM nie zadziała. Możesz je nadać później w Ustawieniach Androida.');
    }
    toast('Zapisano ustawienia');
    await load();
  };

  const grantSms = async () => {
    const ok = await ensureSmsPermission();
    setSmsPermission(ok);
    if (!ok) Alert.alert('Uprawnienie odrzucone', 'Nadaj je ręcznie: Ustawienia Androida → Aplikacje → Klima Serwis → Uprawnienia → SMS.');
  };

  const pickSims = async () => {
    if (!(await ensurePhoneStatePermission())) return;
    const list = SimSms.getSimCards();
    setSims(list);
    if (list.length === 0) toast('Nie znaleziono aktywnych kart SIM');
  };

  const sendTest = async () => {
    if (dirty) { Alert.alert('Najpierw zapisz', 'Zapisz ustawienia, aby test użył nowego trybu i szablonu.'); return; }
    if (!normalizePhone(testPhone)) { Alert.alert('Nieprawidłowy numer', 'Wpisz 9 cyfr, np. 600 123 456.'); return; }
    setTesting(true);
    try {
      const r = await sendSms({ phone: testPhone, message: renderTemplate(form.sms_template, SAMPLE_CLIENT), trigger: 'TEST', interactive: true });
      if (r.status === 'ERROR') Alert.alert('Test nieudany', r.error);
      else toast(r.status === 'MOCK' ? 'Test zapisany w historii (tryb Test)' : 'Wysłano testowy SMS');
    } finally {
      setTesting(false);
    }
  };

  const runBackup = async (kind: 'share-db' | 'save-db' | 'share-json' | 'save-json') => {
    setBusyBackup(kind);
    try {
      const isDb = kind.endsWith('db');
      const file = isDb ? await createDbBackupFile() : await createJsonBackupFile();
      const mime = isDb ? 'application/vnd.sqlite3' : 'application/json';
      if (kind.startsWith('share')) await shareFile(file, mime);
      else { await saveFileToFolder(file, mime); toast(`Zapisano ${file.name}`); }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel/i.test(msg)) Alert.alert('Eksport nieudany', msg);
    } finally {
      setBusyBackup(null);
    }
  };

  const runImport = () => {
    Alert.alert(
      'Zastąpić dane z kopii?',
      'Import nadpisze wszystkich klientów i historię SMS w telefonie danymi z wybranego pliku (.db lub .json). Zrób najpierw eksport, jeśli chcesz zachować obecne dane.',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Wybierz plik', style: 'destructive', onPress: async () => {
            setBusyBackup('import');
            try {
              const r = await importBackup();
              if (r) {
                toast(`Zaimportowano: ${r.clients} klientów, ${r.logs} SMS`);
                await load();
              }
            } catch (e) {
              Alert.alert('Import nieudany', e instanceof Error ? e.message : String(e));
            } finally {
              setBusyBackup(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Ustawienia</Text>

        <SectionTitle>Treść przypomnienia</SectionTitle>
        <Card>
          <Field label="Szablon SMS" value={form.sms_template} onChangeText={(t) => set('sms_template', t)} multiline error={errors.sms_template} />
          <Text style={ui.hint}>Dotknij zmiennej, aby dopisać ją na końcu:</Text>
          <View style={s.chips}>
            {Object.entries(TEMPLATE_VARIABLES).map(([k, desc]) => (
              <Pressable key={k} onPress={() => insertVar(k)} accessibilityRole="button" accessibilityLabel={`Wstaw ${desc}`}
                style={({ pressed }) => [s.chip, pressed && { backgroundColor: colors.border }]}>
                <Text style={s.chipText}>{`{${k}}`}</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.bubble}>
            <Text style={s.bubbleText}>{preview.text}</Text>
          </View>
          <Text style={[ui.hint, preview.info.parts > 1 && { color: colors.soon }]}>
            {preview.info.length} znaków · {preview.info.parts} {preview.info.parts === 1 ? 'SMS' : 'części SMS'}
            {preview.info.unicode ? ' · polskie znaki (70 znaków/SMS)' : ''}
          </Text>
          <ToggleRow label="Zamieniaj polskie znaki" hint="„ą” → „a” itd. Jeden SMS mieści wtedy 160 znaków zamiast 70." value={form.sms_normalize} onChange={(v) => set('sms_normalize', v)} />
        </Card>

        <SectionTitle>Harmonogram</SectionTitle>
        <Card>
          <View style={ui.field}>
            <Text style={ui.label}>Ile dni przed terminem wysłać SMS</Text>
            <Stepper value={form.days_before} min={0} max={90} onChange={(v) => set('days_before', v)} suffix="dni" />
            {errors.days_before ? <Text style={ui.error}>{errors.days_before}</Text> : null}
          </View>
          <TimeField label="Godzina codziennej wysyłki" value={form.send_hour} onChange={(v) => set('send_hour', v)}
            hint="O tej godzinie przyjdzie też powiadomienie, gdyby Android uśpił aplikację." />
          <ToggleRow label="Wysyłaj automatycznie" hint="Raz dziennie po wskazanej godzinie, w tle lub przy otwarciu aplikacji." value={form.auto_send} onChange={(v) => set('auto_send', v)} />
          <Text style={ui.hint}>{bgStatus}</Text>
        </Card>

        <SectionTitle>Sposób wysyłki</SectionTitle>
        <Card>
          <Segmented options={MODES} value={form.sms_mode} onChange={(v) => set('sms_mode', v)} accessibilityLabel="Tryb wysyłki SMS" />
          <Text style={[ui.hint, { marginTop: space.md }]}>{MODE_HINT[form.sms_mode]}</Text>

          {form.sms_mode === 'SIM' ? (
            <View style={{ marginTop: space.lg }}>
              <StatusRow ok={SimSms.isLinked} text={SimSms.isLinked ? 'Moduł SIM wbudowany – wysyłka w tle działa' : 'Brak modułu SIM (Expo Go) – każdy SMS otworzy aplikację wiadomości'} />
              {SimSms.isLinked ? (
                <StatusRow ok={smsPermission} text={smsPermission ? 'Uprawnienie do SMS nadane' : 'Brak uprawnienia do wysyłania SMS'}
                  action={!smsPermission ? <Button title="Nadaj" compact onPress={grantSms} /> : undefined} />
              ) : null}
              <View style={[ui.field, { marginTop: space.lg }]}>
                <Text style={ui.label}>Przerwa między SMS-ami</Text>
                <Stepper value={form.sim_delay_sec} min={2} max={60} onChange={(v) => set('sim_delay_sec', v)} suffix="s" />
                <Text style={ui.hint}>Chroni kartę przed blokadą antyspamową operatora. Zalecane 3–5 s.</Text>
              </View>
              {SimSms.isLinked ? (
                <View style={ui.field}>
                  <Text style={ui.label}>Karta SIM (telefony dual SIM)</Text>
                  {sims.length > 1 ? (
                    <Segmented<number>
                      options={[{ value: -1, label: 'Domyślna' }, ...sims.map((c) => ({ value: c.subscriptionId, label: `SIM ${c.slot + 1}${c.carrier ? ` ${c.carrier}` : ''}` }))]}
                      value={form.sim_subscription_id ?? -1}
                      onChange={(v) => set('sim_subscription_id', v === -1 ? null : v)}
                    />
                  ) : (
                    <Button title={form.sim_subscription_id !== null ? 'Wybrana karta SIM – zmień' : 'Wybierz kartę SIM'} variant="secondary" compact icon="sim-outline" onPress={pickSims} />
                  )}
                </View>
              ) : null}
            </View>
          ) : null}

          {form.sms_mode === 'SMSAPI' ? (
            <View style={{ marginTop: space.lg }}>
              <Field label="Token API (Bearer)" value={tokenInput} onChangeText={setTokenInput} secureTextEntry autoCapitalize="none" autoCorrect={false}
                placeholder={form.smsapi_token ? `Zapisany ••••${form.smsapi_token.slice(-4)}` : 'Wklej token z panelu SMSAPI'}
                error={errors.smsapi_token} hint="Panel SMSAPI → Ustawienia API → Tokeny API, uprawnienie SMS. Puste pole = bez zmian." />
              <Field label="Pole nadawcy" value={form.smsapi_sender} onChangeText={(t) => set('smsapi_sender', t)} maxLength={11} autoCapitalize="none"
                placeholder="np. KlimaSerwis" error={errors.smsapi_sender} hint="Nazwa musi być zarejestrowana w SMSAPI. Puste = nadawca domyślny konta." />
            </View>
          ) : null}
        </Card>

        <Button title={dirty ? 'Zapisz zmiany' : 'Zapisano'} icon="content-save-outline" onPress={save} loading={saving} disabled={!dirty && !tokenInput} style={{ marginTop: space.lg }} />

        <SectionTitle>Testowy SMS</SectionTitle>
        <Card>
          <Field label="Numer telefonu" value={testPhone} onChangeText={(t) => setTestPhone(formatPhoneInput(t))} keyboardType="phone-pad" placeholder="600 123 456"
            hint="Wyśle przykładową treść w zapisanym trybie. Wynik trafi do historii." />
          <Button title="Wyślij testowy SMS" icon="message-processing-outline" variant="secondary" onPress={sendTest} loading={testing} />
        </Card>

        <SectionTitle>Kopia zapasowa</SectionTitle>
        <Card>
          <Text style={[ui.hint, { marginTop: 0, marginBottom: space.md }]}>
            Plik .db to pełna kopia bazy. JSON jest czytelny i bez tokenu SMSAPI. „Udostępnij” pozwala zapisać kopię na Dysku Google.
          </Text>
          <View style={s.grid}>
            <Button title="Udostępnij .db" icon="share-variant-outline" variant="secondary" compact style={s.gridBtn} loading={busyBackup === 'share-db'} onPress={() => runBackup('share-db')} />
            <Button title="Zapisz .db" icon="folder-download-outline" variant="secondary" compact style={s.gridBtn} loading={busyBackup === 'save-db'} onPress={() => runBackup('save-db')} />
            <Button title="Udostępnij JSON" icon="code-json" variant="secondary" compact style={s.gridBtn} loading={busyBackup === 'share-json'} onPress={() => runBackup('share-json')} />
            <Button title="Zapisz JSON" icon="folder-download-outline" variant="secondary" compact style={s.gridBtn} loading={busyBackup === 'save-json'} onPress={() => runBackup('save-json')} />
          </View>
          <Button title="Importuj bazę z pliku" icon="database-import-outline" variant="danger" onPress={runImport} loading={busyBackup === 'import'} style={{ marginTop: space.md }} />
        </Card>

        <Text style={s.footer}>Klima Serwis 1.0 · dane przechowywane wyłącznie w tym telefonie</Text>
      </ScrollView>
    </View>
  );
}

function Stepper({ value, min, max, onChange, suffix }: { value: number; min: number; max: number; onChange: (v: number) => void; suffix: string }) {
  return (
    <View style={s.stepper}>
      <IconButton icon="minus" label="Mniej" onPress={() => onChange(Math.max(min, value - 1))} />
      <Text style={s.stepperValue} accessibilityLiveRegion="polite">{value} {suffix}</Text>
      <IconButton icon="plus" label="Więcej" onPress={() => onChange(Math.min(max, value + 1))} />
    </View>
  );
}

function StatusRow({ ok, text, action }: { ok: boolean; text: string; action?: React.ReactNode }) {
  return (
    <View style={s.statusRow}>
      <View style={[s.dot, { backgroundColor: ok ? colors.ok : colors.soon }]} />
      <Text style={s.statusText}>{text}</Text>
      {action}
    </View>
  );
}

const s = StyleSheet.create({
  title: { ...type.title, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm, marginBottom: space.lg },
  chip: { paddingHorizontal: space.md, minHeight: 36, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.accentSoft },
  chipText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  bubble: { backgroundColor: colors.surfaceHigh, borderRadius: radius.lg, borderTopLeftRadius: 4, padding: space.lg },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.xs, minHeight: 52 },
  stepperValue: { color: colors.text, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  gridBtn: { flexGrow: 1, flexBasis: '45%' },
  footer: { color: colors.faint, fontSize: 12, textAlign: 'center', marginTop: space.xl },
});
