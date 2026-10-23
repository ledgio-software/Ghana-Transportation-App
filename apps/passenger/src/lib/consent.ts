import { type ConsentRow, type ConsentType, hasAgreedToCurrentTerms, LEGAL_VERSIONS } from '@gta/shared';
import Constants from 'expo-constants';
import { useEffect, useSyncExternalStore } from 'react';
import { useSession } from './session';
import { readCache, writeCache } from './storage';
import { supabase } from './supabase';

interface State {
  userId: string | null;
  rows: ConsentRow[];
  loaded: boolean;
}

let state: State = { userId: null, rows: [], loaded: false };
const listeners = new Set<() => void>();
const cacheKey = (userId: string) => `consents:v1:${userId}`;

function set(next: State) {
  state = next;
  if (next.userId && next.loaded) writeCache(cacheKey(next.userId), next.rows);
  listeners.forEach((l) => l());
}

/** Loads the user's consent history; falls back to the copy saved on the phone when offline. */
async function load(userId: string) {
  if (state.userId !== userId) {
    const cached = readCache<ConsentRow[]>(cacheKey(userId));
    set({ userId, rows: cached?.value ?? [], loaded: cached != null });
  }
  const { data, error } = await supabase
    .from('consents')
    .select('consent_type, document_version, granted, created_at')
    .order('created_at');
  if (!error && data && state.userId === userId) set({ userId, rows: data as ConsentRow[], loaded: true });
}

/** Saves new consent decisions as timestamped, versioned rows (never edits old ones). */
export async function recordConsents(
  userId: string,
  decisions: { type: ConsentType; granted: boolean }[],
): Promise<void> {
  const appVersion = Constants.expoConfig?.version ?? null;
  const rows = decisions.map((d) => ({
    user_id: userId,
    consent_type: d.type,
    granted: d.granted,
    document_version: d.type === 'terms' || d.type === 'privacy' ? LEGAL_VERSIONS[d.type] : '1',
    app_version: appVersion,
  }));
  const { data, error } = await supabase
    .from('consents')
    .insert(rows)
    .select('consent_type, document_version, granted, created_at');
  if (error) throw error;
  set({ userId, rows: [...state.rows, ...(data as ConsentRow[])], loaded: true });
}

/** Forgets consents kept on this phone (after the account is deleted). */
export function clearConsentCache(userId: string) {
  writeCache(cacheKey(userId), []);
  set({ userId: null, rows: [], loaded: false });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The signed-in user's consents. `agreed` is true once terms and privacy are accepted at the current version. */
export function useConsents(): { loaded: boolean; rows: ConsentRow[]; agreed: boolean } {
  const session = useSession();
  const userId = session?.user.id ?? null;
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);

  useEffect(() => {
    if (userId) void load(userId);
  }, [userId]);

  const mine = snapshot.userId === userId ? snapshot : { rows: [], loaded: false };
  return { loaded: mine.loaded, rows: mine.rows, agreed: hasAgreedToCurrentTerms(mine.rows) };
}

/** Asks the database directly; used right after sign-in to decide whether to show the agreement. */
export async function checkAgreed(userId: string): Promise<boolean> {
  await load(userId);
  return hasAgreedToCurrentTerms(state.rows);
}
