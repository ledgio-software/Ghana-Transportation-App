import { EMERGENCY_FALLBACK, type EmergencyContact, MAX_PHOTO_BYTES } from '@gta/shared';
import { readCache, writeCache } from './storage';
import { supabase } from './supabase';

const CONTACTS_KEY = 'emergency:v1';

/**
 * Emergency numbers kept by staff. Must work with no signal: the last list is saved on the
 * phone, and before the first load the built-in list is shown.
 */
export async function loadEmergencyContacts(): Promise<EmergencyContact[]> {
  try {
    const { data, error } = await supabase
      .from('emergency_contacts')
      .select('name, phone, kind, note')
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw error;
    writeCache(CONTACTS_KEY, data);
    return data as EmergencyContact[];
  } catch {
    return readCache<EmergencyContact[]>(CONTACTS_KEY)?.value ?? [...EMERGENCY_FALLBACK];
  }
}

export function savedEmergencyContacts(): EmergencyContact[] {
  return readCache<EmergencyContact[]>(CONTACTS_KEY)?.value ?? [...EMERGENCY_FALLBACK];
}

export interface PickedPhoto {
  uri: string;
  base64: string;
  mimeType: string;
}

export class PhotoTooLargeError extends Error {}

function bytesOf(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Uploads photos into the reporter's own folder (the storage rules allow nothing else). */
export async function uploadReportPhotos(userId: string, reportId: string, photos: PickedPhoto[]): Promise<string[]> {
  const paths: string[] = [];
  for (const [i, photo] of photos.entries()) {
    const bytes = bytesOf(photo.base64);
    if (bytes.byteLength > MAX_PHOTO_BYTES) throw new PhotoTooLargeError();
    const ext = photo.mimeType === 'image/png' ? 'png' : photo.mimeType === 'image/webp' ? 'webp' : 'jpg';
    const path = `${userId}/${reportId}/${i + 1}.${ext}`;
    const { error } = await supabase.storage
      .from('report-photos')
      .upload(path, bytes, { contentType: photo.mimeType, upsert: true });
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}
