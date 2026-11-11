import React from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle, StyleProp,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, space, type } from '../theme';

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Button({ title, onPress, variant = 'primary', icon, disabled, loading, compact, style, accessibilityLabel }: ButtonProps) {
  const v = buttonVariants[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [
        styles.btn,
        compact && styles.btnCompact,
        { backgroundColor: v.bg, borderColor: v.border },
        pressed && !inactive && { opacity: 0.8 },
        inactive && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : icon ? <MaterialCommunityIcons name={icon} size={compact ? 18 : 20} color={v.fg} /> : null}
      <Text style={[styles.btnText, compact && styles.btnTextCompact, { color: v.fg }]} numberOfLines={1}>{title}</Text>
    </Pressable>
  );
}

const buttonVariants = {
  primary: { bg: colors.accent, fg: colors.accentInk, border: colors.accent },
  secondary: { bg: colors.surfaceHigh, fg: colors.text, border: colors.border },
  ghost: { bg: 'transparent', fg: colors.accent, border: 'transparent' },
  danger: { bg: 'transparent', fg: colors.late, border: colors.lateSoft },
};

export function IconButton({ icon, onPress, label, color = colors.text, size = 22 }: { icon: IconName; onPress: () => void; label: string; color?: string; size?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.surfaceHigh }]}>
      <MaterialCommunityIcons name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

type FieldProps = TextInputProps & { label: string; error?: string; hint?: string };

export const Field = React.forwardRef<React.ComponentRef<typeof TextInput>, FieldProps>(function Field({ label, error, hint, style, ...rest }, ref) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.faint}
        selectionColor={colors.accent}
        style={[styles.input, rest.multiline && styles.inputMulti, error ? { borderColor: colors.late } : null, style]}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

export function Segmented<T extends string | number>({
  options, value, onChange, accessibilityLabel,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; accessibilityLabel?: string }) {
  return (
    <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Pill({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name={icon} size={40} color={colors.faint} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={styles.emptyText}>{text}</Text> : null}
      {action}
    </View>
  );
}

export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <View style={[styles.switch, value && styles.switchOn]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  btn: {
    minHeight: 52, paddingHorizontal: space.lg, borderRadius: radius.md, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm,
  },
  btnCompact: { minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.sm },
  btnText: { fontSize: 16, fontWeight: '600' },
  btnTextCompact: { fontSize: 14 },
  iconBtn: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.sm },
  sectionTitle: { ...type.heading, color: colors.text },
  field: { marginBottom: space.lg },
  label: { color: colors.mute, fontSize: 14, marginBottom: 6, fontWeight: '500' },
  input: {
    minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.bg,
    color: colors.text, paddingHorizontal: space.md, fontSize: 16,
  },
  inputMulti: { minHeight: 100, paddingTop: space.md, textAlignVertical: 'top' },
  error: { color: colors.late, fontSize: 13, marginTop: 6 },
  hint: { color: colors.mute, fontSize: 13, marginTop: 4, lineHeight: 18 },
  segment: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 4, gap: 4 },
  segmentItem: { flex: 1, minHeight: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentItemActive: { backgroundColor: colors.surfaceHigh },
  segmentText: { color: colors.mute, fontSize: 15, fontWeight: '500' },
  segmentTextActive: { color: colors.text, fontWeight: '700' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: space.xl, gap: space.sm },
  emptyTitle: { ...type.heading, color: colors.text, textAlign: 'center' },
  emptyText: { color: colors.mute, fontSize: 15, textAlign: 'center', lineHeight: 21, marginBottom: space.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, minHeight: 56 },
  toggleLabel: { color: colors.text, fontSize: 16 },
  switch: { width: 52, height: 32, borderRadius: 16, backgroundColor: colors.border, padding: 3, justifyContent: 'center' },
  switchOn: { backgroundColor: colors.accent },
  knob: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.mute },
  knobOn: { backgroundColor: colors.accentInk, transform: [{ translateX: 20 }] },
});
