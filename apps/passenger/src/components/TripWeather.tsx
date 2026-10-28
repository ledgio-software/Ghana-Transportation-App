import {
  dailyOutlook,
  distanceKm,
  type ForecastPeriod,
  hourlyOutlook,
  type LatLng,
  midpoint,
  type PlaceWeather,
  type StationRow,
  type TripPoint,
  type TripWeather as Weather,
  tripWeather,
} from '@gta/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatDay, formatTime, useI18n } from '../lib/i18n';
import { loadForecast } from '../lib/weather';
import { colors, font, radius, space } from '../lib/theme';
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
  // The destination's forecast, for "next hours" and "next days" there (P1-WX-03).
  const [ahead, setAhead] = useState<ForecastPeriod[] | null>(null);

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
      if (!live) return;
      setWeather(tripWeather(points.filter((p): p is TripPoint => p !== null)));
      setAhead(points[points.length - 1]?.forecast ?? null);
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
      {ahead && <Forecast periods={ahead} place={destination.name} />}
      <Body muted>{t('wx.source')}</Body>
    </View>
  );
}

/** Next hours and next days at the destination, so people can plan a later trip too. */
function Forecast({ periods, place }: { periods: ForecastPeriod[]; place: string }) {
  const { t, lang } = useI18n();
  const now = new Date();
  const hours = hourlyOutlook(periods, now);
  const days = dailyOutlook(periods, now);
  if (hours.length === 0 && days.length === 0) return null;
  return (
    <View style={styles.forecast}>
      <Text style={styles.heading}>{t('wx.forecast', { place })}</Text>
      <View style={styles.hours}>
        {hours.map((h) => (
          <View key={h.at.toISOString()} style={[styles.hour, h.rain !== 'none' && styles.wet]}>
            <Text style={styles.hourTime}>{formatTime(h.at, lang)}</Text>
            <Text style={styles.hourTemp}>{h.tempC}°C</Text>
            <Text style={styles.hourSky}>{t(`wx.sky.${h.sky}`)}</Text>
          </View>
        ))}
      </View>
      {days.map((d) => (
        <Body key={d.date}>
          {formatDay(d.date, lang)}: {t('wx.dayRange', { min: String(d.minC), max: String(d.maxC), sky: t(`wx.sky.${d.sky}`) })}
          {d.rain !== 'none' && d.sky !== 'rain' && d.sky !== 'heavyRain' && d.sky !== 'thunder' ? `, ${t('wx.sky.rain')}` : ''}
        </Body>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm, marginBottom: space.md },
  forecast: { gap: space.sm, marginTop: space.xs },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.text },
  hours: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  hour: {
    flexGrow: 1,
    minWidth: 72,
    padding: space.sm,
    gap: 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  wet: { borderColor: colors.warning },
  hourTime: { fontSize: font.small, color: colors.muted, fontWeight: '600' },
  hourTemp: { fontSize: font.heading, fontWeight: '700', color: colors.text },
  hourSky: { fontSize: font.small, color: colors.text },
});
