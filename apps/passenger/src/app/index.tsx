import type { StationRow } from '@gta/shared';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { StationPicker } from '../components/StationPicker';
import { Body, Button, Loading, Notice, Screen, Title } from '../components/ui';
import { useAlerts } from '../lib/alerts';
import { loadStations } from '../lib/api';
import { formatDate, useI18n } from '../lib/i18n';
import { useOutboxCount } from '../lib/outbox';
import { useSavedTrips } from '../lib/saved';
import { colors, font, space } from '../lib/theme';

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
      <Pressable accessibilityRole="button" style={styles.sos} onPress={() => router.push('/emergency')}>
        <Text style={styles.sosText}>{t('sos.button')}</Text>
      </Pressable>
      <Title>{t('search.title')}</Title>
      {waiting > 0 && <Notice>{t('report.pending', { count: waiting })}</Notice>}
      {unread > 0 && (
        <Button label={t('alerts.new', { count: unread })} onPress={() => router.push('/alerts')} />
      )}
      {offlineSince && <Notice tone="warning">{t('common.offline', { date: formatDate(offlineSince, lang) })}</Notice>}
      {failed && (
        <>
          <Notice tone="danger">{t('common.error')}</Notice>
          <Button label={t('common.retry')} variant="secondary" onPress={load} />
        </>
      )}
      {!stations && !failed && <Loading label={t('common.loading')} />}
      {stations && (
        <>
          <StationPicker label={t('search.from')} stations={stations} value={from} onChange={setFrom} />
          <StationPicker label={t('search.to')} stations={stations} value={to} onChange={setTo} />
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
        </>
      )}
      {trips.length > 0 && (
        <>
          <Title>{t('saved.title')}</Title>
          {trips.map((trip) => (
            <Pressable
              key={`${trip.originId}:${trip.destinationId}`}
              accessibilityRole="button"
              style={styles.trip}
              onPress={() =>
                router.push({
                  pathname: '/results',
                  params: { from: trip.originId, to: trip.destinationId, title: `${trip.originName} → ${trip.destinationName}` },
                })
              }
            >
              <Text style={styles.tripText}>
                {trip.originName} → {trip.destinationName}
              </Text>
            </Pressable>
          ))}
        </>
      )}
      <Title>{t('safety.title')}</Title>
      <Button label={t('driver.report')} variant="secondary" onPress={() => router.push('/report-driver')} />
      <Button label={t('rate.button')} variant="secondary" onPress={() => router.push('/rate-driver')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sos: {
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.md,
    borderRadius: 10,
    backgroundColor: colors.danger,
  },
  sosText: { fontSize: font.body, fontWeight: '700', color: colors.primaryText },
  trip: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  tripText: { fontSize: font.body, fontWeight: '600', color: colors.text },
});
