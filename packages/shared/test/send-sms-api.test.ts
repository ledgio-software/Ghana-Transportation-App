import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST, verifySignature } from '../../../apps/passenger/api/send-sms';

const KEY = Buffer.from('test-signing-key-test-signing-key');
const SECRET = `v1,whsec_${KEY.toString('base64')}`;
const PAYLOAD = JSON.stringify({ user: { id: 'u1', phone: '233240000001' }, sms: { otp: '123456' } });

function signed(body: string, { at = Math.floor(Date.now() / 1000), key = KEY } = {}) {
  const sig = createHmac('sha256', key).update(`msg_1.${at}.${body}`).digest('base64');
  return new Request('https://x/api/send-sms', {
    method: 'POST',
    body,
    headers: { 'webhook-id': 'msg_1', 'webhook-timestamp': String(at), 'webhook-signature': `v1,${sig}` },
  });
}

describe('/api/send-sms (Supabase Send SMS hook → SMSGate)', () => {
  beforeEach(() => {
    vi.stubEnv('SEND_SMS_HOOK_SECRET', SECRET);
    vi.stubEnv('SMSGATE_USERNAME', 'user');
    vi.stubEnv('SMSGATE_PASSWORD', 'pass');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends the code to the number through SMSGate when Supabase signed the call', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"m1"}', { status: 202 }));
    vi.stubGlobal('fetch', fetch);
    const res = await POST(signed(PAYLOAD));
    expect(res.status).toBe(200);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.sms-gate.app/3rdparty/v1/messages');
    expect(init.headers.authorization).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`);
    expect(JSON.parse(init.body)).toEqual({
      textMessage: { text: 'Your Ghana Transport code is 123456. Do not share it with anyone.' },
      phoneNumbers: ['+233240000001'],
    });
  });

  it('refuses calls that Supabase did not sign, or old ones, without sending anything', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await POST(signed(PAYLOAD, { key: Buffer.from('someone-else') }))).status).toBe(401);
    expect((await POST(signed(PAYLOAD, { at: Math.floor(Date.now() / 1000) - 3600 }))).status).toBe(401);
    expect((await POST(new Request('https://x', { method: 'POST', body: PAYLOAD }))).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('tells Supabase it failed when SMSGate refuses or is not set up', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    const res = await POST(signed(PAYLOAD));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: { http_code: 502, message: 'could not send SMS, try again' } });
    vi.stubEnv('SMSGATE_PASSWORD', '');
    expect((await POST(signed(PAYLOAD))).status).toBe(500);
  });

  it('checks the signature over the exact body', async () => {
    const req = signed(PAYLOAD);
    expect(await verifySignature(SECRET, req.headers, PAYLOAD)).toBe(true);
    expect(await verifySignature(SECRET, req.headers, PAYLOAD.replace('123456', '000000'))).toBe(false);
  });
});
