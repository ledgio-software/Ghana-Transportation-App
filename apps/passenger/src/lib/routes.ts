import { decodePolyline, type LatLng } from '@gta/shared';
import { API_BASE } from './apiBase';
import { readCache, writeCache } from './storage';

export interface DrivingRoute {
  path: LatLng[];
  durationS: number;
  distanceM: number;
  /** No road line could be loaded: a straight line between the stations stands in. */
  approximate?: boolean;
}

/** Roads between stations rarely change; keep each route on the phone for a week (data). */
const KEEP_MS = 7 * 24 * 3_600_000;

/**
 * The road route between two stations (P1-TRIP-04), through the web app's /api/route function,
 * which holds the private Routes key and shares each route through the edge cache.
 */
export async function loadDrivingRoute(from: LatLng, to: LatLng): Promise<DrivingRoute> {
  const cacheKey = `route:v2:${from.latitude},${from.longitude}:${to.latitude},${to.longitude}`;
  const cached = readCache<DrivingRoute>(cacheKey);
  if (cached && Date.now() - Date.parse(cached.savedAt) < KEEP_MS) return cached.value;

  const point = (p: LatLng) => `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`;
  const res = await fetch(`${API_BASE}/api/route?from=${point(from)}&to=${point(to)}`);
  if (!res.ok) throw new Error(`route ${res.status}`);
  const body = (await res.json()) as { encodedPolyline: string; durationS: number; distanceM: number };
  const result: DrivingRoute = {
    path: decodePolyline(body.encodedPolyline),
    durationS: body.durationS,
    distanceM: body.distanceM,
  };
  writeCache(cacheKey, result);
  return result;
}
