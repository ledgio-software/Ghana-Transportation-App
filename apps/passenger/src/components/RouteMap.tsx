import { googleMapsDirectionsUrl, googleMapsEmbedUrl, type StationRow } from '@gta/shared';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { loadStations } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { colors, font, space } from '../lib/theme';
import { MapFrame } from './MapFrame';
import { Body, Button, Title } from './ui';

// Maps Embed API key: public, restricted to our websites and to the Embed API only.
const EMBED_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_EMBED_KEY;

/**
 * P1-TRIP-01 and P1-TRIP-03: the route on a map, loaded only when asked for (data use),
 * plus Google Maps directions for the trip and for walking to the station.
 */
export function RouteMap({ fromId, toId }: { fromId?: string; toId?: string }) {
  const { t } = useI18n();
  const [stations, setStations] = useState<StationRow[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    loadStations()
      .then((res) => setStations(res.data))
      .catch(() => setStations([]));
  }, []);

  const origin = stations?.find((station) => station.id === fromId);
  const destination = stations?.find((station) => station.id === toId);
  if (!origin || !destination) return null;

  return (
    <View style={styles.section}>
      <Title>{t('map.title')}</Title>
      {EMBED_KEY &&
        (open ? (
          <>
            <MapFrame
              src={googleMapsEmbedUrl(EMBED_KEY, origin, destination, 'driving')}
              title={t('map.mapOf', { from: origin.name, to: destination.name })}
            />
            <Button label={t('map.hide')} variant="secondary" onPress={() => setOpen(false)} />
          </>
        ) : (
          <>
            <Body muted>{t('map.dataNote')}</Body>
            <Button label={t('map.show')} variant="secondary" onPress={() => setOpen(true)} />
          </>
        ))}
      <MapLink label={t('map.open')} url={googleMapsDirectionsUrl(destination, 'driving', origin)} />
      <MapLink label={t('map.walk', { station: origin.name })} url={googleMapsDirectionsUrl(origin, 'walking')} />
    </View>
  );
}

function MapLink({ label, url }: { label: string; url: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url)} style={styles.link}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm, marginTop: space.md },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { fontSize: font.body, color: colors.primary, textDecorationLine: 'underline' },
});
