import { describe, expect, it } from 'vitest';
import { dailyOutlook, distanceKm, type ForecastPeriod, hourlyOutlook, rainLevel, skyOf, tripWeather } from '../src';

const at = (h: number) => new Date(Date.UTC(2026, 9, 27, h));
const hour = (h: number, symbol: string, precipMm = 0, tempC = 28, precipProbability: number | null = null): ForecastPeriod => ({
  time: at(h).toISOString(),
  hours: 1,
  symbol,
  precipMm,
  precipProbability,
  tempC,
});
const dryDay = Array.from({ length: 12 }, (_, i) => hour(8 + i, 'partlycloudy_day'));

describe('weather', () => {
  it('reads MET Norway symbols', () => {
    expect(skyOf('heavyrainandthunder')).toBe('thunder');
    expect(skyOf('heavyrainshowers_day')).toBe('heavyRain');
    expect(skyOf('lightrain')).toBe('rain');
    expect(skyOf('fair_night')).toBe('partly');
    expect(skyOf('clearsky_day')).toBe('clear');
  });

  it('grades rain by amount, symbol and chance', () => {
    expect(rainLevel(hour(9, 'cloudy', 0))).toBe('none');
    expect(rainLevel(hour(9, 'cloudy', 1.2))).toBe('rain');
    expect(rainLevel(hour(9, 'rain', 9))).toBe('heavy');
    expect(rainLevel(hour(9, 'heavyrain', 3))).toBe('heavy');
    expect(rainLevel(hour(9, 'lightrain', 0.6, 28, 20))).toBe('none');
    // A 6-hour period with 12 mm is 2 mm an hour: rain, not heavy.
    expect(rainLevel({ ...hour(9, 'rain', 12), hours: 6 })).toBe('rain');
  });

  it('dry trip: no umbrella', () => {
    const w = tripWeather([
      { role: 'start', name: 'Circle', floodProne: true, at: at(9), forecast: dryDay },
      { role: 'end', name: 'Kasoa', floodProne: false, at: at(10), forecast: dryDay },
    ]);
    expect(w?.umbrella).toBe(false);
    expect(w?.places.map((p) => [p.name, p.sky, p.rain, p.floodWarning])).toEqual([
      ['Circle', 'partly', 'none', false],
      ['Kasoa', 'partly', 'none', false],
    ]);
  });

  it('heavy rain at a flood-prone start warns about flooding, at the time it starts', () => {
    const wet = dryDay.map((p) => (p.time === at(10).toISOString() ? hour(10, 'heavyrainandthunder', 15, 24) : p));
    const w = tripWeather([
      { role: 'start', name: 'Circle', floodProne: true, at: at(9), forecast: wet },
      { role: 'end', name: 'Kasoa', floodProne: true, at: at(14), forecast: dryDay },
    ])!;
    expect(w.umbrella).toBe(true);
    expect(w.places[0]).toMatchObject({ name: 'Circle', sky: 'partly', tempC: 28, rain: 'heavy', floodWarning: true });
    expect(w.places[0]!.rainAt?.toISOString()).toBe(at(10).toISOString());
    // Rain at 10:00 is long over by the 14:00 arrival at Kasoa.
    expect(w.places[1]).toMatchObject({ rain: 'none', floodWarning: false });
  });

  it('heavy rain where flooding is not known: umbrella, no flood warning', () => {
    const wet = dryDay.map((p) => (p.time === at(13).toISOString() ? hour(13, 'heavyrain', 10) : p));
    const w = tripWeather([{ role: 'end', name: 'Kasoa', floodProne: false, at: at(14), forecast: wet }])!;
    expect(w.places[0]).toMatchObject({ rain: 'heavy', floodWarning: false });
    expect(w.umbrella).toBe(true);
  });

  it('no forecast for the hours of the trip: nothing to show', () => {
    expect(tripWeather([{ role: 'start', name: 'Circle', floodProne: false, at: at(23), forecast: dryDay }])).toBeNull();
  });

  it('measures distance', () => {
    const km = distanceKm({ latitude: 5.5717, longitude: -0.2166 }, { latitude: 6.686, longitude: -1.616 });
    expect(Math.round(km)).toBeGreaterThan(190);
    expect(Math.round(km)).toBeLessThan(205);
  });
});

describe('forecast: next hours and next days', () => {
  const now = new Date('2026-10-28T09:30:00Z');
  const hourly = (start: string, n: number, f: (i: number) => Partial<ForecastPeriod> = () => ({})) =>
    Array.from({ length: n }, (_, i) => ({
      time: new Date(Date.parse(start) + i * 3_600_000).toISOString().replace('.000', ''),
      hours: 1,
      symbol: 'partlycloudy_day',
      precipMm: 0,
      precipProbability: null,
      tempC: 25 + (i % 6),
      ...f(i),
    }));

  it('gives the weather every 3 hours from now', () => {
    const periods = hourly('2026-10-28T09:00:00Z', 24, (i) => (i === 6 ? { symbol: 'rain', precipMm: 2 } : {}));
    const out = hourlyOutlook(periods, now);
    expect(out.map((h) => h.at.toISOString())).toEqual([
      '2026-10-28T12:30:00.000Z',
      '2026-10-28T15:30:00.000Z',
      '2026-10-28T18:30:00.000Z',
      '2026-10-28T21:30:00.000Z',
    ]);
    expect(out[1]).toMatchObject({ sky: 'rain', rain: 'rain' });
    expect(out[0]).toMatchObject({ sky: 'partly', rain: 'none' });
  });

  it('sums up each of the next days: coolest, warmest, worst sky, most rain', () => {
    const periods: ForecastPeriod[] = [
      ...hourly('2026-10-28T09:00:00Z', 15),
      { time: '2026-10-29T00:00:00Z', hours: 6, symbol: 'cloudy', precipMm: 0, precipProbability: null, tempC: 22.6 },
      { time: '2026-10-29T06:00:00Z', hours: 6, symbol: 'heavyrainandthunder', precipMm: 60, precipProbability: 90, tempC: 30.2 },
      { time: '2026-10-30T12:00:00Z', hours: 6, symbol: 'clearsky_day', precipMm: 0, precipProbability: null, tempC: 32 },
    ];
    expect(dailyOutlook(periods, now)).toEqual([
      { date: '2026-10-29', minC: 23, maxC: 30, sky: 'thunder', rain: 'heavy' },
      { date: '2026-10-30', minC: 32, maxC: 32, sky: 'clear', rain: 'none' },
    ]);
  });
});
