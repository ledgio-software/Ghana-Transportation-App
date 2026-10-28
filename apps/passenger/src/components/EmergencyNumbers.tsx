import type { EmergencyContact } from '@gta/shared';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../lib/i18n';
import { loadEmergencyContacts, savedEmergencyContacts } from '../lib/safety';
import { colors, font, radius, space } from '../lib/theme';
import { Body, Notice } from './ui';

/** P1-SAFE-01: police, fire and ambulance numbers, one tap to call. Works signed out and offline. */
export function EmergencyNumbers() {
  const { t } = useI18n();
  const [contacts, setContacts] = useState<EmergencyContact[]>(savedEmergencyContacts);

  useEffect(() => {
    void loadEmergencyContacts().then(setContacts);
  }, []);

  return (
    <>
      <Notice tone="danger">{t('sos.danger')}</Notice>
      {contacts.map((c) => {
        const main = c.kind === 'emergency';
        return (
          <Pressable
            key={`${c.phone}:${c.name}`}
            accessibilityRole="button"
            accessibilityLabel={t('sos.call', { name: c.name, phone: c.phone })}
            onPress={() => Linking.openURL(`tel:${c.phone}`)}
            style={({ pressed }) => [styles.contact, main && styles.main, pressed && styles.pressed]}
          >
            <Ionicons name="call" size={22} color={main ? colors.primaryText : colors.danger} />
            <View style={styles.text}>
              <Text style={[styles.name, main && styles.mainText]}>{c.name}</Text>
              {c.note ? <Text style={[styles.note, main && styles.mainText]}>{c.note}</Text> : null}
            </View>
            <Text style={[styles.phone, main && styles.mainText]}>{c.phone}</Text>
          </Pressable>
        );
      })}
      <Body muted>{t('sos.tapToCall')}</Body>
    </>
  );
}

const styles = StyleSheet.create({
  contact: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  main: { backgroundColor: colors.danger, borderColor: colors.danger },
  pressed: { opacity: 0.8 },
  text: { flex: 1 },
  name: { fontSize: font.heading, fontWeight: '700', color: colors.text },
  note: { fontSize: font.small, color: colors.muted },
  phone: { fontSize: font.title, fontWeight: '700', color: colors.danger },
  mainText: { color: colors.primaryText },
});
