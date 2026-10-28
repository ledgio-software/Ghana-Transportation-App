import type { ForecastPeriod } from '@gta/shared';
import { API_BASE } from './apiBase';

/** Forecast for one place. Rounded to about 1 km so nearby searches share the cached answer. */
export async function loadForecast(place: { latitude: number; longitude: number }): Promise<ForecastPeriod[]> {
  const res = await fetch(`${API_BASE}/api/weather?lat=${place.latitude.toFixed(2)}&lon=${place.longitude.toFixed(2)}`);
  if (!res.ok) throw new Error(`weather ${res.status}`);
  const body = (await res.json()) as { periods: ForecastPeriod[] };
  return body.periods;
}
