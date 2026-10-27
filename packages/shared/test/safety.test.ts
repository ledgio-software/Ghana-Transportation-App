import { describe, expect, it } from 'vitest';
import { EMERGENCY_FALLBACK, NEGATIVE_RATING_TAGS, normalizePlate, POSITIVE_RATING_TAGS, tagsForRating } from '../src';

describe('safety', () => {
  it('lists 112 first in the built-in emergency numbers', () => {
    expect(EMERGENCY_FALLBACK[0]).toMatchObject({ phone: '112', kind: 'emergency' });
    expect(EMERGENCY_FALLBACK.map((c) => c.phone)).toEqual(['112', '191', '18555', '192', '193']);
  });

  it('offers praise for good ratings, complaints for bad ones, both in the middle', () => {
    expect(tagsForRating(5)).toEqual([...POSITIVE_RATING_TAGS]);
    expect(tagsForRating(1)).toEqual([...NEGATIVE_RATING_TAGS]);
    expect(tagsForRating(3)).toHaveLength(POSITIVE_RATING_TAGS.length + NEGATIVE_RATING_TAGS.length);
  });

  it('tidies number plates', () => {
    expect(normalizePlate('  gr  1234-24 ')).toBe('GR 1234-24');
    expect(normalizePlate('')).toBeNull();
    expect(normalizePlate('x'.repeat(16))).toBeNull();
  });
});
