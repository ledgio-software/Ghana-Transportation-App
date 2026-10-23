import { flushOutbox, type OutboxItem, type OutboxKind, outcomeForError, type SendOutcome } from '@gta/shared';
import { randomUUID } from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { readCache, writeCache } from './storage';
import { supabase } from './supabase';

const KEY = 'outbox:v1';
const TABLES: Record<OutboxKind, string> = {
  fare_report: 'fare_reports',
  overcharge_report: 'overcharge_reports',
};

const listeners = new Set<() => void>();
let items: OutboxItem[] = readCache<OutboxItem[]>(KEY)?.value ?? [];

function save(next: OutboxItem[]) {
  items = next;
  writeCache(KEY, items);
  listeners.forEach((l) => l());
}

async function send(item: OutboxItem): Promise<SendOutcome> {
  const { error } = await supabase.from(TABLES[item.kind]).insert({ client_id: item.client_id, ...item.payload });
  return error ? outcomeForError(error.code) : 'sent';
}

/** Saves a report on the phone, then tries to send it straight away. */
export function enqueue(kind: OutboxKind, payload: Record<string, unknown>): OutboxItem {
  const item: OutboxItem = { client_id: randomUUID(), kind, payload, created_at: new Date().toISOString(), attempts: 0 };
  save([...items, item]);
  void flush();
  return item;
}

let current: Promise<void> | null = null;

/**
 * Sends waiting reports. Safe to call often: while signed out it does nothing, and while a
 * send is running it returns that same run.
 */
export function flush(): Promise<void> {
  current ??= run().finally(() => {
    current = null;
  });
  return current;
}

async function run(): Promise<void> {
  if (items.length === 0) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const batch = items;
  const result = await flushOutbox(batch, send);
  // Keep anything queued while this run was sending.
  const attempted = new Set(batch.map((i) => i.client_id));
  save([...result.remaining, ...items.filter((i) => !attempted.has(i.client_id))]);
}

/** Drops every waiting report (after the account is deleted, they can no longer be sent). */
export function clearOutbox(): void {
  save([]);
}

export function isPending(clientId: string): boolean {
  return items.some((i) => i.client_id === clientId);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Number of reports still waiting on this phone. */
export function useOutboxCount(): number {
  return useSyncExternalStore(subscribe, () => items.length, () => items.length);
}
