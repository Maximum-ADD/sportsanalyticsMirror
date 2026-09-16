// A filtered slice of the platform's data, exported as a file for use
// elsewhere — the brief's own words for this requirement. CSV rather than
// JSON: it's what "open in a spreadsheet" analysis actually wants, and
// every field here is already a flat, non-nested value by the time a
// caller builds a ColumnSpec, so CSV's row/column shape loses nothing.

export interface ColumnSpec<T> {
  header: string;
  // Returning null/undefined renders as an empty cell, not the literal
  // string "null" — the same "missing stays visibly missing" rule this
  // project's derived stats already follow (see PlayerGameStat's schema
  // doc comment).
  value: (row: T) => string | number | null | undefined;
}

const FIELDS_NEEDING_QUOTES = /[",\r\n]/;

function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!FIELDS_NEEDING_QUOTES.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

// CRLF line endings throughout, per RFC 4180 — not just for the spec's own
// sake, but because Excel (still the single most common consumer of a
// "download as CSV" button) handles CRLF more reliably than a bare LF.
const CSV_LINE_ENDING = "\r\n";

export function toCsv<T>(rows: T[], columns: ColumnSpec<T>[]): string {
  const headerLine = columns.map((column) => escapeCsvField(column.header)).join(",");
  const dataLines = rows.map((row) => columns.map((column) => escapeCsvField(column.value(row))).join(","));
  return [headerLine, ...dataLines].join(CSV_LINE_ENDING) + CSV_LINE_ENDING;
}
