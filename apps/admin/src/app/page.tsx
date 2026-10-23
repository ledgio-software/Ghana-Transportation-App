'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStaffSession } from '@/lib/useStaffSession';

/** Staff sign-in: email + password, then an authenticator-app code (enrolled on first sign-in). */
export default function SignInPage() {
  const state = useStaffSession();
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'ready') router.replace('/fares');
  }, [state, router]);

  return (
    <>
      <header>
        <strong>Ghana Transport Admin</strong>
      </header>
      <main>
        {state.status === 'loading' && <p className="muted">Loading…</p>}
        {state.status === 'signed_out' && <PasswordStep />}
        {state.status === 'needs_mfa' && <MfaStep />}
      </main>
    </>
  );
}

function PasswordStep() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (err) setError(err.message);
  }

  return (
    <form onSubmit={submit}>
      <h1>Staff sign in</h1>
      <label>
        Email
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Password
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy}>Continue</button>
    </form>
  );
}

function MfaStep() {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase.auth.mfa.listFactors();
      if (err) return setError(err.message);
      const verified = data.totp.find((f) => f.status === 'verified');
      if (verified) return setFactorId(verified.id);
      // First sign-in: enrol an authenticator app.
      const enrolled = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (enrolled.error) return setError(enrolled.error.message);
      setFactorId(enrolled.data.id);
      setQr(enrolled.data.totp.qr_code);
    })();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (err) setError(err.message);
  }

  return (
    <form onSubmit={submit}>
      <h1>Two-factor code</h1>
      {qr && (
        <>
          <p>Scan this with an authenticator app (Google Authenticator, Authy, 1Password), then enter the code.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Authenticator QR code" width={200} height={200} />
        </>
      )}
      <label>
        6-digit code
        <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="submit" disabled={!factorId || code.trim().length !== 6}>Verify</button>
        <button type="button" className="secondary" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </form>
  );
}
