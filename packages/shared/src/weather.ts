/**
 * Weather along a trip (P1-WX-01) and heavy rain / flood warnings (P1-WX-02).
 * The forecast comes from MET Norway through the app's /api/weather proxy (ADR 0013).
 */

/** One forecast period for a place, as returned by /api/weather. */
export interface ForecastPeriod {
  /** Start of the period (ISO time). */
  time: string;
  /** Length of the period in hours: 1 near term, 6 further out. */
  hours: number;
  /** MET Norway symbol, e.g. "heavyrainandthunder" or "partlycloudy_day". */
  symbol: string;
  /** Expected rain over the period, in mm. */
  precipMm: number;
  /** Chance of rain in %, when the forecast gives one. */
  precipProbability: number | null;
  tempC: number;
}

export type Sky = 'clear' | 'partly' | 'cloudy' | 'fog' | 'rain' | 'heavyRain' | 'thunder';
export type RainLevel = 'none' | 'rain' | 'heavy';

/** 7.6 mm in an hour is the usual threshold for "heavy rain"; Accra's drains overflow at about that. */
export const HEAVY_RAIN_MM_PER_HOUR = 7.6;
const RAIN_MM_PER_HOUR = 0.5;
const LIKELY_PERCENT = 40;

export function skyOf(symbol: string): Sky {
  const base = symbol.replace(/_(day|night|polartwilight)$/, '');
  if (base.includes('thunder')) return 'thunder';
  if (base.startsWith('heavyrain') || base.startsWith('heavysleet')) return 'heavyRain';
  if (base.includes('rain') || base.includes('sleet') || base.includes('snow')) return 'rain';
  if (base === 'fog') return 'fog';
  if (base === 'cloudy') return 'cloudy';
  if (base === 'partlycloudy' || base === 'fair') return 'partly';
  return 'clear';
}

export function rainLevel(period: ForecastPeriod): RainLevel {
  const perHour = period.precipMm / Math.max(period.hours, 1);
  const sky = skyOf(period.symbol);
  if (period.precipProbability != null && period.precipProbability < LIKELY_PERCENT && perHour < HEAVY_RAIN_MM_PER_HOUR) {
    return 'none';
  }
  if (perHour >= HEAVY_RAIN_MM_PER_HOUR || sky === 'heavyRain') return 'heavy';
  if (perHour >= RAIN_MM_PER_HOUR || sky === 'rain' || sky === 'thunder') return 'rain';
  return 'none';
}

const RAIN_ORDER: Record<RainLevel, number> = { none: 0, rain: 1, heavy: 2 };

export interface TripPoint {
  role: 'start' | 'along' | 'end';
  /** Station name; empty for the point along the way. */
  name: string;
  floodProne: boolean;
  /** When the traveller is expected there. */
  at: Date;
  forecast: ForecastPeriod[];
}

export interface PlaceWeather {
  role: TripPoint['role'];
  name: string;
  at: Date;
  tempC: number;
  sky: Sky;
  rain: RainLevel;
  /** Start of the wettest period, for "around 3 pm". */
  rainAt: Date | null;
  floodWarning: boolean;
}

export interface TripWeather {
  places: PlaceWeather[];
  umbrella: boolean;
}

/** People wait at the start and arrive within about an hour either side of the typical time. */
const WINDOW_BEFORE_H = { start: 0, along: 1, end: 1 } as const;
const WINDOW_AFTER_H = { start: 2, along: 1, end: 1 } as const;

/** Weather at each point for the hours the traveller is there; null when there is no forecast. */
export function tripWeather(points: TripPoint[]): TripWeather | null {
  const places: PlaceWeather[] = [];
  for (const point of points) {
    const from = point.at.getTime() - WINDOW_BEFORE_H[point.role] * 3_600_000;
    const to = point.at.getTime() + WINDOW_AFTER_H[point.role] * 3_600_000;
    const periods = point.forecast.filter((p) => {
      const start = Date.parse(p.time);
      return start < to && start + p.hours * 3_600_000 > from;
    });
    if (periods.length === 0) continue;
    const at = point.at.getTime();
    const current = periods.find((p) => Date.parse(p.time) <= at && at < Date.parse(p.time) + p.hours * 3_600_000) ?? periods[0]!;
    let wettest = periods[0]!;
    for (const p of periods) if (RAIN_ORDER[rainLevel(p)] > RAIN_ORDER[rainLevel(wettest)]) wettest = p;
    const rain = rainLevel(wettest);
    places.push({
      role: point.role,
      name: point.name,
      at: point.at,
      tempC: Math.round(current.tempC),
      sky: skyOf(current.symbol),
      rain,
      rainAt: rain === 'none' ? null : new Date(Math.max(Date.parse(wettest.time), from)),
      floodWarning: rain === 'heavy' && point.floodProne,
    });
  }
  if (places.length === 0) return null;
  return { places, umbrella: places.some((p) => p.rain !== 'none') };
}

/** Most severe last, for "the worst sky of the day". */
const SKY_ORDER: Record<Sky, number> = { clear: 0, partly: 1, cloudy: 2, fog: 3, rain: 4, heavyRain: 5, thunder: 6 };

/** The forecast period covering a moment, if any. */
function periodAt(periods: readonly ForecastPeriod[], at: number): ForecastPeriod | undefined {
  return periods.find((p) => Date.parse(p.time) <= at && at < Date.parse(p.time) + p.hours * 3_600_000);
}

export interface HourOutlook {
  at: Date;
  tempC: number;
  sky: Sky;
  rain: RainLevel;
}

/** The next few hours at one place: every `stepH` hours from now, `count` times (P1-WX-03). */
export function hourlyOutlook(periods: readonly ForecastPeriod[], now: Date, count = 4, stepH = 3): HourOutlook[] {
  const out: HourOutlook[] = [];
  for (let i = 1; i <= count; i++) {
    const at = now.getTime() + i * stepH * 3_600_000;
    const p = periodAt(periods, at);
    if (p) out.push({ at: new Date(at), tempC: Math.round(p.tempC), sky: skyOf(p.symbol), rain: rainLevel(p) });
  }
  return out;
}

export interface DayOutlook {
  /** The day in Ghana (UTC all year), "2026-10-29". */
  date: string;
  minC: number;
  maxC: number;
  /** The worst sky and the most rain of the day. */
  sky: Sky;
  rain: RainLevel;
}

/** The next days at one place, starting tomorrow, as far as the forecast reaches (P1-WX-03). */
export function dailyOutlook(periods: readonly ForecastPeriod[], now: Date, days = 3): DayOutlook[] {
  const out: DayOutlook[] = [];
  for (let d = 1; d <= days; d++) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d)).toISOString().slice(0, 10);
    const day = periods.filter((p) => p.time.slice(0, 10) === date);
    if (day.length === 0) continue;
    const temps = day.map((p) => p.tempC);
    let sky = skyOf(day[0]!.symbol);
    let rain: RainLevel = 'none';
    for (const p of day) {
      if (SKY_ORDER[skyOf(p.symbol)] > SKY_ORDER[sky]) sky = skyOf(p.symbol);
      if (RAIN_ORDER[rainLevel(p)] > RAIN_ORDER[rain]) rain = rainLevel(p);
    }
    out.push({ date, minC: Math.round(Math.min(...temps)), maxC: Math.round(Math.max(...temps)), sky, rain });
  }
  return out;
}

/** Midpoint used for "along the way" on longer trips. */
export function midpoint(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  return { latitude: (a.latitude + b.latitude) / 2, longitude: (a.longitude + b.longitude) / 2 };
}

/** Straight-line distance in km, enough to decide whether a trip is long enough for a midpoint. */
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}
