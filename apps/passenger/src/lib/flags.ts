import { type FeatureFlagRow, isFlagOn, rolloutBucket } from '@gta/shared';
import { randomUUID } from 'expo-crypto';
import { useEffect, useState } from 'react';
import { readCache, readSetting, writeCache, writeSetting } from './storage';
import { supabase } from './supabase';

const KEY = 'flags:v1';

/** A random id for this installation; decides which rollout bucket the device is in. */
function installationId(): string {
  let id = readSetting('installation_id');
  if (!id) {
    id = randomUUID();
    writeSetting('installation_id', id);
  }
  return id;
}

let flags: FeatureFlagRow[] = readCache<FeatureFlagRow[]>(KEY)?.value ?? [];
let loading: Promise<void> | null = null;

function load(): Promise<void> {
  loading ??= (async () => {
    const { data, error } = await supabase.from('feature_flags').select('key, enabled, rollout_percent, cities');
    if (!error && data) {
      flags = data as FeatureFlagRow[];
      writeCache(KEY, flags);
    }
  })().catch(() => undefined);
  return loading;
}

/** Whether a feature switch is on for this device. Uses the last saved switches when offline. */
export function useFlag(key: string): boolean {
  const compute = () => isFlagOn(flags.find((f) => f.key === key), { bucket: rolloutBucket(installationId()) });
  const [on, setOn] = useState(compute);
  useEffect(() => {
    let alive = true;
    void load().then(() => alive && setOn(compute()));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return on;
}
