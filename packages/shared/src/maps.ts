/**
 * Google Maps links and embeds (P1-TRIP, ADR 0009). Both are free: the directions link
 * opens Google Maps itself, and the Maps Embed API has no per-view charge. Travel times
 * with live traffic need the paid Routes API and go through an Edge Function later.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Trotros and buses follow roads, so trips use driving; walking is for getting to the station. */
export type MapTravelMode = 'driving' | 'walking';

function point({ latitude, longitude }: LatLng): string {
  return `${latitude},${longitude}`;
}

/**
 * Opens directions in the Google Maps app (Android) or website (iPhone).
 * Without an origin, Google Maps starts from the phone's current location.
 */
export function googleMapsDirectionsUrl(destination: LatLng, mode: MapTravelMode, origin?: LatLng): string {
  const params = new URLSearchParams({ api: '1', destination: point(destination), travelmode: mode });
  if (origin) params.set('origin', point(origin));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** A route map to show inside the app, using a Maps Embed API key restricted to our websites. */
export function googleMapsEmbedUrl(key: string, origin: LatLng, destination: LatLng, mode: MapTravelMode): string {
  const params = new URLSearchParams({ key, origin: point(origin), destination: point(destination), mode });
  return `https://www.google.com/maps/embed/v1/directions?${params.toString()}`;
}
