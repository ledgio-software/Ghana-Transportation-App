import { type FareOption, fareConfidence, formatPesewas } from '@gta/shared';
import { StyleSheet, Text, View } from 'react-native';
import { formatDate, useI18n } from '../lib/i18n';
import { colors, font, space } from '../lib/theme';

export function FareCard({ fare }: { fare: FareOption }) {
  const { t, lang } = useI18n();
  const confidence = fareConfidence(new Date(fare.last_confirmed_at));
  const title = [fare.operator_name, fare.vehicle_type_name, fare.class !== 'standard' ? fare.class : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.card} accessible>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.numbers}>
        <View style={styles.number}>
          <Text style={styles.label}>{t('fare.official')}</Text>
          <Text style={styles.amount}>{fare.official_pesewas != null ? formatPesewas(fare.official_pesewas) : '—'}</Text>
        </View>
        <View style={styles.number}>
          <Text style={styles.label}>{t('fare.reported')}</Text>
          <Text style={styles.amount}>
            {fare.reported_median_pesewas != null ? formatPesewas(fare.reported_median_pesewas) : '—'}
          </Text>
        </View>
      </View>

      <Text style={[styles.meta, confidence === 'low' && styles.metaWarning]}>
        {t('fare.lastChecked', { date: formatDate(fare.last_confirmed_at, lang) })} · {t(`fare.confidence.${confidence}`)}
      </Text>
      {fare.departure_mode !== 'unknown' && (
        <Text style={styles.meta}>
          {t(`fare.departure.${fare.departure_mode}`)}
          {fare.first_departure && fare.last_departure
            ? ` · ${fare.first_departure.slice(0, 5)}–${fare.last_departure.slice(0, 5)}`
            : ''}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderColor: colors.border, borderRadius: 12, padding: space.md, gap: space.sm },
  title: { fontSize: font.heading, fontWeight: '700', color: colors.text },
  numbers: { flexDirection: 'row', gap: space.md },
  number: { flex: 1, gap: 2 },
  label: { fontSize: font.small, color: colors.muted },
  amount: { fontSize: font.amount, fontWeight: '700', color: colors.text },
  meta: { fontSize: font.small, color: colors.muted },
  metaWarning: { color: colors.warning, fontWeight: '600' },
});
