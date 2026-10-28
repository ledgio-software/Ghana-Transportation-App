import { type RainLevel, type StationRow, tripWeather } from '@gta/shared';
import { useEffect, useState } from 'react';
import { searchFares } from './api';
import type { SavedTrip } from './saved';
import { loadForecast } from './weather';

export interface TripSummary {
  /** Cheapest fare (official, else what people paid); null when there is none. */
  pricePesewas: number | null;
  /** Rain on the trip if it started now; null when there is no forecast (offline). */
  rain: RainLevel | null;
  /** The station that may flood in the heavy rain, if any. */
  floodPlace: string | null;
}

/** A saved trip's cheapest fare and rain outlook, for its card on the home screen. */
export function useTripSummary(trip: SavedTrip, stations: StationRow[] | null): TripSummary | null {
  const [summary, setSummary] = useState<TripSummary | null>(null);
  const origin = stations?.find((s) => s.id === trip.originId);
  const destination = stations?.find((s) => s.id === trip.destinationId);

  useEffect(() => {
    let live = true;
    (async () => {
      const fares = await searchFares(trip.originId, trip.destinationId).then((r) => r.data).catch(() => []);
      const prices = fares.map((f) => f.official_pesewas ?? f.reported_median_pesewas).filter((p): p is number => p != null);
      const durationMin = fares.find((f) => f.typical_duration_min != null)?.typical_duration_min ?? 60;
      let rain: RainLevel | null = null;
      let floodPlace: string | null = null;
      if (origin && destination) {
        const now = Date.now();
        const [start, end] = await Promise.all([loadForecast(origin).catch(() => null), loadForecast(destination).catch(() => null)]);
        const weather = tripWeather([
          ...(start ? [{ role: 'start' as const, name: origin.name, floodProne: origin.flood_prone, at: new Date(now), forecast: start }] : []),
          ...(end ? [{ role: 'end' as const, name: destination.name, floodProne: destination.flood_prone, at: new Date(now + durationMin * 60_000), forecast: end }] : []),
        ]);
        if (weather) {
          rain = weather.places.some((p) => p.rain === 'heavy') ? 'heavy' : weather.umbrella ? 'rain' : 'none';
          floodPlace = weather.places.find((p) => p.floodWarning)?.name ?? null;
        }
      }
      if (live) setSummary({ pricePesewas: prices.length ? Math.min(...prices) : null, rain, floodPlace });
    })();
    return () => {
      live = false;
    };
  }, [trip.originId, trip.destinationId, origin, destination]);

  return summary;
}
