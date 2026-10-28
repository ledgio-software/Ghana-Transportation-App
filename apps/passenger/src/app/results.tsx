import { checkFare, type FareOption, formatDuration, formatPesewas, parseCedisToPesewas, type StationRow } from '@gta/shared';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { FareCard } from '../components/FareCard';
import { RouteMap } from '../components/RouteMap';
import { TripWeather } from '../components/TripWeather';
import { Body, Button, Loading, Notice, Screen, Title } from '../components/ui';
import { loadStations, searchFares } from '../lib/api';
import { useFlag } from '../lib/flags';
import { formatDate, useI18n } from '../lib/i18n';
import { useConsents } from '../lib/consent';
import { type SavedTrip, useSavedTrips } from '../lib/saved';
import { enqueue } from '../lib/outbox';
import { useSession } from '../lib/session';
import { colors, font, ghana, radius, space } from '../lib/theme';

/** P1-FARE results with the P1-ALERT fair price check under each option. */
export default function ResultsScreen() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const reportsOn = useFlag('phase1.fare_reports');
  const { from, to, title } = useLocalSearchParams<{ from: string; to: string; title?: string }>();
  const [fares, setFares] = useState<FareOption[] | null>(null);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    if (!from || !to) return;
    setFailed(false);
    searchFares(from, to)
      .then((res) => {
        setFares(res.data);
        setOfflineSince(res.offlineSince);
      })
      .catch(() => setFailed(true));
  }, [from, to]);

  useEffect(load, [load]);

  // Coordinates for the weather and the map (saved on the phone, like the station list).
  const [stations, setStations] = useState<StationRow[] | null>(null);
  useEffect(() => {
    loadStations()
      .then((res) => setStations(res.data))
      .catch(() => setStations([]));
  }, []);
  const origin = useMemo(() => stations?.find((s) => s.id === from), [stations, from]);
  const destination = useMemo(() => stations?.find((s) => s.id === to), [stations, to]);
  // The option shown in full below the cards; the first (cheapest listed) until one is tapped.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = fares?.find((f) => f.fare_id === selectedId) ?? fares?.[0] ?? null;
  const durations = fares?.map((f) => f.typical_duration_min).filter((d): d is number => d != null) ?? [];
  // Without a typical duration, assume an hour: the arrival window is two hours wide anyway.
  const durationMin = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 60;

  return (
    <Screen>
      {title ? <Stack.Screen options={{ title }} /> : null}
      {offlineSince && <Notice tone="warning">{t('common.offline', { date: formatDate(offlineSince, lang) })}</Notice>}
      {failed && (
        <>
          <Notice tone="danger">{t('common.error')}</Notice>
          <Button label={t('common.retry')} variant="secondary" onPress={load} />
        </>
      )}
      {!fares && !failed && <Loading label={t('common.loading')} />}
      {fares && fares.length === 0 && <Body>{t('fare.none')}</Body>}
      {fares && fares.length > 1 && (
        <FareOptions fares={fares} selectedId={selected?.fare_id} onSelect={setSelectedId} />
      )}
      {selected && (
        <View style={styles.option}>
          <FareCard fare={selected} />
          {reportsOn && (
            <Button
              label={t('report.button')}
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/report',
                  params: {
                    route_id: selected.route_id,
                    operator_id: selected.operator_id ?? '',
                    vehicle_type: selected.vehicle_type,
                    class: selected.class,
                    label: [title, selected.operator_name, selected.vehicle_type_name].filter(Boolean).join(' · '),
                  },
                })
              }
            />
          )}
          <FareCheck key={selected.fare_id} fare={selected} reportsOn={reportsOn} />
        </View>
      )}
      {fares && fares.length > 0 && origin && destination && (
        <TripWeather origin={origin} destination={destination} durationMin={durationMin} />
      )}
      {fares && fares.length > 0 && from && to && (
        <SaveTrip
          trip={{
            originId: from,
            destinationId: to,
            originName: origin?.name ?? title?.split(' → ')[0] ?? '',
            destinationName: destination?.name ?? title?.split(' → ')[1] ?? '',
            routeIds: [...new Set(fares.map((f) => f.route_id))],
          }}
        />
      )}
      {fares && origin && destination && <RouteMap origin={origin} destination={destination} />}
      {fares && fares.length > 0 && <TripSafety routeId={fares[0]!.route_id} label={title} />}
    </Screen>
  );
}

/** Ways to travel as cards you swipe through and tap, like ride apps (only when there is a choice). */
function FareOptions({
  fares,
  selectedId,
  onSelect,
}: {
  fares: FareOption[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <View style={styles.options}>
      <Text style={styles.optionsTitle}>{t('fare.options')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionsRow} accessibilityRole="radiogroup">
        {fares.map((fare) => {
          const on = fare.fare_id === selectedId;
          const pesewas = fare.official_pesewas ?? fare.reported_median_pesewas;
          const price = pesewas != null ? formatPesewas(pesewas) : '—';
          const name = [fare.operator_name, fare.vehicle_type_name, fare.class !== 'standard' ? fare.class : null]
            .filter(Boolean)
            .join(' · ');
          return (
            <Pressable
              key={fare.fare_id}
              accessibilityRole="radio"
              aria-checked={on}
              accessibilityLabel={t('fare.option', { name, price })}
              onPress={() => onSelect(fare.fare_id)}
              style={[styles.optionCard, on && styles.optionCardOn]}
            >
              <Ionicons name={fare.vehicle_type === 'bus' ? 'bus' : 'car'} size={26} color={on ? ghana.gold : colors.primary} />
              <Text style={[styles.optionName, on && styles.optionTextOn]} numberOfLines={2}>
                {name}
              </Text>
              <Text style={[styles.optionPrice, on && styles.optionTextOn]}>{price}</Text>
              {fare.typical_duration_min ? (
                <Text style={[styles.optionMeta, on && styles.optionTextOn]}>{formatDuration(fare.typical_duration_min * 60)}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** P1-SAFE: rate the driver or report one, for this route. */
function TripSafety({ routeId, label }: { routeId: string; label?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const params = { route_id: routeId, label: label ?? '' };
  return (
    <View style={styles.save}>
      <Title>{t('safety.title')}</Title>
      <Button label={t('rate.button')} variant="secondary" onPress={() => router.push({ pathname: '/rate-driver', params })} />
      <Button label={t('driver.report')} variant="secondary" onPress={() => router.push({ pathname: '/report-driver', params })} />
      <Button label={t('sos.title')} variant="secondary" onPress={() => router.push('/emergency')} />
    </View>
  );
}

/** "Save this trip": saved trips appear on the home screen; signed in, they also get fare-change alerts. */
function SaveTrip({ trip }: { trip: SavedTrip }) {
  const { t } = useI18n();
  const { trips, save, remove, signedIn } = useSavedTrips();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const saved = trips.find((x) => x.originId === trip.originId && x.destinationId === trip.destinationId);

  async function toggle() {
    setBusy(true);
    setFailed(false);
    try {
      if (saved) await remove(saved);
      else await save(trip);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.save}>
      {saved && <Body muted>{signedIn ? t('saved.saved') : t('saved.local')}</Body>}
      {!saved && !signedIn && <Body muted>{t('saved.signIn')}</Body>}
      {failed && <Notice tone="danger">{t('common.error')}</Notice>}
      <Button
        label={saved ? t('saved.remove') : t('saved.save')}
        variant={saved ? 'secondary' : 'primary'}
        onPress={toggle}
        loading={busy}
      />
    </View>
  );
}

function FareCheck({ fare, reportsOn }: { fare: FareOption; reportsOn: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const session = useSession();
  const consents = useConsents();
  const [input, setInput] = useState('');
  const [reported, setReported] = useState(false);
  const quoted = parseCedisToPesewas(input);
  const result =
    quoted != null
      ? checkFare(quoted, { officialPesewas: fare.official_pesewas, reportedMedianPesewas: fare.reported_median_pesewas })
      : null;

  return (
    <View style={styles.check}>
      <Title>{t('check.title')}</Title>
      <Text style={styles.label}>{t('check.quoted')}</Text>
      <TextInput
        value={input}
        onChangeText={setInput}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="0.00"
        style={styles.input}
        accessibilityLabel={t('check.quoted')}
      />
      {result && (
        <Notice tone={result.verdict === 'above_normal' ? 'danger' : 'info'}>
          <Text style={[styles.verdict, result.verdict === 'above_normal' && styles.verdictBad]}>
            {result.verdict === 'unknown' ? t('check.unknown') : t(`check.${result.verdict}`)}
          </Text>
          {result.excessPesewas > 0 ? `\n${t('check.excess', { amount: formatPesewas(result.excessPesewas) })}` : ''}
        </Notice>
      )}
      {result?.verdict === 'above_normal' && quoted != null && reportsOn &&
        (reported ? (
          <Body>{t('check.reported')}</Body>
        ) : (
          <Button
            label={t('check.report')}
            onPress={() => {
              if (!session) {
                router.push('/sign-in');
                return;
              }
              if (!consents.agreed) {
                router.push('/consent');
                return;
              }
              // One tap (P1-ALERT-02): saved on the phone and sent when online.
              enqueue('overcharge_report', {
                route_id: fare.route_id,
                fare_id: fare.fare_id,
                kind: 'overcharge',
                quoted_pesewas: quoted,
                reference_pesewas: result.referencePesewas,
                occurred_at: new Date().toISOString(),
              });
              setReported(true);
            }}
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  option: { gap: space.sm, marginBottom: space.md },
  options: { gap: space.sm },
  optionsTitle: { fontSize: font.small, color: colors.muted, fontWeight: '700', textTransform: 'uppercase' },
  optionsRow: { gap: space.sm, paddingRight: space.md },
  optionCard: {
    width: 150,
    minHeight: 140,
    padding: space.md,
    gap: space.xs,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  optionCardOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionName: { fontSize: font.small, fontWeight: '600', color: colors.text },
  optionPrice: { fontSize: font.amount, fontWeight: '800', color: colors.text },
  optionMeta: { fontSize: font.small, color: colors.muted },
  optionTextOn: { color: colors.primaryText },
  save: { gap: space.sm, marginBottom: space.md },
  check: { gap: space.sm, paddingHorizontal: space.xs },
  label: { fontSize: font.small, color: colors.muted, fontWeight: '600' },
  input: {
    minHeight: 52,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: space.md,
    fontSize: font.amount,
  },
  verdict: { fontSize: font.heading, fontWeight: '700', color: colors.ok },
  verdictBad: { color: colors.danger },
});
