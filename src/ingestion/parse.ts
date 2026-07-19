import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { normalizeHeader, SYNONYM_LOOKUP } from "./synonyms";

export const MAX_INGEST_ROWS = 5_000;
export const MAX_INGEST_COLUMNS = 100;
const HEADER_SCAN_ROWS = 10;

export type ParsedCsv = {
  headers: string[];
  rows: string[][];
  warnings: string[];
};

export type ParsedTable = {
  headers: string[];
  rows: string[][];
  warnings: string[];
};

const headerScore = (row: string[]): number =>
  row.reduce((score, value) => {
    const normalized = normalizeHeader(String(value));
    const isKnownScalar = normalized in SYNONYM_LOOKUP;
    const isWidePerson = /^(\d+)(st|nd|rd|th)member(fullname|phone|age)$/.test(normalized);
    const isLongStructure = ["householdid", "membershipid", "isprimary", "membername"].includes(normalized);
    return score + (isKnownScalar || isWidePerson || isLongStructure ? 1 : 0);
  }, 0);

const findHeaderRow = (records: unknown[][]): number => {
  if (records.length < 2) {
    return 0;
  }

  const scored = records.slice(0, HEADER_SCAN_ROWS).map((row, index) => ({
    index,
    score: headerScore(row.map((value) => String(value ?? "")))
  }));
  const firstScore = scored[0]?.score ?? 0;
  const best = scored.reduce((current, candidate) => (candidate.score > current.score ? candidate : current));

  return best.index > 0 && best.score >= 2 && best.score >= firstScore + 2 ? best.index : 0;
};

const buildParsedTable = (records: unknown[][]): ParsedTable => {
  if (records.length === 0) {
    return { headers: [], rows: [], warnings: [] };
  }

  const headerRowIndex = findHeaderRow(records);
  const headersRaw = records[headerRowIndex] ?? [];
  const rowsRaw = records.slice(headerRowIndex + 1);
  const headers = headersRaw.map((header) => String(header ?? "").trim());

  if (headers.length > MAX_INGEST_COLUMNS) {
    throw new Error(`The spreadsheet has too many columns. The maximum is ${MAX_INGEST_COLUMNS}.`);
  }

  if (rowsRaw.length > MAX_INGEST_ROWS) {
    throw new Error(`The spreadsheet has too many rows. The maximum is ${MAX_INGEST_ROWS.toLocaleString("en-US")}.`);
  }

  const rows = rowsRaw.map((row) => headers.map((_header, index) => String(row[index] ?? "").trim()));
  const warnings = headerRowIndex > 0
    ? [`Skipped ${headerRowIndex} introductory row${headerRowIndex === 1 ? "" : "s"} before the detected header.`]
    : [];

  return { headers, rows, warnings };
};

export const parseCsv = (text: string): ParsedCsv => {
  const records = parse(text, {
    bom: true,
    relaxColumnCount: true,
    skipEmptyLines: true
  }) as string[][];

  return buildParsedTable(records);
};

export const parseXlsx = (buffer: Buffer): ParsedTable => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return { headers: [], rows: [], warnings: [] };
  }

  const worksheet = workbook.Sheets[firstSheetName];

  if (!worksheet) {
    return { headers: [], rows: [], warnings: [] };
  }

  const range = worksheet["!ref"] ? XLSX.utils.decode_range(worksheet["!ref"]) : null;
  if (range && range.e.c - range.s.c + 1 > MAX_INGEST_COLUMNS) {
    throw new Error(`The spreadsheet has too many columns. The maximum is ${MAX_INGEST_COLUMNS}.`);
  }
  if (range && range.e.r - range.s.r > MAX_INGEST_ROWS + HEADER_SCAN_ROWS) {
    throw new Error(`The spreadsheet has too many rows. The maximum is ${MAX_INGEST_ROWS.toLocaleString("en-US")}.`);
  }

  const records = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
    defval: ""
  }) as unknown[][];
  return buildParsedTable(records);
};
