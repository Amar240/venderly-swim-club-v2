import { describe, expect, it } from "vitest";
import { fullName, normalizeName, parseGuestCount } from "../../src/handlers/checkin";

describe("parseGuestCount", () => {
  it("parses direct numeric input", () => {
    expect(parseGuestCount("2")).toBe(2);
  });

  it("extracts the first digit sequence from text", () => {
    expect(parseGuestCount("Any 3 of them")).toBe(3);
  });

  it("defaults missing input to zero", () => {
    expect(parseGuestCount(undefined)).toBe(0);
  });
});

describe("normalizeName", () => {
  it("normalizes whitespace and case consistently", () => {
    expect(normalizeName("  Kelly   OLDIS ")).toBe(normalizeName("kelly oldis"));
  });
});

describe("fullName", () => {
  it("joins first and last name", () => {
    expect(fullName({ firstName: "X", lastName: "Y" })).toBe("X Y");
  });
});
