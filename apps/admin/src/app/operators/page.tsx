'use client';

import { slugify } from '@gta/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { AdminShell, describeError } from '@/components/AdminShell';
import { supabase } from '@/lib/supabase';

const OPERATOR_KINDS = [
  { value: 'intercity_bus', label: 'Intercity bus company' },
  { value: 'trotro_union', label: 'Trotro union or branch' },
  { value: 'shared_taxi', label: 'Shared taxi' },
  { value: 'ride_hailing', label: 'Ride-hailing' },
  { value: 'airline', label: 'Airline' },
  { value: 'other', label: 'Other' },
] as const;

const SOURCE_KINDS = [
  { value: 'official_gprtu', label: 'Official GPRTU schedule' },
  { value: 'operator_list', label: 'Operator price list' },
  { value: 'station_board', label: 'Station board' },
  { value: 'field_ridden', label: 'Field team rode the route' },
  { value: 'passenger_report', label: 'Passenger reports' },
  { value: 'admin', label: 'Other (admin)' },
] as const;

interface Operator {
  id: string;
  name: string;
  slug: string;
  kind: string;
  phone: string | null;
  is_active: boolean;
}

interface Source {
  id: string;
  kind: string;
  name: string;
  reference_url: string | null;
  document_date: string | null;
}

/** Operators (bus companies, unions) and fare sources (where each fare came from). */
export default function OperatorsPage() {
  const [operators, setOperators] = useState<Operator[] | null>(null);
  const [sources, setSources] = useState<Source[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [op, setOp] = useState({ name: '', kind: 'intercity_bus', phone: '' });
  const [src, setSrc] = useState({ name: '', kind: 'official_gprtu', reference_url: '', document_date: '' });

  const load = useCallback(async () => {
    const [o, s] = await Promise.all([
      supabase.from('operators').select('id, name, slug, kind, phone, is_active').order('name'),
      supabase.from('fare_sources').select('id, kind, name, reference_url, document_date').order('created_at', { ascending: false }),
    ]);
    if (o.error || s.error) return setError(describeError((o.error ?? s.error)!));
    setOperators(o.data as Operator[]);
    setSources(s.data as Source[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addOperator(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: err } = await supabase.from('operators').insert({
      name: op.name.trim(),
      slug: slugify(op.name),
      kind: op.kind,
      phone: op.phone.trim() || null,
    });
    if (err) return setError(describeError(err));
    setOp({ name: '', kind: op.kind, phone: '' });
    void load();
  }

  async function addSource(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: err } = await supabase.from('fare_sources').insert({
      name: src.name.trim(),
      kind: src.kind,
      reference_url: src.reference_url.trim() || null,
      document_date: src.document_date || null,
    });
    if (err) return setError(describeError(err));
    setSrc({ name: '', kind: src.kind, reference_url: '', document_date: '' });
    void load();
  }

  return (
    <AdminShell title="Operators & sources">
      {error && <p className="error">{error}</p>}

      <h2>Operators</h2>
      <form className="grid" onSubmit={addOperator}>
        <label>
          Name
          <input placeholder="VIP Jeoun" value={op.name} required onChange={(e) => setOp({ ...op, name: e.target.value })} />
        </label>
        <label>
          Type
          <select value={op.kind} onChange={(e) => setOp({ ...op, kind: e.target.value })}>
            {OPERATOR_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
        <label>
          Phone (optional)
          <input value={op.phone} onChange={(e) => setOp({ ...op, phone: e.target.value })} />
        </label>
        <button type="submit">Add operator</button>
      </form>
      {operators && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Phone</th>
            </tr>
          </thead>
          <tbody>
            {operators.map((o) => (
              <tr key={o.id}>
                <td>{o.name}</td>
                <td>{OPERATOR_KINDS.find((k) => k.value === o.kind)?.label ?? o.kind}</td>
                <td>{o.phone ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Fare sources</h2>
      <p className="muted">Every fare records where it came from, so the app can show how trustworthy it is.</p>
      <form className="grid" onSubmit={addSource}>
        <label>
          Name
          <input placeholder="GPRTU Greater Accra schedule, June 2026" value={src.name} required onChange={(e) => setSrc({ ...src, name: e.target.value })} />
        </label>
        <label>
          Type
          <select value={src.kind} onChange={(e) => setSrc({ ...src, kind: e.target.value })}>
            {SOURCE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
        <label>
          Date of the document (optional)
          <input type="date" value={src.document_date} onChange={(e) => setSrc({ ...src, document_date: e.target.value })} />
        </label>
        <label>
          Link or photo URL (optional)
          <input type="url" value={src.reference_url} onChange={(e) => setSrc({ ...src, reference_url: e.target.value })} />
        </label>
        <button type="submit">Add source</button>
      </form>
      {sources && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.reference_url ? (
                    <a href={s.reference_url} target="_blank" rel="noreferrer">{s.name}</a>
                  ) : (
                    s.name
                  )}
                </td>
                <td>{SOURCE_KINDS.find((k) => k.value === s.kind)?.label ?? s.kind}</td>
                <td>{s.document_date ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
