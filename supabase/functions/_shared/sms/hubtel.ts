import { type SmsMessage, type SmsProvider, SmsSendError } from './types.ts';

/** Hubtel SMS (primary). Credentials come from the Hubtel developer portal. */
export class HubtelSmsProvider implements SmsProvider {
  readonly name = 'hubtel';

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly senderId: string,
  ) {}

  async send({ to, body }: SmsMessage): Promise<void> {
    const res = await fetch('https://smsc.hubtel.com/v1/messages/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${btoa(`${this.clientId}:${this.clientSecret}`)}`,
      },
      body: JSON.stringify({ From: this.senderId, To: to.replace(/^\+/, ''), Content: body }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      throw new SmsSendError(this.name, `HTTP ${res.status}`);
    }
  }
}
