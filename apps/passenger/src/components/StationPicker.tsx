import type { StationRow } from '@gta/shared';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useI18n } from '../lib/i18n';
import { colors, font, space } from '../lib/theme';
import { Button } from './ui';

export function StationPicker({
  label,
  stations,
  value,
  onChange,
}: {
  label: string;
  stations: StationRow[];
  value: StationRow | null;
  onChange: (station: StationRow) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stations;
    return stations.filter((s) => s.name.toLowerCase().includes(q) || s.city.toLowerCase().includes(q));
  }, [query, stations]);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value?.name ?? t('search.pickStation')}`}
        style={styles.input}
        onPress={() => setOpen(true)}
      >
        <Text style={[styles.inputText, !value && styles.placeholder]}>
          {value ? `${value.name}, ${value.city}` : t('search.pickStation')}
        </Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={t('search.pickStation')}
            style={styles.search}
            accessibilityLabel={label}
          />
          <FlatList
            data={filtered}
            keyExtractor={(s) => s.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                style={styles.row}
                onPress={() => {
                  onChange(item);
                  setQuery('');
                  setOpen(false);
                }}
              >
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowSub}>{item.city}</Text>
              </Pressable>
            )}
          />
          <Button label={t('common.cancel')} variant="secondary" onPress={() => setOpen(false)} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  label: { fontSize: font.small, fontWeight: '600', color: colors.muted },
  input: {
    minHeight: 52,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: space.md,
    justifyContent: 'center',
  },
  inputText: { fontSize: font.body, color: colors.text },
  placeholder: { color: colors.muted },
  modal: { flex: 1, padding: space.md, gap: space.md, backgroundColor: colors.background, paddingTop: space.xl },
  search: {
    minHeight: 52,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: space.md,
    fontSize: font.body,
  },
  row: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { fontSize: font.body, fontWeight: '600', color: colors.text },
  rowSub: { fontSize: font.small, color: colors.muted },
});
