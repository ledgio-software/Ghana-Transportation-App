/**
 * Row shapes the apps read from Supabase. Keep in step with supabase/migrations.
 * Once a Supabase project exists, replace with `supabase gen types typescript` output.
 */
export type DepartureMode = 'fill_and_go' | 'scheduled' | 'unknown';

export interface StationRow {
  id: string;
  name: string;
  slug: string;
  kind: 'lorry_station' | 'bus_terminal' | 'airport' | 'stop';
  city: string;
  region: string | null;
  latitude: number;
  longitude: number;
  /** Floods in heavy rain: the trip weather warns about it. */
  flood_prone: boolean;
}

/** One row of the search_fares(origin, destination) RPC. */
export interface FareOption {
  fare_id: string;
  route_id: string;
  route_kind: 'intercity' | 'intracity';
  operator_id: string | null;
  operator_name: string | null;
  vehicle_type: string;
  vehicle_type_name: string;
  class: string;
  official_pesewas: number | null;
  reported_median_pesewas: number | null;
  report_count: number;
  last_confirmed_at: string;
  departure_mode: DepartureMode;
  first_departure: string | null;
  last_departure: string | null;
  typical_duration_min: number | null;
}

export interface AppVersionRow {
  platform: 'android' | 'ios' | 'web';
  min_supported: string;
  latest: string;
  update_url: string | null;
}

export interface FeatureFlagRow {
  key: string;
  enabled: boolean;
  rollout_percent: number;
  cities: string[];
}
