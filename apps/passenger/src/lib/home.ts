import type { LatLng } from '@gta/shared';
import { readCache, writeCache } from './storage';

/** Where "home" is for Traffic home (P1-TRIP-05). Kept on this phone only, never sent to us. */
export interface Home extends LatLng {
  /** The station's name, or null for "where I was when I set it". */
  name: string | null;
}

const KEY = 'home:v1';

export function readHome(): Home | null {
  return readCache<Home | null>(KEY)?.value ?? null;
}

export function saveHome(home: Home): void {
  writeCache(KEY, home);
}
