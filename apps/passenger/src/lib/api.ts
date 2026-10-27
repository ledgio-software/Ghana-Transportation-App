import type { AppVersionRow, FareOption, StationRow } from '@gta/shared';
import { readCache, writeCache } from './storage';
import { supabase } from './supabase';

/** Result of an offline-first read: fresh from the server, or the last saved copy. */
export interface Loaded<T> {
  data: T;
  /** Set when the data came from the phone because the network call failed. */
  offlineSince: string | null;
}

async function onlineThenCache<T>(key: string, fetcher: () => Promise<T>): Promise<Loaded<T>> {
  try {
    const data = await fetcher();
    writeCache(key, data);
    return { data, offlineSince: null };
  } catch (err) {
    const cached = readCache<T>(key);
    if (cached) return { data: cached.value, offlineSince: cached.savedAt };
    throw err;
  }
}

export function loadStations(): Promise<Loaded<StationRow[]>> {
  return onlineThenCache('stations:v2', async () => {
    const { data, error } = await supabase
      .from('stations')
      .select('id, name, slug, kind, city, region, latitude, longitude')
      .eq('is_active', true)
      .order('city')
      .order('name');
    if (error) throw error;
    return data as StationRow[];
  });
}

export function searchFares(originId: string, destinationId: string): Promise<Loaded<FareOption[]>> {
  return onlineThenCache(`fares:v1:${originId}:${destinationId}`, async () => {
    const { data, error } = await supabase.rpc('search_fares', {
      origin: originId,
      destination: destinationId,
    });
    if (error) throw error;
    return data as FareOption[];
  });
}

export async function loadAppVersion(platform: AppVersionRow['platform']): Promise<AppVersionRow | null> {
  const { data, error } = await supabase
    .from('app_versions')
    .select('platform, min_supported, latest, update_url')
    .eq('platform', platform)
    .maybeSingle();
  if (error) throw error;
  return data as AppVersionRow | null;
}
