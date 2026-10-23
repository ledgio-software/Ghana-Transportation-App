'use client';

import { formatPesewas, parseCedisToPesewas } from '@gta/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStaffSession } from '@/lib/useStaffSession';

interface FareRow {
  id: string;
  vehicle_type: string;
  class: string;
  amount_pesewas: number;
  is_official: boolean;
  last_confirmed_at: string;
  operator: { name: string } | null;
  route: { origin: { name: string }; destination: { name: string } };
}

/** P1-ADMIN fare editor: confirm a fare is still right, or change it (history is kept). */
export default function FaresPage() {
  const state = useStaffSession();
  const router = useRouter();
  const [fares, setFares] = useState<FareRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === 'signed_out' || state.status === 'needs_mfa') router.replace('/');
  }, [state, router]);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('fares')
      .select(
        'id, vehicle_type, class, amount_pesewas, is_official, last_confirmed_at, operator:operators(name), route:routes(origin:stations!routes_origin_station_id_fkey(name), destination:stations!routes_destination_station_id_fkey(name))',
      )
      .is('effective_to', null)
      .order('last_confirmed_at', { ascending: true });
    if (err) setError(err.message);
    else setFares(data as unknown as FareRow[]);
  }, []);

  useEffect(() => {
    if (state.status === 'ready') void load();
  }, [state.status, load]);

  async function confirm(id: string) {
    const { error: err } = await supabase.from('fares').update({ last_confirmed_at: new Date().toISOString() }).eq('id', id);
    if (err) setError(err.message);
    else void load();
  }

  async function change(id: string, current: number) {
    const input = window.prompt(`New fare in GH¢ (current ${formatPesewas(current)})`);
    if (input == null) return;
    const amount = parseCedisToPesewas(input);
    if (amount == null || amount <= 0) return setError('Enter an amount like 12 or 12.50');
    const { error: err } = await supabase.rpc('change_fare', { p_fare_id: id, p_amount_pesewas: amount });
    if (err) setError(err.message);
    else void load();
  }

  if (state.status !== 'ready') return null;

  return (
    <>
      <header>
        <strong>Ghana Transport Admin · Fares</strong>
        <button className="secondary" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      <main>
        <p className="muted">Oldest-confirmed first. Changing a fare closes the old one and keeps it in history.</p>
        {error && <p className="error">{error}</p>}
        {!fares && !error && <p className="muted">Loading…</p>}
        {fares && (
          <table>
            <thead>
              <tr>
                <th>Route</th>
                <th>Operator</th>
                <th>Type</th>
                <th>Fare</th>
                <th>Last confirmed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fares.map((f) => (
                <tr key={f.id}>
                  <td>{f.route.origin.name} → {f.route.destination.name}</td>
                  <td>{f.operator?.name ?? '—'}</td>
                  <td>{f.vehicle_type} · {f.class}</td>
                  <td>{formatPesewas(f.amount_pesewas)}{f.is_official ? ' (official)' : ''}</td>
                  <td>{new Date(f.last_confirmed_at).toLocaleDateString('en-GB', { timeZone: 'Africa/Accra' })}</td>
                  <td className="row">
                    <button className="secondary" onClick={() => confirm(f.id)}>Still correct</button>
                    <button onClick={() => change(f.id, f.amount_pesewas)}>Change</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}
