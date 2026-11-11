import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { TabScreenProps } from '../navigation/types';
import type { Client, ClientFilter } from '../types';
import { listClients } from '../db/clients';
import { useRefreshOnFocus } from '../hooks';
import { colors, radius, space, type } from '../theme';
import { Button, EmptyState, Segmented } from '../components/ui';
import { ClientCard } from '../components/ClientCard';

const FILTERS: { value: ClientFilter; label: string }[] = [
  { value: 'all', label: 'Wszyscy' },
  { value: 'soon', label: 'Zbliżające się' },
  { value: 'late', label: 'Po terminie' },
];

export default function ClientsScreen({ navigation }: TabScreenProps<'Clients'>) {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<ClientFilter>('all');
  const [clients, setClients] = useState<Client[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setClients(await listClients(debounced, filter));
    setLoaded(true);
  }, [debounced, filter]);
  useRefreshOnFocus(load);
  useEffect(() => { void load(); }, [load]);

  const searching = debounced.length > 0 || filter !== 'all';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[s.header, { paddingTop: insets.top + space.md }]}>
        <Text style={s.title}>Klienci</Text>
        <View style={s.search}>
          <MaterialCommunityIcons name="magnify" size={22} color={colors.mute} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Nazwisko, telefon, adres, model"
            placeholderTextColor={colors.faint}
            selectionColor={colors.accent}
            style={s.searchInput}
            returnKeyType="search"
            accessibilityLabel="Szukaj klienta"
          />
          {q ? (
            <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityLabel="Wyczyść wyszukiwanie">
              <MaterialCommunityIcons name="close-circle" size={20} color={colors.mute} />
            </Pressable>
          ) : null}
        </View>
        <Segmented options={FILTERS} value={filter} onChange={setFilter} accessibilityLabel="Filtr klientów" />
      </View>

      <FlatList
        data={clients}
        keyExtractor={(c) => String(c.id)}
        renderItem={({ item }) => <ClientCard client={item} onPress={() => navigation.navigate('ClientDetails', { id: item.id })} />}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 110 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={loaded ? (
          searching
            ? <EmptyState icon="account-search-outline" title="Brak wyników" text="Zmień wyszukiwanie albo wybierz „Wszyscy”." />
            : <EmptyState icon="account-multiple-plus-outline" title="Brak klientów" text="Dodaj pierwszą instalację, aby system pilnował terminów przeglądów."
                action={<Button title="Dodaj klienta" icon="plus" onPress={() => navigation.navigate('ClientForm')} />} />
        ) : undefined}
      />

      <Pressable onPress={() => navigation.navigate('ClientForm')} accessibilityRole="button" accessibilityLabel="Dodaj klienta"
        style={({ pressed }) => [s.fab, pressed && { opacity: 0.85 }]}>
        <MaterialCommunityIcons name="plus" size={30} color={colors.accentInk} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.md, backgroundColor: colors.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { ...type.title, color: colors.text },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, minHeight: 52 },
  searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: space.sm },
  fab: { position: 'absolute', right: space.lg, bottom: space.lg, width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', elevation: 6 },
});
