import type { StationRow } from '@gta/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { SavedTripCard, TripCard } from '../../components/TripCard';
import { Body, Button, Card, Notice, Screen, Title } from '../../components/ui';
import { useAlerts } from '../../lib/alerts';
import { loadStations } from '../../lib/api';
import { confirmAsync } from '../../lib/confirm';
import { useHistory } from '../../lib/history';
import { formatDate, formatTime, useI18n } from '../../lib/i18n';
import { useOutboxCount } from '../../lib/outbox';
import { useSavedTrips } from '../../lib/saved';

/** My trips tab: saved trips, fare-change alerts, reports waiting to send and recent trips (P1-NOTIF, P1-OFF). */
export default function TripsTab() {
  const { t, lang } = useI18n();
  const history = useHistory();
  const router = useRouter();
  const { trips, signedIn } = useSavedTrips();
  const { unread } = useAlerts();
  const waiting = useOutboxCount();
  const [stations, setStations] = useState<StationRow[] | null>(null);
  useEffect(() => {
    loadStations()
      .then((res) => setStations(res.data))
      .catch(() => setStations([]));
  }, []);

  return (
    <Screen>
      <Title>{t('saved.title')}</Title>
      {waiting > 0 && <Notice>{t('report.pending', { count: waiting })}</Notice>}
      {signedIn && (
        <Button
          label={unread > 0 ? t('alerts.new', { count: unread }) : t('alerts.title')}
          variant={unread > 0 ? 'primary' : 'secondary'}
          onPress={() => router.push('/alerts')}
        />
      )}
      {!signedIn && (
        <Card>
          <Body>{t('saved.signIn')}</Body>
          <Button label={t('settings.signIn')} onPress={() => router.push('/sign-in')} />
        </Card>
      )}
      {trips.length === 0 && <Body muted>{t('saved.none')}</Body>}
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

      <Title>{t('history.title')}</Title>
      {history.trips.length === 0 && <Body muted>{t('history.none')}</Body>}
      {history.trips.slice(0, 10).map((trip) => (
        <TripCard
          key={`h:${trip.originId}:${trip.destinationId}`}
          from={trip.originName}
          to={trip.destinationName}
          detail={`${formatDate(trip.at, lang)}, ${formatTime(new Date(trip.at), lang)}`}
          onPress={() =>
            router.push({
              pathname: '/results',
              params: { from: trip.originId, to: trip.destinationId, title: `${trip.originName} → ${trip.destinationName}` },
            })
          }
        />
      ))}
      {history.trips.length > 0 && (
        <Button
          label={t('history.clear')}
          variant="secondary"
          onPress={async () => {
            if (await confirmAsync(t('history.clearConfirm'), t('history.clear'), t('common.cancel'))) history.clear();
          }}
        />
      )}
      <Body muted>{t('history.private')}</Body>
    </Screen>
  );
}
