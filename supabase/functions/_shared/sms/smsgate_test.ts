import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { smsProviderFromEnv } from './index.ts';
import { SmsGateProvider } from './smsgate.ts';

function stubFetch(status: number) {
  const calls: { url: string; init: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response('{"id":"m1","state":"Pending"}', { status }));
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

Deno.test('SMSGate: sends the code to the number through the cloud server', async () => {
  const stub = stubFetch(202);
  try {
    await new SmsGateProvider('user', 'pass').send({ to: '+233240000001', body: 'code 123456' });
    assertEquals(stub.calls[0].url, 'https://api.sms-gate.app/3rdparty/v1/messages');
    const headers = stub.calls[0].init.headers as Record<string, string>;
    assertEquals(headers.Authorization, `Basic ${btoa('user:pass')}`);
    assertEquals(JSON.parse(stub.calls[0].init.body as string), {
      textMessage: { text: 'code 123456' },
      phoneNumbers: ['+233240000001'],
    });
  } finally {
    stub.restore();
  }
});

Deno.test('SMSGate: a refusal (wrong password, phone offline) is an error, so failover can try the next', async () => {
  const stub = stubFetch(401);
  try {
    await assertRejects(() => new SmsGateProvider('user', 'wrong').send({ to: '+233240000001', body: 'x' }), Error, 'smsgate: HTTP 401');
  } finally {
    stub.restore();
  }
});

Deno.test('SMSGate is used when its username and password are set', () => {
  const env = (vars: Record<string, string>) => ({ get: (k: string) => vars[k] });
  assertEquals(smsProviderFromEnv(env({ SMSGATE_USERNAME: 'u', SMSGATE_PASSWORD: 'p' })).name, 'failover');
});
