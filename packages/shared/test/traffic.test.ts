import { describe, expect, it } from 'vitest';
import { trafficSummary } from '../src';

describe('trafficSummary', () => {
  it('reads up to 15% longer than usual as light traffic', () => {
    expect(trafficSummary(1800, 1800)).toEqual({ level: 'light', delayMin: 0 });
    expect(trafficSummary(2070, 1800)).toEqual({ level: 'light', delayMin: 0 });
    expect(trafficSummary(1500, 1800)).toEqual({ level: 'light', delayMin: 0 });
  });

  it('says how many minutes longer for moderate and heavy traffic', () => {
    expect(trafficSummary(2400, 1800)).toEqual({ level: 'moderate', delayMin: 10 });
    expect(trafficSummary(3600, 1800)).toEqual({ level: 'heavy', delayMin: 30 });
  });

  it('copes with no usual time', () => {
    expect(trafficSummary(600, 0)).toEqual({ level: 'light', delayMin: 0 });
  });
});
