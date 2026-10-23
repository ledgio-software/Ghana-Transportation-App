import type { Session } from '@supabase/supabase-js';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** The signed-in session, or null. Searching works without one (P1-ACC). */
export function useSession(): Session | null {
  return useContext(SessionContext);
}
