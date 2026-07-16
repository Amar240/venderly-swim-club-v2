import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";

export type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

export type ParsedTable = {
  headers: string[];
  rows: string[][];
};

export const parseCsv = (text: string): ParsedCsv => {
  const records = parse(text, {
    bom: true,
    relaxColumnCount: true,
    skipEmptyLines: true
  }) as string[][];

  const [headersRaw, ...rowsRaw] = records;

  if (!headersRaw) {
    return { headers: [], rows: [] };
  }

  const headers = headersRaw.map((header) => header.trim());
  const rows = rowsRaw.map((row) => headers.map((_header, index) => row[index]?.trim() ?? ""));

  return { headers, rows };
};

export const parseXlsx = (buffer: Buffer): ParsedTable => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return { headers: [], rows: [] };
  }

  const worksheet = workbook.Sheets[firstSheetName];

  if (!worksheet) {
    return { headers: [], rows: [] };
  }

  const records = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
    defval: ""
  }) as unknown[][];
  const [headersRaw, ...rowsRaw] = records;

  if (!headersRaw) {
    return { headers: [], rows: [] };
  }

  const headers = headersRaw.map((header) => String(header).trim());
  const rows = rowsRaw.map((row) => headers.map((_header, index) => String(row[index] ?? "").trim()));

  return { headers, rows };
};
