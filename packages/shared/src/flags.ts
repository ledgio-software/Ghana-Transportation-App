import type { FeatureFlagRow } from './database';

/**
 * Feature switch rule (ADR 0007): on when enabled, the user's city is listed (or no cities
 * are listed), and the device's stable bucket (0-99) falls inside rollout_percent.
 */
export function isFlagOn(
  flag: FeatureFlagRow | undefined,
  ctx: { bucket: number; city?: string | null },
): boolean {
  if (!flag || !flag.enabled) return false;
  if (flag.cities.length > 0 && (!ctx.city || !flag.cities.includes(ctx.city))) return false;
  return ctx.bucket < flag.rollout_percent;
}

/** Stable 0-99 bucket from an installation id, so a device stays in or out of a rollout. */
export function rolloutBucket(installationId: string): number {
  let hash = 0;
  for (let i = 0; i < installationId.length; i++) {
    hash = (hash * 31 + installationId.charCodeAt(i)) >>> 0;
  }
  return hash % 100;
}
