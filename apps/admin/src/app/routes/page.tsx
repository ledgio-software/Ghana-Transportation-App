'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { AdminShell, describeError } from '@/components/AdminShell';
import { supabase } from '@/lib/supabase';

interface StationOption {
  id: string;
  name: string;
  city: string;
}

interface Route {
  id: string;
  kind: 'intercity' | 'intracity';
  corridor: string | null;
  distance_m: number | null;
  typical_duration_min: number | null;
  is_active: boolean;
  origin_station_id: string;
  destination_station_id: string;
  origin: { name: string };
  destination: { name: string };
}

interface Draft {
  id: string | null;
  origin: string;
  destination: string;
  kind: 'intercity' | 'intracity';
  corridor: string;
  distanceKm: string;
  durationMin: string;
  is_active: boolean;
}

const EMPTY: Draft = {
  id: null,
  origin: '',
  destination: '',
  kind: 'intracity',
  corridor: '',
  distanceKm: '',
  durationMin: '',
  is_active: true,
};

function optionalInt(value: string, scale = 1): number | null {
  const n = Number(value);
  return value.trim() === '' || !Number.isFinite(n) || n <= 0 ? null : Math.round(n * scale);
}

/** Routes between two stations. Fares hang off a route. */
export default function RoutesPage() {
  const [stations, setStations] = useState<StationOption[]>([]);
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [st, rt] = await Promise.all([
      supabase.from('stations').select('id, name, city').eq('is_active', true).order('city').order('name'),
      supabase
        .from('routes')
        .select(
          'id, kind, corridor, distance_m, typical_duration_min, is_active, origin_station_id, destination_station_id, origin:stations!routes_origin_station_id_fkey(name), destination:stations!routes_destination_station_id_fkey(name)',
        )
        .order('created_at', { ascending: false }),
    ]);
    if (st.error || rt.error) return setError(describeError((st.error ?? rt.error)!));
    setStations(st.data as StationOption[]);
    setRoutes(rt.data as unknown as Route[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    if (draft.origin === draft.destination) return setError('Start and destination must be different stations.');
    const row = {
      origin_station_id: draft.origin,
      destination_station_id: draft.destination,
      kind: draft.kind,
      corridor: draft.corridor.trim().toUpperCase() || null,
      distance_m: optionalInt(draft.distanceKm, 1000),
      typical_duration_min: optionalInt(draft.durationMin),
      is_active: draft.is_active,
    };
    const { error: err } = draft.id
      ? await supabase.from('routes').update(row).eq('id', draft.id)
      : await supabase.from('routes').insert(row);
    if (err) return setError(describeError(err));
    setSaved('Route saved.');
    setDraft(EMPTY);
    void load();
  }

  function edit(r: Route) {
    setDraft({
      id: r.id,
      origin: r.origin_station_id,
      destination: r.destination_station_id,
      kind: r.kind,
      corridor: r.corridor ?? '',
      distanceKm: r.distance_m ? String(r.distance_m / 1000) : '',
      durationMin: r.typical_duration_min ? String(r.typical_duration_min) : '',
      is_active: r.is_active,
    });
    setSaved(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const stationSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} required onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose a station</option>
      {stations.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} ({s.city})
        </option>
      ))}
    </select>
  );

  return (
    <AdminShell title="Routes">
      <form className="grid" onSubmit={save}>
        <h2 className="full">{draft.id ? 'Edit route' : 'Add a route'}</h2>
        <label>
          From
          {stationSelect(draft.origin, (v) => setDraft((d) => ({ ...d, origin: v })))}
        </label>
        <label>
          To
          {stationSelect(draft.destination, (v) => setDraft((d) => ({ ...d, destination: v })))}
        </label>
        <label>
          Type
          <select value={draft.kind} onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as Draft['kind'] }))}>
            <option value="intracity">Within a city (trotro, taxi)</option>
            <option value="intercity">Between cities (bus)</option>
          </select>
        </label>
        <label>
          Highway (optional)
          <input placeholder="N6" value={draft.corridor} onChange={(e) => setDraft((d) => ({ ...d, corridor: e.target.value }))} />
        </label>
        <label>
          Distance in km (optional)
          <input inputMode="decimal" value={draft.distanceKm} onChange={(e) => setDraft((d) => ({ ...d, distanceKm: e.target.value }))} />
        </label>
        <label>
          Usual travel time in minutes (optional)
          <input inputMode="numeric" value={draft.durationMin} onChange={(e) => setDraft((d) => ({ ...d, durationMin: e.target.value }))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))} />
          Shown in the app
        </label>
        <div className="row full">
          <button type="submit">{draft.id ? 'Save changes' : 'Add route'}</button>
          {draft.id && (
            <button type="button" className="secondary" onClick={() => setDraft(EMPTY)}>
              Cancel
            </button>
          )}
          {error && <span className="error">{error}</span>}
          {saved && <span className="ok">{saved}</span>}
        </div>
      </form>

      {!routes && !error && <p className="muted">Loading…</p>}
      {routes && (
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Type</th>
              <th>Highway</th>
              <th>Distance</th>
              <th>Usual time</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.origin.name} → {r.destination.name} {!r.is_active && <span className="pill">hidden</span>}
                </td>
                <td>{r.kind === 'intercity' ? 'Between cities' : 'Within a city'}</td>
                <td>{r.corridor ?? '—'}</td>
                <td className="num">{r.distance_m ? `${(r.distance_m / 1000).toFixed(1)} km` : '—'}</td>
                <td className="num">{r.typical_duration_min ? `${r.typical_duration_min} min` : '—'}</td>
                <td>
                  <button className="secondary" onClick={() => edit(r)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
