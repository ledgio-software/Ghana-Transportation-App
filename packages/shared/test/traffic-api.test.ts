import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, parseRoughPoint } from '../../../apps/passenger/api/traffic';

const url = (q: string) => new Request(`https://x/api/traffic?${q}`);

describe('/api/traffic', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('accepts places in Ghana only, rounded to about 100 m', () => {
    expect(parseRoughPoint('5.571734,-0.216612')).toEqual({ latitude: 5.572, longitude: -0.217 });
    expect(parseRoughPoint('51.5,-0.1')).toBeNull();
    expect(parseRoughPoint(null)).toBeNull();
  });

  it('refuses places outside Ghana and says when no key is set, without calling Google', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('GOOGLE_ROUTES_KEY', 'k');
    expect((await GET(url('from=51.5,-0.1&to=5.534,-0.417'))).status).toBe(400);
    vi.stubEnv('GOOGLE_ROUTES_KEY', '');
    expect((await GET(url('from=5.5717,-0.2166&to=5.534,-0.417'))).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('asks Google for the drive in live traffic and the usual time, shared for 5 minutes', async () => {
    vi.stubEnv('GOOGLE_ROUTES_KEY', 'private-key');
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ routes: [{ duration: '2400s', staticDuration: '1800s', distanceMeters: 23000, polyline: { encodedPolyline: 'abc' } }] }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const res = await GET(url('from=5.571734,-0.216612&to=5.534,-0.417'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=120, s-maxage=300, stale-while-revalidate=300');
    expect(await res.json()).toEqual({ encodedPolyline: 'abc', durationS: 2400, usualS: 1800, distanceM: 23000 });
    const [, init] = fetch.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(body.routingPreference).toBe('TRAFFIC_AWARE');
    expect(body.origin.location.latLng).toEqual({ latitude: 5.572, longitude: -0.217 });
    expect(init.headers['x-goog-fieldmask']).toContain('routes.staticDuration');
  });

  it('passes on Google refusing, with the reason, without caching it', async () => {
    vi.stubEnv('GOOGLE_ROUTES_KEY', 'private-key');
    const refusal = { error: { status: 'PERMISSION_DENIED' } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(refusal), { status: 403 })));
    const res = await GET(url('from=5.5717,-0.2166&to=5.534,-0.417'));
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'routes unavailable (403)', reason: 'PERMISSION_DENIED' });
  });
});
