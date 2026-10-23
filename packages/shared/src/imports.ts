/**
 * Field-team spreadsheet imports (Phase 0 doc 4.2): fixed columns, names from the agreed
 * spelling list, fares as numbers. These checks run in the admin before anything is saved,
 * so staff see every problem with its spreadsheet line number.
 */
import { csvRecords } from './csv';
import { parseCedisToPesewas } from './money';
import { GHANA_REGIONS, slugify } from './places';

export const STATION_COLUMNS = ['name', 'short_id', 'type', 'city', 'region', 'latitude', 'longitude', 'ghanapost_gps'] as const;

export const FARE_COLUMNS = [
  'from_station',
  'to_station',
  'route_type',
  'operator',
  'vehicle_type',
  'class',
  'fare_ghs',
  'official',
  'date_observed',
  'source',
  'source_type',
  'departure',
  'first_departure',
  'last_departure',
  'collector',
  'photo_link',
] as const;

export interface RowError {
  line: number;
  messages: string[];
}

export interface StationImportRow {
  line: number;
  name: string;
  slug: string;
  kind: string;
  city: string;
  region: string | null;
  latitude: number;
  longitude: number;
  ghanapost_gps: string | null;
}

export interface FareImportRow {
  line: number;
  origin_station_id: string;
  destination_station_id: string;
  route_kind: 'intercity' | 'intracity';
  operator_id: string | null;
  vehicle_type: string;
  class: string;
  amount_pesewas: number;
  is_official: boolean;
  observed_on: string;
  source_name: string | null;
  source_kind: string;
  departure_mode: 'fill_and_go' | 'scheduled' | 'unknown';
  first_departure: string | null;
  last_departure: string | null;
  collected_by: string | null;
  evidence_url: string | null;
}

export interface ImportCheck<T> {
  valid: T[];
  errors: RowError[];
  missingColumns: string[];
}

const STATION_KINDS: Record<string, string> = {
  lorry_station: 'lorry_station',
  lorry: 'lorry_station',
  station: 'lorry_station',
  bus_terminal: 'bus_terminal',
  terminal: 'bus_terminal',
  stop: 'stop',
  airport: 'airport',
};

const ROUTE_KINDS: Record<string, 'intercity' | 'intracity'> = {
  intercity: 'intercity',
  between_cities: 'intercity',
  intracity: 'intracity',
  within_city: 'intracity',
  within_a_city: 'intracity',
};

const DEPARTURES: Record<string, FareImportRow['departure_mode']> = {
  fill_and_go: 'fill_and_go',
  when_full: 'fill_and_go',
  scheduled: 'scheduled',
  timetable: 'scheduled',
  unknown: 'unknown',
  '': 'unknown',
};

const SOURCE_KINDS: Record<string, string> = {
  official_gprtu: 'official_gprtu',
  gprtu: 'official_gprtu',
  operator_list: 'operator_list',
  operator: 'operator_list',
  station_board: 'station_board',
  board: 'station_board',
  field_ridden: 'field_ridden',
  ridden: 'field_ridden',
  passenger: 'passenger_report',
  passenger_report: 'passenger_report',
  admin: 'admin',
  '': 'field_ridden',
};

const key = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function missing(found: Record<string, string> | undefined, required: readonly string[]): string[] {
  if (!found) return [...required];
  return required.filter((c) => !(c in found));
}

/** Accepts 2026-10-23, 23/10/2026 or 23-10-2026 (Ghana writes day first). Returns ISO or null. */
export function parseDate(input: string): string | null {
  const v = input.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "5:00", "05:00" or "17:30" -> "05:00" / "17:30"; empty -> null; anything else -> undefined. */
export function parseTime(input: string): string | null | undefined {
  const v = input.trim();
  if (!v) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return undefined;
  return `${match[1]!.padStart(2, '0')}:${match[2]}`;
}

function parseYesNo(input: string): boolean | undefined {
  const v = input.trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'official'].includes(v)) return true;
  if (['no', 'n', 'false', '0', ''].includes(v)) return false;
  return undefined;
}

export function checkStationImport(csv: string): ImportCheck<StationImportRow> {
  const records = csvRecords(csv);
  const missingColumns = missing(records[0]?.values, ['name', 'city', 'latitude', 'longitude']);
  if (missingColumns.length) return { valid: [], errors: [], missingColumns };

  const valid: StationImportRow[] = [];
  const errors: RowError[] = [];
  const seenSlugs = new Map<string, number>();

  for (const { line, values: v } of records) {
    const messages: string[] = [];
    const name = v.name ?? '';
    const slug = v.short_id || slugify(name);
    const kind = STATION_KINDS[key(v.type ?? '')] ?? (v.type ? undefined : 'lorry_station');
    const region = v.region ? GHANA_REGIONS.find((r) => r.toLowerCase() === v.region!.toLowerCase()) : null;
    const latitude = Number(v.latitude);
    const longitude = Number(v.longitude);

    if (!name) messages.push('name is empty');
    if (!/^[a-z0-9-]+$/.test(slug)) messages.push(`short id "${slug}" may only use a-z, 0-9 and -`);
    if (!kind) messages.push(`type "${v.type}" is not one of: lorry station, bus terminal, stop, airport`);
    if (!v.city) messages.push('city is empty');
    if (region === undefined) messages.push(`region "${v.region}" is not one of the 16 regions`);
    if (!v.latitude || !Number.isFinite(latitude) || latitude < 4.5 || latitude > 11.5) {
      messages.push(`latitude "${v.latitude}" is not in Ghana (4.5 to 11.5)`);
    }
    if (!v.longitude || !Number.isFinite(longitude) || longitude < -3.5 || longitude > 1.5) {
      messages.push(`longitude "${v.longitude}" is not in Ghana (-3.5 to 1.5)`);
    }
    const dupe = seenSlugs.get(slug);
    if (dupe) messages.push(`same short id as line ${dupe}`);
    seenSlugs.set(slug, line);

    if (messages.length) errors.push({ line, messages });
    else
      valid.push({
        line,
        name,
        slug,
        kind: kind!,
        city: v.city!,
        region: region ?? null,
        latitude,
        longitude,
        ghanapost_gps: v.ghanapost_gps ? v.ghanapost_gps.toUpperCase() : null,
      });
  }
  return { valid, errors, missingColumns };
}

export interface ReferenceData {
  stations: { id: string; slug: string; name: string; city: string }[];
  operators: { id: string; slug: string; name: string }[];
  vehicleTypes: { code: string; name: string }[];
}

/** Finds a station by short id, exact name, or "Name (City)". Names shared by two cities must use the short id. */
export function resolveStation(input: string, stations: ReferenceData['stations']): { id?: string; error?: string } {
  const v = input.trim();
  if (!v) return { error: 'is empty' };
  const bySlug = stations.find((s) => s.slug === v.toLowerCase());
  if (bySlug) return { id: bySlug.id };
  const withCity = /^(.*)\(([^)]+)\)\s*$/.exec(v);
  const name = (withCity ? withCity[1]! : v).trim().toLowerCase();
  const city = withCity?.[2]!.trim().toLowerCase();
  const matches = stations.filter((s) => s.name.toLowerCase() === name && (!city || s.city.toLowerCase() === city));
  if (matches.length === 1) return { id: matches[0]!.id };
  if (matches.length > 1) return { error: `"${v}" matches stations in several cities; use the short id` };
  return { error: `"${v}" is not a known station (add it on the Stations page first)` };
}

export function checkFareImport(csv: string, ref: ReferenceData): ImportCheck<FareImportRow> {
  const records = csvRecords(csv);
  const missingColumns = missing(records[0]?.values, ['from_station', 'to_station', 'vehicle_type', 'fare_ghs', 'date_observed']);
  if (missingColumns.length) return { valid: [], errors: [], missingColumns };

  const valid: FareImportRow[] = [];
  const errors: RowError[] = [];

  for (const { line, values: v } of records) {
    const messages: string[] = [];
    const from = resolveStation(v.from_station ?? '', ref.stations);
    const to = resolveStation(v.to_station ?? '', ref.stations);
    if (from.error) messages.push(`from station ${from.error}`);
    if (to.error) messages.push(`to station ${to.error}`);
    if (from.id && from.id === to.id) messages.push('from and to are the same station');

    const routeKind = v.route_type ? ROUTE_KINDS[key(v.route_type)] : 'intracity';
    if (!routeKind) messages.push(`route type "${v.route_type}" should be intercity or intracity`);

    let operatorId: string | null = null;
    if (v.operator) {
      const op = ref.operators.find(
        (o) => o.slug === slugify(v.operator!) || o.name.toLowerCase() === v.operator!.toLowerCase(),
      );
      if (op) operatorId = op.id;
      else messages.push(`operator "${v.operator}" is not known (add it on the Operators page first)`);
    }

    const vehicle = ref.vehicleTypes.find(
      (t) => t.code === key(v.vehicle_type ?? '') || t.name.toLowerCase() === (v.vehicle_type ?? '').toLowerCase(),
    );
    if (!vehicle) {
      messages.push(`vehicle type "${v.vehicle_type}" should be one of: ${ref.vehicleTypes.map((t) => t.code).join(', ')}`);
    }

    const amount = parseCedisToPesewas(v.fare_ghs ?? '');
    if (amount == null || amount <= 0) messages.push(`fare "${v.fare_ghs}" should be a number like 12 or 12.50`);

    const official = parseYesNo(v.official ?? '');
    if (official === undefined) messages.push(`official "${v.official}" should be yes or no`);

    const observedOn = parseDate(v.date_observed ?? '');
    if (!observedOn) messages.push(`date observed "${v.date_observed}" should look like 23/10/2026`);
    else if (observedOn > new Date().toISOString().slice(0, 10)) messages.push('date observed is in the future');

    const sourceKind = SOURCE_KINDS[key(v.source_type ?? '')];
    if (!sourceKind) messages.push(`source type "${v.source_type}" is not recognised`);

    const departure = DEPARTURES[key(v.departure ?? '')];
    if (!departure) messages.push(`departure "${v.departure}" should be "when full" or "scheduled"`);

    const first = parseTime(v.first_departure ?? '');
    const last = parseTime(v.last_departure ?? '');
    if (first === undefined) messages.push(`first departure "${v.first_departure}" should look like 05:00`);
    if (last === undefined) messages.push(`last departure "${v.last_departure}" should look like 21:30`);

    const cls = key(v.class ?? '') || 'standard';

    if (messages.length) {
      errors.push({ line, messages });
      continue;
    }
    valid.push({
      line,
      origin_station_id: from.id!,
      destination_station_id: to.id!,
      route_kind: routeKind!,
      operator_id: operatorId,
      vehicle_type: vehicle!.code,
      class: cls,
      amount_pesewas: amount!,
      is_official: official!,
      observed_on: observedOn!,
      source_name: v.source || null,
      source_kind: sourceKind!,
      departure_mode: departure!,
      first_departure: first ?? null,
      last_departure: last ?? null,
      collected_by: v.collector || null,
      evidence_url: v.photo_link || null,
    });
  }
  return { valid, errors, missingColumns };
}
