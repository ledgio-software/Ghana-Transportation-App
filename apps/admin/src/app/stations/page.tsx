'use client';

import { GHANA_REGIONS, slugify } from '@gta/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { AdminShell, describeError } from '@/components/AdminShell';
import { supabase } from '@/lib/supabase';

const KINDS = [
  { value: 'lorry_station', label: 'Lorry station' },
  { value: 'bus_terminal', label: 'Bus terminal' },
  { value: 'stop', label: 'Stop' },
  { value: 'airport', label: 'Airport' },
] as const;

interface Station {
  id: string;
  name: string;
  slug: string;
  kind: string;
  city: string;
  region: string | null;
  latitude: number;
  longitude: number;
  ghanapost_gps: string | null;
  is_active: boolean;
}

interface Draft {
  id: string | null;
  name: string;
  slug: string;
  slugEdited: boolean;
  kind: string;
  city: string;
  region: string;
  latitude: string;
  longitude: string;
  ghanapost_gps: string;
  is_active: boolean;
}

const EMPTY: Draft = {
  id: null,
  name: '',
  slug: '',
  slugEdited: false,
  kind: 'lorry_station',
  city: '',
  region: 'Greater Accra',
  latitude: '',
  longitude: '',
  ghanapost_gps: '',
  is_active: true,
};

/** Stations and terminals (Phase 0 doc 4.1): GPS pin, GhanaPostGPS address, canonical spelling. */
export default function StationsPage() {
  const [stations, setStations] = useState<Station[] | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('stations')
      .select('id, name, slug, kind, city, region, latitude, longitude, ghanapost_gps, is_active')
      .order('city')
      .order('name');
    if (err) setError(describeError(err));
    else setStations(data as Station[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function edit(s: Station) {
    setDraft({
      id: s.id,
      name: s.name,
      slug: s.slug,
      slugEdited: true,
      kind: s.kind,
      city: s.city,
      region: s.region ?? '',
      latitude: String(s.latitude),
      longitude: String(s.longitude),
      ghanapost_gps: s.ghanapost_gps ?? '',
      is_active: s.is_active,
    });
    setSaved(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    const latitude = Number(draft.latitude);
    const longitude = Number(draft.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setError('Latitude and longitude must be numbers, for example 5.5717 and -0.2166.');
      return;
    }
    const { error: err } = await supabase.rpc('save_station', {
      p_id: draft.id,
      p_name: draft.name.trim(),
      p_slug: draft.slug,
      p_kind: draft.kind,
      p_city: draft.city.trim(),
      p_region: draft.region || null,
      p_latitude: latitude,
      p_longitude: longitude,
      p_ghanapost_gps: draft.ghanapost_gps.trim(),
      p_is_active: draft.is_active,
    });
    if (err) {
      setError(err.code === '22023' ? 'Those coordinates are outside Ghana. Check that latitude and longitude are not swapped.' : describeError(err));
      return;
    }
    setSaved(`Saved ${draft.name}.`);
    setDraft(EMPTY);
    void load();
  }

  const q = filter.trim().toLowerCase();
  const shown = stations?.filter((s) => !q || s.name.toLowerCase().includes(q) || s.city.toLowerCase().includes(q));

  return (
    <AdminShell title="Stations">
      <form className="grid" onSubmit={save}>
        <h2 className="full">{draft.id ? `Edit ${draft.name}` : 'Add a station'}</h2>
        <label>
          Name (agreed spelling)
          <input
            value={draft.name}
            required
            onChange={(e) =>
              setDraft((d) => ({ ...d, name: e.target.value, slug: d.slugEdited ? d.slug : slugify(e.target.value) }))
            }
          />
        </label>
        <label>
          Short id
          <input
            value={draft.slug}
            required
            pattern="[a-z0-9-]+"
            title="Lowercase letters, numbers and dashes"
            onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value, slugEdited: true }))}
          />
        </label>
        <label>
          Type
          <select value={draft.kind} onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
        <label>
          City or town
          <input value={draft.city} required onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))} />
        </label>
        <label>
          Region
          <select value={draft.region} onChange={(e) => setDraft((d) => ({ ...d, region: e.target.value }))}>
            {GHANA_REGIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Latitude
          <input inputMode="decimal" placeholder="5.5717" value={draft.latitude} required onChange={(e) => setDraft((d) => ({ ...d, latitude: e.target.value }))} />
        </label>
        <label>
          Longitude
          <input inputMode="decimal" placeholder="-0.2166" value={draft.longitude} required onChange={(e) => setDraft((d) => ({ ...d, longitude: e.target.value }))} />
        </label>
        <label>
          GhanaPostGPS
          <input placeholder="GA-123-4567" value={draft.ghanapost_gps} onChange={(e) => setDraft((d) => ({ ...d, ghanapost_gps: e.target.value.toUpperCase() }))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))} />
          Shown in the app
        </label>
        <div className="row full">
          <button type="submit">{draft.id ? 'Save changes' : 'Add station'}</button>
          {draft.id && (
            <button type="button" className="secondary" onClick={() => setDraft(EMPTY)}>
              Cancel
            </button>
          )}
          {error && <span className="error">{error}</span>}
          {saved && <span className="ok">{saved}</span>}
        </div>
      </form>

      <input placeholder="Filter by name or city" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {!shown && !error && <p className="muted">Loading…</p>}
      {shown && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>City</th>
              <th>Type</th>
              <th>Location</th>
              <th>GhanaPostGPS</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.name} {!s.is_active && <span className="pill">hidden</span>}
                </td>
                <td>{s.city}</td>
                <td>{KINDS.find((k) => k.value === s.kind)?.label ?? s.kind}</td>
                <td className="num">
                  <a href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`} target="_blank" rel="noreferrer">
                    {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}
                  </a>
                </td>
                <td>{s.ghanapost_gps ?? '—'}</td>
                <td>
                  <button className="secondary" onClick={() => edit(s)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
