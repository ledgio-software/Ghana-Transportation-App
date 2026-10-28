/**
 * GET /api/route?from=5.5717,-0.2166&to=5.534,-0.417: the road route between two points in
 * Ghana from Google's Routes API, for the live map (P1-TRIP-04). Runs as a Vercel Function so the
 * Routes key stays private (the API does not accept the website-restricted browser key) and so
 * Vercel's edge cache shares each route with everyone for a week: one Google call per route.
 * Needs the GOOGLE_ROUTES_KEY environment variable (a key restricted to the Routes API only).
 */

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const WEEK_S = 7 * 24 * 3600;

export interface RouteAnswer {
  encodedPolyline: string;
  durationS: number;
  distanceM: number;
}

/** "5.5717,-0.2166" inside Ghana, rounded to about 10 m so nearby requests share the cache. */
export function parsePoint(value: string | null): { latitude: number; longitude: number } | null {
  const parts = (value ?? '').split(',').map(Number);
  if (parts.length !== 2) return null;
  const [lat, lng] = parts as [number, number];
  if (!(lat >= 4.5 && lat <= 11.5 && lng >= -3.5 && lng <= 1.5)) return null;
  return { latitude: Math.round(lat * 1e4) / 1e4, longitude: Math.round(lng * 1e4) / 1e4 };
}

function json(body: unknown, status: number, cacheS = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheS ? `public, max-age=86400, s-maxage=${cacheS}, stale-while-revalidate=${cacheS}` : 'no-store',
    },
  });
}

/** The machine-readable reason from a Google error body; never contains the key. */
async function googleReason(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: { status?: string; details?: { reason?: string }[] } };
    return body.error?.details?.find((d) => d.reason)?.reason ?? body.error?.status;
  } catch {
    return undefined;
  }
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const from = parsePoint(params.get('from'));
  const to = parsePoint(params.get('to'));
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
        'x-goog-fieldmask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
      },
      // No live traffic: the cheaper "Essentials" tier, and the answer can be cached for a week.
      body: JSON.stringify({ origin: point(from), destination: point(to), travelMode: 'DRIVE' }),
    });
    if (!res.ok) {
      // Google's short reason (e.g. API_KEY_HTTP_REFERRER_BLOCKED) says which setting to fix.
      const reason = await googleReason(res);
      return json({ error: `routes unavailable (${res.status})`, ...(reason && { reason }) }, 502);
    }
    const body = (await res.json()) as {
      routes?: { duration?: string; distanceMeters?: number; polyline?: { encodedPolyline?: string } }[];
    };
    const route = body.routes?.[0];
    if (!route?.polyline?.encodedPolyline) return json({ error: 'no route' }, 404);
    const answer: RouteAnswer = {
      encodedPolyline: route.polyline.encodedPolyline,
      durationS: Number.parseInt(route.duration ?? '0', 10),
      distanceM: route.distanceMeters ?? 0,
    };
    return json(answer, 200, WEEK_S);
  } catch {
    return json({ error: 'routes unavailable' }, 502);
  }
}
