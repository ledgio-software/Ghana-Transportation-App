// Supabase Auth "Send SMS" hook: Auth calls this function to deliver phone OTP codes.
// The request is signed with Standard Webhooks; anything unsigned is rejected.
import { Webhook } from 'npm:standardwebhooks@1.0.0';
import { smsProviderFromEnv } from '../_shared/sms/index.ts';

interface SendSmsHookPayload {
  user: { id: string; phone: string };
  sms: { otp: string };
}

const OTP_MESSAGE = (otp: string) =>
  `Your Ghana Transport code is ${otp}. Do not share it with anyone.`;

function hookError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return hookError(405, 'method not allowed');

  const secret = Deno.env.get('SEND_SMS_HOOK_SECRETS');
  if (!secret) return hookError(500, 'hook secret not configured');

  const raw = await req.text();
  let payload: SendSmsHookPayload;
  try {
    const wh = new Webhook(secret.replace('v1,whsec_', ''));
    payload = wh.verify(raw, Object.fromEntries(req.headers)) as SendSmsHookPayload;
  } catch {
    return hookError(401, 'invalid signature');
  }

  try {
    const sms = smsProviderFromEnv(Deno.env);
    await sms.send({ to: `+${payload.user.phone.replace(/^\+/, '')}`, body: OTP_MESSAGE(payload.sms.otp) });
  } catch (err) {
    console.error('send-sms failed', err instanceof Error ? err.message : err);
    return hookError(502, 'could not send SMS, try again');
  }

  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
});
