import { parse } from "csv-parse/sync";

export type ParsedCsv = {
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
