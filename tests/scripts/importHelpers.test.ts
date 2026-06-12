import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatFamilyNames,
  getAllergiesField,
  getField,
  getFirstField,
  getMemberNameField,
  getMemberPhoneField,
  getRelationshipsField,
  normalizeFirstName,
  normalizeName,
  normalizePaymentStatus,
  parseArgs,
  parseBool,
  parseChildrenAges,
  parseCsv,
  parseFamilyMembers,
  parseGhlDate,
  parseName,
  parsePaymentAmountCents,
  parseRelationships,
  printDryRunSummary,
  resolveTier,
  splitMultivalue,
  tierFromMemberCount,
  trimOrNull,
  cleanPhoneNumber
} from "../../scripts/lib/importMembersHelpers";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseArgs", () => {
  it("parses import flags and explicit csv path", () => {
    expect(parseArgs(["--dry-run", "--upsert", "--include-pending", "members.csv"])).toEqual({
      dryRun: true,
      upsert: true,
      skipPending: false,
      csvPath: "members.csv"
    });
  });

  it("skips pending rows by default", () => {
    expect(parseArgs([])).toEqual({ dryRun: false, upsert: false, skipPending: true, csvPath: undefined });
  });
});

describe("parseCsv", () => {
  it("parses quoted fields, escaped quotes, and trims headers and values", () => {
    const rows = parseCsv(' Name ,Note\r\n"Kelly, O","Said ""hi"""\r\n');

    expect(rows).toEqual([{ Name: "Kelly, O", Note: 'Said "hi"' }]);
  });

  it("returns an empty array for blank content", () => {
    expect(parseCsv("\n\n")).toEqual([]);
  });
});

describe("field helpers", () => {
  const row = {
    "Member 1 Name": " Tyler Oldis ",
    "Member 1 Phone": " 302-555-1111 ",
    "All names and family relationships on membership:": "Son: Tyler",
    "Do you have any allergies, medical concerns, or require any special accommodations? If so, please describe:": "Peanuts"
  };

  it("reads and trims fields", () => {
    expect(getField(row, "Member 1 Name")).toBe("Tyler Oldis");
    expect(getField(row, "missing")).toBe("");
  });

  it("returns the first present field", () => {
    expect(getFirstField(row, ["missing", "Member 1 Name"])).toBe("Tyler Oldis");
    expect(getFirstField(row, ["missing"])).toBe("");
  });

  it("reads final CSV compatible family fields", () => {
    expect(getMemberNameField(row, 1)).toBe("Tyler Oldis");
    expect(getMemberPhoneField(row, 1)).toBe("302-555-1111");
    expect(getRelationshipsField(row)).toBe("Son: Tyler");
    expect(getAllergiesField(row)).toBe("Peanuts");
  });
});

describe("normalizePaymentStatus", () => {
  it("trims and lowercases payment status", () => {
    expect(normalizePaymentStatus(" Success ")).toBe("success");
  });
});

describe("trimOrNull", () => {
  it("returns trimmed text or null", () => {
    expect(trimOrNull(" hello ")).toBe("hello");
    expect(trimOrNull("  ")).toBeNull();
    expect(trimOrNull(undefined)).toBeNull();
  });
});

describe("parseGhlDate", () => {
  it("parses GHL ordinal date strings", () => {
    expect(parseGhlDate("Apr 30th 2026, 11:36 pm")).toBeInstanceOf(Date);
    expect(parseGhlDate("May 1st 2026, 12:00 am")).toBeInstanceOf(Date);
  });

  it("returns null for invalid or empty strings", () => {
    expect(parseGhlDate("garbage")).toBeNull();
    expect(parseGhlDate("")).toBeNull();
  });
});

describe("parseName", () => {
  it("splits first and last name parts", () => {
    expect(parseName("Mary Jane Watson")).toEqual({ firstName: "Mary", lastName: "Jane Watson" });
    expect(parseName("")).toEqual({ firstName: "", lastName: "" });
  });
});

describe("normalizeName", () => {
  it("collapses whitespace and lowercases", () => {
    expect(normalizeName("  KELLY   Oldis ")).toBe("kelly oldis");
  });
});

describe("normalizeFirstName", () => {
  it("normalizes the parsed first name", () => {
    expect(normalizeFirstName("Tyler Oldis")).toBe("tyler");
  });
});

describe("parseBool", () => {
  it("parses true-ish values", () => {
    expect(parseBool("true")).toBe(true);
    expect(parseBool("yes")).toBe(true);
    expect(parseBool("1")).toBe(true);
    expect(parseBool("TRUE")).toBe(true);
  });

  it("parses false-ish and missing values", () => {
    expect(parseBool("false")).toBe(false);
    expect(parseBool("no")).toBe(false);
    expect(parseBool("")).toBe(false);
    expect(parseBool(undefined)).toBe(false);
  });
});

describe("cleanPhoneNumber", () => {
  it("normalizes the first phone number in a multi-value field", () => {
    expect(cleanPhoneNumber("+1 (302) 555-1234, 302-555-9999")).toBe("3025551234");
  });

  it("returns undefined for missing or incomplete numbers", () => {
    expect(cleanPhoneNumber("")).toBeUndefined();
    expect(cleanPhoneNumber("555")).toBeUndefined();
  });
});

describe("parsePaymentAmountCents", () => {
  it("parses dollar amounts to cents", () => {
    expect(parsePaymentAmountCents("$340 ")).toBe(34000);
    expect(parsePaymentAmountCents("$0")).toBe(0);
    expect(parsePaymentAmountCents("200")).toBe(20000);
  });

  it("returns zero for unparseable amounts", () => {
    expect(parsePaymentAmountCents("abc")).toBe(0);
  });
});

describe("resolveTier", () => {
  it("maps known payment amounts", () => {
    expect(resolveTier(290, 2)).toEqual({ tier: "AdultPlusChild", maxMembers: 2 });
    expect(resolveTier(530, 5)).toEqual({ tier: "Family5", maxMembers: 5 });
  });

  it("raises max members when the parsed household is larger than the known amount tier", () => {
    expect(resolveTier(530, 9)).toEqual({ tier: "Family5", maxMembers: 9 });
  });

  it("falls back to member count for unknown amounts", () => {
    expect(resolveTier(200, 5)).toEqual({ tier: "Family5", maxMembers: 5 });
    expect(resolveTier(0, 1)).toEqual({ tier: "Adult", maxMembers: 1 });
    expect(resolveTier(0, 3)).toEqual({ tier: "Family3", maxMembers: 3 });
  });
});

describe("splitMultivalue", () => {
  it("splits comma and newline separated values", () => {
    expect(splitMultivalue("a, b\nc")).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array for blank input", () => {
    expect(splitMultivalue("")).toEqual([]);
  });
});

describe("parseChildrenAges", () => {
  it("parses child names and ages into a first-name map", () => {
    const ages = parseChildrenAges("Yelena (12), Ethan (9)");

    expect(ages.size).toBe(2);
    expect(ages.get("yelena")).toBe(12);
    expect(ages.get("ethan")).toBe(9);
  });
});

describe("parseRelationships", () => {
  it("parses relationship labels into a first-name map", () => {
    const relationships = parseRelationships("Son: Tyler, Daughter: Emily");

    expect(relationships.size).toBe(2);
    expect(relationships.get("tyler")).toBe("son");
    expect(relationships.get("emily")).toBe("daughter");
  });

  it("ignores segments without names", () => {
    expect(parseRelationships("No colon here").size).toBe(0);
  });
});

describe("tierFromMemberCount", () => {
  it("maps member counts to tiers", () => {
    expect(tierFromMemberCount(1)).toEqual({ tier: "Adult", maxMembers: 1 });
    expect(tierFromMemberCount(2)).toEqual({ tier: "AdultPlusChild", maxMembers: 2 });
    expect(tierFromMemberCount(3)).toEqual({ tier: "Family3", maxMembers: 3 });
    expect(tierFromMemberCount(4)).toEqual({ tier: "Family4", maxMembers: 4 });
    expect(tierFromMemberCount(5)).toEqual({ tier: "Family5", maxMembers: 5 });
    expect(tierFromMemberCount(6)).toEqual({ tier: "FamilyPlus", maxMembers: 6 });
    expect(tierFromMemberCount(8)).toEqual({ tier: "FamilyLarge", maxMembers: 8 });
    expect(tierFromMemberCount(9)).toEqual({ tier: "FamilyLarge", maxMembers: 9 });
  });
});

describe("parseFamilyMembers", () => {
  it("parses family members, skips the account holder, and enriches phone, age, and relationship", () => {
    const members = parseFamilyMembers(
      {
        "Member 1 Name": "Kelly Oldis",
        "Member 2 Name": "Tyler Oldis",
        "Member 2 Phone": "+1 (302) 555-1234",
        "Email addresses for all people on membership:": "tyler@example.com",
        "Include name(s) & age(s) of your child/children:": "Tyler (12)",
        "All names and family relationships": "Son: Tyler"
      },
      "Kelly Oldis"
    );

    expect(members).toEqual([
      {
        firstName: "Tyler",
        lastName: "Oldis",
        fullName: "Tyler Oldis",
        email: "tyler@example.com",
        phone: "3025551234",
        age: 12,
        relationship: "son"
      }
    ]);
  });

  it("falls back to family_member for unknown relationships and skips blank names", () => {
    const members = parseFamilyMembers(
      {
        "Member 1 Name": "",
        "Member 2": "Chase Oldis"
      },
      "Kelly Oldis"
    );

    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ firstName: "Chase", relationship: "family_member" });
  });
});

describe("formatFamilyNames", () => {
  it("formats parsed member first names", () => {
    expect(
      formatFamilyNames([
        { firstName: "Tyler", lastName: "Oldis", fullName: "Tyler Oldis", relationship: "son" },
        { firstName: "Chase", lastName: "Oldis", fullName: "Chase Oldis", relationship: "son" }
      ])
    ).toBe("Tyler, Chase");
  });
});

describe("printDryRunSummary", () => {
  it("prints dry-run summary with pending, non-success, tier, date, and weird-row data", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    printDryRunSummary(
      [
        {
          "Your Full Name": "Kelly Oldis",
          "Your Email": "kelly@example.com",
          "Payment Status": "Success",
          "Payment Amount": "$530",
          "Submission Date": "Apr 30th 2026, 11:36 pm",
          "Member 1 Name": "Kelly Oldis",
          "Member 2 Name": "Tyler Oldis"
        },
        {
          "Your Full Name": "Pending Person",
          "Your Email": "pending@example.com",
          "Payment Status": "Pending"
        },
        {
          "Your Full Name": "Failed Person",
          "Your Email": "failed@example.com",
          "Payment Status": "Failed"
        },
        {
          "Your Full Name": "",
          "Your Email": "bad",
          "Payment Status": "Success",
          "Payment Amount": "$0",
          "Submission Date": "garbage"
        }
      ],
      { dryRun: true, upsert: false, skipPending: true }
    );

    const output = log.mock.calls.map((call) => String(call[0]));
    expect(output).toContain("Total rows seen: 4");
    expect(output).toContain("Skipped pending rows: 1");
    expect(output).toContain("Skipped non-success rows: 1");
    expect(output.some((line) => line.includes("Family5: 1 memberships, 2 persons"))).toBe(true);
    expect(output).toContain("Rows with weird/unparseable data:");
    expect(output).toContain("DRY RUN — no rows written to database.");
  });

  it("prints zero weird rows when all included rows are clean", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    printDryRunSummary(
      [
        {
          "Your Full Name": "Kelly Oldis",
          "Your Email": "kelly@example.com",
          "Payment Status": "Success",
          "Payment Amount": "$530",
          "Submission Date": "May 2nd 2026, 12:00 pm"
        }
      ],
      { dryRun: true, upsert: false, skipPending: true }
    );

    expect(log.mock.calls.map((call) => String(call[0]))).toContain("Rows with weird/unparseable data: 0");
  });
});
