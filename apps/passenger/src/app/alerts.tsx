import { formatPesewas } from '@gta/shared';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Body, Button, Screen, Title } from '../components/ui';
import { useAlerts } from '../lib/alerts';
import { formatDate, useI18n } from '../lib/i18n';
import { colors, font, space } from '../lib/theme';

/** P1-NOTIF: fare changes on the user's saved trips. Opening the screen marks them read. */
export default function AlertsScreen() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { alerts, markAllRead } = useAlerts();

  useEffect(() => {
    void markAllRead();
  }, [markAllRead]);

  return (
    <Screen>
      <Title>{t('alerts.title')}</Title>
      {alerts.length === 0 && <Body muted>{t('alerts.none')}</Body>}
      {alerts.map((a) => {
        const p = a.payload;
        const up = p.new_pesewas > p.old_pesewas;
        return (
          <View key={a.id} style={[styles.card, !a.read_at && styles.unread]}>
            <Text style={styles.route}>
              {p.origin_name} → {p.destination_name}
            </Text>
            <Text style={[styles.change, up ? styles.up : styles.down]}>
              {t('alerts.changed', {
                vehicle: [p.operator_name, p.vehicle_type_name].filter(Boolean).join(' · '),
                old: formatPesewas(p.old_pesewas),
                new: formatPesewas(p.new_pesewas),
              })}
            </Text>
            <Text style={styles.date}>{formatDate(a.created_at, lang)}</Text>
            <Button
              label={t('alerts.view')}
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/results',
                  params: { from: p.origin_id, to: p.destination_id, title: `${p.origin_name} → ${p.destination_name}` },
                })
              }
            />
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderColor: colors.border, borderRadius: 12, padding: space.md, gap: space.xs },
  unread: { borderColor: colors.primary },
  route: { fontSize: font.heading, fontWeight: '700', color: colors.text },
  change: { fontSize: font.body, fontWeight: '700' },
  up: { color: colors.danger },
  down: { color: colors.ok },
  date: { fontSize: font.small, color: colors.muted },
});
