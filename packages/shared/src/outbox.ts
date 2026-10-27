/**
 * Offline outbox (ADR 0005): reports are saved on the phone first and sent when possible.
 * Every item carries a client_id the server stores with a unique constraint, so sending the
 * same item twice can never create two reports.
 */
export type OutboxKind = 'fare_report' | 'overcharge_report' | 'driver_report' | 'driver_rating';

export interface OutboxItem {
  client_id: string;
  kind: OutboxKind;
  payload: Record<string, unknown>;
  created_at: string;
  attempts: number;
}

/** What happened when one item was sent. */
export type SendOutcome = 'sent' | 'retry' | 'drop';

/** Gives up on an item after this many failed attempts, so a broken item cannot block forever. */
export const MAX_OUTBOX_ATTEMPTS = 30;

/**
 * Maps a server or network error to what the outbox should do with the item.
 * Postgres codes: 23505 unique violation = the server already has it (a retry of a sent item);
 * other 22xxx/23xxx = the data is invalid and will never be accepted; everything else
 * (network down, signed out, rate limited) is worth retrying later.
 */
export function outcomeForError(code: string | undefined): SendOutcome {
  if (code === '23505') return 'sent';
  if (code && (code.startsWith('22') || code.startsWith('23'))) return 'drop';
  return 'retry';
}

export interface FlushResult {
  remaining: OutboxItem[];
  sent: number;
  dropped: number;
}

/** Sends items oldest first. Stops at the first retryable failure (usually "offline"). */
export async function flushOutbox(
  items: readonly OutboxItem[],
  send: (item: OutboxItem) => Promise<SendOutcome>,
): Promise<FlushResult> {
  const queue = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at));
  let sent = 0;
  let dropped = 0;
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i]!;
    let outcome: SendOutcome;
    try {
      outcome = await send(item);
    } catch {
      outcome = 'retry';
    }
    if (outcome === 'sent') {
      sent++;
    } else if (outcome === 'drop' || item.attempts + 1 >= MAX_OUTBOX_ATTEMPTS) {
      dropped++;
    } else {
      const rest = queue.slice(i + 1);
      return { remaining: [{ ...item, attempts: item.attempts + 1 }, ...rest], sent, dropped };
    }
  }
  return { remaining: [], sent, dropped };
}
