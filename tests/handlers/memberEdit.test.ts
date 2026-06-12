import { describe, expect, it } from "vitest";
import { cleanPhone, updateEmergencySchema, updatePersonSchema } from "../../src/handlers/memberEdit";

describe("cleanPhone", () => {
  it("normalizes phone numbers to 10 digits", () => {
    expect(cleanPhone("(302) 555-1234")).toBe("3025551234");
  });

  it("returns null for empty input", () => {
    expect(cleanPhone("")).toBeNull();
  });

  it("returns undefined for undefined input", () => {
    expect(cleanPhone(undefined)).toBeUndefined();
  });

  it("returns null when no digits are present", () => {
    expect(cleanPhone("abc")).toBeNull();
  });
});

describe("updatePersonSchema", () => {
  it("rejects invalid ages", () => {
    expect(() => updatePersonSchema.parse({ age: 200 })).toThrow();
  });

  it("allows clearing email", () => {
    expect(updatePersonSchema.parse({ email: "" })).toEqual({ email: "" });
  });

  it("rejects invalid email", () => {
    expect(() => updatePersonSchema.parse({ email: "bad" })).toThrow();
  });
});

describe("updateEmergencySchema", () => {
  it("allows clearing email", () => {
    expect(updateEmergencySchema.parse({ emergencyContactEmail: "" })).toEqual({ emergencyContactEmail: "" });
  });

  it("rejects invalid email", () => {
    expect(() => updateEmergencySchema.parse({ emergencyContactEmail: "bad" })).toThrow();
  });
});
