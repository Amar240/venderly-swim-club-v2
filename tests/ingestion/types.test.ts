import { describe, expect, it } from "vitest";
import { ingestTable } from "../../src/ingestion/normalize";
import { canonicalMembershipSchema } from "../../src/ingestion/types";

describe("canonicalMembershipSchema", () => {
  const membership = {
    accountHolderName: "Ada Lovelace",
    memberCount: 1,
    persons: [{ fullName: "Ada Lovelace", isPrimary: true }]
  };

  it("accepts a membership without email or phone", () => {
    expect(canonicalMembershipSchema.parse(membership)).toEqual(membership);
  });

  it("still validates contact values when supplied", () => {
    expect(() => canonicalMembershipSchema.parse({ ...membership, email: "bad" })).toThrow();
    expect(() => canonicalMembershipSchema.parse({ ...membership, phone: "" })).toThrow();
  });

  it("ingests a holder-only table with no contact columns", () => {
    const result = ingestTable(["Your Full Name"], [["Ada Lovelace"]]);

    expect(result.warnings).toEqual([]);
    expect(result.memberships).toEqual([
      expect.objectContaining({
        accountHolderName: "Ada Lovelace",
        memberCount: 1,
        persons: [{ fullName: "Ada Lovelace", isPrimary: true, age: null }]
      })
    ]);
    expect(result.memberships[0]).not.toHaveProperty("email");
    expect(result.memberships[0]).not.toHaveProperty("phone");
  });
});
