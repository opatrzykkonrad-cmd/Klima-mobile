import React, { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TabScreenProps } from '../navigation/types';
import type { SmsLog, SmsStatus } from '../types';
import { listLogs } from '../db/logs';
import { useRefreshOnFocus } from '../hooks';
import { colors, radius, space, type } from '../theme';
import { Button, EmptyState, Pill, Segmented } from '../components/ui';
import { toPL } from '../utils/dates';
import { formatPhone } from '../utils/phone';
import { retryLog } from '../services/queue';
import { toast } from '../services/actions';

type LogFilter = '' | 'SENT' | 'ERROR' | 'MOCK';
const PAGE = 40;

const STATUS: Record<SmsStatus, { label: string; fg: string; bg: string }> = {
  SENT_SIM: { label: 'Wysłany z SIM', fg: colors.ok, bg: colors.okSoft },
  SENT_API: { label: 'Wysłany SMSAPI', fg: colors.ok, bg: colors.okSoft },
  MOCK: { label: 'Test', fg: colors.soon, bg: colors.soonSoft },
  ERROR: { label: 'Błąd', fg: colors.late, bg: colors.lateSoft },
};
const TRIGGER: Record<string, string> = { AUTO: 'automatycznie', MANUAL: 'ręcznie', TEST: 'test', RETRY: 'ponowienie' };

export function LogItem({ log, compact, onChanged }: { log: SmsLog; compact?: boolean; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false);
  const st = STATUS[log.status];
  const retry = async () => {
    setBusy(true);
    try {
      const r = await retryLog(log.id);
      if (r.status === 'ERROR') Alert.alert('Ponowna wysyłka nieudana', r.error);
      else toast('Wysłano ponownie');
    } catch (e) {
      Alert.alert('Nie wysłano', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      onChanged?.();
    }
  };
  return (
    <View style={s.item}>
      <View style={s.itemHead}>
        <View style={{ flex: 1 }}>
          {!compact ? <Text style={s.name} numberOfLines={1}>{log.client_name || formatPhone(log.phone)}</Text> : null}
          <Text style={s.meta}>
            {toPL(log.sent_at)} {log.sent_at.slice(11, 16)} · {TRIGGER[log.trigger_type] ?? log.trigger_type}
            {!compact && log.client_name ? ` · ${formatPhone(log.phone)}` : ''}
          </Text>
        </View>
        <Pill label={st.label} fg={st.fg} bg={st.bg} />
      </View>
      <Text style={s.message} numberOfLines={compact ? 3 : undefined}>{log.message}</Text>
      {log.error_details ? <Text style={[s.error, log.status !== 'ERROR' && { color: colors.mute }]}>{log.error_details}</Text> : null}
      {log.status === 'ERROR' ? (
        <Button title="Ponów wysyłkę" icon="refresh" variant="secondary" compact loading={busy} onPress={retry} style={{ marginTop: space.md, alignSelf: 'flex-start' }} />
      ) : null}
    </View>
  );
}

export default function LogsScreen(_: TabScreenProps<'Logs'>) {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<LogFilter>('');
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const rows = await listLogs({ status: filter, limit: PAGE, offset: 0 });
    setLogs(rows); setHasMore(rows.length === PAGE); setLoaded(true);
  }, [filter]);
  useRefreshOnFocus(load);
  React.useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    if (!hasMore) return;
    const rows = await listLogs({ status: filter, limit: PAGE, offset: logs.length });
    setLogs((prev) => [...prev, ...rows]);
    setHasMore(rows.length === PAGE);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[s.header, { paddingTop: insets.top + space.md }]}>
        <Text style={s.title}>Historia SMS</Text>
        <Segmented<LogFilter>
          options={[{ value: '', label: 'Wszystkie' }, { value: 'SENT', label: 'Wysłane' }, { value: 'ERROR', label: 'Błędy' }, { value: 'MOCK', label: 'Test' }]}
          value={filter} onChange={setFilter} accessibilityLabel="Filtr historii"
        />
      </View>
      <FlatList
        data={logs}
        keyExtractor={(l) => String(l.id)}
        renderItem={({ item }) => <LogItem log={item} onChanged={load} />}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={loaded ? <EmptyState icon="message-text-outline" title="Brak wiadomości" text="Tu pojawi się każdy wysłany SMS – także testowy i nieudany." /> : undefined}
      />
    </View>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { ...type.title, color: colors.text },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.md },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginBottom: space.sm },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.mute, fontSize: 13, marginTop: 2 },
  message: { color: colors.text, fontSize: 15, lineHeight: 21 },
  error: { color: colors.late, fontSize: 13, marginTop: space.sm, lineHeight: 18 },
});
