'use client';

import {
  checkFareImport,
  checkStationImport,
  csvCell,
  FARE_COLUMNS,
  type ImportCheck,
  type ReferenceData,
  STATION_COLUMNS,
} from '@gta/shared';
import { type ChangeEvent, useState } from 'react';
import { AdminShell, describeError } from '@/components/AdminShell';
import { supabase } from '@/lib/supabase';

type Kind = 'stations' | 'fares';

interface RowResult {
  line: number;
  status: 'created' | 'updated' | 'confirmed' | 'changed' | 'skipped' | 'error';
  message?: string;
}

const EXAMPLES: Record<Kind, string[][]> = {
  stations: [
    [...STATION_COLUMNS],
    ['Kwame Nkrumah Circle', 'kwame-nkrumah-circle', 'lorry station', 'Accra', 'Greater Accra', '5.5717', '-0.2166', 'GA-000-0000'],
  ],
  fares: [
    [...FARE_COLUMNS],
    ['Kwame Nkrumah Circle', 'Kasoa', 'intracity', 'GPRTU', 'trotro', 'standard', '11.00', 'yes', '23/10/2026',
      'Circle station board, Oct 2026', 'station board', 'when full', '05:00', '21:00', 'Ama Mensah', ''],
  ],
};

const BATCH = 200;
const rows = (n: number) => `${n} row${n === 1 ? '' : 's'}`;
const STATUS_LABELS: Record<RowResult['status'], string> = {
  created: 'Added',
  updated: 'Updated',
  confirmed: 'Confirmed (same price)',
  changed: 'Price changed',
  skipped: 'Skipped',
  error: 'Failed',
};

function downloadTemplate(kind: Kind) {
  const csv = EXAMPLES[kind].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${kind}-template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function loadReferenceData(): Promise<ReferenceData> {
  const [st, op, vt] = await Promise.all([
    supabase.from('stations').select('id, slug, name, city'),
    supabase.from('operators').select('id, slug, name'),
    supabase.from('vehicle_types').select('code, name'),
  ]);
  const err = st.error ?? op.error ?? vt.error;
  if (err) throw new Error(describeError(err));
  return {
    stations: st.data as ReferenceData['stations'],
    operators: op.data as ReferenceData['operators'],
    vehicleTypes: vt.data as ReferenceData['vehicleTypes'],
  };
}

/** Bulk import of the field team's spreadsheets (Phase 0 doc 4.2), checked before anything is saved. */
export default function ImportPage() {
  const [kind, setKind] = useState<Kind>('fares');
  const [fileName, setFileName] = useState<string | null>(null);
  const [check, setCheck] = useState<ImportCheck<{ line: number }> | null>(null);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset(next: Kind) {
    setKind(next);
    setFileName(null);
    setCheck(null);
    setResults(null);
    setError(null);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setResults(null);
    setFileName(file.name);
    if (!/\.csv$/i.test(file.name)) {
      setCheck(null);
      setError('Choose a .csv file. In Google Sheets: File → Download → CSV. In Excel: Save As → CSV UTF-8.');
      return;
    }
    try {
      const text = await file.text();
      setCheck(kind === 'stations' ? checkStationImport(text) : checkFareImport(text, await loadReferenceData()));
    } catch (err) {
      setCheck(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function runImport() {
    if (!check) return;
    setBusy(true);
    setError(null);
    const all: RowResult[] = [];
    try {
      for (let i = 0; i < check.valid.length; i += BATCH) {
        const { data, error: err } = await supabase.rpc(kind === 'stations' ? 'import_stations' : 'import_fares', {
          rows: check.valid.slice(i, i + BATCH),
        });
        if (err) throw new Error(describeError(err));
        all.push(...(data as RowResult[]));
        setResults([...all]);
      }
    } catch (err) {
      setError(`${err instanceof Error ? err.message : String(err)} Rows before this point were saved.`);
    } finally {
      setBusy(false);
      setCheck(null);
    }
  }

  const counts = results?.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  const problems = results?.filter((r) => r.status === 'skipped' || r.status === 'error') ?? [];

  return (
    <AdminShell title="Import a spreadsheet">
      <div className="tabs">
        <button className={kind === 'fares' ? 'on' : undefined} onClick={() => reset('fares')}>Fares</button>
        <button className={kind === 'stations' ? 'on' : undefined} onClick={() => reset('stations')}>Stations</button>
      </div>

      <ol className="muted">
        <li>
          Start from the template so the columns match.{' '}
          <button className="secondary" onClick={() => downloadTemplate(kind)}>Download {kind} template</button>
        </li>
        <li>Fill one row per {kind === 'fares' ? 'fare seen' : 'station'}. Dates can be written 23/10/2026.</li>
        <li>Save it as CSV (Google Sheets: File → Download → CSV) and choose it below.</li>
        {kind === 'fares' && <li>Import stations and add operators first: fares refer to them by name or short id.</li>}
      </ol>

      <label>
        CSV file
        <input type="file" accept=".csv,text/csv" onChange={onFile} disabled={busy} />
      </label>
      {fileName && <p className="muted">{fileName}</p>}
      {error && <p className="error">{error}</p>}

      {check && check.missingColumns.length > 0 && (
        <p className="error">
          Missing columns: {check.missingColumns.join(', ')}. Use the template headers.
        </p>
      )}

      {check && check.missingColumns.length === 0 && (
        <>
          <h2>Check before importing</h2>
          <p>
            <strong className="ok">{rows(check.valid.length)} ready</strong>
            {check.errors.length > 0 && (
              <>
                {' · '}
                <strong className="error">{rows(check.errors.length)} with problems</strong> (these will not be imported;
                fix them in the spreadsheet and import the file again)
              </>
            )}
          </p>
          {check.errors.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Problems</th>
                </tr>
              </thead>
              <tbody>
                {check.errors.map((e) => (
                  <tr key={e.line}>
                    <td className="num">{e.line}</td>
                    <td>{e.messages.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p>
            <button onClick={runImport} disabled={busy || check.valid.length === 0}>
              {busy ? 'Importing…' : `Import ${rows(check.valid.length)}`}
            </button>
          </p>
        </>
      )}

      {results && (
        <>
          <h2>Result</h2>
          <p>
            {Object.entries(counts ?? {})
              .map(([status, n]) => `${STATUS_LABELS[status as RowResult['status']]}: ${n}`)
              .join(' · ')}
          </p>
          {problems.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Result</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {problems.map((r) => (
                  <tr key={r.line}>
                    <td className="num">{r.line}</td>
                    <td>{STATUS_LABELS[r.status]}</td>
                    <td>{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </AdminShell>
  );
}
