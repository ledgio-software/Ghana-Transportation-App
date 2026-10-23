// Gives native builds a SQLite-backed localStorage; the browser already has one.
import 'expo-sqlite/localStorage/install';

interface Cached<T> {
  savedAt: string;
  value: T;
}

/** Reads a cached value. Storage can fail (private browsing, full disk); treat that as a miss. */
export function readCache<T>(key: string): Cached<T> | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as Cached<T>) : null;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), value }));
  } catch {
    // Offline cache is best-effort; the online path still works.
  }
}

export function readSetting(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(`setting:${key}`) ?? null;
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(`setting:${key}`, value);
  } catch {
    // Settings fall back to defaults if they cannot be stored.
  }
}
