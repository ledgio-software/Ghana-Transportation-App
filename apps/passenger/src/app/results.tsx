import { checkFare, type FareOption, formatPesewas, parseCedisToPesewas } from '@gta/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { FareCard } from '../components/FareCard';
import { RouteMap } from '../components/RouteMap';
import { Body, Button, Loading, Notice, Screen, Title } from '../components/ui';
import { searchFares } from '../lib/api';
import { useFlag } from '../lib/flags';
import { formatDate, useI18n } from '../lib/i18n';
import { useConsents } from '../lib/consent';
import { useSavedTrips } from '../lib/saved';
import { enqueue } from '../lib/outbox';
import { useSession } from '../lib/session';
import { colors, font, space } from '../lib/theme';

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
      {fares && fares.length > 0 && <SaveTrip from={from} to={to} routeIds={[...new Set(fares.map((f) => f.route_id))]} />}
      {fares?.map((fare) => (
        <View key={fare.fare_id} style={styles.option}>
          <FareCard fare={fare} />
          {reportsOn && (
            <Button
              label={t('report.button')}
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/report',
                  params: {
                    route_id: fare.route_id,
                    operator_id: fare.operator_id ?? '',
                    vehicle_type: fare.vehicle_type,
                    class: fare.class,
                    label: [title, fare.operator_name, fare.vehicle_type_name].filter(Boolean).join(' · '),
                  },
                })
              }
            />
          )}
          <FareCheck fare={fare} reportsOn={reportsOn} />
        </View>
      ))}
      {fares && <RouteMap fromId={from} toId={to} />}
    </Screen>
  );
}

/** "Save this trip": saved trips appear on the home screen and get fare-change alerts. */
function SaveTrip({ from, to, routeIds }: { from?: string; to?: string; routeIds: string[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const { trips, save, remove, signedIn } = useSavedTrips();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const saved = trips.find((trip) => trip.originId === from && trip.destinationId === to);

  async function toggle() {
    if (!signedIn) {
      router.push('/sign-in');
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      if (saved) await remove(saved.routeIds);
      else await save(routeIds);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.save}>
      {saved && <Body muted>{t('saved.saved')}</Body>}
      {!signedIn && <Body muted>{t('saved.signIn')}</Body>}
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
