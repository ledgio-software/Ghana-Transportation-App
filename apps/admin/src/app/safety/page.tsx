'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { AdminShell, describeError } from '@/components/AdminShell';
import { supabase } from '@/lib/supabase';

type Tab = 'reports' | 'ratings' | 'contacts';

const REPORT_KINDS: Record<string, string> = {
  reckless_driving: 'Reckless driving',
  drunk_driving: 'Drunk driving',
  abuse: 'Abused passengers',
  harassment: 'Harassment',
  overloading: 'Overloading',
  unroadworthy: 'Unsafe vehicle',
  other: 'Something else',
};

const TAG_LABELS: Record<string, string> = {
  safe_driving: 'safe driving',
  polite: 'polite',
  clean_vehicle: 'clean vehicle',
  on_time: 'on time',
  fair_fare: 'fair fare',
  reckless: 'reckless',
  rude: 'rude',
  dirty_vehicle: 'dirty vehicle',
  overloaded: 'overloaded',
  overcharged: 'overcharged',
};

const CONTACT_KINDS = [
  { value: 'emergency', label: 'All emergencies' },
  { value: 'police', label: 'Police' },
  { value: 'fire', label: 'Fire' },
  { value: 'ambulance', label: 'Ambulance' },
  { value: 'road_safety', label: 'Road safety (MTTD, NRSA)' },
  { value: 'operator', label: 'Bus company / union' },
  { value: 'other', label: 'Other' },
] as const;

const ROUTE = 'route:routes(origin:stations!routes_origin_station_id_fkey(name), destination:stations!routes_destination_station_id_fkey(name))';

type RouteJoin = { origin: { name: string }; destination: { name: string } } | null;
const routeName = (r: RouteJoin) => (r ? `${r.origin.name} → ${r.destination.name}` : '—');
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Accra' });

/** P1-SAFE: driver reports (forward to MTTD, NRSA or the operator), ratings, emergency numbers. */
export default function SafetyPage() {
  const [tab, setTab] = useState<Tab>('reports');
  return (
    <AdminShell title="Safety">
      <div className="tabs">
        <button className={tab === 'reports' ? 'on' : undefined} onClick={() => setTab('reports')}>Driver reports</button>
        <button className={tab === 'ratings' ? 'on' : undefined} onClick={() => setTab('ratings')}>Driver ratings</button>
        <button className={tab === 'contacts' ? 'on' : undefined} onClick={() => setTab('contacts')}>Emergency numbers</button>
      </div>
      {tab === 'reports' && <DriverReports />}
      {tab === 'ratings' && <DriverRatings />}
      {tab === 'contacts' && <EmergencyContacts />}
    </AdminShell>
  );
}

interface DriverReport {
  id: string;
  created_at: string;
  occurred_at: string;
  kind: string;
  vehicle_plate: string | null;
  note: string | null;
  photo_paths: string[];
  status: string;
  forwarded_to: string | null;
  staff_note: string | null;
  route: RouteJoin;
}

function DriverReports() {
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState<DriverReport[] | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [expired, setExpired] = useState<{ report_id: string; photo_paths: string[] }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    const { data, error: err } = await supabase
      .from('driver_reports')
      .select(`id, created_at, occurred_at, kind, vehicle_plate, note, photo_paths, status, forwarded_to, staff_note, ${ROUTE}`)
      .eq('status', status)
      .order('created_at', { ascending: status === 'pending' })
      .limit(100);
    if (err) return setError(describeError(err));
    const reports = data as unknown as DriverReport[];
    setRows(reports);
    // Photos are private: show them through links that expire after 10 minutes.
    const paths = reports.flatMap((r) => r.photo_paths);
    if (paths.length) {
      const signed = await supabase.storage.from('report-photos').createSignedUrls(paths, 600);
      if (signed.data) {
        const urls: Record<string, string> = {};
        for (const s of signed.data) if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;
        setPhotos(urls);
      }
    }
    const old = await supabase.rpc('expired_report_photos');
    if (!old.error) setExpired(old.data as typeof expired);
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handle(id: string, next: 'forwarded' | 'closed' | 'rejected', forwardedTo: string, staffNote: string) {
    setError(null);
    const { error: err } = await supabase.rpc('handle_driver_report', {
      p_id: id,
      p_status: next,
      p_forwarded_to: forwardedTo,
      p_staff_note: staffNote,
    });
    if (err) return setError(err.code === '22023' ? 'Say who you forwarded it to (for example "MTTD Accra").' : describeError(err));
    setRows((current) => current?.filter((r) => r.id !== id) ?? null);
  }

  async function deleteExpiredPhotos() {
    const paths = expired.flatMap((e) => e.photo_paths);
    const removed = await supabase.storage.from('report-photos').remove(paths);
    if (removed.error) return setError(describeError(removed.error));
    const { error: err } = await supabase.rpc('forget_report_photos', { p_ids: expired.map((e) => e.report_id) });
    if (err) return setError(describeError(err));
    setNotice(`Deleted ${paths.length} photo(s) older than 90 days.`);
    setExpired([]);
  }

  return (
    <>
      <div className="row">
        <label>
          Show
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">Waiting for review</option>
            <option value="forwarded">Forwarded</option>
            <option value="closed">Closed</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
      </div>
      <p className="muted">
        Check the report, then forward it to whoever can act (MTTD, NRSA, the bus company or union) and note who. Reporters stay anonymous: never share their details.
      </p>
      {expired.length > 0 && (
        <p className="row">
          <span>{expired.reduce((n, e) => n + e.photo_paths.length, 0)} photo(s) are older than 90 days and must be deleted.</span>
          <button className="secondary" onClick={deleteExpiredPhotos}>Delete now</button>
        </p>
      )}
      {notice && <p className="ok">{notice}</p>}
      {error && <p className="error">{error}</p>}
      {!rows && !error && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && <p>Nothing here.</p>}
      {rows?.map((r) => (
        <ReportCard key={r.id} report={r} photos={photos} onHandle={handle} />
      ))}
    </>
  );
}

function ReportCard({
  report: r,
  photos,
  onHandle,
}: {
  report: DriverReport;
  photos: Record<string, string>;
  onHandle: (id: string, next: 'forwarded' | 'closed' | 'rejected', forwardedTo: string, staffNote: string) => void;
}) {
  const [forwardedTo, setForwardedTo] = useState(r.forwarded_to ?? '');
  const [staffNote, setStaffNote] = useState(r.staff_note ?? '');
  return (
    <section className="card" aria-label={`Report: ${REPORT_KINDS[r.kind] ?? r.kind}`}>
      <h2>
        {REPORT_KINDS[r.kind] ?? r.kind} {r.vehicle_plate && <span className="pill">{r.vehicle_plate}</span>}
      </h2>
      <p className="muted">
        Happened {when(r.occurred_at)} · sent {when(r.created_at)} · {routeName(r.route)}
      </p>
      {r.note && <p>{r.note}</p>}
      {r.photo_paths.length > 0 && (
        <div className="row">
          {r.photo_paths.map((p) =>
            photos[p] ? (
              <a key={p} href={photos[p]} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photos[p]} alt="Vehicle photo" className="thumb" />
              </a>
            ) : (
              <span key={p} className="pill">photo</span>
            ),
          )}
        </div>
      )}
      <div className="row wrap">
        <label>
          Forwarded to
          <input value={forwardedTo} placeholder="MTTD Accra" onChange={(e) => setForwardedTo(e.target.value)} />
        </label>
        <label>
          Staff note
          <input value={staffNote} placeholder="Called the desk, ref 123" onChange={(e) => setStaffNote(e.target.value)} />
        </label>
        <button onClick={() => onHandle(r.id, 'forwarded', forwardedTo, staffNote)}>Mark forwarded</button>
        <button className="secondary" onClick={() => onHandle(r.id, 'closed', forwardedTo, staffNote)}>Close</button>
        <button className="secondary" onClick={() => onHandle(r.id, 'rejected', forwardedTo, staffNote)}>Reject</button>
      </div>
    </section>
  );
}

interface Rating {
  id: string;
  created_at: string;
  rating: number;
  tags: string[];
  vehicle_plate: string | null;
  comment: string | null;
  route: RouteJoin;
}

function DriverRatings() {
  const [rows, setRows] = useState<Rating[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase
      .from('driver_ratings')
      .select(`id, created_at, rating, tags, vehicle_plate, comment, ${ROUTE}`)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error: err }) => (err ? setError(describeError(err)) : setRows(data as unknown as Rating[])));
  }, []);

  const average = rows && rows.length ? (rows.reduce((n, r) => n + r.rating, 0) / rows.length).toFixed(1) : null;

  return (
    <>
      {error && <p className="error">{error}</p>}
      {!rows && !error && <p className="muted">Loading…</p>}
      {average && (
        <p>
          Average <strong>{average} ★</strong> from the latest {rows!.length} rating(s).
        </p>
      )}
      {rows && rows.length === 0 && <p>No ratings yet.</p>}
      {rows && rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Sent</th>
              <th>Stars</th>
              <th>Route</th>
              <th>Plate</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{when(r.created_at)}</td>
                <td>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</td>
                <td>{routeName(r.route)}</td>
                <td>{r.vehicle_plate ?? '—'}</td>
                <td>
                  {r.tags.map((tag) => TAG_LABELS[tag] ?? tag).join(', ')}
                  {r.comment && <div className="muted">{r.comment}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  kind: string;
  note: string | null;
  sort_order: number;
  is_active: boolean;
}

const EMPTY_CONTACT = { id: null as string | null, name: '', phone: '', kind: 'road_safety', note: '', sort_order: '100', is_active: true };

function EmergencyContacts() {
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [draft, setDraft] = useState(EMPTY_CONTACT);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('emergency_contacts')
      .select('id, name, phone, kind, note, sort_order, is_active')
      .order('sort_order');
    if (err) setError(describeError(err));
    else setRows(data as Contact[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    const row = {
      name: draft.name.trim(),
      phone: draft.phone.replace(/[\s-]/g, ''),
      kind: draft.kind,
      note: draft.note.trim() || null,
      sort_order: Number(draft.sort_order) || 100,
      is_active: draft.is_active,
    };
    const { error: err } = draft.id
      ? await supabase.from('emergency_contacts').update(row).eq('id', draft.id)
      : await supabase.from('emergency_contacts').insert(row);
    if (err) {
      return setError(err.code === '23514' ? 'Check the number: digits only, for example 0302123456 or 112.' : describeError(err));
    }
    setSaved(`Saved ${row.name}.`);
    setDraft(EMPTY_CONTACT);
    void load();
  }

  return (
    <>
      <form className="grid" onSubmit={save}>
        <h2 className="full">{draft.id ? `Edit ${draft.name}` : 'Add a number'}</h2>
        <label>
          Name shown in the app
          <input value={draft.name} required placeholder="MTTD Accra" onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        </label>
        <label>
          Phone number
          <input value={draft.phone} required inputMode="tel" placeholder="0302123456" onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} />
        </label>
        <label>
          Type
          <select value={draft.kind} onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}>
            {CONTACT_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
        <label>
          Note (optional)
          <input value={draft.note} placeholder="24 hours" onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
        </label>
        <label>
          Order (lower shows first)
          <input value={draft.sort_order} inputMode="numeric" onChange={(e) => setDraft((d) => ({ ...d, sort_order: e.target.value }))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))} />
          Shown in the app
        </label>
        <div className="row full">
          <button type="submit">{draft.id ? 'Save changes' : 'Add number'}</button>
          {draft.id && (
            <button type="button" className="secondary" onClick={() => setDraft(EMPTY_CONTACT)}>Cancel</button>
          )}
          {error && <span className="error">{error}</span>}
          {saved && <span className="ok">{saved}</span>}
        </div>
      </form>
      <p className="muted">Call each number to confirm it works before adding it. The app saves this list on the phone so it works without data.</p>
      {rows && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Number</th>
              <th>Type</th>
              <th>Note</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.name} {!c.is_active && <span className="pill">hidden</span>}
                </td>
                <td className="num">{c.phone}</td>
                <td>{CONTACT_KINDS.find((k) => k.value === c.kind)?.label ?? c.kind}</td>
                <td>{c.note ?? '—'}</td>
                <td>
                  <button
                    className="secondary"
                    onClick={() =>
                      setDraft({ id: c.id, name: c.name, phone: c.phone, kind: c.kind, note: c.note ?? '', sort_order: String(c.sort_order), is_active: c.is_active })
                    }
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
