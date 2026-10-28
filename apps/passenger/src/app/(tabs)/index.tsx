import type { StationRow } from '@gta/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { StationPicker } from '../../components/StationPicker';
import { SavedTripCard } from '../../components/TripCard';
import { Body, Button, Card, FlagStripe, Loading, Notice, Screen, Title } from '../../components/ui';
import { useAlerts } from '../../lib/alerts';
import { loadStations } from '../../lib/api';
import { formatDate, useI18n } from '../../lib/i18n';
import { useOutboxCount } from '../../lib/outbox';
import { useSavedTrips } from '../../lib/saved';
import { colors, font, ghana, radius, space } from '../../lib/theme';

/** P1-FARE: search from and to. Works signed out and offline (last saved stations). */
export default function SearchScreen() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [stations, setStations] = useState<StationRow[] | null>(null);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [from, setFrom] = useState<StationRow | null>(null);
  const [to, setTo] = useState<StationRow | null>(null);
  const waiting = useOutboxCount();
  const { trips } = useSavedTrips();
  const { unread } = useAlerts();

  const load = useCallback(() => {
    setFailed(false);
    loadStations()
      .then((res) => {
        setStations(res.data);
        setOfflineSince(res.offlineSince);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(load, [load]);

  const same = from != null && to != null && from.id === to.id;

  return (
    <Screen>
      <View style={styles.hero}>
        <FlagStripe height={14} />
        <View style={styles.heroBody}>
          <Text style={styles.greeting}>{t('home.greeting')}</Text>
          <Text style={styles.slogan} accessibilityRole="header">
            {t('home.plan')} <Text style={styles.sloganGold}>{t('home.ride')}</Text> {t('home.arrive')}
          </Text>
          <Text style={styles.tagline}>{t('home.tagline')}</Text>
        </View>
      </View>

      {/* One tap opens the phone's dialer on 112 (phones never let an app place an emergency call by itself). */}
      <Pressable accessibilityRole="button" style={styles.sos} onPress={() => Linking.openURL('tel:112')}>
        <Ionicons name="call" size={20} color={colors.primaryText} />
        <Text style={styles.sosText}>{t('sos.button')}</Text>
      </Pressable>
      <Pressable accessibilityRole="link" style={styles.sosMore} onPress={() => router.push('/emergency')}>
        <Text style={styles.sosMoreText}>{t('sos.more')}</Text>
      </Pressable>

      {waiting > 0 && <Notice>{t('report.pending', { count: waiting })}</Notice>}
      {unread > 0 && <Button label={t('alerts.new', { count: unread })} onPress={() => router.push('/alerts')} />}
      {offlineSince && <Notice tone="warning">{t('common.offline', { date: formatDate(offlineSince, lang) })}</Notice>}
      {failed && (
        <>
          <Notice tone="danger">{t('common.error')}</Notice>
          <Button label={t('common.retry')} variant="secondary" onPress={load} />
        </>
      )}
      {!stations && !failed && <Loading label={t('common.loading')} />}
      {stations && (
        <Card accent>
          <Title>{t('search.title')}</Title>
          <View style={styles.pickers}>
            <View style={styles.pickerColumn}>
              <StationPicker label={t('search.from')} stations={stations} value={from} onChange={setFrom} />
              <StationPicker label={t('search.to')} stations={stations} value={to} onChange={setTo} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('search.swap')}
              disabled={!from && !to}
              hitSlop={8}
              style={styles.swap}
              onPress={() => {
                setFrom(to);
                setTo(from);
              }}
            >
              <Ionicons name="swap-vertical" size={24} color={colors.primary} />
            </Pressable>
          </View>
          {same && <Body muted>{t('search.sameStation')}</Body>}
          <Button
            label={t('search.button')}
            disabled={!from || !to || same}
            onPress={() =>
              from &&
              to &&
              router.push({
                pathname: '/results',
                params: { from: from.id, to: to.id, title: `${from.name} → ${to.name}` },
              })
            }
          />
        </Card>
      )}
      <Card>
        <Title>{t('traffic.title')}</Title>
        <Body>{t('traffic.why')}</Body>
        <Button label={t('traffic.button')} variant="secondary" onPress={() => router.push('/traffic')} />
      </Card>
      {trips.length > 0 && (
        <>
          <Title>{t('saved.title')}</Title>
          {trips.map((trip) => (
            <SavedTripCard
              key={`${trip.originId}:${trip.destinationId}`}
              trip={trip}
              stations={stations}
              onPress={() =>
                router.push({
                  pathname: '/results',
                  params: { from: trip.originId, to: trip.destinationId, title: `${trip.originName} → ${trip.destinationName}` },
                })
              }
            />
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Black for the Black Star, so all three flag colours show on the stripe.
  hero: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: ghana.black },
  heroBody: { padding: space.lg, gap: space.xs },
  greeting: { fontSize: font.body, fontWeight: '600', color: colors.primaryText },
  slogan: { fontSize: font.hero, fontWeight: '800', color: colors.primaryText },
  sloganGold: { color: ghana.gold },
  tagline: { fontSize: font.small, color: colors.primaryText, opacity: 0.95 },
  sos: {
    minHeight: 52,
    flexDirection: 'row',
    gap: space.sm,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
  },
  sosText: { fontSize: font.body, fontWeight: '700', color: colors.primaryText },
  sosMore: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: -space.sm },
  sosMoreText: { fontSize: font.small, fontWeight: '600', color: colors.danger, textDecorationLine: 'underline' },
  pickers: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pickerColumn: { flex: 1, gap: space.sm },
  swap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.lg,
  },
});
