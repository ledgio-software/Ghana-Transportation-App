import { decodePolyline, type LatLng } from '@gta/shared';
import { readCache, writeCache } from './storage';

export interface DrivingRoute {
  path: LatLng[];
  durationS: number;
  distanceM: number;
}

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
/** Roads between stations rarely change; keep each route on the phone for a week (cost, data). */
const KEEP_MS = 7 * 24 * 3_600_000;

/**
 * The road route between two stations from Google's Routes API (P1-TRIP-04), without live
 * traffic (the cheaper "Essentials" tier). The key is the public, website-restricted one.
 */
export async function loadDrivingRoute(key: string, from: LatLng, to: LatLng): Promise<DrivingRoute> {
  const cacheKey = `route:v1:${from.latitude},${from.longitude}:${to.latitude},${to.longitude}`;
  const cached = readCache<DrivingRoute>(cacheKey);
  if (cached && Date.now() - Date.parse(cached.savedAt) < KEEP_MS) return cached.value;

  const point = (p: LatLng) => ({ location: { latLng: { latitude: p.latitude, longitude: p.longitude } } });
  const res = await fetch(ROUTES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': key,
      'x-goog-fieldmask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify({ origin: point(from), destination: point(to), travelMode: 'DRIVE' }),
  });
  if (!res.ok) throw new Error(`routes ${res.status}`);
  const body = (await res.json()) as {
    routes?: { duration?: string; distanceMeters?: number; polyline?: { encodedPolyline?: string } }[];
  };
  const route = body.routes?.[0];
  if (!route?.polyline?.encodedPolyline) throw new Error('no route');
  const result: DrivingRoute = {
    path: decodePolyline(route.polyline.encodedPolyline),
    durationS: Number.parseInt(route.duration ?? '0', 10),
    distanceM: route.distanceMeters ?? 0,
  };
  writeCache(cacheKey, result);
  return result;
}
