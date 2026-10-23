/**
 * Minimal CSV reader (RFC 4180): quoted fields, doubled quotes, commas and line breaks
 * inside quotes, CRLF or LF, and the byte-order mark Excel adds. Google Sheets, Excel and
 * KoboToolbox exports all fit this.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/^﻿/, '');

  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Header cell to a key: "Fare (GH¢)" -> "fare_gh", "Date observed" -> "date_observed". */
export function headerKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Rows as objects keyed by headerKey, with the 1-based spreadsheet line number. */
export function csvRecords(text: string): { line: number; values: Record<string, string> }[] {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const keys = header.map(headerKey);
  return body.map((cells, i) => ({
    line: i + 2,
    values: Object.fromEntries(keys.map((k, j) => [k, (cells[j] ?? '').trim()])),
  }));
}

/** Quotes a value for CSV output. */
export function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
