import React from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { reloadAppAsync } from 'expo';

/** Ekran awarii – bez zależności od reszty aplikacji, żeby działał nawet przy błędzie w niej. */
export function ErrorScreen({ title, message, details, onDismiss }: {
  title: string; message: string; details?: string; onDismiss?: () => void;
}) {
  const report = `${title}\n\n${message}\n\n${details ?? ''}`.trim();
  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.hint}>Zrób zrzut ekranu albo naciśnij „Udostępnij raport” i wyślij go programiście.</Text>
        <Text style={s.message} selectable>{message}</Text>
        {details ? <Text style={s.details} selectable>{details}</Text> : null}
      </ScrollView>
      <View style={s.bar}>
        <Btn label="Udostępnij raport" onPress={() => { void Share.share({ message: report }); }} primary />
        {onDismiss ? <Btn label="Zamknij" onPress={onDismiss} /> : <Btn label="Uruchom ponownie" onPress={() => { void reloadAppAsync(); }} />}
      </View>
    </View>
  );
}

function Btn({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[s.btn, primary && s.btnPrimary]} accessibilityRole="button">
      <Text style={[s.btnText, primary && { color: '#06232D' }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0E1620' },
  content: { padding: 20, paddingTop: 56 },
  title: { color: '#F0645A', fontSize: 22, fontWeight: '700' },
  hint: { color: '#8DA0B3', fontSize: 14, marginTop: 8, lineHeight: 20 },
  message: { color: '#E9EFF4', fontSize: 16, fontWeight: '600', marginTop: 20, lineHeight: 22 },
  details: { color: '#8DA0B3', fontSize: 12, marginTop: 16, fontFamily: 'monospace', lineHeight: 17 },
  bar: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#2A3A4D' },
  btn: { flex: 1, minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: '#2A3A4D', alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: '#4FC3E0', borderColor: '#4FC3E0' },
  btnText: { color: '#E9EFF4', fontSize: 15, fontWeight: '600' },
});

type BoundaryState = { error: Error | null };

/** Łapie błędy renderowania ekranów. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): BoundaryState { return { error }; }
  render() {
    const e = this.state.error;
    if (e) return <ErrorScreen title="Błąd aplikacji" message={`${e.name}: ${e.message}`} details={e.stack} />;
    return this.props.children;
  }
}
