import type { ReactNode } from 'react';
import { useConsents } from '../lib/consent';
import { useSession } from '../lib/session';
import { ConsentPrompt, SignInPrompt, type SignInReason } from './SignInPrompt';

/** Reports need an account and agreement to the terms (P1-ACC, P1-LEGAL); asks for whichever is missing. */
export function ReportGate({ reason, children }: { reason: SignInReason; children: ReactNode }) {
  const session = useSession();
  const consents = useConsents();

  if (!session) return <SignInPrompt reason={reason} />;
  if (!consents.agreed) return <ConsentPrompt loaded={consents.loaded} />;
  return <>{children}</>;
}
