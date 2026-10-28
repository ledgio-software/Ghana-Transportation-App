import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGAL_ENTITY, LEGAL_VERSIONS, legalMarkdown, privacyPolicy, termsOfUse } from '../src';

const filled = Object.fromEntries(Object.keys(LEGAL_ENTITY).map((k) => [k, `filled-${k}`])) as unknown as typeof LEGAL_ENTITY;
const text = (doc: ReturnType<typeof termsOfUse>) => doc.sections.flatMap((s) => [s.heading, ...s.blocks.flat()]).join('\n');

describe('terms of use and privacy policy', () => {
  it('carry the consent versions people agree to', () => {
    expect(termsOfUse().version).toBe(LEGAL_VERSIONS.terms);
    expect(privacyPolicy().version).toBe(LEGAL_VERSIONS.privacy);
  });

  it('have no blanks left once the company details are filled in', () => {
    for (const doc of [termsOfUse(filled), privacyPolicy(filled)]) expect(text(doc)).not.toMatch(/\[[^\]]*\]/);
  });

  it('cover what the app does with personal data (Act 843)', () => {
    const policy = text(privacyPolicy());
    for (const topic of ['Phone number', 'photos', 'Shared trips', 'location', 'Data Protection Commission', '90 days', 'Download my data', 'Delete my account', 'outside Ghana']) {
      expect(policy).toContain(topic);
    }
    expect(text(termsOfUse())).toContain('call 112');
  });

  it('docs/legal is up to date (npx vite-node scripts/build-legal-docs.ts)', () => {
    const read = (f: string) => readFileSync(resolve(__dirname, '../../../docs/legal', f), 'utf8');
    expect(read('terms-of-use.md')).toBe(legalMarkdown(termsOfUse()));
    expect(read('privacy-policy.md')).toBe(legalMarkdown(privacyPolicy()));
  });
});
