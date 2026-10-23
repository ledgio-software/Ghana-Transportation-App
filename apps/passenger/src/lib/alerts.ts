import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useSession } from './session';
import { supabase } from './supabase';

export interface FareChangeAlert {
  id: string;
  created_at: string;
  read_at: string | null;
  payload: {
    origin_id: string;
    destination_id: string;
    origin_name: string;
    destination_name: string;
    operator_name: string | null;
    vehicle_type_name: string;
    class: string;
    old_pesewas: number;
    new_pesewas: number;
  };
}

/** Fare-change alerts for the signed-in user, refreshed whenever the screen comes into view. */
export function useAlerts() {
  const session = useSession();
  const [alerts, setAlerts] = useState<FareChangeAlert[]>([]);

  const reload = useCallback(async () => {
    if (!session) return setAlerts([]);
    const { data } = await supabase
      .from('notifications')
      .select('id, created_at, read_at, payload')
      .eq('kind', 'fare_changed')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setAlerts(data as FareChangeAlert[]);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const markAllRead = useCallback(async () => {
    const unread = alerts.filter((a) => !a.read_at).map((a) => a.id);
    if (unread.length === 0) return;
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unread);
  }, [alerts]);

  return { alerts, unread: alerts.filter((a) => !a.read_at).length, reload, markAllRead };
}
