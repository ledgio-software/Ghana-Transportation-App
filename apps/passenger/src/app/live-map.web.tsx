/* eslint-disable @typescript-eslint/no-explicit-any */
import { formatDistance, formatDuration, googleMapsDirectionsUrl, type LatLng, routeProgress, type StationRow } from '@gta/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SharePanel } from '../components/SharePanel';
import { Body } from '../components/ui';
import { loadStations } from '../lib/api';
import { loadGoogleMaps } from '../lib/googleMaps';
import { useI18n } from '../lib/i18n';
import { type DrivingRoute, loadDrivingRoute } from '../lib/routes';
import { currentShare, SHARE_EVERY_MS, sendPosition, shareLink, startShare, stopShare, type TripShare } from '../lib/tripShare';
import { colors, font, ghana, space } from '../lib/theme';

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_EMBED_KEY;

type Located = { status: 'waiting' } | { status: 'denied' } | { status: 'unavailable' } | { status: 'ok'; position: LatLng };

/**
 * P1-TRIP-04: live map like the ride apps. The route between the stations, a blue dot that
 * follows the traveller, and the time and distance left. The Android app shows this same page
 * in a WebView (live-map.tsx), so there is one implementation.
 */
export default function LiveMapScreen() {
  const { t } = useI18n();
  const { from, to, embedded } = useLocalSearchParams<{ from: string; to: string; embedded?: string }>();
  const [stations, setStations] = useState<StationRow[] | null>(null);
  const [route, setRoute] = useState<DrivingRoute | null>(null);
  const [failed, setFailed] = useState(false);
  const [located, setLocated] = useState<Located>({ status: 'waiting' });
  const [following, setFollowing] = useState(true);
  const mapDiv = useRef<HTMLDivElement | null>(null);
  const map = useRef<{ maps: any; map: any; dot?: any } | null>(null);
  // P1-SAFE-05: share the trip with family.
  const [share, setShare] = useState<TripShare | null>(() => (from && to ? currentShare(from, to) : null));
  const [panel, setPanel] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const lastSent = useRef(0);

  useEffect(() => {
    loadStations()
      .then((res) => setStations(res.data))
      .catch(() => setFailed(true));
  }, []);
  const origin = useMemo(() => stations?.find((s) => s.id === from), [stations, from]);
  const destination = useMemo(() => stations?.find((s) => s.id === to), [stations, to]);

  // The map, then the road line. Without a road line (Routes unavailable) the map, the dot and
  // the straight-line distance still work.
  useEffect(() => {
    if (!KEY || !origin || !destination || !mapDiv.current) return;
    let live = true;
    const toLatLng = (p: LatLng) => ({ lat: p.latitude, lng: p.longitude });
    const routePromise = loadDrivingRoute(origin, destination).catch(
      (): DrivingRoute => ({ path: [origin, destination], durationS: 0, distanceM: 0, approximate: true }),
    );
    loadGoogleMaps(KEY)
      .then(async (maps) => {
        if (!live || !mapDiv.current) return;
        const m = new maps.Map(mapDiv.current, {
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
        });
        new maps.Marker({ map: m, position: toLatLng(origin), title: origin.name, label: 'A' });
        new maps.Marker({ map: m, position: toLatLng(destination), title: destination.name, label: 'B' });
        // Moving the map by hand stops following until "Follow me".
        m.addListener('dragstart', () => setFollowing(false));
        map.current = { maps, map: m };
        const loaded = await routePromise;
        if (!live) return;
        const bounds = new maps.LatLngBounds();
        loaded.path.forEach((p) => bounds.extend(toLatLng(p)));
        m.fitBounds(bounds, 48);
        if (!loaded.approximate) {
          new maps.Polyline({ map: m, path: loaded.path.map(toLatLng), strokeColor: colors.primary, strokeWeight: 6, strokeOpacity: 0.9 });
        }
        setRoute(loaded);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [origin, destination]);

  // Where the traveller is, as they move.
  useEffect(() => {
    const geo = globalThis.navigator?.geolocation;
    if (!geo) {
      setLocated({ status: 'unavailable' });
      return;
    }
    const id = geo.watchPosition(
      (pos) => setLocated({ status: 'ok', position: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } }),
      (err) => setLocated({ status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 },
    );
    return () => geo.clearWatch(id);
  }, []);

  const progress = useMemo(
    () => (route && located.status === 'ok' ? routeProgress(route.path, route.durationS, located.position) : null),
    [route, located],
  );

  // Move the blue dot (snapped to the road while on it) and keep it in view.
  useEffect(() => {
    const current = map.current;
    if (!current || !progress || located.status !== 'ok') return;
    // Snap to the road only when there is a real road line and the traveller is on it.
    const shown = progress.offRoute || route?.approximate ? located.position : progress.snapped;
    const position = { lat: shown.latitude, lng: shown.longitude };
    if (!current.dot) {
      current.dot = new current.maps.Marker({
        map: current.map,
        position,
        title: t('live.you'),
        zIndex: 10,
        icon: {
          path: current.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: '#1A73E8',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 3,
        },
      });
    } else {
      current.dot.setPosition(position);
    }
    if (following) current.map.panTo(position);
  }, [progress, located, following, route, t]);

  // While sharing, send the position every 20 s; stop by itself on arrival.
  useEffect(() => {
    if (!share || located.status !== 'ok') return;
    if (progress?.arrived) {
      setShare(null);
      void stopShare(share).catch(() => undefined);
      return;
    }
    if (Date.now() - lastSent.current < SHARE_EVERY_MS) return;
    lastSent.current = Date.now();
    sendPosition(share, located.position)
      .then((live) => live || setShare(null))
      .catch(() => undefined);
  }, [share, located, progress]);

  async function onShare() {
    if (!from || !to) return;
    setShareFailed(false);
    try {
      if (!share) {
        const started = await startShare(from, to);
        lastSent.current = 0;
        setShare(started);
      }
      setPanel(true);
    } catch {
      setShareFailed(true);
    }
  }

  const destinationName = destination?.name ?? '';
  let status: { text: string; tone: 'info' | 'warning' | 'ok' };
  if (failed || !KEY) status = { text: t('live.error'), tone: 'warning' };
  else if (!route) status = { text: t('common.loading'), tone: 'info' };
  else if (located.status === 'denied') status = { text: t('live.denied'), tone: 'warning' };
  else if (located.status === 'unavailable') status = { text: t('live.unavailable'), tone: 'warning' };
  else if (!progress) status = { text: t('live.waiting'), tone: 'info' };
  else if (progress.arrived) status = { text: t('live.arrived', { place: destinationName }), tone: 'ok' };
  else if (route.approximate) status = { text: t('live.straight', { distance: formatDistance(progress.remainingM) }), tone: 'info' };
  else if (progress.offRoute) status = { text: t('live.offRoute', { distance: formatDistance(progress.offRouteM) }), tone: 'warning' };
  else status = { text: t('live.left', { time: formatDuration(progress.remainingS), distance: formatDistance(progress.remainingM) }), tone: 'info' };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: embedded !== '1', title: t('live.title') }} />
      <div ref={mapDiv} data-testid="live-map" style={{ position: 'absolute', inset: 0 }} />
      <View style={styles.card} accessibilityLiveRegion="polite">
        {destination && <Text style={styles.to}>{t('live.to', { place: destinationName })}</Text>}
        <Text style={[styles.status, status.tone === 'warning' && styles.warning, status.tone === 'ok' && styles.ok]}>{status.text}</Text>
        {route && !progress?.arrived && <Body muted>{t(route.approximate ? 'live.noRoad' : 'live.estimate')}</Body>}
        {share && <Text style={styles.sharing}>{t('share.on')}</Text>}
        {shareFailed && <Text style={styles.warning}>{t('share.error')}</Text>}
      </View>
      <View style={styles.actions}>
        {!following && located.status === 'ok' && (
          <Pressable accessibilityRole="button" style={styles.action} onPress={() => setFollowing(true)}>
            <Text style={styles.actionText}>{t('live.recenter')}</Text>
          </Pressable>
        )}
        {destination && !share && (
          <Pressable accessibilityRole="button" style={styles.action} onPress={onShare}>
            <Text style={styles.actionText}>{t('share.button')}</Text>
          </Pressable>
        )}
        {share && (
          <View style={styles.row}>
            <Pressable accessibilityRole="button" style={[styles.action, styles.grow]} onPress={() => setPanel(true)}>
              <Text style={styles.actionText}>{t('share.again')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.action, styles.grow, styles.secondary]}
              onPress={() => {
                setShare(null);
                setPanel(false);
                void stopShare(share).catch(() => undefined);
              }}
            >
              <Text style={[styles.actionText, styles.secondaryText]}>{t('share.stop')}</Text>
            </Pressable>
          </View>
        )}
        {destination && (
          <Pressable
            accessibilityRole="button"
            style={[styles.action, styles.secondary]}
            onPress={() => Linking.openURL(googleMapsDirectionsUrl(destination, 'driving', origin))}
          >
            <Text style={[styles.actionText, styles.secondaryText]}>{t('map.open')}</Text>
          </Pressable>
        )}
      </View>
      {panel && share && (
        <View style={styles.sheet}>
          <SharePanel
            link={shareLink(share.id)}
            message={t('share.message', { place: destinationName, link: shareLink(share.id) })}
            onClose={() => setPanel(false)}
          />
        </View>
      )}
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
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  to: { fontSize: font.small, color: colors.muted, fontWeight: '600' },
  status: { fontSize: font.heading, fontWeight: '700', color: colors.text },
  warning: { color: colors.warning },
  ok: { color: colors.ok },
  actions: { position: 'absolute', bottom: space.lg, left: space.md, right: space.md, gap: space.sm },
  action: {
    minHeight: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  actionText: { fontSize: font.body, fontWeight: '700', color: colors.primaryText },
  secondary: { backgroundColor: colors.background, borderWidth: 2, borderColor: colors.primary },
  secondaryText: { color: colors.primary },
  sharing: { fontSize: font.small, fontWeight: '700', color: ghana.green },
  row: { flexDirection: 'row', gap: space.sm },
  grow: { flex: 1 },
  sheet: { position: 'absolute', bottom: space.lg, left: space.md, right: space.md },
});
