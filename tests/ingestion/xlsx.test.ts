import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ingestCsv, ingestFile } from "../../src/ingestion/normalize";
import { parseXlsx } from "../../src/ingestion/parse";

const fixturePath = (name: string): string => join(process.cwd(), "tests", "fixtures", "ingestion", name);

describe("parseXlsx", () => {
  it("parses the first worksheet into string headers and rows", () => {
    const buffer = readFileSync(fixturePath("base_wedgewood_wide.xlsx"));
    const parsed = parseXlsx(buffer);
    const phoneColumn = parsed.headers.indexOf("1st Member Phone");

    expect(parsed.headers).toHaveLength(41);
    expect(parsed.rows).toHaveLength(40);
    expect(phoneColumn).toBeGreaterThanOrEqual(0);
    expect(typeof parsed.rows[0]?.[phoneColumn]).toBe("string");
    expect(parsed.rows[0]?.[phoneColumn]).not.toBe("");
  });
});

describe("ingestFile", () => {
  it("ingests xlsx files equivalently to csv for key canonical fields", () => {
    const xlsxBuffer = readFileSync(fixturePath("base_wedgewood_wide.xlsx"));
    const csvText = readFileSync(fixturePath("base_wedgewood_wide.csv"), "utf8");
    const xlsxResult = ingestFile(xlsxBuffer, "base_wedgewood_wide.xlsx");
    const csvResult = ingestCsv(csvText);
    const xlsxFirst = xlsxResult.memberships[0]!;
    const csvFirst = csvResult.memberships[0]!;

    expect(xlsxResult.memberships).toHaveLength(40);
    expect(csvResult.memberships).toHaveLength(40);
    expect(xlsxFirst.accountHolderName).toBe("Caleb Lewis");
    expect(xlsxFirst.accountHolderName).toBe(csvFirst.accountHolderName);
    expect(xlsxFirst.phone).toBe(csvFirst.phone);
    expect(xlsxFirst.persons).toEqual(csvFirst.persons);
  });

  it("throws a friendly error for Apple Numbers files", () => {
    expect(() => ingestFile(Buffer.from("not a real numbers file"), "x.numbers")).toThrow(
      "Apple Numbers files are not supported. Please export the spreadsheet to Excel (.xlsx) or CSV."
    );
  });
});
