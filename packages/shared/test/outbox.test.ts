import { describe, expect, it } from 'vitest';
import {
  type FeatureFlagRow,
  flushOutbox,
  isFlagOn,
  MAX_OUTBOX_ATTEMPTS,
  type OutboxItem,
  outcomeForError,
  rolloutBucket,
} from '../src';

const item = (id: string, created_at: string, attempts = 0): OutboxItem => ({
  client_id: id,
  kind: 'fare_report',
  payload: { amount_pesewas: 1100 },
  created_at,
  attempts,
});

describe('outbox', () => {
  it('sends everything when online, oldest first', async () => {
    const order: string[] = [];
    const res = await flushOutbox([item('b', '2026-10-23T10:00:00Z'), item('a', '2026-10-23T09:00:00Z')], async (i) => {
      order.push(i.client_id);
      return 'sent';
    });
    expect(order).toEqual(['a', 'b']);
    expect(res).toEqual({ remaining: [], sent: 2, dropped: 0 });
  });

  it('keeps items and counts the attempt when offline', async () => {
    const res = await flushOutbox([item('a', '1'), item('b', '2')], async () => {
      throw new Error('Network request failed');
    });
    expect(res.sent).toBe(0);
    expect(res.remaining.map((i) => [i.client_id, i.attempts])).toEqual([
      ['a', 1],
      ['b', 0],
    ]);
  });

  it('drops invalid items and carries on', async () => {
    const res = await flushOutbox([item('bad', '1'), item('good', '2')], async (i) =>
      i.client_id === 'bad' ? 'drop' : 'sent',
    );
    expect(res).toEqual({ remaining: [], sent: 1, dropped: 1 });
  });

  it('gives up on an item after too many attempts', async () => {
    const res = await flushOutbox([item('stuck', '1', MAX_OUTBOX_ATTEMPTS - 1)], async () => 'retry');
    expect(res).toEqual({ remaining: [], sent: 0, dropped: 1 });
  });

  it('treats a duplicate as already sent and bad data as never sendable', () => {
    expect(outcomeForError('23505')).toBe('sent');
    expect(outcomeForError('23503')).toBe('drop');
    expect(outcomeForError('22P02')).toBe('drop');
    expect(outcomeForError('P0001')).toBe('retry'); // rate limited
    expect(outcomeForError('42501')).toBe('retry'); // signed out
    expect(outcomeForError(undefined)).toBe('retry'); // network
  });
});

describe('feature switches', () => {
  const flag = (over: Partial<FeatureFlagRow>): FeatureFlagRow => ({
    key: 'phase1.fare_reports',
    enabled: true,
    rollout_percent: 100,
    cities: [],
    ...over,
  });

  it('respects enabled, city list and rollout percentage', () => {
    expect(isFlagOn(flag({}), { bucket: 99 })).toBe(true);
    expect(isFlagOn(flag({ enabled: false }), { bucket: 0 })).toBe(false);
    expect(isFlagOn(undefined, { bucket: 0 })).toBe(false);
    expect(isFlagOn(flag({ cities: ['Accra'] }), { bucket: 0, city: 'Kumasi' })).toBe(false);
    expect(isFlagOn(flag({ cities: ['Accra'] }), { bucket: 0, city: 'Accra' })).toBe(true);
    expect(isFlagOn(flag({ rollout_percent: 10 }), { bucket: 9 })).toBe(true);
    expect(isFlagOn(flag({ rollout_percent: 10 }), { bucket: 10 })).toBe(false);
  });

  it('gives a device the same bucket every time', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(rolloutBucket(id)).toBe(rolloutBucket(id));
    expect(rolloutBucket(id)).toBeGreaterThanOrEqual(0);
    expect(rolloutBucket(id)).toBeLessThan(100);
  });
});
