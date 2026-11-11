import React, { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { TabScreenProps } from '../navigation/types';
import type { Client, Settings } from '../types';
import { DashboardStats, getQueue, getStats } from '../db/clients';
import { getMeta, getSettings } from '../db/settings';
import { useRefreshOnFocus } from '../hooks';
import { colors, radius, space, type } from '../theme';
import { Button, Card, EmptyState } from '../components/ui';
import { dueLabel, serviceState, toPL } from '../utils/dates';
import { formatPhone } from '../utils/phone';
import { clientName, toast } from '../services/actions';
import { isQueueRunning, QueueProgress, sendQueue, sendReminder } from '../services/queue';
import { SimSms } from '../../modules/sim-sms';

const todayLabel = () =>
  new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

export default function DashboardScreen({ navigation }: TabScreenProps<'Dashboard'>) {
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [queue, setQueue] = useState<Client[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [progress, setProgress] = useState<QueueProgress | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const cancelRef = useRef(false);

  const load = useCallback(async () => {
    const s = await getSettings();
    const [st, q, meta] = await Promise.all([getStats(), getQueue(s.days_before), getMeta('last_queue_summary')]);
    setSettings(s); setStats(st); setQueue(q); setLastRun(meta);
  }, []);
  useRefreshOnFocus(load);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const sendAll = () => {
    if (!settings || queue.length === 0) return;
    const n = queue.length;
    const seconds = settings.sms_mode === 'SIM' ? Math.round((n - 1) * settings.sim_delay_sec) : 0;
    const modeText = settings.sms_mode === 'SIM' ? 'z karty SIM' : settings.sms_mode === 'SMSAPI' ? 'przez SMSAPI.pl' : 'w trybie testowym (bez wysyłki)';
    const extra = settings.sms_mode === 'SIM' && n > 25
      ? '\n\nAndroid może poprosić o potwierdzenie przy ponad 30 SMS w ciągu 30 minut.' : '';
    Alert.alert(
      `Wysłać ${n} ${n === 1 ? 'przypomnienie' : 'przypomnień'}?`,
      `SMS-y wyjdą ${modeText}${seconds > 0 ? `, z przerwą ${settings.sim_delay_sec} s (ok. ${Math.ceil(seconds / 60)} min)` : ''}.${extra}`,
      [{ text: 'Anuluj', style: 'cancel' }, { text: 'Wyślij', onPress: runQueue }],
    );
  };

  const runQueue = async () => {
    cancelRef.current = false;
    setProgress({ done: 0, total: queue.length });
    try {
      const r = await sendQueue({
        trigger: 'MANUAL', interactive: true,
        onProgress: setProgress,
        shouldCancel: () => cancelRef.current,
      });
      const parts = [`Wysłano: ${r.sent}`];
      if (r.errors) parts.push(`błędy: ${r.errors}`);
      if (r.skipped) parts.push(`pominięte: ${r.skipped}`);
      if (r.cancelled) parts.push('przerwano');
      if (r.errors) Alert.alert('Wysyłka zakończona z błędami', `${parts.join(', ')}.\nSzczegóły i ponowienie znajdziesz w Historii SMS.`);
      else toast(parts.join(', '));
    } catch (e) {
      Alert.alert('Nie wysłano', e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
      void load();
    }
  };

  const sendOne = async (client: Client) => {
    if (isQueueRunning()) return;
    setSendingId(client.id);
    try {
      const r = await sendReminder(client, 'MANUAL', true);
      if (r.status === 'ERROR') Alert.alert('Nie wysłano', r.error ?? 'Błąd wysyłki');
      else toast(r.status === 'MOCK' ? 'Zapisano SMS testowy (MOCK)' : `Wysłano do: ${clientName(client)}`);
    } finally {
      setSendingId(null);
      void load();
    }
  };

  let lastRunText: string | null = null;
  if (lastRun) {
    try {
      const j = JSON.parse(lastRun) as { sent: number; errors: number; at: string; trigger: string };
      const at = new Date(j.at);
      lastRunText = `Ostatnia wysyłka (${j.trigger === 'AUTO' ? 'automatyczna' : 'ręczna'}): ${at.toLocaleDateString('pl-PL')} ${at.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })} · wysłano ${j.sent}${j.errors ? `, błędy ${j.errors}` : ''}`;
    } catch { /* ignore */ }
  }

  const busy = progress !== null;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.lg, paddingBottom: space.xl * 2 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} progressBackgroundColor={colors.surface} />}
    >
      <Text style={s.date}>{todayLabel()}</Text>
      <Text style={s.title}>Przeglądy klimatyzacji</Text>

      {settings?.sms_mode === 'MOCK' ? (
        <Banner icon="flask-outline" color={colors.soon} text="Tryb testowy: SMS-y trafiają tylko do historii. Zmień tryb w Ustawieniach." />
      ) : settings?.sms_mode === 'SIM' && !SimSms.isLinked ? (
        <Banner icon="information-outline" color={colors.accent} text="Ta wersja nie ma modułu SIM – każdy SMS otworzy aplikację wiadomości. Zbuduj APK, aby wysyłać automatycznie." />
      ) : null}

      <View style={s.stats}>
        <Stat value={stats?.total} label="klientów" />
        <Stat value={stats?.thisMonth} label="serwisów w tym miesiącu" />
        <Stat value={stats?.overdue} label="po terminie" color={stats?.overdue ? colors.late : undefined} />
      </View>

      <Card style={s.queueCard}>
        <View style={s.queueHead}>
          <View style={{ flex: 1 }}>
            <Text style={s.queueTitle}>Dzisiejsza kolejka do wysyłki</Text>
            <Text style={s.queueSub}>
              Termin w ciągu {settings?.days_before ?? 7} dni lub zaległy, bez wysłanego przypomnienia
            </Text>
          </View>
          <Text style={s.queueCount} accessibilityLabel={`${queue.length} w kolejce`}>{queue.length}</Text>
        </View>

        {busy && progress ? (
          <View style={{ marginTop: space.lg }}>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }]} />
            </View>
            <Text style={s.progressText}>
              {progress.done}/{progress.total}{progress.current ? ` · ${clientName(progress.current)}` : ''}
            </Text>
            <Button title="Przerwij wysyłkę" variant="danger" icon="stop-circle-outline" onPress={() => { cancelRef.current = true; }} style={{ marginTop: space.md }} />
          </View>
        ) : queue.length > 0 ? (
          <Button
            title={`Wyślij zaległe przypomnienia (${queue.length})`}
            icon="send"
            onPress={sendAll}
            style={{ marginTop: space.lg }}
          />
        ) : null}

        {queue.length === 0 && !busy ? (
          <EmptyState icon="check-all" title="Wszystko wysłane" text="Nikt nie czeka dziś na przypomnienie." />
        ) : (
          <View style={{ marginTop: space.md }}>
            {queue.map((c) => {
              const { state, daysLeft } = serviceState(c.next_service_date);
              return (
                <Pressable key={c.id} onPress={() => navigation.navigate('ClientDetails', { id: c.id })}
                  style={({ pressed }) => [s.qItem, pressed && { backgroundColor: colors.surfaceHigh }]}
                  accessibilityRole="button" accessibilityLabel={`${clientName(c)}, ${dueLabel(daysLeft)}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.qName} numberOfLines={1}>{clientName(c)}</Text>
                    <Text style={s.qMeta} numberOfLines={1}>
                      {toPL(c.next_service_date)} · <Text style={{ color: state === 'late' ? colors.late : colors.soon }}>{dueLabel(daysLeft)}</Text> · {formatPhone(c.phone)}
                    </Text>
                  </View>
                  <Button title="Wyślij" compact variant="secondary" icon="message-arrow-right-outline"
                    loading={sendingId === c.id} disabled={busy || (sendingId !== null && sendingId !== c.id)} onPress={() => sendOne(c)} />
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>

      {lastRunText ? <Text style={s.lastRun}>{lastRunText}</Text> : null}
      {settings ? (
        <Text style={s.lastRun}>
          {settings.auto_send ? `Automatyczna wysyłka codziennie po ${settings.send_hour}` : 'Automatyczna wysyłka wyłączona – wysyłaj z tego ekranu'}
          {stats?.smsSentToday ? ` · dziś wysłano ${stats.smsSentToday}` : ''}
        </Text>
      ) : null}

      <Button title="Dodaj klienta" icon="account-plus-outline" variant="secondary" onPress={() => navigation.navigate('ClientForm')} style={{ marginTop: space.xl }} />
    </ScrollView>
  );
}

function Stat({ value, label, color }: { value?: number; label: string; color?: string }) {
  return (
    <View style={s.stat} accessible accessibilityLabel={`${value ?? 0} ${label}`}>
      <Text style={[s.statValue, color ? { color } : null]}>{value ?? '–'}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function Banner({ icon, color, text }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; color: string; text: string }) {
  return (
    <View style={[s.banner, { borderColor: color }]}>
      <MaterialCommunityIcons name={icon} size={20} color={color} />
      <Text style={s.bannerText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  date: { color: colors.mute, fontSize: 15, textTransform: 'capitalize' },
  title: { ...type.title, color: colors.text, marginTop: 2, marginBottom: space.lg },
  banner: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', borderWidth: 1, borderRadius: radius.md, padding: space.md, marginBottom: space.lg, backgroundColor: colors.surface },
  bannerText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
  stats: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: space.md, paddingHorizontal: space.sm },
  statValue: { color: colors.text, fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statLabel: { color: colors.mute, fontSize: 12, marginTop: 2, lineHeight: 16 },
  queueCard: { borderColor: colors.accent, backgroundColor: colors.surface },
  queueHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  queueTitle: { ...type.heading, color: colors.text },
  queueSub: { color: colors.mute, fontSize: 13, marginTop: 4, lineHeight: 18 },
  queueCount: { ...type.hero, color: colors.accent, fontVariant: ['tabular-nums'] },
  qItem: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  qName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  qMeta: { color: colors.mute, fontSize: 13, marginTop: 2 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  progressText: { color: colors.mute, fontSize: 14, marginTop: space.sm },
  lastRun: { color: colors.faint, fontSize: 13, marginTop: space.md, lineHeight: 18 },
});
