import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ingestCsv } from "../../src/ingestion/normalize";

const fixturePath = (name: string): string => join(process.cwd(), "tests", "fixtures", "ingestion", name);
const readFixture = (name: string): string => readFileSync(fixturePath(name), "utf8");

const expectSinglePrimary = (persons: Array<{ fullName: string; isPrimary: boolean }>, holderName: string) => {
  expect(persons.filter((person) => person.isPrimary)).toEqual([expect.objectContaining({ fullName: holderName })]);
};

describe("ingestCsv fixtures", () => {
  it("ingests base_wedgewood_wide.csv", () => {
    const result = ingestCsv(readFixture("base_wedgewood_wide.csv"));

    expect(result.memberships).toHaveLength(40);
    expect(result.warnings).toEqual([]);
    expect(result.droppedColumns).toEqual(
      expect.arrayContaining([
        "Terms and Conditions",
        "Timezone",
        "Payment Status",
        "Email Verified",
        "Phone Verified"
      ])
    );

    const first = result.memberships[0]!;
    expect(first).toMatchObject({
      accountHolderName: "Caleb Lewis",
      email: "caleb.lewis.0001@example.com",
      phone: "+13025911540",
      streetAddress: "8354 Sunset Blvd",
      city: "Smyrna",
      postalCode: "19929",
      state: "Delaware",
      country: "US",
      memberCount: 2,
      paymentAmount: 240,
      orderId: "35352570a1793581b4218",
      medicalNotes: "Asthma - carries an inhaler"
    });
    expect(first.submittedAt).toBe("2026-07-06T23:52:00.000Z");
    expect(first.persons).toEqual([
      { fullName: "Caleb Lewis", isPrimary: true, age: null, phone: "+13025911540" },
      { fullName: "Kevin Lewis", isPrimary: false, age: 67, phone: "+13025911540" },
      { fullName: "Ethan Lewis", isPrimary: false, age: 11 }
    ]);
    expectSinglePrimary(first.persons, "Caleb Lewis");
  });

  it("ingests fixture_A_long_per_person.csv by grouping households", () => {
    const result = ingestCsv(readFixture("fixture_A_long_per_person.csv"));

    expect(result.memberships).toHaveLength(40);
    expect(result.warnings).toEqual([]);
    const first = result.memberships[0]!;
    expect(first).toMatchObject({
      accountHolderName: "Caleb Lewis",
      email: "caleb.lewis.0001@example.com",
      phone: "+13025911540",
      memberCount: 2,
      paymentAmount: 240
    });
    expect(first.persons).toEqual([
      { fullName: "Caleb Lewis", isPrimary: true, age: null, phone: "+13025911540" },
      { fullName: "Kevin Lewis", isPrimary: false, age: 67, phone: "+13025911540" },
      { fullName: "Ethan Lewis", isPrimary: false, age: 11 }
    ]);
    expectSinglePrimary(first.persons, "Caleb Lewis");
  });

  it("ingests fixture_B_renamed_combined.csv with header synonyms and combined people", () => {
    const result = ingestCsv(readFixture("fixture_B_renamed_combined.csv"));

    expect(result.memberships).toHaveLength(40);
    expect(result.warnings).toEqual([]);
    const first = result.memberships[0]!;
    expect(first).toMatchObject({
      accountHolderName: "Caleb Lewis",
      email: "caleb.lewis.0001@example.com",
      phone: "+13025911540",
      streetAddress: "8354 Sunset Blvd",
      memberCount: 2,
      paymentAmount: 240
    });
    expect(first.persons).toEqual([
      { fullName: "Caleb Lewis", isPrimary: true, age: null, phone: "+13025911540" },
      { fullName: "Kevin Lewis", isPrimary: false, age: 67 },
      { fullName: "Ethan Lewis", isPrimary: false, age: 11 }
    ]);
    expectSinglePrimary(first.persons, "Caleb Lewis");
  });

  it("ingests fixture_C_mixed_junk.csv and keeps only account-holder persons", () => {
    const result = ingestCsv(readFixture("fixture_C_mixed_junk.csv"));

    expect(result.memberships).toHaveLength(40);
    expect(result.warnings).toEqual([]);
    expect(result.droppedColumns).toEqual(expect.arrayContaining(["_internal_id", "LegacyFlag", "EmailVerified"]));

    const [first, second, third] = result.memberships;
    expect(first).toMatchObject({
      accountHolderName: "Caleb Lewis",
      email: "caleb.lewis.0001@example.com",
      phone: "+13025911540",
      postalCode: "01992",
      state: "Delaware",
      country: "US",
      memberCount: 2,
      guestPasses: null,
      medicalNotes: "Asthma - carries an inhaler"
    });
    expect(first?.persons).toEqual([{ fullName: "Caleb Lewis", isPrimary: true, age: null, phone: "+13025911540" }]);
    expectSinglePrimary(first?.persons ?? [], "Caleb Lewis");
    expect(second?.phone).toBe("+13026742095");
    expect(third?.phone).toBe("+13024860333");
  });

  it("ingests fixture_D_dates_split_name.csv with split names, combined address, and varied dates", () => {
    const result = ingestCsv(readFixture("fixture_D_dates_split_name.csv"));

    expect(result.memberships).toHaveLength(40);
    expect(result.warnings).toEqual([]);
    const [first, second, third] = result.memberships;
    expect(first).toMatchObject({
      accountHolderName: "Caleb Lewis",
      email: "caleb.lewis.0001@example.com",
      phone: "+13025911540",
      streetAddress: "8354 Sunset Blvd",
      city: "Smyrna",
      state: "DE",
      country: "USA",
      memberCount: 2
    });
    expect(first?.persons).toEqual([{ fullName: "Caleb Lewis", isPrimary: true, age: null, phone: "+13025911540" }]);
    expectSinglePrimary(first?.persons ?? [], "Caleb Lewis");
    expect(first?.submittedAt).toBe("2026-07-06T23:52:00.000Z");
    expect(second?.submittedAt).toBe("2026-07-02T12:00:00.000Z");
    expect(third?.submittedAt).toBe("2026-07-03T12:00:00.000Z");
  });

  it("skips invalid rows and records warnings instead of throwing the whole ingest", () => {
    const csv = [
      "Name,Phone,Email,Members",
      "Valid Holder,3025911540,valid@example.com,1",
      "Invalid Holder,3025911540,not-an-email,1"
    ].join("\n");
    const result = ingestCsv(csv);

    expect(result.memberships).toHaveLength(1);
    expect(result.memberships[0]?.accountHolderName).toBe("Valid Holder");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("row 3");
  });
});
