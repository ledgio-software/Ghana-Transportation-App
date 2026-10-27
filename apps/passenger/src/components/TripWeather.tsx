import {
  distanceKm,
  type LatLng,
  midpoint,
  type PlaceWeather,
  type StationRow,
  type TripPoint,
  type TripWeather as Weather,
  tripWeather,
} from '@gta/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatTime, useI18n } from '../lib/i18n';
import { loadForecast } from '../lib/weather';
import { space } from '../lib/theme';
import { Body, Notice, Title } from './ui';

type Stop = Omit<TripPoint, 'forecast'> & { place: LatLng };

/** Trips longer than this also get the weather half way. */
const ALONG_THE_WAY_KM = 50;

/**
 * P1-WX-01 and P1-WX-02: weather at the start now, half way on long trips and at the destination
 * at arrival, with "take an umbrella" and heavy rain / flood warnings. Hidden when there is no forecast.
 */
export function TripWeather({
  origin,
  destination,
  durationMin,
}: {
  origin: StationRow;
  destination: StationRow;
  durationMin: number;
}) {
  const { t, lang } = useI18n();
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    let live = true;
    const now = Date.now();
    const stops: Stop[] = [
      { role: 'start', name: origin.name, floodProne: origin.flood_prone, at: new Date(now), place: origin },
    ];
    if (distanceKm(origin, destination) > ALONG_THE_WAY_KM) {
      const at = new Date(now + (durationMin / 2) * 60_000);
      stops.push({ role: 'along', name: '', floodProne: false, at, place: midpoint(origin, destination) });
    }
    stops.push({
      role: 'end',
      name: destination.name,
      floodProne: destination.flood_prone,
      at: new Date(now + durationMin * 60_000),
      place: destination,
    });
    Promise.all(
      stops.map(({ place, ...stop }) =>
        loadForecast(place)
          .then((forecast): TripPoint => ({ ...stop, forecast }))
          .catch(() => null),
      ),
    ).then((points) => {
      if (live) setWeather(tripWeather(points.filter((p): p is TripPoint => p !== null)));
    });
    return () => {
      live = false;
    };
  }, [origin, destination, durationMin]);

  if (!weather) return null;

  const placeName = (p: PlaceWeather) => (p.role === 'along' ? t('wx.onTheWay') : p.name);
  const label = (p: PlaceWeather) =>
    p.role === 'start'
      ? t('wx.start', { place: p.name })
      : p.role === 'along'
        ? t('wx.along', { time: formatTime(p.at, lang) })
        : t('wx.end', { place: p.name, time: formatTime(p.at, lang) });
  const heavy = weather.places.filter((p) => p.rain === 'heavy');

  return (
    <View style={styles.section}>
      <Title>{t('wx.title')}</Title>
      {heavy.map((p) => (
        <Notice key={p.role} tone="danger">
          {t('wx.heavy', { place: placeName(p), time: formatTime(p.rainAt ?? p.at, lang) })}
          {'\n'}
          {p.floodWarning ? t('wx.flood', { place: p.name }) : t('wx.floodSafety')}
        </Notice>
      ))}
      <Notice tone={weather.umbrella ? 'warning' : 'info'}>{weather.umbrella ? t('wx.umbrella') : t('wx.dry')}</Notice>
      {weather.places.map((p) => (
        <Body key={p.role}>
          {label(p)}: {t('wx.conditions', { temp: String(p.tempC), sky: t(`wx.sky.${p.sky}`) })}
          {p.rain === 'rain' && p.rainAt ? ` · ${t('wx.rainAround', { time: formatTime(p.rainAt, lang) })}` : ''}
        </Body>
      ))}
      <Body muted>{t('wx.source')}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm, marginBottom: space.md },
});
