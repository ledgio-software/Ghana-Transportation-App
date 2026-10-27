import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, toPeriods } from '../../../apps/passenger/api/weather';

const now = new Date('2026-10-27T09:30:00Z');
const step = (time: string, hours: 1 | 6, symbol: string, mm: number, prob?: number) => ({
  time,
  data: {
    instant: { details: { air_temperature: 27.4 } },
    [hours === 1 ? 'next_1_hours' : 'next_6_hours']: {
      summary: { symbol_code: symbol },
      details: { precipitation_amount: mm, ...(prob == null ? {} : { probability_of_precipitation: prob }) },
    },
  },
});

describe('/api/weather', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the next 36 hours, hourly first, then 6-hourly without overlaps', () => {
    const periods = toPeriods(
      {
        properties: {
          timeseries: [
            step('2026-10-27T07:00:00Z', 1, 'cloudy', 0), // more than an hour ago
            step('2026-10-27T09:00:00Z', 1, 'rain', 1.5, 70),
            step('2026-10-27T10:00:00Z', 1, 'heavyrain', 9),
            step('2026-10-28T12:00:00Z', 6, 'partlycloudy_day', 0),
            step('2026-10-28T15:00:00Z', 6, 'cloudy', 0), // inside the previous 6-hour period
            step('2026-10-29T12:00:00Z', 6, 'cloudy', 0), // beyond 36 hours
          ],
        },
      },
      now,
    );
    expect(periods).toEqual([
      { time: '2026-10-27T09:00:00Z', hours: 1, symbol: 'rain', precipMm: 1.5, precipProbability: 70, tempC: 27.4 },
      { time: '2026-10-27T10:00:00Z', hours: 1, symbol: 'heavyrain', precipMm: 9, precipProbability: null, tempC: 27.4 },
      { time: '2026-10-28T12:00:00Z', hours: 6, symbol: 'partlycloudy_day', precipMm: 0, precipProbability: null, tempC: 27.4 },
    ]);
  });

  it('refuses places outside Ghana without calling MET Norway', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await GET(new Request('https://x/api/weather?lat=51.5&lon=-0.1'))).status).toBe(400);
    expect((await GET(new Request('https://x/api/weather?lat=5.5'))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('identifies itself to MET Norway, rounds the place and lets the edge cache answers', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ properties: { timeseries: [] } })));
    vi.stubGlobal('fetch', fetch);
    const res = await GET(new Request('https://x/api/weather?lat=5.57171&lon=-0.21664'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('s-maxage=1800');
    expect(await res.json()).toEqual({ source: 'MET Norway', periods: [] });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=5.57&lon=-0.22');
    expect(init.headers['user-agent']).toMatch(/^GhanaTransport\//);
  });

  it('reports an unavailable forecast without caching it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('busy', { status: 429 })));
    const res = await GET(new Request('https://x/api/weather?lat=5.57&lon=-0.22'));
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
