import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme';
import { dateToISO, isoToDate, toPL } from '../utils/dates';
import { styles } from './ui';

export function DateField({ label, value, onChange, maximumDate, error }: {
  label: string; value: string; onChange: (iso: string) => void; maximumDate?: Date; error?: string;
}) {
  const open = () => {
    DateTimePickerAndroid.open({
      value: value ? isoToDate(value) : new Date(),
      mode: 'date',
      maximumDate,
      onChange: (event, date) => {
        if (event.type === 'set' && date) onChange(dateToISO(date));
      },
    });
  };
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${label}: ${toPL(value) || 'nie wybrano'}`}
        style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, error ? { borderColor: colors.late } : null]}>
        <Text style={{ color: value ? colors.text : colors.faint, fontSize: 16 }}>{value ? toPL(value) : 'Wybierz datę'}</Text>
        <MaterialCommunityIcons name="calendar-month-outline" size={22} color={colors.mute} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function TimeField({ label, value, onChange, hint }: { label: string; value: string; onChange: (hhmm: string) => void; hint?: string }) {
  const open = () => {
    const [h, m] = (value || '09:00').split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    DateTimePickerAndroid.open({
      value: d,
      mode: 'time',
      is24Hour: true,
      onChange: (event, date) => {
        if (event.type === 'set' && date) {
          onChange(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
        }
      },
    });
  };
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}
        style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
        <Text style={{ color: colors.text, fontSize: 16 }}>{value}</Text>
        <MaterialCommunityIcons name="clock-outline" size={22} color={colors.mute} />
      </Pressable>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}
