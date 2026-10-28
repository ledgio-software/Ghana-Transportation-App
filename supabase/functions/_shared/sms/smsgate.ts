import { type SmsMessage, type SmsProvider, SmsSendError } from './types.ts';

/**
 * SMSGate (sms-gate.app): sends through an Android phone running the SMSGate app, via its cloud
 * server. Free, for testing and the first users; the phone needs credit and to stay online.
 * Messages come from that phone's number, not a sender name. Hubtel or Arkesel replace it at
 * launch (ADR 0010).
 */
export class SmsGateProvider implements SmsProvider {
  readonly name = 'smsgate';

  constructor(
    private readonly username: string,
    private readonly password: string,
    private readonly baseUrl = 'https://api.sms-gate.app/3rdparty/v1',
  ) {}

  async send({ to, body }: SmsMessage): Promise<void> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${btoa(`${this.username}:${this.password}`)}`,
      },
      body: JSON.stringify({ textMessage: { text: body }, phoneNumbers: [to] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      throw new SmsSendError(this.name, `HTTP ${res.status}`);
    }
  }
}
