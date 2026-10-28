import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { readCache, writeCache } from './storage';

/** A trip the traveller looked up. Kept on this phone only, never sent to us. */
export interface RecentTrip {
  originId: string;
  destinationId: string;
  originName: string;
  destinationName: string;
  /** When it was last looked up (ISO time). */
  at: string;
}

const KEY = 'history:v1';
const MAX = 20;

export function readHistory(): RecentTrip[] {
  return readCache<RecentTrip[]>(KEY)?.value ?? [];
}

/** Saves a looked-up trip at the top of the history (once per trip, newest first). */
export function recordTrip(trip: Omit<RecentTrip, 'at'>): void {
  const rest = readHistory().filter((t) => t.originId !== trip.originId || t.destinationId !== trip.destinationId);
  writeCache(KEY, [{ ...trip, at: new Date().toISOString() }, ...rest].slice(0, MAX));
}

export function clearHistory(): void {
  writeCache(KEY, []);
}

/** The trip history, read again whenever the screen comes back into view. */
export function useHistory() {
  const [trips, setTrips] = useState<RecentTrip[]>(readHistory);
  useFocusEffect(useCallback(() => setTrips(readHistory()), []));
  const clear = useCallback(() => {
    clearHistory();
    setTrips([]);
  }, []);
  return { trips, clear };
}
