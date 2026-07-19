import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  detectHeaderRow,
  parseCsv,
  scoreHeaderCandidate
} from "../../src/ingestion/parse";

const fixture = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("scoreHeaderCandidate", () => {
  it("scores a single-cell title below a real wide header", () => {
    const grid = [
      ["Lakeside Aquatic Association"],
      ["Name", "Email", "Phone", "Member Count"],
      ["Caleb Lewis", "caleb@example.com", "3025550100", "3"],
      ["Ada Lovelace", "ada@example.com", "3025550101", "2"]
    ];

    expect(scoreHeaderCandidate(grid, 0)).toBeLessThan(scoreHeaderCandidate(grid, 1));
  });
});

describe("detectHeaderRow", () => {
  it("preserves blank preamble indexes and selects the hard fixture header", () => {
    const parsed = parseCsv(fixture("test-files/ai-mapping-hard.csv"), {
      validateCandidate: (_headers, _rows, index) => index === 4 ? 30 : 0
    });

    expect(parsed.structure.headerRowIndex).toBe(4);
    expect(parsed.structure.candidateRows[3]).toEqual({ index: 3, cells: [] });
  });

  it("selects row zero for the clean fixture with one validation pass", () => {
    const validate = vi.fn(() => 40);
    const parsed = parseCsv(fixture("tests/fixtures/ingestion/base_wedgewood_wide.csv"), {
      validateCandidate: validate
    });

    expect(parsed.structure.headerRowIndex).toBe(0);
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it("validates no more than the top three candidates for difficult files", () => {
    const parsed = parseCsv(fixture("test-files/ai-mapping-hard.csv"));
    const validate = vi.fn((_headers: string[], _rows: string[][], index: number) => index === 4 ? 30 : 0);

    expect(detectHeaderRow(parsed.grid, validate)).toBe(4);
    expect(validate.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("rejects manual rows outside the first ten physical rows", () => {
    expect(() => parseCsv(fixture("test-files/ai-mapping-hard.csv"), { headerRowIndex: 10 })).toThrow(
      "within the first 10 rows"
    );
  });
});
