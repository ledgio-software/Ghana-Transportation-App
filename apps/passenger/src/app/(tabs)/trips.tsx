import type { StationRow } from '@gta/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { SavedTripCard } from '../../components/TripCard';
import { Body, Button, Card, Notice, Screen, Title } from '../../components/ui';
import { useAlerts } from '../../lib/alerts';
import { loadStations } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useOutboxCount } from '../../lib/outbox';
import { useSavedTrips } from '../../lib/saved';

/** My trips tab: saved trips, fare-change alerts and reports waiting to send (P1-NOTIF, P1-OFF). */
export default function TripsTab() {
  const { t } = useI18n();
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
    </Screen>
  );
}
