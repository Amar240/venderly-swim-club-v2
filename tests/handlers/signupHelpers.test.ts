import { describe, expect, it } from "vitest";
import {
  cleanPhoneNumber,
  emergencyEmailSchema,
  normalizeName,
  parseAge,
  parseMembershipTier,
  splitFullName
} from "../../src/handlers/signup";

describe("normalizeName", () => {
  it("ignores punctuation differences", () => {
    expect(normalizeName("Elena M. Gouge")).toBe(normalizeName("Elena M Gouge"));
    expect(normalizeName("Mary-Anne")).toBe(normalizeName("Mary Anne"));
  });

  it("trims whitespace and lowercases", () => {
    expect(normalizeName("  Lisa   TURNER  ")).toBe(normalizeName("lisa turner"));
  });
});

describe("cleanPhoneNumber", () => {
  it("normalizes US phone numbers", () => {
    expect(cleanPhoneNumber("+1 (302) 555-1234")).toBe("3025551234");
  });

  it("returns undefined when no digits are present", () => {
    expect(cleanPhoneNumber("abc")).toBeUndefined();
    expect(cleanPhoneNumber("")).toBeUndefined();
  });
});

describe("emergencyEmailSchema", () => {
  it("drops empty or malformed optional emergency emails", () => {
    for (const value of ["", "no email", "I dont have one", "jen@gm", "N/@", "skip", undefined]) {
      expect(emergencyEmailSchema.parse(value)).toBeUndefined();
    }
  });

  it("trims and keeps valid emergency emails", () => {
    expect(emergencyEmailSchema.parse("  jen@example.com  ")).toBe("jen@example.com");
  });
});

describe("parseAge", () => {
  it("parses numeric ages", () => {
    expect(parseAge("8")).toBe(8);
  });

  it("returns undefined for non-numeric or null ages", () => {
    expect(parseAge("eight")).toBeUndefined();
    expect(parseAge(null)).toBeUndefined();
  });
});

describe("splitFullName", () => {
  it("splits first and remaining last name parts", () => {
    expect(splitFullName("Mary Jane Watson")).toEqual({ firstName: "Mary", lastName: "Jane Watson" });
  });

  it("handles single names and trims whitespace", () => {
    expect(splitFullName("Madonna")).toEqual({ firstName: "Madonna", lastName: "" });
    expect(splitFullName("  Tyler  ")).toEqual({ firstName: "Tyler", lastName: "" });
  });
});

describe("parseMembershipTier", () => {
  it("maps known form values", () => {
    expect(parseMembershipTier("1")).toEqual({ tier: "Student/Adult", maxMembers: 1 });
    expect(parseMembershipTier("5+")).toEqual({ tier: "Family5", maxMembers: 5 });
  });

  it("falls back to unknown", () => {
    expect(parseMembershipTier(undefined)).toEqual({ tier: "unknown", maxMembers: 5 });
  });
});
