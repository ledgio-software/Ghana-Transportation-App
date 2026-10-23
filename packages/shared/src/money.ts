/**
 * Money is always stored and passed around as integer pesewas (GH¢1 = 100 pesewas)
 * with an explicit currency code. Floating point cedis only exist at the UI edge.
 */
export type CurrencyCode = 'GHS';

export interface Money {
  amountPesewas: number;
  currency: CurrencyCode;
}

export function ghs(amountPesewas: number): Money {
  if (!Number.isInteger(amountPesewas)) {
    throw new Error(`amountPesewas must be an integer, got ${amountPesewas}`);
  }
  return { amountPesewas, currency: 'GHS' };
}

/** Parses user input such as "20", "20.5", "GH¢ 20.50" or "20,50" into pesewas. */
export function parseCedisToPesewas(input: string): number | null {
  const cleaned = input
    .replace(/gh[s¢₵]?|cedis?|₵|¢/gi, '')
    .replace(/\s+/g, '')
    .replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole = '0', fraction = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function formatPesewas(amountPesewas: number): string {
  const cedis = Math.floor(amountPesewas / 100);
  const pesewas = amountPesewas % 100;
  return pesewas === 0
    ? `GH¢${cedis}`
    : `GH¢${cedis}.${String(pesewas).padStart(2, '0')}`;
}
