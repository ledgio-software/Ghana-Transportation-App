/**
 * Vendor adapter contract (Phase 0 doc 5.2 and 7.2 rule 10): features talk to SmsProvider,
 * never to Hubtel or Arkesel directly, so a vendor can be swapped without touching features.
 */
export interface SmsMessage {
  /** E.164, e.g. +233241234567 */
  to: string;
  body: string;
}

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<void>;
}

export class SmsSendError extends Error {
  constructor(readonly provider: string, message: string) {
    super(`${provider}: ${message}`);
  }
}
