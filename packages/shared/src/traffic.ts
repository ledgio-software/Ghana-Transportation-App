/** How bad the traffic is on a drive (P1-TRIP-05), from the time now and the usual time. */
export type TrafficLevel = 'light' | 'moderate' | 'heavy';

export interface TrafficSummary {
  level: TrafficLevel;
  /** Minutes longer than usual (0 when traffic is light or the drive is quicker). */
  delayMin: number;
}

/** Up to 15% longer than usual reads as light, up to 40% as moderate, more as heavy. */
export function trafficSummary(durationS: number, usualS: number): TrafficSummary {
  const delayS = Math.max(0, durationS - usualS);
  const ratio = usualS > 0 ? durationS / usualS : 1;
  const level: TrafficLevel = ratio <= 1.15 ? 'light' : ratio <= 1.4 ? 'moderate' : 'heavy';
  return { level, delayMin: level === 'light' ? 0 : Math.round(delayS / 60) };
}
