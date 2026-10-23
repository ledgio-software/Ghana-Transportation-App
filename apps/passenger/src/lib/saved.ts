import { useCallback, useEffect, useState } from 'react';
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

/** The signed-in user's saved trips; shows the copy saved on the phone while offline. */
export function useSavedTrips() {
  const session = useSession();
  const userId = session?.user.id ?? null;
  const cacheKey = `saved:v1:${userId}`;
  const [trips, setTrips] = useState<SavedTrip[]>(() => (userId ? readCache<SavedTrip[]>(cacheKey)?.value ?? [] : []));

  const reload = useCallback(async () => {
    if (!userId) return setTrips([]);
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

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (routeIds: string[]) => {
      const { error } = await supabase
        .from('saved_routes')
        .upsert(routeIds.map((route_id) => ({ route_id })), { onConflict: 'user_id,route_id', ignoreDuplicates: true });
      if (error) throw error;
      await reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (routeIds: string[]) => {
      const { error } = await supabase.from('saved_routes').delete().in('route_id', routeIds);
      if (error) throw error;
      await reload();
    },
    [reload],
  );

  return { trips, save, remove, reload, signedIn: userId != null };
}
