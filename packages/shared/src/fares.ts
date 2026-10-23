/**
 * Fair price check (P1-ALERT). Pure functions so the same rule runs on the phone
 * offline and on the server.
 */

/** A quote this far above the reference fare is flagged. Admin-tunable later (rule 9). */
export const DEFAULT_OVERCHARGE_TOLERANCE = 0.1;

export type FareVerdict = 'below_normal' | 'normal' | 'above_normal' | 'unknown';

export interface FareReference {
  /** Official (GPRTU / operator) fare in pesewas, if known. */
  officialPesewas: number | null;
  /** Median of what passengers reported in the last 7 days, if any. */
  reportedMedianPesewas: number | null;
}

export interface FareCheckResult {
  verdict: FareVerdict;
  /** The fare the quote was compared against. */
  referencePesewas: number | null;
  /** How much above the reference the quote is, in pesewas (0 if not above). */
  excessPesewas: number;
}

/**
 * The reference is the official fare when there is one, because the product promise is
 * "know the approved fare". Without an official fare, the recent reported median is used.
 */
export function checkFare(
  quotedPesewas: number,
  ref: FareReference,
  tolerance = DEFAULT_OVERCHARGE_TOLERANCE,
): FareCheckResult {
  const reference = ref.officialPesewas ?? ref.reportedMedianPesewas;
  if (reference == null || reference <= 0) {
    return { verdict: 'unknown', referencePesewas: null, excessPesewas: 0 };
  }
  const upper = Math.round(reference * (1 + tolerance));
  const lower = Math.round(reference * (1 - tolerance));
  if (quotedPesewas > upper) {
    return { verdict: 'above_normal', referencePesewas: reference, excessPesewas: quotedPesewas - reference };
  }
  if (quotedPesewas < lower) {
    return { verdict: 'below_normal', referencePesewas: reference, excessPesewas: 0 };
  }
  return { verdict: 'normal', referencePesewas: reference, excessPesewas: 0 };
}

/** Median of integer amounts; used for "people paid this week". */
export function medianPesewas(amounts: readonly number[]): number | null {
  if (amounts.length === 0) return null;
  const sorted = [...amounts].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export type FareConfidence = 'high' | 'medium' | 'low';

/** Confidence shown next to every fare, from how recently it was confirmed. */
export function fareConfidence(lastConfirmedAt: Date, now: Date = new Date()): FareConfidence {
  const days = (now.getTime() - lastConfirmedAt.getTime()) / 86_400_000;
  if (days <= 30) return 'high';
  if (days <= 90) return 'medium';
  return 'low';
}
