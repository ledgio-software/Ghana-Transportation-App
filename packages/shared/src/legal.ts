/**
 * Consent records (Act 843, Phase 0 doc 2.1): each agreement is a timestamped row with the
 * document version. Bump a version when the lawyer-approved text changes; everyone is then
 * asked to agree again before reporting.
 */
export const LEGAL_VERSIONS = {
  terms: '2026-10-draft-2',
  privacy: '2026-10-draft-2',
} as const;

export type ConsentType = 'terms' | 'privacy' | 'location' | 'share_with_contacts' | 'marketing';

export interface ConsentRow {
  consent_type: ConsentType;
  document_version: string;
  granted: boolean;
  created_at: string;
}

/** The most recent decision per consent type. */
export function latestConsents(rows: readonly ConsentRow[]): Partial<Record<ConsentType, ConsentRow>> {
  const latest: Partial<Record<ConsentType, ConsentRow>> = {};
  for (const row of rows) {
    const seen = latest[row.consent_type];
    if (!seen || row.created_at > seen.created_at) latest[row.consent_type] = row;
  }
  return latest;
}

/** True when the user's latest answer to both terms and privacy is "yes" to the current versions. */
export function hasAgreedToCurrentTerms(rows: readonly ConsentRow[]): boolean {
  const latest = latestConsents(rows);
  return (['terms', 'privacy'] as const).every(
    (type) => latest[type]?.granted === true && latest[type]?.document_version === LEGAL_VERSIONS[type],
  );
}
