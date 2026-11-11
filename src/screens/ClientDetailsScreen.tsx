import React, { useCallback, useLayoutEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RootScreenProps } from '../navigation/types';
import type { Client, SmsLog } from '../types';
import { getClient } from '../db/clients';
import { listLogsForClient } from '../db/logs';
import { useRefreshOnFocus } from '../hooks';
import { colors, radius, space, stateColor, type } from '../theme';
import { Button, Card, IconButton, Pill, SectionTitle } from '../components/ui';
import { dueLabel, serviceState, toPL } from '../utils/dates';
import { formatPhone } from '../utils/phone';
import { callClient, clientName, confirmServiceDoneToday, navigateTo, toast } from '../services/actions';
import { buildReminderText, sendReminder } from '../services/queue';
import { sendSms } from '../services/sms';
import { LogItem } from './LogsScreen';

export default function ClientDetailsScreen({ navigation, route }: RootScreenProps<'ClientDetails'>) {
  const { id } = route.params;
  const [client, setClient] = useState<Client | null>(null);
  const [preview, setPreview] = useState('');
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const c = await getClient(id);
    if (!c) { navigation.goBack(); return; }
    setClient(c);
    setPreview(await buildReminderText(c));
    setLogs(await listLogsForClient(id, 10));
  }, [id, navigation]);
  useRefreshOnFocus(load);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: client ? clientName(client) : 'Klient',
      headerRight: () => <IconButton icon="pencil-outline" label="Edytuj klienta" onPress={() => navigation.navigate('ClientForm', { id })} />,
    });
  }, [navigation, client, id]);

  if (!client) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const { state, daysLeft } = serviceState(client.next_service_date);
  const sc = stateColor[state];

  const send = () => {
    const again = client.reminder_sent === 1;
    Alert.alert(again ? 'Wysłać ponownie?' : 'Wysłać przypomnienie teraz?', preview, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Wyślij', onPress: async () => {
          setSending(true);
          try {
            if (again) {
              // ręczne ponowienie w tym samym cyklu – świadoma decyzja użytkownika
              const r = await sendSms({ phone: client.phone, message: preview, clientId: client.id, trigger: 'MANUAL', interactive: true });
              if (r.status === 'ERROR') Alert.alert('Nie wysłano', r.error); else toast('Wysłano ponownie');
            } else {
              const r = await sendReminder(client, 'MANUAL', true);
              if (r.status === 'ERROR') Alert.alert('Nie wysłano', r.error); else toast(r.status === 'MOCK' ? 'Zapisano SMS testowy' : 'Wysłano przypomnienie');
            }
          } finally {
            setSending(false);
            void load();
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }}>
      <Card style={{ borderLeftWidth: 5, borderLeftColor: sc.fg }}>
        <View style={s.row}>
          <Text style={s.next}>{toPL(client.next_service_date)}</Text>
          <Pill label={dueLabel(daysLeft)} fg={sc.fg} bg={sc.bg} />
        </View>
        <Text style={s.meta}>
          Ostatni serwis {toPL(client.last_service_date)} · co {client.service_interval_months} mies.
        </Text>
        <Text style={s.meta}>
          {client.sms_enabled
            ? client.reminder_sent ? `Przypomnienie wysłane ${toPL(client.reminder_sent_at)}` : 'Przypomnienie jeszcze nie wysłane'
            : 'Klient bez zgody na SMS'}
        </Text>
        <Button title="Serwis wykonany dzisiaj" icon="check-circle-outline" onPress={() => confirmServiceDoneToday(client, () => void load())} style={{ marginTop: space.lg }} />
      </Card>

      <View style={s.actions}>
        <Button title="Zadzwoń" icon="phone" variant="secondary" style={{ flex: 1 }} onPress={() => callClient(client.phone)} />
        <Button title="Nawiguj" icon="navigation-variant-outline" variant="secondary" style={{ flex: 1 }}
          disabled={!client.address} onPress={() => client.address && navigateTo(client.address)} />
      </View>

      <Card style={{ marginTop: space.md }}>
        <Info label="Telefon" value={formatPhone(client.phone)} />
        {client.company_name && client.first_name ? <Info label="Osoba kontaktowa" value={client.first_name} /> : null}
        <Info label="Adres" value={client.address || '—'} />
        <Info label="Urządzenie" value={client.device_model || '—'} />
        {client.notes ? <Info label="Notatki" value={client.notes} /> : null}
      </Card>

      <SectionTitle>Treść przypomnienia</SectionTitle>
      <View style={s.bubble}><Text style={s.bubbleText}>{preview}</Text></View>
      <Button title={client.reminder_sent ? 'Wyślij SMS ponownie' : 'Wyślij przypomnienie teraz'} icon="send" variant="secondary"
        loading={sending} disabled={!client.sms_enabled} onPress={send} style={{ marginTop: space.md }} />

      <SectionTitle>Historia SMS</SectionTitle>
      {logs.length ? logs.map((l) => <LogItem key={l.id} log={l} compact onChanged={load} />) : <Text style={s.meta}>Brak wysłanych wiadomości.</Text>}
    </ScrollView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.info}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue} selectable>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  next: { ...type.hero, color: colors.text, fontVariant: ['tabular-nums'] },
  meta: { color: colors.mute, fontSize: 14, marginTop: 6, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  info: { paddingVertical: space.sm },
  infoLabel: { color: colors.mute, fontSize: 13 },
  infoValue: { color: colors.text, fontSize: 16, marginTop: 2, lineHeight: 22 },
  bubble: { backgroundColor: colors.surfaceHigh, borderRadius: radius.lg, borderTopLeftRadius: 4, padding: space.lg },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 22 },
});
