/**
 * Ghana mobile numbers: 10 digits locally (0XX XXX XXXX) or +233 followed by 9 digits.
 * Returns E.164 (+233XXXXXXXXX) or null when the number is not a valid Ghana mobile.
 */
export function normalizeGhanaPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  let national: string;
  if (digits.startsWith('+233')) national = digits.slice(4);
  else if (digits.startsWith('00233')) national = digits.slice(5);
  else if (digits.startsWith('233') && digits.length === 12) national = digits.slice(3);
  else if (digits.startsWith('0')) national = digits.slice(1);
  else national = digits;

  // Mobile prefixes start with 2 or 5 (e.g. 24, 54, 55, 20, 50, 26, 27, 57, 28).
  if (!/^[25]\d{8}$/.test(national)) return null;
  return `+233${national}`;
}

/** Masks a phone number for display and logs: +233******567. */
export function maskPhone(e164: string): string {
  return e164.length > 7 ? `${e164.slice(0, 4)}${'*'.repeat(e164.length - 7)}${e164.slice(-3)}` : '***';
}
