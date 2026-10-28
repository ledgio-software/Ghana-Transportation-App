import { formatPesewas, type StationRow } from '@gta/shared';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../lib/i18n';
import type { SavedTrip } from '../lib/saved';
import { colors, font, radius, space } from '../lib/theme';
import { useTripSummary } from '../lib/tripSummary';

/** A saved trip with its cheapest fare and whether it will rain, so there is no need to search. */
export function SavedTripCard({ trip, stations, onPress }: { trip: SavedTrip; stations: StationRow[] | null; onPress: () => void }) {
  const { t } = useI18n();
  const summary = useTripSummary(trip, stations);
  const parts: string[] = [];
  if (summary?.pricePesewas != null) parts.push(t('saved.from', { price: formatPesewas(summary.pricePesewas) }));
  if (summary?.floodPlace) parts.push(t('saved.flood', { place: summary.floodPlace }));
  else if (summary?.rain === 'heavy') parts.push(t('saved.heavy'));
  else if (summary?.rain === 'rain') parts.push(t('saved.rain'));
  else if (summary?.rain === 'none') parts.push(t('saved.dry'));
  return (
    <TripCard
      from={trip.originName}
      to={trip.destinationName}
      detail={parts.join(' · ') || undefined}
      warn={summary?.rain === 'heavy' || summary?.rain === 'rain'}
      onPress={onPress}
    />
  );
}

/** A saved trip as a card: bus icon, "From → To" (and a detail line), arrow. */
export function TripCard({
  from,
  to,
  detail,
  warn,
  onPress,
}: {
  from: string;
  to: string;
  detail?: string;
  warn?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" style={({ pressed }) => [styles.trip, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.icon}>
        <Ionicons name="bus" size={22} color={colors.primary} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.tripText}>
          {from} → {to}
        </Text>
        {detail && <Text style={[styles.detail, warn && styles.warn]}>{detail}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trip: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  pressed: { opacity: 0.8 },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, gap: 2, paddingVertical: space.sm },
  tripText: { fontSize: font.body, fontWeight: '600', color: colors.text },
  detail: { fontSize: font.small, color: colors.muted },
  warn: { color: colors.warning, fontWeight: '600' },
});
