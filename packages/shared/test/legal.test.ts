import { describe, expect, it } from 'vitest';
import { type ConsentRow, hasAgreedToCurrentTerms, LEGAL_VERSIONS, latestConsents } from '../src';

const row = (consent_type: ConsentRow['consent_type'], granted: boolean, created_at: string, version?: string): ConsentRow => ({
  consent_type,
  granted,
  created_at,
  document_version: version ?? (consent_type === 'terms' || consent_type === 'privacy' ? LEGAL_VERSIONS[consent_type] : '1'),
});

describe('consent records', () => {
  it('uses the latest decision per type', () => {
    const latest = latestConsents([
      row('marketing', true, '2026-10-01T00:00:00Z'),
      row('marketing', false, '2026-10-05T00:00:00Z'),
    ]);
    expect(latest.marketing?.granted).toBe(false);
  });

  it('needs both terms and privacy agreed at the current version', () => {
    expect(hasAgreedToCurrentTerms([])).toBe(false);
    expect(hasAgreedToCurrentTerms([row('terms', true, '1')])).toBe(false);
    expect(hasAgreedToCurrentTerms([row('terms', true, '1'), row('privacy', true, '1')])).toBe(true);
    expect(hasAgreedToCurrentTerms([row('terms', true, '1', 'old'), row('privacy', true, '1')])).toBe(false);
  });
});
