import { decodePolyline, type LatLng } from '@gta/shared';
import { API_BASE } from './apiBase';

export interface Traffic {
  path: LatLng[];
  /** With today's traffic. */
  durationS: number;
  /** Without traffic. */
  usualS: number;
  distanceM: number;
}

/** The drive now, in live traffic, through the web app's /api/traffic function (P1-TRIP-05). */
export async function loadTraffic(from: LatLng, to: LatLng): Promise<Traffic> {
  const point = (p: LatLng) => `${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}`;
  const res = await fetch(`${API_BASE}/api/traffic?from=${point(from)}&to=${point(to)}`);
  if (!res.ok) throw new Error(`traffic ${res.status}`);
  const body = (await res.json()) as { encodedPolyline: string; durationS: number; usualS: number; distanceM: number };
  return { path: decodePolyline(body.encodedPolyline), durationS: body.durationS, usualS: body.usualS, distanceM: body.distanceM };
}
