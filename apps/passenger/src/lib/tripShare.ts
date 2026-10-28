import type { LatLng } from '@gta/shared';
import { readCache, writeCache } from './storage';
import { supabase } from './supabase';

/**
 * P1-SAFE-04 "Share my trip". The phone keeps the share's secret; the link only carries the
 * public id, so whoever has the link can watch but cannot move the dot or stop the share.
 */
export interface TripShare {
  id: string;
  secret: string;
  expiresAt: string;
  from: string;
  to: string;
}

const KEY = 'share:v1';
/** How often the phone sends its position while sharing. */
export const SHARE_EVERY_MS = 20_000;

const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? '').replace(/\/$/, '');

/** The live share for this trip, if one was started on this phone and has not expired. */
export function currentShare(from: string, to: string): TripShare | null {
  const share = readCache<TripShare | null>(KEY)?.value;
  if (!share || share.from !== from || share.to !== to) return null;
  return Date.parse(share.expiresAt) > Date.now() ? share : null;
}

export async function startShare(from: string, to: string): Promise<TripShare> {
  const { data, error } = await supabase.rpc('start_trip_share', { p_origin: from, p_destination: to });
  if (error) throw error;
  const row = (data as { share_id: string; secret: string; expires_at: string }[])[0];
  if (!row) throw new Error('no share');
  const share: TripShare = { id: row.share_id, secret: row.secret, expiresAt: row.expires_at, from, to };
  writeCache(KEY, share);
  return share;
}

/** Sends the position. Resolves false when the share has ended or expired. */
export async function sendPosition(share: TripShare, position: LatLng): Promise<boolean> {
  const { data, error } = await supabase.rpc('update_trip_share', {
    p_id: share.id,
    p_secret: share.secret,
    p_latitude: position.latitude,
    p_longitude: position.longitude,
  });
  if (error) throw error;
  if (data === false) writeCache(KEY, null);
  return data !== false;
}

export async function stopShare(share: TripShare): Promise<void> {
  writeCache(KEY, null);
  await supabase.rpc('end_trip_share', { p_id: share.id, p_secret: share.secret });
}

/** The page family open. The live map runs on the website (also inside the Android app). */
export function shareLink(id: string): string {
  const origin = globalThis.location?.origin ?? WEB_URL;
  return `${origin}/follow/${id}`;
}

export function whatsappUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** "sms:?&body=" works on both Android and iPhone. */
export function smsUrl(message: string): string {
  return `sms:?&body=${encodeURIComponent(message)}`;
}

export interface SharedTrip {
  origin: LatLng & { name: string };
  destination: LatLng & { name: string };
  position: LatLng | null;
  locatedAt: string | null;
  expiresAt: string;
  status: 'live' | 'ended' | 'expired';
}

/** What the family page shows; null when the link is unknown. */
export async function loadSharedTrip(id: string): Promise<SharedTrip | null> {
  const { data, error } = await supabase.rpc('get_trip_share', { p_id: id });
  if (error) throw error;
  const row = (data as Record<string, any>[])[0]; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!row) return null;
  return {
    origin: { name: row.origin_name, latitude: row.origin_latitude, longitude: row.origin_longitude },
    destination: { name: row.destination_name, latitude: row.destination_latitude, longitude: row.destination_longitude },
    position: row.latitude == null ? null : { latitude: row.latitude, longitude: row.longitude },
    locatedAt: row.located_at,
    expiresAt: row.expires_at,
    status: row.status,
  };
}
