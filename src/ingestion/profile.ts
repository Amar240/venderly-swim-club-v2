export type InferredColumnType = "string" | "number" | "empty";

export type ColumnProfile = {
  name: string;
  nullPct: number;
  cardinality: number;
  inferredType: InferredColumnType;
  isConstant: boolean;
};

const isEmpty = (value: string): boolean => value.trim().length === 0;

const isNumeric = (value: string): boolean => {
  if (isEmpty(value)) {
    return false;
  }

  return Number.isFinite(Number(value.replace(/[$,]/g, "").trim()));
};

export const profileColumns = (headers: string[], rows: string[][]): ColumnProfile[] =>
  headers.map((name, index) => {
    const values = rows.map((row) => row[index] ?? "");
    const nonEmpty = values.map((value) => value.trim()).filter((value) => value.length > 0);
    const unique = new Set(nonEmpty);
    const nullPct = values.length === 0 ? 1 : (values.length - nonEmpty.length) / values.length;
    const inferredType: InferredColumnType =
      nonEmpty.length === 0 ? "empty" : nonEmpty.every(isNumeric) ? "number" : "string";

    return {
      name,
      nullPct,
      cardinality: unique.size,
      inferredType,
      isConstant: nonEmpty.length > 0 && unique.size === 1
    };
  });
