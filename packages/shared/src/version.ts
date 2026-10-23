/** Compares "major.minor.patch" versions. Returns -1, 0 or 1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** Minimum app version check (rule 7): true when this build must be updated before use. */
export function isUpdateRequired(current: string, minSupported: string): boolean {
  return compareVersions(current, minSupported) < 0;
}
