/* eslint-disable @typescript-eslint/no-explicit-any */
import { ARRIVED_M, formatDistance, formatDuration, type LatLng, metresBetween, routeProgress } from '@gta/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Body } from '../../components/ui';
import { loadGoogleMaps } from '../../lib/googleMaps';
import { useI18n } from '../../lib/i18n';
import { type DrivingRoute, loadDrivingRoute } from '../../lib/routes';
import { colors, font, ghana, space } from '../../lib/theme';
import { loadSharedTrip, type SharedTrip } from '../../lib/tripShare';

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFRESH_MS = 15_000;

type Loaded = { status: 'loading' } | { status: 'missing' } | { status: 'failed' } | { status: 'ok'; trip: SharedTrip };

/**
 * P1-SAFE-05: the page family open from a "Share my trip" link. No sign-in. Shows the route
 * and the traveller's latest position, refreshed every 15 s, until the trip ends.
 */
export default function FollowScreen() {
  const { t } = useI18n();
  const { id, embedded } = useLocalSearchParams<{ id: string; embedded?: string }>();
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [route, setRoute] = useState<DrivingRoute | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const mapDiv = useRef<HTMLDivElement | null>(null);
  const map = useRef<{ maps: any; map: any; dot?: any; fitted?: boolean } | null>(null);

  useEffect(() => {
    if (!id || !UUID.test(id)) {
      setLoaded({ status: 'missing' });
      return;
    }
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      loadSharedTrip(id)
        .then((trip) => {
          if (!live) return;
          setLoaded(trip ? { status: 'ok', trip } : { status: 'missing' });
          setNow(Date.now());
          if (trip?.status === 'live') timer = setTimeout(tick, REFRESH_MS);
        })
        .catch(() => {
          if (!live) return;
          // Keep the last good answer through a network blip.
          setLoaded((current) => (current.status === 'ok' ? current : { status: 'failed' }));
          timer = setTimeout(tick, REFRESH_MS);
        });
    };
    tick();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [id]);

  const trip = loaded.status === 'ok' ? loaded.trip : null;
  const origin = trip?.origin;
  const destination = trip?.destination;

  // The map and road line, once.
  useEffect(() => {
    if (!KEY || !origin || !destination || !mapDiv.current || map.current) return;
    let live = true;
    const toLatLng = (p: LatLng) => ({ lat: p.latitude, lng: p.longitude });
    loadGoogleMaps(KEY)
      .then(async (maps) => {
        if (!live || !mapDiv.current) return;
        const m = new maps.Map(mapDiv.current, { disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy', clickableIcons: false });
        new maps.Marker({ map: m, position: toLatLng(origin), title: origin.name, label: 'A' });
        new maps.Marker({ map: m, position: toLatLng(destination), title: destination.name, label: 'B' });
        const bounds = new maps.LatLngBounds();
        bounds.extend(toLatLng(origin));
        bounds.extend(toLatLng(destination));
        m.fitBounds(bounds, 48);
        map.current = { maps, map: m };
        const road = await loadDrivingRoute(origin, destination).catch(() => null);
        if (!live || !road) return;
        new maps.Polyline({ map: m, path: road.path.map(toLatLng), strokeColor: colors.primary, strokeWeight: 6, strokeOpacity: 0.9 });
        setRoute(road);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [origin, destination]);

  // Move the traveller's dot.
  const position = trip?.position ?? null;
  useEffect(() => {
    const current = map.current;
    if (!current) return;
    if (!position) {
      current.dot?.setMap(null);
      current.dot = undefined;
      return;
    }
    const at = { lat: position.latitude, lng: position.longitude };
    if (!current.dot) {
      current.dot = new current.maps.Marker({
        map: current.map,
        position: at,
        title: t('follow.them'),
        zIndex: 10,
        icon: { path: current.maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#1A73E8', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 },
      });
    } else {
      current.dot.setPosition(at);
    }
    if (!current.map.getBounds()?.contains(at)) current.map.panTo(at);
  }, [position, route, t]);

  let status: { text: string; tone: 'info' | 'warning' | 'ok' };
  if (loaded.status === 'loading') status = { text: t('common.loading'), tone: 'info' };
  else if (loaded.status === 'missing') status = { text: t('follow.missing'), tone: 'warning' };
  else if (loaded.status === 'failed') status = { text: t('common.error'), tone: 'warning' };
  else if (loaded.trip.status === 'ended') status = { text: t('follow.ended'), tone: 'ok' };
  else if (loaded.trip.status === 'expired') status = { text: t('follow.expired'), tone: 'warning' };
  else if (!position) status = { text: t('follow.waiting'), tone: 'info' };
  else {
    const progress = route && !route.approximate ? routeProgress(route.path, route.durationS, position) : null;
    if (progress?.arrived || metresBetween(position, loaded.trip.destination) < ARRIVED_M) {
      status = { text: t('follow.arrived', { place: loaded.trip.destination.name }), tone: 'ok' };
    } else if (progress && !progress.offRoute) {
      status = { text: t('live.left', { time: formatDuration(progress.remainingS), distance: formatDistance(progress.remainingM) }), tone: 'info' };
    } else {
      status = { text: t('live.straight', { distance: formatDistance(metresBetween(position, loaded.trip.destination)) }), tone: 'info' };
    }
  }

  const updated = trip?.locatedAt ? Math.max(0, Math.round((now - Date.parse(trip.locatedAt)) / 60_000)) : null;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: embedded !== '1', title: t('follow.title') }} />
      <div ref={mapDiv} data-testid="follow-map" style={{ position: 'absolute', inset: 0 }} />
      <View style={styles.card} accessibilityLiveRegion="polite">
        {trip && <Text style={styles.to}>{t('follow.trip', { from: trip.origin.name, place: trip.destination.name })}</Text>}
        <Text style={[styles.status, status.tone === 'warning' && styles.warning, status.tone === 'ok' && styles.ok]}>{status.text}</Text>
        {trip?.status === 'live' && updated != null && (
          <Body muted>{updated < 1 ? t('follow.updatedNow') : t('follow.updated', { minutes: updated })}</Body>
        )}
        {trip?.status === 'live' && updated != null && updated >= 5 && <Text style={styles.warning}>{t('follow.stale')}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  card: {
    position: 'absolute',
    top: space.md,
    left: space.md,
    right: space.md,
    padding: space.md,
    gap: space.xs,
    borderRadius: 12,
    backgroundColor: colors.background,
    borderTopWidth: 4,
    borderTopColor: ghana.gold,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  to: { fontSize: font.small, color: colors.muted, fontWeight: '600' },
  status: { fontSize: font.heading, fontWeight: '700', color: colors.text },
  warning: { color: colors.warning, fontWeight: '600' },
  ok: { color: colors.ok },
});
