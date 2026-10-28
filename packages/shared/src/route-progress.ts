/**
 * Live trip map (P1-TRIP-04): where the traveller is along the route line, how far and how
 * long is left, whether they have left the route and whether they have arrived.
 */
import type { LatLng } from './maps';

/** Decodes a Google encoded polyline (as returned by the Routes API) into points. */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of ['lat', 'lng'] as const) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 'lat') lat += delta;
      else lng += delta;
    }
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

const EARTH_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function metresBetween(a: LatLng, b: LatLng): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Closest point on segment a-b to p, in a local flat projection (fine for road segments). */
function project(p: LatLng, a: LatLng, b: LatLng): { point: LatLng; t: number } {
  const k = Math.cos(rad(p.latitude));
  const ax = a.longitude * k;
  const bx = b.longitude * k;
  const px = p.longitude * k;
  const dx = bx - ax;
  const dy = b.latitude - a.latitude;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (p.latitude - a.latitude) * dy) / len2));
  return { point: { latitude: a.latitude + t * dy, longitude: a.longitude + t * (b.longitude - a.longitude) }, t };
}

export interface RouteProgress {
  /** Metres from the start of the route to the traveller's nearest point on it. */
  travelledM: number;
  remainingM: number;
  /** Seconds left, scaled from the route's total duration. */
  remainingS: number;
  /** How far the traveller is from the route line. */
  offRouteM: number;
  offRoute: boolean;
  arrived: boolean;
  /** Nearest point on the route, for snapping the dot when GPS is a little off. */
  snapped: LatLng;
}

/** Further than this from the line counts as off the route (GPS in Accra is often 20-50 m out). */
export const OFF_ROUTE_M = 150;
/** Within this of the destination counts as arrived. */
export const ARRIVED_M = 120;

export function routeProgress(path: readonly LatLng[], totalDurationS: number, position: LatLng): RouteProgress {
  if (path.length === 0) throw new Error('empty route');
  let cumulative = 0;
  let best = { distance: Infinity, travelled: 0, point: path[0]! };
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const segment = metresBetween(a, b);
    const { point, t } = project(position, a, b);
    const distance = metresBetween(position, point);
    if (distance < best.distance) best = { distance, travelled: cumulative + t * segment, point };
    cumulative += segment;
  }
  if (path.length === 1) best = { distance: metresBetween(position, path[0]!), travelled: 0, point: path[0]! };
  const total = cumulative;
  const remainingM = Math.max(0, total - best.travelled);
  const destination = path[path.length - 1]!;
  return {
    travelledM: best.travelled,
    remainingM,
    remainingS: total > 0 ? (remainingM / total) * totalDurationS : 0,
    offRouteM: best.distance,
    offRoute: best.distance > OFF_ROUTE_M,
    arrived: metresBetween(position, destination) <= ARRIVED_M,
    snapped: best.point,
  };
}

/** "12.4 km" / "800 m". */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.max(0, Math.round(metres / 50) * 50)} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}

/** "18 min" / "2 h 5 min". Rounds up so the app never promises too early an arrival. */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
