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
type Tab = Kind | 'hotspots';

/** Moderation queue: accept or reject pending crowd reports (amounts cannot be edited). */
export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('fare');
  const kind: Kind = tab === 'hotspots' ? 'overcharge' : tab;
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (tab === 'hotspots') return;
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
  }, [kind, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, status: 'accepted' | 'rejected') {
    const { error: err } = await supabase.rpc('moderate_report', { p_kind: kind, p_id: id, p_status: status });
    if (err) return setError(describeError(err));
    setRows((current) => current?.filter((r) => r.id !== id) ?? null);
  }

  const route = (r: ReportRow) => (r.route ? `${r.route.origin.name} → ${r.route.destination.name}` : '—');

  const tabs = (
    <div className="tabs">
      {(Object.keys(LABELS) as Kind[]).map((k) => (
        <button key={k} className={k === tab ? 'on' : undefined} onClick={() => setTab(k)}>
          {LABELS[k]}
        </button>
      ))}
      <button className={tab === 'hotspots' ? 'on' : undefined} onClick={() => setTab('hotspots')}>
        Overcharging hotspots
      </button>
    </div>
  );

  if (tab === 'hotspots') {
    return (
      <AdminShell title="Reports to review">
        {tabs}
        <Hotspots />
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Reports to review">
      {tabs}
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

interface HotspotRow {
  route_id: string;
  created_at: string;
  kind: string;
  quoted_pesewas: number;
  reference_pesewas: number | null;
  route: { origin: { name: string }; destination: { name: string } } | null;
}

interface Hotspot {
  routeId: string;
  name: string;
  reports: number;
  shortDrops: number;
  extraTotal: number;
  extraCount: number;
  latest: string;
}

/** Where overcharging happens: the last 30 days of overcharge reports (not rejected) by route. */
function Hotspots() {
  const [spots, setSpots] = useState<Hotspot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    supabase
      .from('overcharge_reports')
      .select(`route_id, created_at, kind, quoted_pesewas, reference_pesewas, ${ROUTE}`)
      .neq('status', 'rejected')
      .gte('created_at', since)
      .limit(5000)
      .then(({ data, error: err }) => {
        if (err) return setError(describeError(err));
        const byRoute = new Map<string, Hotspot>();
        for (const r of data as unknown as HotspotRow[]) {
          const spot = byRoute.get(r.route_id) ?? {
            routeId: r.route_id,
            name: r.route ? `${r.route.origin.name} → ${r.route.destination.name}` : '—',
            reports: 0,
            shortDrops: 0,
            extraTotal: 0,
            extraCount: 0,
            latest: r.created_at,
          };
          spot.reports++;
          if (r.kind === 'short_drop') spot.shortDrops++;
          if (r.reference_pesewas != null && r.quoted_pesewas > r.reference_pesewas) {
            spot.extraTotal += r.quoted_pesewas - r.reference_pesewas;
            spot.extraCount++;
          }
          if (r.created_at > spot.latest) spot.latest = r.created_at;
          byRoute.set(r.route_id, spot);
        }
        setSpots([...byRoute.values()].sort((a, b) => b.reports - a.reports || b.latest.localeCompare(a.latest)));
      });
  }, []);

  return (
    <>
      <p className="muted">
        Routes where passengers reported being overcharged or dropped short in the last 30 days, most reports first. Rejected reports are
        left out. Use it to decide where to check fares or alert the station or union.
      </p>
      {error && <p className="error">{error}</p>}
      {!spots && !error && <p className="muted">Loading…</p>}
      {spots && spots.length === 0 && <p>No overcharging reported in the last 30 days.</p>}
      {spots && spots.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Reports</th>
              <th>Short drops</th>
              <th>Average extra asked</th>
              <th>Latest</th>
            </tr>
          </thead>
          <tbody>
            {spots.map((h) => (
              <tr key={h.routeId}>
                <td>{h.name}</td>
                <td>{h.reports}</td>
                <td>{h.shortDrops}</td>
                <td>{h.extraCount ? formatPesewas(Math.round(h.extraTotal / h.extraCount)) : '—'}</td>
                <td>
                  {new Date(h.latest).toLocaleDateString('en-GB', {
                    timeZone: 'Africa/Accra',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
