import { ArkeselSmsProvider } from './arkesel.ts';
import { HubtelSmsProvider } from './hubtel.ts';
import type { SmsMessage, SmsProvider } from './types.ts';

export type { SmsMessage, SmsProvider } from './types.ts';

/** Logs only the last 3 digits; phone numbers never go to logs in full (Phase 0 doc 8.5). */
function maskPhone(e164: string): string {
  return `***${e164.slice(-3)}`;
}

/** Tries each provider in order and stops at the first success. */
export class FailoverSmsProvider implements SmsProvider {
  readonly name = 'failover';

  constructor(private readonly providers: SmsProvider[]) {
    if (providers.length === 0) throw new Error('no SMS providers configured');
  }

  async send(message: SmsMessage): Promise<void> {
    const errors: string[] = [];
    for (const provider of this.providers) {
      try {
        await provider.send(message);
        if (errors.length > 0) {
          console.warn(`sms delivered to ${maskPhone(message.to)} via ${provider.name} after: ${errors.join('; ')}`);
        }
        return;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    throw new Error(`all SMS providers failed: ${errors.join('; ')}`);
  }
}

/** Logs instead of sending. Used when no vendor is configured (local development). */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  send(message: SmsMessage): Promise<void> {
    console.log(`[dev sms] to ${maskPhone(message.to)}: ${message.body}`);
    return Promise.resolve();
  }
}

/** Builds the provider chain from environment secrets: Hubtel first, then Arkesel. */
export function smsProviderFromEnv(env: { get(key: string): string | undefined }): SmsProvider {
  const senderId = env.get('SMS_SENDER_ID') ?? 'GhTransport';
  const providers: SmsProvider[] = [];

  const hubtelId = env.get('HUBTEL_CLIENT_ID');
  const hubtelSecret = env.get('HUBTEL_CLIENT_SECRET');
  if (hubtelId && hubtelSecret) providers.push(new HubtelSmsProvider(hubtelId, hubtelSecret, senderId));

  const arkeselKey = env.get('ARKESEL_API_KEY');
  if (arkeselKey) providers.push(new ArkeselSmsProvider(arkeselKey, senderId));

  if (providers.length === 0) {
    if (env.get('SMS_ALLOW_CONSOLE') === 'true') return new ConsoleSmsProvider();
    throw new Error('no SMS provider configured: set HUBTEL_* and/or ARKESEL_API_KEY');
  }
  return new FailoverSmsProvider(providers);
}
