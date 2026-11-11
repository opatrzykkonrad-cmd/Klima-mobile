import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { RootScreenProps } from '../navigation/types';
import type { FieldErrors } from '../types';
import { createClient, deleteClient, getClient, updateClient } from '../db/clients';
import { colors, radius, space } from '../theme';
import { Button, Field, Segmented, ToggleRow, styles as ui } from '../components/ui';
import { DateField } from '../components/DateField';
import { addMonths, isValidISO, toPL, todayISO } from '../utils/dates';
import { formatPhone, formatPhoneInput, normalizePhone } from '../utils/phone';
import { emitDataChanged } from '../services/events';
import { toast } from '../services/actions';

type IntervalChoice = 6 | 12 | 0; // 0 = inny

export default function ClientFormScreen({ navigation, route }: RootScreenProps<'ClientForm'>) {
  const id = route.params?.id;
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const [firstName, setFirstName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [model, setModel] = useState('');
  const [lastDate, setLastDate] = useState(todayISO());
  const [intervalChoice, setIntervalChoice] = useState<IntervalChoice>(12);
  const [customInterval, setCustomInterval] = useState('18');
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [notes, setNotes] = useState('');

  const phoneRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: id ? 'Edycja klienta' : 'Nowy klient' });
  }, [navigation, id]);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const c = await getClient(id);
      if (!c) { Alert.alert('Nie znaleziono klienta'); navigation.goBack(); return; }
      setFirstName(c.first_name ?? '');
      setCompanyName(c.company_name ?? '');
      setPhone(formatPhone(c.phone));
      setAddress(c.address ?? '');
      setModel(c.device_model ?? '');
      setLastDate(c.last_service_date);
      if (c.service_interval_months === 6 || c.service_interval_months === 12) setIntervalChoice(c.service_interval_months);
      else { setIntervalChoice(0); setCustomInterval(String(c.service_interval_months)); }
      setSmsEnabled(c.sms_enabled === 1);
      setNotes(c.notes ?? '');
      setLoading(false);
    })();
  }, [id, navigation]);

  const interval = intervalChoice === 0 ? Number(customInterval) : intervalChoice;
  const nextDate = useMemo(
    () => (isValidISO(lastDate) && Number.isInteger(interval) && interval >= 1 && interval <= 60 ? addMonths(lastDate, interval) : null),
    [lastDate, interval],
  );
  const phoneOk = phone.trim() === '' || normalizePhone(phone) !== null;

  const save = async () => {
    setSaving(true);
    const input = {
      first_name: firstName, company_name: companyName, phone, address, device_model: model,
      last_service_date: lastDate, service_interval_months: interval, sms_enabled: smsEnabled, notes,
    };
    try {
      const r = id ? await updateClient(id, input) : await createClient(input);
      if ('errors' in r) { setErrors(r.errors); return; }
      if ('notFound' in r) { Alert.alert('Klient został usunięty'); navigation.goBack(); return; }
      emitDataChanged();
      toast(id ? 'Zapisano zmiany' : 'Dodano klienta');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Nie zapisano', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!id) return;
    Alert.alert('Usunąć klienta?', 'Dane klienta zostaną trwale usunięte. Historia SMS pozostanie bez powiązania.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń', style: 'destructive', onPress: async () => {
          await deleteClient(id);
          emitDataChanged();
          toast('Usunięto klienta');
          navigation.popToTop();
        },
      },
    ]);
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior="height">
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }} keyboardShouldPersistTaps="handled">
        <Field label="Imię i nazwisko" value={firstName} onChangeText={setFirstName} error={errors.first_name}
          autoCapitalize="words" returnKeyType="next" placeholder="np. Jan Kowalski" />
        <Field label="Nazwa firmy (opcjonalnie)" value={companyName} onChangeText={setCompanyName} error={errors.company_name}
          returnKeyType="next" onSubmitEditing={() => phoneRef.current?.focus()} />
        <Field ref={phoneRef} label="Telefon" value={phone} onChangeText={(t) => setPhone(formatPhoneInput(t))}
          keyboardType="phone-pad" placeholder="600 123 456" autoComplete="tel"
          error={errors.phone ?? (!phoneOk && phone.replace(/\D/g, '').length >= 9 ? 'Sprawdź numer: 9 cyfr' : undefined)} />
        <Field label="Adres montażu" value={address} onChangeText={setAddress} error={errors.address}
          placeholder="ul. Słoneczna 5, Kraków" autoCapitalize="sentences" />
        <Field label="Model / ilość jednostek" value={model} onChangeText={setModel} error={errors.device_model}
          placeholder="Gree Amber Prestige 3.5kW x2" />

        <DateField label="Ostatni serwis / montaż" value={lastDate} onChange={setLastDate} maximumDate={new Date()} error={errors.last_service_date} />

        <View style={ui.field}>
          <Text style={ui.label}>Interwał serwisowy</Text>
          <Segmented<IntervalChoice>
            options={[{ value: 6, label: '6 mies.' }, { value: 12, label: '12 mies.' }, { value: 0, label: 'Inny' }]}
            value={intervalChoice} onChange={setIntervalChoice} accessibilityLabel="Interwał serwisowy"
          />
          {intervalChoice === 0 ? (
            <View style={{ marginTop: space.md }}>
              <Field label="Liczba miesięcy" value={customInterval} onChangeText={(t) => setCustomInterval(t.replace(/\D/g, '').slice(0, 2))}
                keyboardType="number-pad" error={errors.service_interval_months} />
            </View>
          ) : errors.service_interval_months ? <Text style={ui.error}>{errors.service_interval_months}</Text> : null}
        </View>

        <View style={s.nextBox} accessible accessibilityLabel={nextDate ? `Kolejny serwis ${toPL(nextDate)}` : 'Brak daty kolejnego serwisu'}>
          <Text style={s.nextLabel}>Kolejny serwis</Text>
          <Text style={s.nextDate}>{nextDate ? toPL(nextDate) : '—'}</Text>
        </View>

        <ToggleRow label="Przypomnienia SMS" hint="Klient zgodził się na SMS o terminie przeglądu" value={smsEnabled} onChange={setSmsEnabled} />

        <Field label="Notatki techniczne" value={notes} onChangeText={setNotes} multiline error={errors.notes}
          placeholder="np. pompka skroplin, dostęp przez balkon, kod do bramy" />

        <Button title={id ? 'Zapisz zmiany' : 'Dodaj klienta'} icon="content-save-outline" onPress={save} loading={saving} />
        {id ? <Button title="Usuń klienta" variant="danger" icon="trash-can-outline" onPress={remove} style={{ marginTop: space.md }} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  nextBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: space.lg, marginBottom: space.md },
  nextLabel: { color: colors.text, fontSize: 15 },
  nextDate: { color: colors.accent, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
