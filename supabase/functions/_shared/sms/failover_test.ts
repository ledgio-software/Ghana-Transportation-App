import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { FailoverSmsProvider, smsProviderFromEnv } from './index.ts';
import type { SmsMessage, SmsProvider } from './types.ts';

class FakeProvider implements SmsProvider {
  sent: SmsMessage[] = [];
  constructor(readonly name: string, private readonly fail = false) {}
  send(message: SmsMessage): Promise<void> {
    if (this.fail) return Promise.reject(new Error(`${this.name} down`));
    this.sent.push(message);
    return Promise.resolve();
  }
}

const msg = { to: '+233240000001', body: 'code 123456' };

Deno.test('uses the primary provider when it works', async () => {
  const primary = new FakeProvider('primary');
  const backup = new FakeProvider('backup');
  await new FailoverSmsProvider([primary, backup]).send(msg);
  assertEquals(primary.sent.length, 1);
  assertEquals(backup.sent.length, 0);
});

Deno.test('falls back to the backup when the primary fails', async () => {
  const backup = new FakeProvider('backup');
  await new FailoverSmsProvider([new FakeProvider('primary', true), backup]).send(msg);
  assertEquals(backup.sent, [msg]);
});

Deno.test('fails when every provider fails', async () => {
  await assertRejects(
    () => new FailoverSmsProvider([new FakeProvider('a', true), new FakeProvider('b', true)]).send(msg),
    Error,
    'all SMS providers failed',
  );
});

Deno.test('refuses to start without vendor keys unless console mode is allowed', () => {
  const env = (vars: Record<string, string>) => ({ get: (k: string) => vars[k] });
  let threw = false;
  try {
    smsProviderFromEnv(env({}));
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
  assertEquals(smsProviderFromEnv(env({ SMS_ALLOW_CONSOLE: 'true' })).name, 'console');
  assertEquals(smsProviderFromEnv(env({ ARKESEL_API_KEY: 'k' })).name, 'failover');
});
