'use client';

import { formatPesewas } from '@gta/shared';
import { useCallback, useEffect, useState } from 'react';
import { AdminShell, describeError } from '@/components/AdminShell';
import { supabase } from '@/lib/supabase';

type Kind = 'fare' | 'overcharge' | 'hazard';

interface ReportRow {
  id: string;
  created_at: string;
  amount_pesewas?: number;
  quoted_pesewas?: number;
  reference_pesewas?: number | null;
  vehicle_type?: string;
  class?: string;
  kind?: string;
  vehicle_plate?: string | null;
  note?: string | null;
  route?: { origin: { name: string }; destination: { name: string } } | null;
}

const ROUTE = 'route:routes(origin:stations!routes_origin_station_id_fkey(name), destination:stations!routes_destination_station_id_fkey(name))';

const QUERIES: Record<Kind, { table: string; select: string }> = {
  fare: { table: 'fare_reports', select: `id, created_at, amount_pesewas, vehicle_type, class, ${ROUTE}` },
  overcharge: {
    table: 'overcharge_reports',
    select: `id, created_at, kind, quoted_pesewas, reference_pesewas, vehicle_plate, note, ${ROUTE}`,
  },
  hazard: { table: 'hazard_reports', select: 'id, created_at, kind, note' },
};

const LABELS: Record<Kind, string> = { fare: 'Fares paid', overcharge: 'Overcharging', hazard: 'Road hazards' };

/** Moderation queue: accept or reject pending crowd reports (amounts cannot be edited). */
export default function ReportsPage() {
  const [kind, setKind] = useState<Kind>('fare');
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    const q = QUERIES[kind];
    const { data, error: err } = await supabase
      .from(q.table)
      .select(q.select)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100);
    if (err) setError(describeError(err));
    else setRows(data as unknown as ReportRow[]);
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, status: 'accepted' | 'rejected') {
    const { error: err } = await supabase.rpc('moderate_report', { p_kind: kind, p_id: id, p_status: status });
    if (err) return setError(describeError(err));
    setRows((current) => current?.filter((r) => r.id !== id) ?? null);
  }

  const route = (r: ReportRow) => (r.route ? `${r.route.origin.name} → ${r.route.destination.name}` : '—');

  return (
    <AdminShell title="Reports to review">
      <div className="tabs">
        {(Object.keys(LABELS) as Kind[]).map((k) => (
          <button key={k} className={k === kind ? 'on' : undefined} onClick={() => setKind(k)}>
            {LABELS[k]}
          </button>
        ))}
      </div>
      <p className="muted">Oldest first. Reject reports that look fake or mistyped; accepted and pending fares both count towards &quot;people paid this week&quot;.</p>
      {error && <p className="error">{error}</p>}
      {!rows && !error && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && <p>Nothing waiting.</p>}
      {rows && rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Sent</th>
              {kind !== 'hazard' && <th>Route</th>}
              <th>Details</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString('en-GB', { timeZone: 'Africa/Accra' })}</td>
                {kind !== 'hazard' && <td>{route(r)}</td>}
                <td>
                  {kind === 'fare' && `${formatPesewas(r.amount_pesewas!)} · ${r.vehicle_type} · ${r.class}`}
                  {kind === 'overcharge' &&
                    `${r.kind === 'short_drop' ? 'Short drop' : 'Overcharge'}: asked ${formatPesewas(r.quoted_pesewas!)}` +
                      (r.reference_pesewas ? ` (normal ${formatPesewas(r.reference_pesewas)})` : '') +
                      (r.vehicle_plate ? ` · plate ${r.vehicle_plate}` : '')}
                  {kind === 'hazard' && r.kind}
                  {r.note && <div className="muted">{r.note}</div>}
                </td>
                <td className="row">
                  <button onClick={() => decide(r.id, 'accepted')}>Accept</button>
                  <button className="secondary" onClick={() => decide(r.id, 'rejected')}>Reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
