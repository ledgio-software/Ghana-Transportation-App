import { describe, expect, it } from 'vitest';
import {
  checkFareImport,
  checkStationImport,
  csvCell,
  parseCsv,
  parseDate,
  parseTime,
  type ReferenceData,
  resolveStation,
} from '../src';

describe('csv', () => {
  it('reads quotes, commas and line breaks inside quotes, CRLF and the Excel BOM', () => {
    const text = '﻿name,note\r\n"Circle, Accra","said ""hi""\nthen left"\r\n\r\nKasoa,\n';
    expect(parseCsv(text)).toEqual([
      ['name', 'note'],
      ['Circle, Accra', 'said "hi"\nthen left'],
      ['Kasoa', ''],
    ]);
  });

  it('quotes cells that need it', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "x"')).toBe('"say ""x"""');
    expect(csvCell(12)).toBe('12');
  });
});

describe('dates and times', () => {
  it('accepts ISO and day-first Ghanaian dates, rejects impossible ones', () => {
    expect(parseDate('2026-10-23')).toBe('2026-10-23');
    expect(parseDate('23/10/2026')).toBe('2026-10-23');
    expect(parseDate('3-4-2026')).toBe('2026-04-03');
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('10/23/2026')).toBeNull(); // US order: month 23 does not exist
    expect(parseDate('yesterday')).toBeNull();
  });

  it('normalises times', () => {
    expect(parseTime('5:00')).toBe('05:00');
    expect(parseTime('')).toBeNull();
    expect(parseTime('25:00')).toBeUndefined();
  });
});

describe('station import', () => {
  it('accepts good rows and reports bad ones with their line numbers', () => {
    const csv = [
      'Name,Short ID,Type,City,Region,Latitude,Longitude,GhanaPost GPS',
      'Kaneshie,,lorry station,Accra,Greater Accra,5.566,-0.236,ga-123-4567',
      'Swapped,,stop,Accra,Greater Accra,-0.236,5.566,',
      'Kaneshie,,stop,Accra,Atlantis,5.5,-0.2,',
    ].join('\n');
    const res = checkStationImport(csv);
    expect(res.missingColumns).toEqual([]);
    expect(res.valid).toEqual([
      {
        line: 2,
        name: 'Kaneshie',
        slug: 'kaneshie',
        kind: 'lorry_station',
        city: 'Accra',
        region: 'Greater Accra',
        latitude: 5.566,
        longitude: -0.236,
        ghanapost_gps: 'GA-123-4567',
      },
    ]);
    expect(res.errors.map((e) => e.line)).toEqual([3, 4]);
    expect(res.errors[0]!.messages.join(' ')).toMatch(/latitude.*not in Ghana/);
    expect(res.errors[1]!.messages.join(' ')).toMatch(/region "Atlantis"/);
    expect(res.errors[1]!.messages.join(' ')).toMatch(/same short id as line 2/);
  });

  it('names missing columns instead of failing every row', () => {
    expect(checkStationImport('name,city\nX,Accra').missingColumns).toEqual(['latitude', 'longitude']);
  });
});

const ref: ReferenceData = {
  stations: [
    { id: 's-circle', slug: 'kwame-nkrumah-circle', name: 'Kwame Nkrumah Circle', city: 'Accra' },
    { id: 's-kasoa', slug: 'kasoa', name: 'Kasoa', city: 'Kasoa' },
    { id: 's-station-acc', slug: 'tema-station-accra', name: 'Tema Station', city: 'Accra' },
    { id: 's-station-tema', slug: 'tema-station-tema', name: 'Tema Station', city: 'Tema' },
  ],
  operators: [{ id: 'o-gprtu', slug: 'gprtu', name: 'GPRTU' }],
  vehicleTypes: [
    { code: 'trotro', name: 'Trotro' },
    { code: 'bus', name: 'Intercity bus' },
  ],
};

describe('station lookup', () => {
  it('finds by short id, name, or name with city', () => {
    expect(resolveStation('kasoa', ref.stations).id).toBe('s-kasoa');
    expect(resolveStation('kwame nkrumah circle', ref.stations).id).toBe('s-circle');
    expect(resolveStation('Tema Station (Tema)', ref.stations).id).toBe('s-station-tema');
    expect(resolveStation('Tema Station', ref.stations).error).toMatch(/several cities/);
    expect(resolveStation('Circle', ref.stations).error).toMatch(/not a known station/);
  });
});

describe('fare import', () => {
  const header =
    'From station,To station,Route type,Operator,Vehicle type,Class,Fare GHS,Official,Date observed,Source,Source type,Departure,First departure,Last departure,Collector,Photo link';

  it('turns a field-team row into a fare', () => {
    const csv = `${header}\nKwame Nkrumah Circle,Kasoa,intracity,GPRTU,Trotro,,11.50,yes,23/10/2026,Circle board Oct 2026,station board,when full,5:00,21:00,Ama,https://x/p.jpg`;
    const res = checkFareImport(csv, ref);
    expect(res.errors).toEqual([]);
    expect(res.valid).toEqual([
      {
        line: 2,
        origin_station_id: 's-circle',
        destination_station_id: 's-kasoa',
        route_kind: 'intracity',
        operator_id: 'o-gprtu',
        vehicle_type: 'trotro',
        class: 'standard',
        amount_pesewas: 1150,
        is_official: true,
        observed_on: '2026-10-23',
        source_name: 'Circle board Oct 2026',
        source_kind: 'station_board',
        departure_mode: 'fill_and_go',
        first_departure: '05:00',
        last_departure: '21:00',
        collected_by: 'Ama',
        evidence_url: 'https://x/p.jpg',
      },
    ]);
  });

  it('collects every problem on a row', () => {
    const csv = `${header}\nCircle,Kasoa,by air,Unknown Co,okada,,abc,maybe,31/02/2026,,,sometimes,25:00,,,`;
    const [err] = checkFareImport(csv, ref).errors;
    expect(err!.line).toBe(2);
    expect(err!.messages).toHaveLength(9);
  });

  it('rejects dates in the future', () => {
    const csv = `${header}\nkasoa,kwame-nkrumah-circle,,,trotro,,10,no,01/01/2099,,,,,,,`;
    expect(checkFareImport(csv, ref).errors[0]!.messages).toContain('date observed is in the future');
  });
});
