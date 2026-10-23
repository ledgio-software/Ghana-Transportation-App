import { type SmsMessage, type SmsProvider, SmsSendError } from './types.ts';

/** Arkesel SMS (backup gateway so OTP never depends on one vendor). */
export class ArkeselSmsProvider implements SmsProvider {
  readonly name = 'arkesel';

  constructor(private readonly apiKey: string, private readonly senderId: string) {}

  async send({ to, body }: SmsMessage): Promise<void> {
    const res = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': this.apiKey },
      body: JSON.stringify({ sender: this.senderId, message: body, recipients: [to.replace(/^\+/, '')] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      throw new SmsSendError(this.name, `HTTP ${res.status}`);
    }
    const json = await res.json().catch(() => null);
    if (json && json.status && json.status !== 'success') {
      throw new SmsSendError(this.name, `status ${json.status}`);
    }
  }
}
