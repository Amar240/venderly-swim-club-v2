import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";

export const MAX_INGEST_ROWS = 5_000;
export const MAX_INGEST_COLUMNS = 100;
export const HEADER_SCAN_ROWS = 10;
const HEADER_VALIDATION_ROWS = 50;
const HEADER_CANDIDATE_LIMIT = 3;
const FAST_PATH_SCORE = 0.65;

export type HeaderDetectionMethod = "auto" | "manual";

export type HeaderCandidate = {
  index: number;
  score: number;
};

export type HeaderSelection = {
  headerRowIndex: number;
  detectedBy: HeaderDetectionMethod;
  candidateRows: Array<{ index: number; cells: string[] }>;
};

export type ParsedTable = {
  headers: string[];
  rows: string[][];
  warnings: string[];
  grid: string[][];
  structure: HeaderSelection;
};

export type ParsedCsv = ParsedTable;

export type HeaderCandidateValidator = (headers: string[], rows: string[][], headerRowIndex: number) => number;

export type ParseTableOptions = {
  headerRowIndex?: number;
  detectedBy?: HeaderDetectionMethod;
  validateCandidate?: HeaderCandidateValidator;
};

export class InvalidHeaderRowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidHeaderRowError";
  }
}

const normalizeGrid = (records: unknown[][]): string[][] =>
  records.map((row) => row.map((value) => String(value ?? "").trim()));

const isBlankRow = (row: string[]): boolean => row.every((value) => value.length === 0);

const nonEmptyWidth = (row: string[]): number => row.filter(Boolean).length;

const modalColumnCount = (grid: string[][]): number => {
  const counts = new Map<number, number>();

  for (const row of grid) {
    const width = row.length;
    if (width > 0) {
      counts.set(width, (counts.get(width) ?? 0) + 1);
    }
  }

  let mode = 0;
  let frequency = 0;
  for (const [width, count] of counts) {
    if (count > frequency || (count === frequency && width > mode)) {
      mode = width;
      frequency = count;
    }
  }

  return mode;
};

const valueType = (value: string): "numeric" | "text" => {
  const normalized = value.replace(/[$,%()+\-\s]/g, "");
  return normalized.length > 0 && /^\d+(?:\.\d+)?$/.test(normalized) ? "numeric" : "text";
};

const columnTypeConsistency = (grid: string[][], headerRowIndex: number, columnCount: number): number => {
  const sample = grid.slice(headerRowIndex + 1, headerRowIndex + 1 + HEADER_VALIDATION_ROWS);
  if (sample.length === 0 || columnCount === 0) {
    return 0;
  }

  let consistencyTotal = 0;
  let populatedColumns = 0;
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const values = sample.map((row) => row[columnIndex] ?? "").filter(Boolean);
    if (values.length === 0) {
      continue;
    }

    const numericCount = values.filter((value) => valueType(value) === "numeric").length;
    consistencyTotal += Math.max(numericCount, values.length - numericCount) / values.length;
    populatedColumns += 1;
  }

  return populatedColumns > 0 ? consistencyTotal / populatedColumns : 0;
};

export const scoreHeaderCandidate = (grid: string[][], index: number): number => {
  const row = grid[index] ?? [];
  const cells = row.filter(Boolean);
  if (cells.length === 0) {
    return 0;
  }

  const modalWidth = modalColumnCount(grid);
  const widthCloseness = modalWidth > 0
    ? Math.max(0, 1 - Math.abs(cells.length - modalWidth) / modalWidth)
    : 0;
  const textRatio = cells.filter((value) => !/\d/.test(value)).length / cells.length;
  const distinctRatio = new Set(cells.map((value) => value.toLowerCase())).size / cells.length;
  const typeConsistency = columnTypeConsistency(grid, index, row.length);

  return (
    widthCloseness * 0.4 +
    textRatio * 0.25 +
    distinctRatio * 0.15 +
    typeConsistency * 0.2
  );
};

export const rankHeaderCandidates = (grid: string[][]): HeaderCandidate[] =>
  grid
    .slice(0, HEADER_SCAN_ROWS)
    .map((_row, index) => ({ index, score: scoreHeaderCandidate(grid, index) }))
    .filter((candidate) => candidate.score > 0)
    .sort((first, second) => second.score - first.score || first.index - second.index);

export const materializeHeaderRow = (
  grid: string[][],
  headerRowIndex: number,
  detectedBy: HeaderDetectionMethod = "auto"
): ParsedTable => {
  if (!Number.isInteger(headerRowIndex) || headerRowIndex < 0 || headerRowIndex >= grid.length) {
    throw new InvalidHeaderRowError("The selected header row is outside the spreadsheet.");
  }
  if (headerRowIndex >= HEADER_SCAN_ROWS) {
    throw new InvalidHeaderRowError(`The selected header row must be within the first ${HEADER_SCAN_ROWS} rows.`);
  }

  const headers = (grid[headerRowIndex] ?? []).map((header) => header.trim());
  if (headers.length > MAX_INGEST_COLUMNS) {
    throw new Error(`The spreadsheet has too many columns. The maximum is ${MAX_INGEST_COLUMNS}.`);
  }

  const dataRows = grid.slice(headerRowIndex + 1).filter((row) => !isBlankRow(row));
  if (dataRows.length > MAX_INGEST_ROWS) {
    throw new Error(`The spreadsheet has too many rows. The maximum is ${MAX_INGEST_ROWS.toLocaleString("en-US")}.`);
  }

  const rows = dataRows.map((row) => headers.map((_header, index) => row[index] ?? ""));
  const warnings = headerRowIndex > 0
    ? [`Skipped ${headerRowIndex} introductory row${headerRowIndex === 1 ? "" : "s"} before the detected header.`]
    : [];
  const candidateRows = grid.slice(0, 8).map((row, index) => {
    const cells = [...row];
    while (cells.at(-1) === "") {
      cells.pop();
    }
    return { index, cells: cells.map((cell) => cell.slice(0, 40)) };
  });

  return {
    headers,
    rows,
    warnings,
    grid,
    structure: { headerRowIndex, detectedBy, candidateRows }
  };
};

export const detectHeaderRow = (
  grid: string[][],
  validateCandidate?: HeaderCandidateValidator
): number => {
  if (grid.length === 0) {
    return 0;
  }

  const ranked = rankHeaderCandidates(grid);
  if (ranked.length === 0) {
    return 0;
  }

  const validationCache = new Map<number, number>();
  const validate = (index: number): number => {
    const cached = validationCache.get(index);
    if (cached !== undefined) {
      return cached;
    }
    if (!validateCandidate) {
      return 0;
    }
    const table = materializeHeaderRow(grid, index);
    const validMemberships = validateCandidate(table.headers, table.rows.slice(0, HEADER_VALIDATION_ROWS), index);
    validationCache.set(index, validMemberships);
    return validMemberships;
  };

  const rowZero = ranked.find((candidate) => candidate.index === 0);
  if (rowZero && rowZero.score >= FAST_PATH_SCORE) {
    if (!validateCandidate || validate(0) > 0) {
      return 0;
    }
  }

  if (!validateCandidate) {
    return ranked[0]?.index ?? 0;
  }

  return ranked
    .slice(0, HEADER_CANDIDATE_LIMIT)
    .map((candidate) => ({ ...candidate, validMemberships: validate(candidate.index) }))
    .sort((first, second) => second.validMemberships - first.validMemberships || first.index - second.index)[0]
    ?.index ?? 0;
};

const buildParsedTable = (records: unknown[][], options: ParseTableOptions = {}): ParsedTable => {
  const grid = normalizeGrid(records);
  if (grid.length === 0) {
    return {
      headers: [],
      rows: [],
      warnings: [],
      grid: [],
      structure: {
        headerRowIndex: 0,
        detectedBy: options.detectedBy ?? (options.headerRowIndex === undefined ? "auto" : "manual"),
        candidateRows: []
      }
    };
  }

  const headerRowIndex = options.headerRowIndex ?? detectHeaderRow(grid, options.validateCandidate);
  return materializeHeaderRow(
    grid,
    headerRowIndex,
    options.detectedBy ?? (options.headerRowIndex === undefined ? "auto" : "manual")
  );
};

export const parseCsv = (text: string, options: ParseTableOptions = {}): ParsedCsv => {
  const records = parse(text, {
    bom: true,
    relaxColumnCount: true,
    skipEmptyLines: false
  }) as string[][];

  return buildParsedTable(records, options);
};

export const parseXlsx = (buffer: Buffer, options: ParseTableOptions = {}): ParsedTable => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return buildParsedTable([], options);
  }

  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    return buildParsedTable([], options);
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
    defval: "",
    blankrows: true,
    ...(range ? { range: { s: { r: 0, c: 0 }, e: range.e } } : {})
  }) as unknown[][];
  return buildParsedTable(records, options);
};
