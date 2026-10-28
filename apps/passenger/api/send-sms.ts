/**
 * POST /api/send-sms: Supabase Auth's "Send SMS" hook (P1-ACC-02). Supabase calls it with each
 * phone sign-in code; it sends the code through SMSGate (an Android phone running the SMSGate
 * app, via its cloud server). Runs on Vercel, so it deploys with the website and needs no
 * Supabase CLI; supabase/functions/send-sms does the same as an Edge Function (ADR 0010).
 *
 * Needs, in Vercel's environment variables:
 *   SEND_SMS_HOOK_SECRET  the hook's secret from Supabase (v1,whsec_…)
 *   SMSGATE_USERNAME, SMSGATE_PASSWORD  from the SMSGate app's "Cloud server" card
 * Requests without a valid Supabase signature are refused, so nobody else can send SMS.
 */
const SMSGATE_URL = 'https://api.sms-gate.app/3rdparty/v1/messages';
/** Supabase signs each call; older than this is refused (replays). */
const MAX_AGE_S = 5 * 60;

export const otpMessage = (otp: string) => `Your Ghana Transport code is ${otp}. Do not share it with anyone.`;

function hookError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Standard Webhooks signature check, as Supabase Auth hooks sign their calls. */
export async function verifySignature(
  secret: string,
  headers: Headers,
  body: string,
  nowS = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatures = headers.get('webhook-signature');
  if (!id || !timestamp || !signatures) return false;
  if (!(Math.abs(nowS - Number(timestamp)) <= MAX_AGE_S)) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      fromBase64(secret.replace(/^v1,/, '').replace(/^whsec_/, '')),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const signed = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
    for (const part of signatures.split(' ')) {
      const [version, sig] = part.split(',');
      // subtle.verify compares in constant time.
      if (version === 'v1' && sig && (await crypto.subtle.verify('HMAC', key, fromBase64(sig), signed))) return true;
    }
  } catch {
    // A malformed secret or signature is simply not valid.
  }
  return false;
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.SEND_SMS_HOOK_SECRET;
  const username = process.env.SMSGATE_USERNAME;
  const password = process.env.SMSGATE_PASSWORD;
  if (!secret || !username || !password) return hookError(500, 'SMS not configured');

  const body = await request.text();
  if (!(await verifySignature(secret, request.headers, body))) return hookError(401, 'invalid signature');

  let to: string;
  let otp: string;
  try {
    const payload = JSON.parse(body) as { user: { phone: string }; sms: { otp: string } };
    to = `+${payload.user.phone.replace(/^\+/, '')}`;
    otp = payload.sms.otp;
  } catch {
    return hookError(400, 'bad request');
  }

  try {
    const res = await fetch(SMSGATE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${btoa(`${username}:${password}`)}`,
      },
      body: JSON.stringify({ textMessage: { text: otpMessage(otp) }, phoneNumbers: [to] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      // Only the last 3 digits ever go to the logs.
      console.error(`send-sms: SMSGate HTTP ${res.status} for ***${to.slice(-3)}`);
      return hookError(502, 'could not send SMS, try again');
    }
  } catch {
    console.error(`send-sms: SMSGate unreachable for ***${to.slice(-3)}`);
    return hookError(502, 'could not send SMS, try again');
  }
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
}
