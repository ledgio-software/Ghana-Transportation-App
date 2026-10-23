import { describe, expect, it } from 'vitest';
import {
  checkFare,
  fareConfidence,
  formatPesewas,
  isUpdateRequired,
  maskPhone,
  medianPesewas,
  normalizeGhanaPhone,
  parseCedisToPesewas,
  translate,
  translations,
} from '../src';

describe('money', () => {
  it('parses cedi input into integer pesewas', () => {
    expect(parseCedisToPesewas('20')).toBe(2000);
    expect(parseCedisToPesewas('20.5')).toBe(2050);
    expect(parseCedisToPesewas('GH¢ 11.25')).toBe(1125);
    expect(parseCedisToPesewas('7,50')).toBe(750);
    expect(parseCedisToPesewas('abc')).toBeNull();
    expect(parseCedisToPesewas('1.234')).toBeNull();
  });

  it('formats pesewas for display', () => {
    expect(formatPesewas(15000)).toBe('GH¢150');
    expect(formatPesewas(1125)).toBe('GH¢11.25');
    expect(formatPesewas(5)).toBe('GH¢0.05');
  });
});

describe('phone', () => {
  it('normalises Ghana mobile numbers to E.164', () => {
    expect(normalizeGhanaPhone('024 123 4567')).toBe('+233241234567');
    expect(normalizeGhanaPhone('+233 54 123 4567')).toBe('+233541234567');
    expect(normalizeGhanaPhone('233201234567')).toBe('+233201234567');
    expect(normalizeGhanaPhone('00233551234567')).toBe('+233551234567');
  });

  it('rejects numbers that are not Ghana mobiles', () => {
    expect(normalizeGhanaPhone('0302123456')).toBeNull(); // landline
    expect(normalizeGhanaPhone('02412345')).toBeNull();
    expect(normalizeGhanaPhone('+2348031234567')).toBeNull(); // Nigeria
  });

  it('masks numbers for display and logs', () => {
    expect(maskPhone('+233241234567')).toBe('+233******567');
  });
});

describe('fair price check (P1-ALERT-02)', () => {
  it('flags Circle to Kasoa at GH¢20 against an official GH¢11 as above normal', () => {
    const result = checkFare(2000, { officialPesewas: 1100, reportedMedianPesewas: 1500 });
    expect(result).toEqual({ verdict: 'above_normal', referencePesewas: 1100, excessPesewas: 900 });
  });

  it('accepts a quote within 10% of the official fare', () => {
    expect(checkFare(1200, { officialPesewas: 1100, reportedMedianPesewas: null }).verdict).toBe('normal');
  });

  it('falls back to the reported median when there is no official fare', () => {
    expect(checkFare(700, { officialPesewas: null, reportedMedianPesewas: 500 }).verdict).toBe('above_normal');
  });

  it('says unknown when there is nothing to compare against', () => {
    expect(checkFare(700, { officialPesewas: null, reportedMedianPesewas: null }).verdict).toBe('unknown');
  });

  it('computes medians', () => {
    expect(medianPesewas([])).toBeNull();
    expect(medianPesewas([500, 700, 600])).toBe(600);
    expect(medianPesewas([500, 700])).toBe(600);
  });

  it('lowers confidence as a fare ages', () => {
    const now = new Date('2026-10-23T12:00:00Z');
    expect(fareConfidence(new Date('2026-10-01T00:00:00Z'), now)).toBe('high');
    expect(fareConfidence(new Date('2026-08-15T00:00:00Z'), now)).toBe('medium');
    expect(fareConfidence(new Date('2026-01-01T00:00:00Z'), now)).toBe('low');
  });
});

describe('app version check', () => {
  it('requires an update only below the minimum supported version', () => {
    expect(isUpdateRequired('0.9.9', '1.0.0')).toBe(true);
    expect(isUpdateRequired('1.0.0', '1.0.0')).toBe(false);
    expect(isUpdateRequired('1.10.0', '1.9.0')).toBe(false);
  });
});

describe('translations', () => {
  it('has a non-empty Twi string for every English key', () => {
    for (const key of Object.keys(translations.en) as (keyof typeof translations.en)[]) {
      expect(translations.tw[key], key).toBeTruthy();
    }
  });

  it('keeps the same placeholders in every language', () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const key of Object.keys(translations.en) as (keyof typeof translations.en)[]) {
      expect(placeholders(translations.tw[key]), key).toBe(placeholders(translations.en[key]));
    }
  });

  it('fills placeholders', () => {
    expect(translate('en', 'fare.lastChecked', { date: '23 Oct' })).toBe('Last checked 23 Oct');
  });
});
