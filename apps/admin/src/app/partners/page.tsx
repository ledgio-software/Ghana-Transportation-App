'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { AdminShell, describeError } from '@/components/AdminShell';
import { supabase } from '@/lib/supabase';

const API_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'}/rest/v1/rpc/partner_update_fares`;

interface Partner {
  id: string;
  name: string;
  operator_id: string | null;
  key_hint: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface Update {
  id: string;
  partner_id: string;
  received_at: string;
  fare_count: number;
  results: { line: number; status: string; message?: string }[];
}

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Accra' });

/**
 * P1-ADMIN-09: keys for GPRTU and other unions or operators to send fare changes through the fare
 * API (docs/partner-fare-api.md), and what each of their updates changed. Admins only.
 */
export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [operators, setOperators] = useState<{ id: string; name: string }[]>([]);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', operator_id: '' });
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, o, u] = await Promise.all([
      supabase.from('partners').select('id, name, operator_id, key_hint, created_at, last_used_at, revoked_at').order('created_at'),
      supabase.from('operators').select('id, name').order('name'),
      supabase.from('partner_fare_updates').select('id, partner_id, received_at, fare_count, results').order('received_at', { ascending: false }).limit(20),
    ]);
    if (p.error || o.error || u.error) return setError(describeError((p.error ?? o.error ?? u.error)!));
    setPartners(p.data as Partner[]);
    setOperators(o.data as { id: string; name: string }[]);
    setUpdates(u.data as Update[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { data, error: err } = await supabase.rpc('create_partner', { p_name: form.name, p_operator_id: form.operator_id || null });
    if (err) return setError(describeError(err));
    setNewKey(data as string);
    setForm({ name: '', operator_id: form.operator_id });
    void load();
  }

  async function revoke(p: Partner) {
    if (!globalThis.confirm(`Stop ${p.name}'s key? Their updates will be refused until you make a new key.`)) return;
    const { error: err } = await supabase.rpc('revoke_partner', { p_id: p.id });
    if (err) return setError(describeError(err));
    void load();
  }

  const name = (id: string | null, list: { id: string; name: string }[]) => list.find((x) => x.id === id)?.name ?? '—';
  const count = (u: Update, status: string) => u.results.filter((r) => r.status === status).length;

  return (
    <AdminShell title="Fare API partners">
      <p className="muted">
        GPRTU, other unions and operators can send fare changes straight to the app with a key. Each change keeps the fare
        history and alerts people who saved the route, like a change made here. Send them <code>docs/partner-fare-api.md</code>{' '}
        and their key.
      </p>
      {error && <p className="error">{error}</p>}

      <h2>Make a key</h2>
      <form className="grid" onSubmit={create}>
        <label>
          Partner name
          <input placeholder="GPRTU Greater Accra" value={form.name} required minLength={2} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Their fares belong to
          <select value={form.operator_id} onChange={(e) => setForm({ ...form, operator_id: e.target.value })} required>
            <option value="">Choose the operator or union</option>
            {operators.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </label>
        <button type="submit">Make key</button>
      </form>
      {newKey && (
        <div className="notice" role="status">
          <p>
            <strong>Copy this key now.</strong> It is shown only once. Send it to the partner privately (not in a group chat).
          </p>
          <p>
            <code aria-label="New partner key">{newKey}</code>
          </p>
          <p className="muted">Address: <code>{API_URL}</code></p>
          <button type="button" className="secondary" onClick={() => setNewKey(null)}>I have copied it</button>
        </div>
      )}

      <h2>Partners</h2>
      {partners && partners.length === 0 && <p>No partners yet.</p>}
      {partners && partners.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Partner</th>
              <th>Fares of</th>
              <th>Key</th>
              <th>Last update</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{name(p.operator_id, operators)}</td>
                <td>…{p.key_hint}</td>
                <td>{p.last_used_at ? when(p.last_used_at) : 'Never'}</td>
                <td>
                  {p.revoked_at ? (
                    <span className="muted">Stopped</span>
                  ) : (
                    <button className="secondary" onClick={() => void revoke(p)}>Stop key</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Latest updates</h2>
      {updates.length === 0 && <p className="muted">No updates received yet.</p>}
      {updates.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Received</th>
              <th>Partner</th>
              <th>Fares</th>
              <th>Changed</th>
              <th>New</th>
              <th>Same price</th>
              <th>Problems</th>
            </tr>
          </thead>
          <tbody>
            {updates.map((u) => (
              <tr key={u.id}>
                <td>{when(u.received_at)}</td>
                <td>{name(u.partner_id, partners ?? [])}</td>
                <td>{u.fare_count}</td>
                <td>{count(u, 'changed')}</td>
                <td>{count(u, 'created')}</td>
                <td>{count(u, 'confirmed')}</td>
                <td>
                  {count(u, 'error') + count(u, 'skipped')}
                  {u.results
                    .filter((r) => r.status === 'error' || r.status === 'skipped')
                    .slice(0, 3)
                    .map((r) => (
                      <div key={r.line} className="muted">
                        Fare {r.line}: {r.message}
                      </div>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
