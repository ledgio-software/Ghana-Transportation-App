/**
 * GET /api/weather?lat=5.57&lon=-0.22: the forecast for one place, trimmed to the next 36 hours
 * (ADR 0013). Runs as a Vercel Function next to the web app. MET Norway is free for commercial
 * use but needs an identifying User-Agent, which a browser cannot send, hence this proxy.
 * Vercel's edge cache keeps each answer for 30 minutes, so popular stations cost one call.
 */

import type { ForecastPeriod } from '@gta/shared';

const MET_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/complete';
const USER_AGENT = 'GhanaTransport/0.1 (+https://ghana-transportation-app-passenger.vercel.app)';
const HOURS_AHEAD = 36;

interface MetPeriod {
  summary?: { symbol_code?: string };
  details?: { precipitation_amount?: number; probability_of_precipitation?: number };
}

interface MetForecast {
  properties?: {
    timeseries?: {
      time: string;
      data: { instant: { details?: { air_temperature?: number } }; next_1_hours?: MetPeriod; next_6_hours?: MetPeriod };
    }[];
  };
}


export function toPeriods(met: MetForecast, now: Date): ForecastPeriod[] {
  const from = now.getTime() - 3_600_000;
  const to = now.getTime() + HOURS_AHEAD * 3_600_000;
  const periods: ForecastPeriod[] = [];
  for (const step of met.properties?.timeseries ?? []) {
    const start = Date.parse(step.time);
    if (start < from || start > to) continue;
    const hours = step.data.next_1_hours ? 1 : 6;
    const next = step.data.next_1_hours ?? step.data.next_6_hours;
    const symbol = next?.summary?.symbol_code;
    const tempC = step.data.instant.details?.air_temperature;
    if (!symbol || tempC == null) continue;
    // Once the forecast steps are 6 hours apart, skip the hourly points in between.
    const last = periods[periods.length - 1];
    if (last && start < Date.parse(last.time) + last.hours * 3_600_000) continue;
    periods.push({
      time: step.time,
      hours,
      symbol,
      precipMm: next?.details?.precipitation_amount ?? 0,
      precipProbability: next?.details?.probability_of_precipitation ?? null,
      tempC,
    });
  }
  return periods;
}

function json(body: unknown, status: number, cache = false): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache ? 'public, max-age=600, s-maxage=1800, stale-while-revalidate=3600' : 'no-store',
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  // Only places in Ghana, so this is not an open proxy for MET Norway.
  if (!params.get('lat') || !params.get('lon') || !(lat >= 4.5 && lat <= 11.5 && lon >= -3.5 && lon <= 1.5)) {
    return json({ error: 'lat and lon must be a place in Ghana' }, 400);
  }
  const url = `${MET_URL}?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`;
  try {
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } });
    if (!res.ok) return json({ error: `forecast unavailable (${res.status})` }, 502);
    return json({ source: 'MET Norway', periods: toPeriods((await res.json()) as MetForecast, new Date()) }, 200, true);
  } catch {
    return json({ error: 'forecast unavailable' }, 502);
  }
}
