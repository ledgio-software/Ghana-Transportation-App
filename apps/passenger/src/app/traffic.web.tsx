/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  formatDistance,
  formatDuration,
  googleMapsDirectionsUrl,
  type LatLng,
  metresBetween,
  type StationRow,
  trafficSummary,
} from '@gta/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { StationPicker } from '../components/StationPicker';
import { Body, Button, Card, Loading, Notice, Screen, Title } from '../components/ui';
import { loadStations } from '../lib/api';
import { loadGoogleMaps } from '../lib/googleMaps';
import { type Home, readHome, saveHome } from '../lib/home';
import { useI18n } from '../lib/i18n';
import { loadTraffic, type Traffic } from '../lib/traffic';
import { colors, font, space } from '../lib/theme';

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
/** Ask again every 2 minutes while the page is open. */
const REFRESH_MS = 120_000;
/** Closer than this, you are home. */
const AT_HOME_M = 200;

type Located = { status: 'waiting' } | { status: 'denied' } | { status: 'unavailable' } | { status: 'ok'; position: LatLng };

function locate(): Promise<Located> {
  const geo = globalThis.navigator?.geolocation;
  if (!geo) return Promise.resolve({ status: 'unavailable' });
  return new Promise((resolve) =>
    geo.getCurrentPosition(
      (pos) => resolve({ status: 'ok', position: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } }),
      (err) => resolve({ status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    ),
  );
}

/**
 * P1-TRIP-05 "Traffic home": where I am, and how many minutes it takes to get home in today's
 * traffic compared with usual, on a map with Google's live traffic. Home is kept on the phone.
 */
export default function TrafficScreen() {
  const { t } = useI18n();
  const { embedded } = useLocalSearchParams<{ embedded?: string }>();
  const [home, setHome] = useState<Home | null>(() => readHome());
  const [choosing, setChoosing] = useState(false);
  const [located, setLocated] = useState<Located>({ status: 'waiting' });
  const [traffic, setTraffic] = useState<Traffic | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const homeName = home?.name ?? t('traffic.homeName');
  const position = located.status === 'ok' ? located.position : null;
  const atHome = home && position ? metresBetween(position, home) < AT_HOME_M : false;

  const refresh = useCallback(async () => {
    if (!home) return;
    setBusy(true);
    setFailed(false);
    const here = await locate();
    setLocated(here);
    if (here.status === 'ok' && metresBetween(here.position, home) >= AT_HOME_M) {
      try {
        setTraffic(await loadTraffic(here.position, home));
        setCheckedAt(Date.now());
      } catch {
        setFailed(true);
      }
    }
    setBusy(false);
  }, [home]);

  useEffect(() => {
    if (!home || choosing) return;
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [home, choosing, refresh]);

  function choose(next: Home) {
    saveHome(next);
    setHome(next);
    setTraffic(null);
    setChoosing(false);
  }

  if (!home || choosing) {
    return <ChooseHome onChoose={choose} onCancel={home ? () => setChoosing(false) : undefined} embedded={embedded === '1'} />;
  }

  const summary = traffic ? trafficSummary(traffic.durationS, traffic.usualS) : null;
  let status: { text: string; tone: 'info' | 'warning' | 'ok' };
  if (located.status === 'denied') status = { text: t('live.denied'), tone: 'warning' };
  else if (located.status === 'unavailable') status = { text: t('live.unavailable'), tone: 'warning' };
  else if (atHome) status = { text: t('traffic.atHome'), tone: 'ok' };
  else if (failed && !traffic) status = { text: t('traffic.error'), tone: 'warning' };
  else if (!traffic) status = { text: t('common.loading'), tone: 'info' };
  else status = { text: t('traffic.toHome', { time: formatDuration(traffic.durationS) }), tone: 'info' };
  const minutesAgo = checkedAt ? Math.max(0, Math.round((now - checkedAt) / 60_000)) : null;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: embedded !== '1', title: t('traffic.title') }} />
      <TrafficMap position={position} home={home} homeName={homeName} path={atHome ? null : (traffic?.path ?? null)} />
      <View style={styles.card} accessibilityLiveRegion="polite">
        <Text style={styles.to}>{homeName}</Text>
        <Text style={[styles.status, status.tone === 'warning' && styles.warning, status.tone === 'ok' && styles.ok]}>{status.text}</Text>
        {traffic && summary && !atHome && (
          <>
            <Text style={[styles.level, summary.level === 'moderate' && styles.moderate, summary.level === 'heavy' && styles.heavy]}>
              {summary.level === 'light' ? t('traffic.light') : t(`traffic.${summary.level}`, { delay: summary.delayMin })}
            </Text>
            <Body muted>{t('traffic.usual', { distance: formatDistance(traffic.distanceM), time: formatDuration(traffic.usualS) })}</Body>
          </>
        )}
        {traffic && failed && <Text style={styles.warning}>{t('traffic.error')}</Text>}
        {minutesAgo != null && !atHome && (
          <Body muted>{minutesAgo < 1 ? t('follow.updatedNow') : t('follow.updated', { minutes: minutesAgo })}</Body>
        )}
      </View>
      <View style={styles.actions}>
        <View style={styles.row}>
          <Pressable accessibilityRole="button" disabled={busy} style={[styles.action, styles.grow, busy && styles.busy]} onPress={() => void refresh()}>
            <Text style={styles.actionText}>{busy ? t('common.loading') : t('traffic.refresh')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={[styles.action, styles.grow, styles.secondary]} onPress={() => setChoosing(true)}>
            <Text style={[styles.actionText, styles.secondaryText]}>{t('traffic.change')}</Text>
          </Pressable>
        </View>
        {position && !atHome && (
          <Pressable
            accessibilityRole="button"
            style={[styles.action, styles.secondary]}
            onPress={() => Linking.openURL(googleMapsDirectionsUrl(home, 'driving', position))}
          >
            <Text style={[styles.actionText, styles.secondaryText]}>{t('traffic.directions')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Home is a station or "where I am now"; kept on the phone. */
function ChooseHome({ onChoose, onCancel, embedded }: { onChoose: (home: Home) => void; onCancel?: () => void; embedded: boolean }) {
  const { t } = useI18n();
  const [stations, setStations] = useState<StationRow[] | null>(null);
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    loadStations()
      .then((res) => setStations(res.data))
      .catch(() => setStations([]));
  }, []);

  async function useHere() {
    setLocating(true);
    setProblem(null);
    const here = await locate();
    setLocating(false);
    if (here.status === 'ok') onChoose({ name: null, ...here.position });
    else setProblem(here.status === 'denied' ? t('live.denied') : t('live.unavailable'));
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: !embedded, title: t('traffic.title') }} />
      <Card accent>
        <Title>{t('traffic.setHome')}</Title>
        <Body>{t('traffic.why')}</Body>
        <Button label={t('traffic.useHere')} onPress={useHere} loading={locating} />
        {problem && <Notice tone="warning">{problem}</Notice>}
        {!stations && <Loading label={t('common.loading')} />}
        {stations && stations.length > 0 && (
          <StationPicker
            label={t('traffic.pickStation')}
            stations={stations}
            value={null}
            onChange={(s) => onChoose({ name: s.name, latitude: s.latitude, longitude: s.longitude })}
          />
        )}
        <Body muted>{t('traffic.setHomeWhy')}</Body>
        {onCancel && <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} />}
      </Card>
    </Screen>
  );
}

/** Google's map with its live traffic layer, the road home, home and the blue "you" dot. */
function TrafficMap({ position, home, homeName, path }: { position: LatLng | null; home: Home; homeName: string; path: LatLng[] | null }) {
  const { t } = useI18n();
  const div = useRef<HTMLDivElement | null>(null);
  const map = useRef<{ maps: any; map: any; home: any; dot?: any; line?: any; fitted?: boolean } | null>(null);
  const [ready, setReady] = useState(false);
  const toLatLng = (p: LatLng) => ({ lat: p.latitude, lng: p.longitude });

  useEffect(() => {
    if (!KEY || !div.current) return;
    let live = true;
    loadGoogleMaps(KEY)
      .then((maps) => {
        if (!live || !div.current) return;
        const m = new maps.Map(div.current, {
          center: toLatLng(home),
          zoom: 13,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
        });
        new maps.TrafficLayer().setMap(m);
        map.current = { maps, map: m, home: new maps.Marker({ map: m, position: toLatLng(home), title: homeName, label: 'H' }) };
        setReady(true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // The map is made once; home changes move the marker below.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const current = map.current;
    if (!ready || !current) return;
    current.home.setPosition(toLatLng(home));
    current.home.setTitle?.(homeName);
    if (position) {
      const at = toLatLng(position);
      if (!current.dot) {
        current.dot = new current.maps.Marker({
          map: current.map,
          position: at,
          title: t('live.you'),
          zIndex: 10,
          icon: { path: current.maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#1A73E8', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 },
        });
      } else {
        current.dot.setPosition(at);
      }
    }
    if (path) {
      if (!current.line) {
        current.line = new current.maps.Polyline({ map: current.map, path: path.map(toLatLng), strokeColor: colors.primary, strokeWeight: 5, strokeOpacity: 0.6 });
      } else {
        current.line.setPath(path.map(toLatLng));
      }
    } else if (current.line) {
      current.line.setMap(null);
      current.line = undefined;
    }
    // Show you and home together once; after that, leave the map where the user put it.
    if (position && !current.fitted) {
      const bounds = new current.maps.LatLngBounds();
      bounds.extend(toLatLng(position));
      bounds.extend(toLatLng(home));
      path?.forEach((p) => bounds.extend(toLatLng(p)));
      current.map.fitBounds(bounds, 64);
      current.fitted = true;
    }
  }, [ready, position, home, homeName, path, t]);

  return <div ref={div} data-testid="traffic-map" style={{ position: 'absolute', inset: 0 }} />;
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
  level: { fontSize: font.body, fontWeight: '700', color: colors.ok },
  moderate: { color: colors.warning },
  heavy: { color: colors.danger },
  warning: { color: colors.warning },
  ok: { color: colors.ok },
  actions: { position: 'absolute', bottom: space.lg, left: space.md, right: space.md, gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  grow: { flex: 1 },
  action: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  busy: { opacity: 0.7 },
  actionText: { fontSize: font.body, fontWeight: '700', color: colors.primaryText },
  secondary: { backgroundColor: colors.background, borderWidth: 2, borderColor: colors.primary },
  secondaryText: { color: colors.primary },
});
