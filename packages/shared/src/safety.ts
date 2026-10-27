/**
 * Safety (P1-SAFE): emergency numbers, reports about a driver and driver ratings.
 * Kinds and tags must match the checks in supabase/migrations/20261028000100_safety.sql.
 */

export interface EmergencyContact {
  name: string;
  phone: string;
  kind: 'emergency' | 'police' | 'fire' | 'ambulance' | 'road_safety' | 'operator' | 'other';
  note: string | null;
}

/**
 * Shown before the list has ever loaded (first start without data). The list itself is
 * kept by staff in emergency_contacts and saved on the phone after each load.
 */
export const EMERGENCY_FALLBACK: readonly EmergencyContact[] = [
  { name: 'All emergencies', phone: '112', kind: 'emergency', note: 'Police, fire and ambulance' },
  { name: 'Police', phone: '191', kind: 'police', note: null },
  { name: 'Police (toll-free)', phone: '18555', kind: 'police', note: null },
  { name: 'Fire service', phone: '192', kind: 'fire', note: null },
  { name: 'Ambulance', phone: '193', kind: 'ambulance', note: null },
];

export const DRIVER_REPORT_KINDS = [
  'reckless_driving',
  'drunk_driving',
  'abuse',
  'harassment',
  'overloading',
  'unroadworthy',
  'other',
] as const;
export type DriverReportKind = (typeof DRIVER_REPORT_KINDS)[number];

export const POSITIVE_RATING_TAGS = ['safe_driving', 'polite', 'clean_vehicle', 'on_time', 'fair_fare'] as const;
export const NEGATIVE_RATING_TAGS = ['reckless', 'rude', 'dirty_vehicle', 'overloaded', 'overcharged'] as const;
export type RatingTag = (typeof POSITIVE_RATING_TAGS)[number] | (typeof NEGATIVE_RATING_TAGS)[number];

/** Tags worth offering for a star rating: praise for 4-5, complaints for 1-2, both for 3. */
export function tagsForRating(rating: number): RatingTag[] {
  if (rating >= 4) return [...POSITIVE_RATING_TAGS];
  if (rating <= 2) return [...NEGATIVE_RATING_TAGS];
  return [...POSITIVE_RATING_TAGS, ...NEGATIVE_RATING_TAGS];
}

/** Ghana plates look like "GR 1234-24" or "GT 5678 Z"; keep what people type, tidied. */
export function normalizePlate(input: string): string | null {
  const plate = input.toUpperCase().replace(/\s+/g, ' ').trim();
  return plate.length >= 2 && plate.length <= 15 ? plate : null;
}

export const MAX_REPORT_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
