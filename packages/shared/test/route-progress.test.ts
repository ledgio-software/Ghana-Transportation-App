import { describe, expect, it } from 'vitest';
import { decodePolyline, formatDistance, formatDuration, metresBetween, routeProgress } from '../src';

describe('route progress', () => {
  it('decodes Google encoded polylines', () => {
    // The example from Google's polyline documentation.
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ]);
    expect(decodePolyline('')).toEqual([]);
  });

  // A straight road east along the equator-ish latitude of Accra: 0.02 degrees is about 2.2 km.
  const path = [
    { latitude: 5.6, longitude: -0.22 },
    { latitude: 5.6, longitude: -0.21 },
    { latitude: 5.6, longitude: -0.2 },
  ];
  const total = metresBetween(path[0]!, path[2]!);

  it('measures how far along and how much is left, scaled from the route time', () => {
    const p = routeProgress(path, 600, { latitude: 5.6, longitude: -0.21 });
    expect(p.travelledM).toBeCloseTo(total / 2, -1);
    expect(p.remainingM).toBeCloseTo(total / 2, -1);
    expect(p.remainingS).toBeCloseTo(300, 0);
    expect(p.offRoute).toBe(false);
    expect(p.arrived).toBe(false);
  });

  it('snaps a slightly-off GPS fix to the road but notices leaving it', () => {
    const near = routeProgress(path, 600, { latitude: 5.6005, longitude: -0.215 }); // ~55 m north
    expect(near.offRoute).toBe(false);
    expect(near.snapped.latitude).toBeCloseTo(5.6, 6);
    const far = routeProgress(path, 600, { latitude: 5.605, longitude: -0.215 }); // ~550 m north
    expect(far.offRoute).toBe(true);
    expect(far.offRouteM).toBeGreaterThan(500);
  });

  it('knows when you have arrived', () => {
    const p = routeProgress(path, 600, { latitude: 5.6003, longitude: -0.2001 });
    expect(p.arrived).toBe(true);
    expect(p.remainingM).toBeLessThan(50);
  });

  it('formats distance and time for the card', () => {
    expect(formatDistance(780)).toBe('800 m');
    expect(formatDistance(12_440)).toBe('12 km');
    expect(formatDistance(4_260)).toBe('4.3 km');
    expect(formatDuration(61)).toBe('2 min');
    expect(formatDuration(0)).toBe('1 min');
    expect(formatDuration(3600 + 5 * 60)).toBe('1 h 5 min');
  });
});
