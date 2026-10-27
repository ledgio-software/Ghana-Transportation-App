'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useStaffSession } from '@/lib/useStaffSession';

const NAV = [
  { href: '/fares', label: 'Fares' },
  { href: '/stations', label: 'Stations' },
  { href: '/routes', label: 'Routes' },
  { href: '/operators', label: 'Operators & sources' },
  { href: '/reports', label: 'Reports' },
  { href: '/safety', label: 'Safety' },
  { href: '/import', label: 'Import' },
];

/** Page frame for signed-in staff. Sends anyone without a two-factor session back to sign-in. */
export function AdminShell({ title, children }: { title: string; children: ReactNode }) {
  const state = useStaffSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state.status === 'signed_out' || state.status === 'needs_mfa') router.replace('/');
  }, [state, router]);

  if (state.status !== 'ready') return null;

  return (
    <>
      <header>
        <nav className="row">
          <strong>GH Transport Admin</strong>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={pathname === item.href ? 'active' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <button className="secondary" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>
      <main>
        <h1>{title}</h1>
        {children}
      </main>
    </>
  );
}

/** Supabase errors in plain words for staff. */
export function describeError(err: { code?: string; message: string }): string {
  if (err.code === '23505') return 'This already exists. Edit the existing record instead.';
  if (err.code === '42501') return 'You do not have permission for this. Ask an admin for the right role.';
  if (err.code === '23503') return 'This is still used by other records and cannot be removed.';
  return err.message;
}
