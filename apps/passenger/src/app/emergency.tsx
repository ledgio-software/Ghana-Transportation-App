import type { EmergencyContact } from '@gta/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Notice, Screen, Title } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { loadEmergencyContacts, savedEmergencyContacts } from '../lib/safety';
import { colors, font, space } from '../lib/theme';

/** P1-SAFE-01: police, fire and ambulance numbers, one tap to call. Works signed out and offline. */
export default function EmergencyScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const [contacts, setContacts] = useState<EmergencyContact[]>(savedEmergencyContacts);

  useEffect(() => {
    void loadEmergencyContacts().then(setContacts);
  }, []);

  return (
    <Screen>
      <Title>{t('sos.title')}</Title>
      <Notice tone="danger">{t('sos.danger')}</Notice>
      {contacts.map((c) => (
        <Pressable
          key={`${c.phone}:${c.name}`}
          accessibilityRole="button"
          accessibilityLabel={t('sos.call', { name: c.name, phone: c.phone })}
          onPress={() => Linking.openURL(`tel:${c.phone}`)}
          style={({ pressed }) => [styles.contact, c.kind === 'emergency' && styles.main, pressed && styles.pressed]}
        >
          <View style={styles.text}>
            <Text style={[styles.name, c.kind === 'emergency' && styles.mainText]}>{c.name}</Text>
            {c.note ? <Text style={[styles.note, c.kind === 'emergency' && styles.mainText]}>{c.note}</Text> : null}
          </View>
          <Text style={[styles.phone, c.kind === 'emergency' && styles.mainText]}>{c.phone}</Text>
        </Pressable>
      ))}
      <Body muted>{t('sos.tapToCall')}</Body>
      <Title>{t('driver.reportTitle')}</Title>
      <Body>{t('driver.reportWhy')}</Body>
      <Button label={t('driver.report')} variant="secondary" onPress={() => router.push('/report-driver')} />
    </Screen>
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
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
  },
  main: { backgroundColor: colors.danger, borderColor: colors.danger },
  pressed: { opacity: 0.8 },
  text: { flex: 1 },
  name: { fontSize: font.heading, fontWeight: '700', color: colors.text },
  note: { fontSize: font.small, color: colors.muted },
  phone: { fontSize: font.title, fontWeight: '700', color: colors.danger },
  mainText: { color: colors.primaryText },
});
