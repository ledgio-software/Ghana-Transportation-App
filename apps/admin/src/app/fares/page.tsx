'use client';

import { formatPesewas, parseCedisToPesewas } from '@gta/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { AdminShell, describeError } from '@/components/AdminShell';
import { supabase } from '@/lib/supabase';

interface FareRow {
  id: string;
  vehicle_type: string;
  class: string;
  amount_pesewas: number;
  is_official: boolean;
  last_confirmed_at: string;
  operator: { name: string } | null;
  source: { name: string } | null;
  route: { origin: { name: string }; destination: { name: string } };
}

interface Option {
  id: string;
  label: string;
}

const EMPTY = {
  route_id: '',
  operator_id: '',
  vehicle_type: 'trotro',
  class: 'standard',
  amount: '',
  is_official: true,
  source_id: '',
  departure_mode: 'fill_and_go',
  first_departure: '',
  last_departure: '',
};

const ROUTE_SELECT =
  'id, origin:stations!routes_origin_station_id_fkey(name), destination:stations!routes_destination_station_id_fkey(name)';

/** P1-ADMIN fare editor: add fares, confirm they are still right, or change them (history is kept). */
export default function FaresPage() {
  const [fares, setFares] = useState<FareRow[] | null>(null);
  const [routes, setRoutes] = useState<Option[]>([]);
  const [operators, setOperators] = useState<Option[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<Option[]>([]);
  const [sources, setSources] = useState<Option[]>([]);
  const [draft, setDraft] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [f, r, o, v, s] = await Promise.all([
      supabase
        .from('fares')
        .select(`id, vehicle_type, class, amount_pesewas, is_official, last_confirmed_at, operator:operators(name), source:fare_sources(name), route:routes(${ROUTE_SELECT})`)
        .is('effective_to', null)
        .order('last_confirmed_at', { ascending: true }),
      supabase.from('routes').select(ROUTE_SELECT).eq('is_active', true),
      supabase.from('operators').select('id, name').eq('is_active', true).order('name'),
      supabase.from('vehicle_types').select('code, name').order('sort_order'),
      supabase.from('fare_sources').select('id, name').order('created_at', { ascending: false }),
    ]);
    const firstError = f.error ?? r.error ?? o.error ?? v.error ?? s.error;
    if (firstError) return setError(describeError(firstError));
    setFares(f.data as unknown as FareRow[]);
    setRoutes(
      (r.data as unknown as { id: string; origin: { name: string }; destination: { name: string } }[])
        .map((x) => ({ id: x.id, label: `${x.origin.name} → ${x.destination.name}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    );
    setOperators((o.data ?? []).map((x) => ({ id: x.id as string, label: x.name as string })));
    setVehicleTypes((v.data ?? []).map((x) => ({ id: x.code as string, label: x.name as string })));
    setSources((s.data ?? []).map((x) => ({ id: x.id as string, label: x.name as string })));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addFare(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    const amount = parseCedisToPesewas(draft.amount);
    if (amount == null || amount <= 0) return setError('Enter the fare in cedis, like 12 or 12.50.');
    const { error: err } = await supabase.from('fares').insert({
      route_id: draft.route_id,
      operator_id: draft.operator_id || null,
      vehicle_type: draft.vehicle_type,
      class: draft.class.trim().toLowerCase().replace(/\s+/g, '_') || 'standard',
      amount_pesewas: amount,
      is_official: draft.is_official,
      source_id: draft.source_id || null,
      departure_mode: draft.departure_mode,
      first_departure: draft.first_departure || null,
      last_departure: draft.last_departure || null,
    });
    if (err) {
      return setError(
        err.code === '23505'
          ? 'This route already has a current fare for that operator, vehicle and class. Use "Change" on it below.'
          : describeError(err),
      );
    }
    setSaved(`Added ${formatPesewas(amount)}.`);
    setDraft({ ...EMPTY, route_id: draft.route_id, source_id: draft.source_id });
    void load();
  }

  async function confirm(id: string) {
    setError(null);
    const { error: err } = await supabase.from('fares').update({ last_confirmed_at: new Date().toISOString() }).eq('id', id);
    if (err) setError(describeError(err));
    else void load();
  }

  async function change(id: string, current: number) {
    const input = window.prompt(`New fare in GH¢ (current ${formatPesewas(current)})`);
    if (input == null) return;
    const amount = parseCedisToPesewas(input);
    if (amount == null || amount <= 0) return setError('Enter an amount like 12 or 12.50');
    const { error: err } = await supabase.rpc('change_fare', { p_fare_id: id, p_amount_pesewas: amount });
    if (err) setError(describeError(err));
    else void load();
  }

  const select = (value: string, options: Option[], onChange: (v: string) => void, empty?: string) => (
    <select value={value} required={!empty} onChange={(e) => onChange(e.target.value)}>
      <option value="">{empty ?? 'Choose…'}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </select>
  );

  return (
    <AdminShell title="Fares">
      <form className="grid" onSubmit={addFare}>
        <h2 className="full">Add a fare</h2>
        <label>
          Route
          {select(draft.route_id, routes, (v) => setDraft((d) => ({ ...d, route_id: v })))}
        </label>
        <label>
          Operator
          {select(draft.operator_id, operators, (v) => setDraft((d) => ({ ...d, operator_id: v })), 'None / any')}
        </label>
        <label>
          Vehicle
          {select(draft.vehicle_type, vehicleTypes, (v) => setDraft((d) => ({ ...d, vehicle_type: v })))}
        </label>
        <label>
          Class
          <input placeholder="standard, executive, vip" value={draft.class} onChange={(e) => setDraft((d) => ({ ...d, class: e.target.value }))} />
        </label>
        <label>
          Fare (GH¢)
          <input inputMode="decimal" placeholder="11.00" value={draft.amount} required onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))} />
        </label>
        <label>
          Source
          {select(draft.source_id, sources, (v) => setDraft((d) => ({ ...d, source_id: v })), 'Not recorded')}
        </label>
        <label>
          Departs
          <select value={draft.departure_mode} onChange={(e) => setDraft((d) => ({ ...d, departure_mode: e.target.value }))}>
            <option value="fill_and_go">When full</option>
            <option value="scheduled">On a timetable</option>
            <option value="unknown">Not known</option>
          </select>
        </label>
        <label>
          First departure
          <input type="time" value={draft.first_departure} onChange={(e) => setDraft((d) => ({ ...d, first_departure: e.target.value }))} />
        </label>
        <label>
          Last departure
          <input type="time" value={draft.last_departure} onChange={(e) => setDraft((d) => ({ ...d, last_departure: e.target.value }))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={draft.is_official} onChange={(e) => setDraft((d) => ({ ...d, is_official: e.target.checked }))} />
          Official (approved) fare
        </label>
        <div className="row full">
          <button type="submit">Add fare</button>
          {error && <span className="error">{error}</span>}
          {saved && <span className="ok">{saved}</span>}
        </div>
      </form>

      <h2>Current fares</h2>
      <p className="muted">Oldest-confirmed first. Changing a fare closes the old one and keeps it in history.</p>
      {!fares && !error && <p className="muted">Loading…</p>}
      {fares && (
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Operator</th>
              <th>Type</th>
              <th>Fare</th>
              <th>Source</th>
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
                <td className="num">{formatPesewas(f.amount_pesewas)}{f.is_official ? ' (official)' : ''}</td>
                <td>{f.source?.name ?? '—'}</td>
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
    </AdminShell>
  );
}
