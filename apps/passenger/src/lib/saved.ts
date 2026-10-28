import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useSession } from './session';
import { readCache, writeCache } from './storage';
import { supabase } from './supabase';

/** A saved trip: every route between two stations the user saved (bus and trotro can both exist). */
export interface SavedTrip {
  originId: string;
  destinationId: string;
  originName: string;
  destinationName: string;
  routeIds: string[];
}

interface SavedRow {
  route_id: string;
  route: { origin_station_id: string; destination_station_id: string; origin: { name: string }; destination: { name: string } };
}

function group(rows: SavedRow[]): SavedTrip[] {
  const trips = new Map<string, SavedTrip>();
  for (const row of rows) {
    const key = `${row.route.origin_station_id}:${row.route.destination_station_id}`;
    const trip = trips.get(key) ?? {
      originId: row.route.origin_station_id,
      destinationId: row.route.destination_station_id,
      originName: row.route.origin.name,
      destinationName: row.route.destination.name,
      routeIds: [],
    };
    trip.routeIds.push(row.route_id);
    trips.set(key, trip);
  }
  return [...trips.values()];
}

const LOCAL_KEY = 'saved:local:v1';
const sameTrip = (a: SavedTrip, b: SavedTrip) => a.originId === b.originId && a.destinationId === b.destinationId;
const readLocal = () => readCache<SavedTrip[]>(LOCAL_KEY)?.value ?? [];

/**
 * Saved trips. Signed in: kept on the account (fare-change alerts), with the copy saved on the
 * phone shown while offline. Signed out: kept on this phone only, and moved to the account at
 * the next sign-in.
 */
export function useSavedTrips() {
  const session = useSession();
  const userId = session?.user.id ?? null;
  const cacheKey = `saved:v1:${userId}`;
  const [trips, setTrips] = useState<SavedTrip[]>(() => (userId ? readCache<SavedTrip[]>(cacheKey)?.value ?? [] : readLocal()));

  const reload = useCallback(async () => {
    if (!userId) return setTrips(readLocal());
    const local = readLocal();
    if (local.length > 0) {
      const { error } = await supabase.from('saved_routes').upsert(
        local.flatMap((trip) => trip.routeIds.map((route_id) => ({ route_id }))),
        { onConflict: 'user_id,route_id', ignoreDuplicates: true },
      );
      if (!error) writeCache(LOCAL_KEY, []);
    }
    const { data, error } = await supabase
      .from('saved_routes')
      .select(
        'route_id, route:routes(origin_station_id, destination_station_id, origin:stations!routes_origin_station_id_fkey(name), destination:stations!routes_destination_station_id_fkey(name))',
      )
      .order('created_at');
    if (error) {
      setTrips(readCache<SavedTrip[]>(cacheKey)?.value ?? []);
      return;
    }
    const next = group(data as unknown as SavedRow[]);
    writeCache(cacheKey, next);
    setTrips(next);
  }, [userId, cacheKey]);

  // Again whenever the screen comes back, so a trip saved on another screen shows up.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const save = useCallback(
    async (trip: SavedTrip) => {
      if (!userId) {
        const next = [...readLocal().filter((t) => !sameTrip(t, trip)), trip];
        writeCache(LOCAL_KEY, next);
        return setTrips(next);
      }
      const { error } = await supabase
        .from('saved_routes')
        .upsert(trip.routeIds.map((route_id) => ({ route_id })), { onConflict: 'user_id,route_id', ignoreDuplicates: true });
      if (error) throw error;
      await reload();
    },
    [userId, reload],
  );

  const remove = useCallback(
    async (trip: SavedTrip) => {
      if (!userId) {
        const next = readLocal().filter((t) => !sameTrip(t, trip));
        writeCache(LOCAL_KEY, next);
        return setTrips(next);
      }
      const { error } = await supabase.from('saved_routes').delete().in('route_id', trip.routeIds);
      if (error) throw error;
      await reload();
    },
    [userId, reload],
  );

  return { trips, save, remove, reload, signedIn: userId != null };
}
