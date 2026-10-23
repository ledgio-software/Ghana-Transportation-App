'use client';

import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type StaffState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'needs_mfa'; session: Session }
  | { status: 'ready'; session: Session };

/** Staff are only "ready" once the session reached aal2 (password + authenticator code). */
export function useStaffSession(): StaffState {
  const [state, setState] = useState<StaffState>({ status: 'loading' });

  useEffect(() => {
    async function evaluate(session: Session | null) {
      if (!session) return setState({ status: 'signed_out' });
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      setState(data?.currentLevel === 'aal2' ? { status: 'ready', session } : { status: 'needs_mfa', session });
    }
    supabase.auth.getSession().then(({ data }) => evaluate(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      void evaluate(session);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return state;
}
