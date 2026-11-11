import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Client } from '../types';
import { colors, radius, space, stateColor } from '../theme';
import { dueLabel, serviceState, toPL } from '../utils/dates';
import { formatPhone } from '../utils/phone';
import { callClient, clientName, confirmServiceDoneToday, navigateTo } from '../services/actions';

export function ClientCard({ client, onPress }: { client: Client; onPress: () => void }) {
  const { state, daysLeft } = serviceState(client.next_service_date);
  const sc = stateColor[state];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${clientName(client)}, serwis ${toPL(client.next_service_date)}, ${dueLabel(daysLeft)}`}
      style={({ pressed }) => [s.card, pressed && { backgroundColor: colors.surfaceHigh }]}>
      <View style={[s.stripe, { backgroundColor: sc.fg }]} />
      <View style={s.body}>
        <View style={s.topRow}>
          <Text style={s.name} numberOfLines={1}>{clientName(client)}</Text>
          {client.reminder_sent ? <MaterialCommunityIcons name="message-check-outline" size={18} color={colors.ok} accessibilityLabel="SMS wysłany" /> : null}
          {!client.sms_enabled ? <MaterialCommunityIcons name="message-off-outline" size={18} color={colors.faint} accessibilityLabel="Bez zgody na SMS" /> : null}
        </View>
        {client.company_name && client.first_name ? <Text style={s.sub} numberOfLines={1}>{client.first_name}</Text> : null}
        <Text style={s.sub} numberOfLines={1}>{client.device_model || 'Brak modelu'} · {formatPhone(client.phone)}</Text>

        <View style={s.dueRow}>
          <Text style={s.date}>{toPL(client.next_service_date)}</Text>
          <Text style={[s.due, { color: sc.fg }]}>{dueLabel(daysLeft)}</Text>
        </View>

        <View style={s.actions}>
          <QuickAction icon="phone" label="Zadzwoń" onPress={() => callClient(client.phone)} />
          <QuickAction icon="navigation-variant-outline" label="Nawiguj" onPress={() => client.address && navigateTo(client.address)} disabled={!client.address} />
          <QuickAction icon="check-circle-outline" label="Serwis dziś" onPress={() => confirmServiceDoneToday(client)} />
        </View>
      </View>
    </Pressable>
  );
}

function QuickAction({ icon, label, onPress, disabled }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
      style={({ pressed }) => [s.qa, pressed && { backgroundColor: colors.border }, disabled && { opacity: 0.35 }]}>
      <MaterialCommunityIcons name={icon} size={18} color={colors.accent} />
      <Text style={s.qaText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: space.md },
  stripe: { width: 5 },
  body: { flex: 1, padding: space.lg, paddingLeft: space.md },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '700' },
  sub: { color: colors.mute, fontSize: 14, marginTop: 2 },
  dueRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space.md },
  date: { color: colors.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  due: { fontSize: 14, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  qa: { flex: 1, minHeight: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceHigh, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 4 },
  qaText: { color: colors.text, fontSize: 13, fontWeight: '600' },
});
