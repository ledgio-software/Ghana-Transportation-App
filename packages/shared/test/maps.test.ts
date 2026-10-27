import { describe, expect, it } from 'vitest';
import { googleMapsDirectionsUrl, googleMapsEmbedUrl } from '../src';

const circle = { latitude: 5.5701, longitude: -0.2131 };
const kasoa = { latitude: 5.5345, longitude: -0.4168 };

describe('maps', () => {
  it('links to driving directions between two stations', () => {
    const url = new URL(googleMapsDirectionsUrl(kasoa, 'driving', circle));
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('origin')).toBe('5.5701,-0.2131');
    expect(url.searchParams.get('destination')).toBe('5.5345,-0.4168');
    expect(url.searchParams.get('travelmode')).toBe('driving');
  });

  it('starts walking directions from the current location when no origin is given', () => {
    const url = new URL(googleMapsDirectionsUrl(circle, 'walking'));
    expect(url.searchParams.has('origin')).toBe(false);
    expect(url.searchParams.get('travelmode')).toBe('walking');
  });

  it('builds a directions embed with the key', () => {
    const url = new URL(googleMapsEmbedUrl('k&1', circle, kasoa, 'driving'));
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/embed/v1/directions');
    expect(url.searchParams.get('key')).toBe('k&1');
    expect(url.searchParams.get('origin')).toBe('5.5701,-0.2131');
    expect(url.searchParams.get('mode')).toBe('driving');
  });
});
