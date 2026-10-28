/**
 * GET /api/traffic?from=5.5717,-0.2166&to=5.534,-0.417: how long the drive takes now, in live
 * traffic, and how long it usually takes (P1-TRIP-05 "Traffic home"). Google's Routes API with
 * TRAFFIC_AWARE routing (the "Pro" tier), through the private GOOGLE_ROUTES_KEY like /api/route.
 * Points are rounded to about 100 m: enough for a drive time, less precise about where people
 * are, and nearby requests share the 5-minute edge cache. Nothing is stored.
 */
import { googleReason, json } from './route';

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const FIVE_MIN_S = 300;

export interface TrafficAnswer {
  encodedPolyline: string;
  /** With today's traffic. */
  durationS: number;
  /** The same drive without traffic. */
  usualS: number;
  distanceM: number;
}

/** "5.5717,-0.2166" inside Ghana, rounded to about 100 m. */
export function parseRoughPoint(value: string | null): { latitude: number; longitude: number } | null {
  const parts = (value ?? '').split(',').map(Number);
  if (parts.length !== 2) return null;
  const [lat, lng] = parts as [number, number];
  if (!(lat >= 4.5 && lat <= 11.5 && lng >= -3.5 && lng <= 1.5)) return null;
  return { latitude: Math.round(lat * 1e3) / 1e3, longitude: Math.round(lng * 1e3) / 1e3 };
}

const seconds = (d: string | undefined) => Number.parseInt(d ?? '0', 10);

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const from = parseRoughPoint(params.get('from'));
  const to = parseRoughPoint(params.get('to'));
  // Only places in Ghana, so the private key cannot be used as an open proxy.
  if (!from || !to) return json({ error: 'from and to must be places in Ghana' }, 400);
  const key = process.env.GOOGLE_ROUTES_KEY;
  if (!key) return json({ error: 'routes not configured' }, 503);

  const point = (p: { latitude: number; longitude: number }) => ({ location: { latLng: p } });
  try {
    const res = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': key,
        'x-goog-fieldmask': 'routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify({ origin: point(from), destination: point(to), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE' }),
    });
    if (!res.ok) {
      const reason = await googleReason(res);
      return json({ error: `routes unavailable (${res.status})`, ...(reason && { reason }) }, 502);
    }
    const body = (await res.json()) as {
      routes?: { duration?: string; staticDuration?: string; distanceMeters?: number; polyline?: { encodedPolyline?: string } }[];
    };
    const route = body.routes?.[0];
    if (!route?.polyline?.encodedPolyline) return json({ error: 'no route' }, 404);
    const answer: TrafficAnswer = {
      encodedPolyline: route.polyline.encodedPolyline,
      durationS: seconds(route.duration),
      usualS: seconds(route.staticDuration ?? route.duration),
      distanceM: route.distanceMeters ?? 0,
    };
    // Traffic changes quickly: share for 5 minutes, and the phone asks again after 2.
    return json(answer, 200, FIVE_MIN_S, 120);
  } catch {
    return json({ error: 'routes unavailable' }, 502);
  }
}
