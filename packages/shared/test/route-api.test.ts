import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, parsePoint } from '../../../apps/passenger/api/route';

const url = (q: string) => new Request(`https://x/api/route?${q}`);

describe('/api/route', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('accepts places in Ghana only, rounded to about 10 m', () => {
    expect(parsePoint('5.571734,-0.216612')).toEqual({ latitude: 5.5717, longitude: -0.2166 });
    expect(parsePoint('51.5,-0.1')).toBeNull();
    expect(parsePoint('5.5')).toBeNull();
    expect(parsePoint(null)).toBeNull();
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

  it('asks Google with the private key and lets the edge cache keep the route for a week', async () => {
    vi.stubEnv('GOOGLE_ROUTES_KEY', 'private-key');
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ routes: [{ duration: '1800s', distanceMeters: 23000, polyline: { encodedPolyline: 'abc' } }] })),
    );
    vi.stubGlobal('fetch', fetch);
    const res = await GET(url('from=5.5717,-0.2166&to=5.534,-0.417'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('s-maxage=604800');
    expect(await res.json()).toEqual({ encodedPolyline: 'abc', durationS: 1800, distanceM: 23000 });
    const [called, init] = fetch.mock.calls[0]!;
    expect(called).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(init.headers['x-goog-api-key']).toBe('private-key');
    expect(JSON.parse(init.body).origin.location.latLng).toEqual({ latitude: 5.5717, longitude: -0.2166 });
  });

  it('passes on Google refusing without caching it', async () => {
    vi.stubEnv('GOOGLE_ROUTES_KEY', 'private-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })));
    const res = await GET(url('from=5.5717,-0.2166&to=5.534,-0.417'));
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'routes unavailable (403)' });
  });

  it("says Google's reason for refusing, so the key setting to fix is clear", async () => {
    vi.stubEnv('GOOGLE_ROUTES_KEY', 'private-key');
    const refusal = {
      error: { code: 403, status: 'PERMISSION_DENIED', details: [{ reason: 'API_KEY_HTTP_REFERRER_BLOCKED' }] },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(refusal), { status: 403 })));
    const res = await GET(url('from=5.5717,-0.2166&to=5.534,-0.417'));
    expect(await res.json()).toEqual({ error: 'routes unavailable (403)', reason: 'API_KEY_HTTP_REFERRER_BLOCKED' });
  });
});
